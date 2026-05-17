"""
Correlation engine - connects visual failures with repo risks.
Handles auth failures, public deployments, and no-repo scenarios gracefully.
"""
from typing import List, Dict, Any, Optional


def correlate(repo_risks: List[Dict], browser_events: List[Dict], repo_path: str) -> Dict[str, Any]:
    """Correlate browser failures with repo risks to build incident hypothesis."""

    failed_apis  = [e for e in browser_events if e.get('event_type') == 'failed_api']
    console_errs = [e for e in browser_events if e.get('event_type') == 'console_error']
    triggered    = [e for e in browser_events if e.get('event_type') == 'button_triggered_failure']
    dead_buttons = [e for e in browser_events if e.get('event_type') == 'dead_button']
    page_loaded  = [e for e in browser_events if e.get('event_type') == 'page_loaded']

    # ── No failure at all ──────────────────────────────────────────────────────
    if not failed_apis and not console_errs and not dead_buttons:
        return {
            "incident_type": "no_failure_detected",
            "confidence": "high",
            "user_action": "n/a",
            "user_symptom": "No failures detected during browser scan",
            "frontend_evidence": [],
            "backend_evidence": [],
            "repo_evidence": [],
            "business_impact": "none",
            "root_cause_hypothesis": "The deployed application responded correctly to all tested user flows.",
            "recommended_actions": ["Monitor for intermittent failures", "Expand scan coverage with login credentials"]
        }

    # ── Classify ───────────────────────────────────────────────────────────────
    incident_type, user_action = _classify(repo_risks, failed_apis, console_errs, triggered, dead_buttons)

    # ── Build evidence lists ───────────────────────────────────────────────────
    frontend_ev = []
    for e in failed_apis:
        status = e.get('status', '?')
        method = e.get('method', 'GET')
        url    = e.get('url', '')
        trigger = e.get('triggered_by', '')
        line = f"API {method} {url} → HTTP {status}"
        if trigger:
            line += f" (triggered by: \"{trigger}\")"
        frontend_ev.append(line)
    for e in console_errs:
        frontend_ev.append(f"Console {e.get('type','error')}: {e.get('message','')[:120]}")
    for e in dead_buttons:
        frontend_ev.append(f"Dead button: \"{e.get('text','?')}\" — no network/nav/DOM change on click")

    dep_risks    = [r for r in repo_risks if r.get('risk_type') == 'dependency_incompatibility']
    config_risks = [r for r in repo_risks if r.get('risk_type') == 'runtime_config_drift']
    repo_ev = [r.get('evidence', '') for r in (dep_risks + config_risks)[:5] if r.get('evidence')]

    # ── Business impact ────────────────────────────────────────────────────────
    impact = _assess_impact(failed_apis, triggered, dead_buttons)

    return {
        "incident_type": incident_type,
        "confidence": _confidence(incident_type, failed_apis, repo_ev),
        "user_action": user_action,
        "user_symptom": _symptom(incident_type, triggered, failed_apis, dead_buttons),
        "frontend_evidence": frontend_ev,
        "backend_evidence": [],
        "repo_evidence": repo_ev,
        "business_impact": impact,
        "root_cause_hypothesis": _hypothesis(incident_type, repo_risks, failed_apis, console_errs, page_loaded),
        "recommended_actions": _actions(incident_type, failed_apis, repo_risks),
    }


# ── Classification ─────────────────────────────────────────────────────────────

def _classify(repo_risks, failed_apis, console_errs, triggered, dead_buttons) -> tuple:
    user_action = "browsed app"
    if triggered:
        user_action = f"clicked '{triggered[0].get('text', 'button')}'"
    elif failed_apis and failed_apis[0].get('triggered_by'):
        user_action = f"clicked '{failed_apis[0]['triggered_by']}'"

    statuses = [e.get('status', 0) for e in failed_apis]

    dep_risks    = [r for r in repo_risks if r.get('risk_type') == 'dependency_incompatibility']
    config_risks = [r for r in repo_risks if r.get('risk_type') == 'runtime_config_drift']
    contract_risks = [r for r in repo_risks if r.get('risk_type') == 'frontend_backend_contract_mismatch']

    # Auth failure — 401/403 detected
    if any(s in (401, 403) for s in statuses):
        return "auth_failure", user_action

    # Dependency incompatibility — failed API + dep risk in repo
    if failed_apis and dep_risks:
        return "dependency_incompatibility", user_action

    # Runtime config drift — config risk exists + failure
    if config_risks and (failed_apis or console_errs):
        return "runtime_config_drift", user_action

    # Contract mismatch
    if contract_risks and failed_apis:
        return "frontend_backend_contract_mismatch", user_action

    # Server error with no repo match
    if any(s >= 500 for s in statuses):
        return "unknown_runtime_failure", user_action

    # Client error (4xx) that isn't auth
    if any(400 <= s < 500 for s in statuses):
        return "frontend_backend_contract_mismatch", user_action

    # Dead button / no network effect
    if dead_buttons and not failed_apis:
        return "visual_user_flow_failure", user_action

    # Console errors only
    if console_errs and not failed_apis:
        return "visual_user_flow_failure", user_action

    return "unknown_runtime_failure", user_action


# ── Helpers ────────────────────────────────────────────────────────────────────

def _confidence(incident_type: str, failed_apis: list, repo_ev: list) -> str:
    if incident_type == "auth_failure":
        return "high"
    if incident_type == "no_failure_detected":
        return "high"
    if failed_apis and repo_ev:
        return "high"
    if failed_apis or repo_ev:
        return "medium"
    return "low"


def _symptom(incident_type: str, triggered: list, failed_apis: list, dead_buttons: list) -> str:
    if incident_type == "auth_failure":
        statuses = [str(e.get('status', '')) for e in failed_apis if e.get('status') in (401, 403)]
        urls = [e.get('url', '') for e in failed_apis if e.get('status') in (401, 403)]
        url = urls[0] if urls else 'API endpoint'
        return f"Request to {url} returned {statuses[0] if statuses else '401'} — app requires authentication"
    if triggered:
        return f"'{triggered[0].get('text','button')}' triggers an API failure"
    if failed_apis:
        e = failed_apis[0]
        return f"API {e.get('method','GET')} {e.get('url','')} failed with HTTP {e.get('status','?')}"
    if dead_buttons:
        return f"'{dead_buttons[0].get('text','button')}' does nothing on click"
    return "Runtime failure detected during browser scan"


def _assess_impact(failed_apis: list, triggered: list, dead_buttons: list) -> str:
    for e in failed_apis:
        url = e.get('url', '').lower()
        status = e.get('status', 0)
        if status in (401, 403):
            return "app inaccessible without authentication"
        if any(k in url for k in ('/payment', '/checkout', '/order', '/purchase')):
            return "checkout / payment flow broken"
        if any(k in url for k in ('/auth', '/login', '/token', '/session')):
            return "authentication flow broken"
        if any(k in url for k in ('/api/', '/graphql')):
            return "core API unavailable"
    if dead_buttons:
        return "user flow non-functional"
    if triggered:
        return "user-facing feature broken"
    return "degraded user experience"


def _hypothesis(incident_type: str, repo_risks: list, failed_apis: list, console_errs: list, page_loaded: list) -> str:
    failed_url = failed_apis[0].get('url', 'the API') if failed_apis else 'the API'
    failed_status = failed_apis[0].get('status', '') if failed_apis else ''

    if incident_type == "auth_failure":
        return (
            f"The deployed application returned HTTP {failed_status} on {failed_url}. "
            f"This means the app or its API requires authentication credentials. "
            f"Provide login email/password in the Credentials section and re-run the scan for deeper analysis."
        )

    if incident_type == "dependency_incompatibility":
        dep = next((r for r in repo_risks if r.get('risk_type') == 'dependency_incompatibility'), None)
        if dep and 'err.code' in dep.get('evidence', ''):
            return (
                f"A dependency version upgrade changed the error response shape. "
                f"Code reads 'err.code' but the newer SDK uses 'err.error_code', "
                f"causing a TypeError at runtime that surfaces as HTTP 500 on {failed_url}."
            )
        if dep:
            return f"{dep.get('evidence', 'A dependency upgrade')} is causing a runtime failure at {failed_url}."
        return f"A dependency version incompatibility is causing the failure at {failed_url}."

    if incident_type == "runtime_config_drift":
        cfg = next((r for r in repo_risks if r.get('risk_type') == 'runtime_config_drift'), None)
        if cfg:
            return cfg.get('evidence', 'A required environment variable is missing in the deployment environment.')
        return "A required environment variable or runtime configuration is missing in the deployed environment."

    if incident_type == "frontend_backend_contract_mismatch":
        return (
            f"The frontend is calling {failed_url} with HTTP {failed_status}. "
            f"This suggests either the endpoint does not exist on the backend, "
            f"or the request format (fields, headers, content-type) does not match what the backend expects."
        )

    if incident_type == "visual_user_flow_failure":
        if console_errs:
            msg = console_errs[0].get('message', '')[:100]
            return f"A JavaScript error is preventing the UI from functioning correctly: \"{msg}\""
        return "A UI element is non-functional — clicking it produces no network request, navigation, or visible state change."

    # unknown
    if failed_apis:
        return (
            f"The browser agent detected HTTP {failed_status} from {failed_url}. "
            f"No matching repository evidence was found. "
            f"Provide the source repository path or GitHub URL to enable deeper correlation and root-cause analysis."
        )
    return "Runtime failure detected. Provide the source repository to enable root-cause correlation."


def _actions(incident_type: str, failed_apis: list, repo_risks: list) -> list:
    if incident_type == "auth_failure":
        return [
            "Add login credentials in the Credentials section and re-run the scan",
            "Ensure the app has a test/staging user account available",
            "Check if the deployment requires an API key or Bearer token in headers",
        ]
    if incident_type == "dependency_incompatibility":
        return [
            "Review the generated compatibility patch",
            "Run the sandbox-verified tests before approving",
            "Pin the dependency version after applying the fix",
        ]
    if incident_type == "runtime_config_drift":
        return [
            "Add the missing environment variable to your deployment config",
            "Review .env.example against the deployed environment",
            "Apply the startup validation patch to fail fast on missing config",
        ]
    if incident_type == "frontend_backend_contract_mismatch":
        return [
            "Compare frontend API call payload with backend route schema",
            "Check for field name casing mismatches (camelCase vs snake_case)",
            "Verify the API endpoint path exists in the backend router",
        ]
    if incident_type == "visual_user_flow_failure":
        return [
            "Check browser console for JavaScript errors",
            "Ensure all UI dependencies are correctly bundled",
            "Add error boundary and loading states to the affected component",
        ]
    return [
        "Provide the source repository URL or local path for deeper analysis",
        "Check server logs for the failing endpoint",
        "Add credentials if the app requires authentication",
    ]
