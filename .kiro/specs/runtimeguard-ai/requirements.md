# Requirements Document

## Introduction

RuntimeGuard AI is an AI-powered software immune system that turns production crashes into sandbox-verified recovery pull requests and learns from every incident to prevent the next one.

**Core Product Loop:** Detect → Bundle → Reproduce → Patch → Verify → PR → Learn → Prevent

**Positioning:** RuntimeGuard is not a coding agent, not an observability dashboard, not an incident summarizer. It is the runtime verification and recovery layer between production failure and safe code recovery.

**Differentiation:** Sentry tells you what broke. Datadog explains why. Coding agents can write a fix. RuntimeGuard proves the fix recovers the exact broken runtime condition before an engineer merges it, and remembers the pattern so the next crash can be prevented.

The MVP is scoped for a 2-day hackathon build (Ship to Scale) targeting VC judges evaluating innovation, technical execution, product feasibility, UX, and pitch/demo quality.

---

## Glossary

- **RuntimeListener**: The crash detection layer that receives production failures via webhook or exception middleware.
- **IncidentBundle**: A structured debugging packet containing error type, message, stack trace, root file/line/function, endpoint, payload, and suspected cause.
- **StackTraceParser**: Extracts structured crash information from raw stack traces, identifying application-level root frames.
- **CodeContextEngine**: Retrieves only the relevant source code needed to understand and fix the crash (not the full repo).
- **SecretRedactor**: Regex-based redaction of API keys, tokens, passwords, PII before any LLM call.
- **ReplayTestGenerator**: Converts the production failure into a reproducible pytest that proves the bug exists.
- **FailureReplaySandbox**: Runs the replay test BEFORE patching to confirm the failure is reproducible.
- **RemediationAgent**: LLM-powered patch generation producing exactly 2 candidates (minimal + robust).
- **PatchPolicyEngine**: Rejects unsafe patches based on diff analysis (too many files, sensitive paths, hardcoded values).
- **VerificationSandbox**: Applies patches in isolation, runs replay test + regression tests, confirms the fix works.
- **RiskScoreEngine**: Scores each patch (0-100) based on diff size, test results, sensitive files, and verification outcome.
- **PRCreator**: Creates a recovery pull request with full evidence (before/after, risk score, verification proof).
- **IncidentMemoryGraph**: Stores resolved incidents as reusable knowledge and cross-references crashes against prior warnings.
- **PreventabilityScanner**: Scans codebase for patterns similar to resolved incidents.
- **HealthScore**: A 0-100 integer representing repository safety posture.
- **DemoApp**: A purpose-built FastAPI service with intentional bugs for reliable demo.
- **Incident**: A crash event progressing through statuses: detected → bundled → reproducing → patching → verifying → pr_created → healed → failed.
- **Patch**: A candidate fix with sandbox verification status, risk score, and rejection/acceptance reason.

---

## Requirements

### Requirement 1: Backend Configuration and Database

**User Story:** As a developer, I want a clean configuration system and database layer, so that the backend starts reliably with zero manual setup beyond a `.env` file.

#### Acceptance Criteria

1. THE System SHALL load all configuration from a `.env` file via a `Settings` dataclass with sensible defaults for all optional fields.
2. THE System SHALL use SQLite as the database with `check_same_thread=False` for async compatibility.
3. THE System SHALL create all database tables automatically on application startup via `init_db()` called in the FastAPI lifespan handler.
4. THE System SHALL seed the proactive PR record on startup (lifespan handler) if no proactive PR exists.
5. THE System SHALL never hardcode secrets; all sensitive values SHALL come from the Settings class.
6. THE System SHALL use Python logging module (not print()) for all output, logging entry/exit of every service function at INFO level.

---

### Requirement 2: ORM Models

**User Story:** As a developer, I want well-defined database models, so that incident tracking, patch management, and health scoring are structured and queryable.

#### Acceptance Criteria

1. THE Incident model SHALL include: id (UUID text PK), created_at, exception_type, exception_msg, file_path, line_number, function_name, raw_stack_trace, source_repo, endpoint, request_payload, suspected_cause, severity, status (default "detected"), failure_reason, pr_url, pr_number, was_preventable, preventable_pr_number, preventable_pr_days_ago, root_cause_explanation, replay_test_code, replay_test_before_result.
2. THE Incident status SHALL only take values: detected, bundled, reproducing, patching, verifying, pr_created, healed, failed.
3. THE Patch model SHALL include: id (UUID text PK), incident_id (FK), created_at, candidate_num (1 or 2), patch_content, sandbox_status (default "pending"), sandbox_output, selected (bool), rejected (bool), rejection_reasons (text), risk_score (int), risk_label (text).
4. THE ProactivePR model SHALL include: id (UUID text PK), created_at, file_path, pattern_matched, pr_url, pr_number, pr_title, days_since_created, repo.
5. THE HealthScore model SHALL include: repo (text PK), score (int, default 100), cve_count, deprecated_count, open_incidents, risky_patterns, last_updated.

---

### Requirement 3: Demo Endpoints

**User Story:** As a hackathon presenter, I want reliable demo trigger and reset endpoints, so that the full healing loop can be demonstrated on demand without manual setup.

#### Acceptance Criteria

1. THE System SHALL expose `POST /demo/trigger` that creates a hardcoded crash payload (KeyError on 'user_id' in demo-app/routes/user.py line 12, function get_user, endpoint POST /user, payload {"cart_id": "c123"}), inserts an Incident with status "detected", fires the remediation pipeline as a BackgroundTask, and returns `{ incident_id, status: "detected", message: "Demo triggered" }`.
2. THE System SHALL expose `POST /demo/reset` that deletes all incidents and patches, resets health_score to 100, re-seeds the proactive PR record, and attempts to close open GitHub PRs with the "auto-healed" label.
3. THE `/demo/trigger` endpoint SHALL NOT seed the proactive PR — that is handled exclusively by the lifespan handler and `/demo/reset`.
4. THE `/demo/trigger` endpoint SHALL return HTTP 200 within 500 milliseconds (pipeline runs asynchronously).

---

### Requirement 4: Demo Application

**User Story:** As a presenter, I want a purpose-built demo application with intentional bugs, so that the crash and healing can be demonstrated against real (but controlled) code.

#### Acceptance Criteria

1. THE DemoApp SHALL be a FastAPI application in `demo-app/` with a deprecated `@app.on_event("startup")` handler in `app.py`.
2. THE DemoApp SHALL include `routes/user.py` with a buggy endpoint that raises KeyError when `data['user_id']` is missing from the request.
3. THE DemoApp SHALL include `tests/test_user.py` with exactly 3 pytest tests: test_existing_user (passes on any code), test_missing_user (expects 404), test_missing_key (expects 400/422).
4. THE DemoApp tests SHALL pass when the robust fix (Patch 2) is applied and fail when only the minimal fix (Patch 1) is applied.

---

### Requirement 5: Stack Trace Parser and Incident Bundling

**User Story:** As the pipeline, I need to extract structured crash information and create a clean incident bundle, so that downstream services have exact production context.

#### Acceptance Criteria

1. THE StackTraceParser SHALL accept a crash payload dict and return a ParsedCrash with: exception_type, exception_message, primary_file, line_number, function_name, related_files, raw_trace, endpoint, request_payload.
2. THE StackTraceParser SHALL skip library frames (site-packages, venv, stdlib) and extract the first user-code frame as the primary frame.
3. THE StackTraceParser SHALL classify the error into a category: missing_field, null_access, schema_mismatch, dependency_breakage, config_issue, import_failure, api_contract_mismatch.
4. THE StackTraceParser SHALL generate a suspected_cause string (e.g., "missing required request field 'user_id'").
5. IF the payload is missing fields or has no user-code frames, THEN THE StackTraceParser SHALL return sensible defaults rather than raising an exception.

---

### Requirement 6: Code Context Retrieval

**User Story:** As the pipeline, I need to retrieve only the relevant source file involved in a crash from GitHub, so that the patch generator has real code without exposing the full repository.

#### Acceptance Criteria

1. THE CodeContextEngine SHALL retrieve file content from GitHub using PyGithub with a 10-second timeout.
2. THE CodeContextEngine SHALL retrieve ONLY the specific file identified in the stack trace (not the full repo tree).
3. THE CodeContextEngine SHALL retry up to 3 times with exponential backoff on failure.
4. IF all GitHub fetch attempts fail, THEN THE CodeContextEngine SHALL return a hardcoded fallback source constant (the demo-app/routes/user.py content) and log a WARNING.
5. THE CodeContextEngine SHALL never raise an exception to the caller.

---

### Requirement 7: Secret Redaction

**User Story:** As a security-conscious user, I want RuntimeGuard to redact secrets before sending code to any LLM, so that credentials are never exposed.

#### Acceptance Criteria

1. THE SecretRedactor SHALL apply regex-based redaction replacing detected secrets with `[REDACTED]` before any LLM call.
2. THE SecretRedactor SHALL detect: API keys (AWS, GitHub, Stripe), passwords assigned to variables, bearer tokens, database connection strings, emails, and credit card patterns.
3. IF redaction fails, THEN THE System SHALL abort the LLM call and use fallback patches.
4. THE SecretRedactor SHALL log redaction events (file, line, category) without logging the matched value.

---

### Requirement 8: Replay Test Generator

**User Story:** As the pipeline, I need to generate a reproducible test from the production failure, so that I can prove the bug exists before attempting to fix it.

#### Acceptance Criteria

1. THE ReplayTestGenerator SHALL convert the incident bundle (endpoint, method, payload, expected error) into a pytest function that reproduces the crash.
2. THE generated replay test SHALL assert that the endpoint returns a 500 status (proving the bug exists in unfixed code).
3. THE generated replay test SHALL be stored on the Incident record as `replay_test_code`.
4. THE replay test format SHALL be: `def test_runtimeguard_replay_incident(): response = client.post("{endpoint}", json={payload}); assert response.status_code != 500` (inverted for verification after fix).

---

### Requirement 9: Failure Reproduction (Before-Fix Sandbox)

**User Story:** As the pipeline, I need to confirm the failure is reproducible before attempting any fix, so that the system only fixes what it can prove is broken.

#### Acceptance Criteria

1. THE FailureReplaySandbox SHALL run the generated replay test against the UNFIXED code and confirm it fails (proving the bug exists).
2. THE before-fix result SHALL be stored on the Incident as `replay_test_before_result`.
3. IF the replay test passes on unfixed code (bug not reproducible), THEN THE pipeline SHALL mark the incident as "failed" with reason "Bug not reproducible in sandbox".
4. THE FailureReplaySandbox SHALL use the same Docker sandbox infrastructure as the verification sandbox, with the same timeout and fallback behavior.

---

### Requirement 10: Claude Patch Generator (Multi-Candidate)

**User Story:** As the pipeline, I need to generate exactly 2 patch candidates — one minimal and one robust — so that the system can demonstrate patch rejection and selection.

#### Acceptance Criteria

1. THE RemediationAgent SHALL call Claude to generate exactly 2 patches per incident.
2. Candidate 1 SHALL be prompted as "most minimal possible fix" (intentionally incomplete — wraps only the immediate crash, misses input validation).
3. Candidate 2 SHALL be prompted as "robust fix with proper input validation and error handling" (validates input, returns proper HTTP errors).
4. THE RemediationAgent SHALL include in the prompt: error message, stack trace, source code, endpoint, payload, and suspected cause.
5. THE system prompt SHALL instruct Claude to return ONLY the patched file content with no markdown or explanation.
6. IF the Claude API fails after 1 retry (10s timeout), THEN THE RemediationAgent SHALL return pre-baked fallback patches matching the demo-contracts specification.
7. THE RemediationAgent SHALL never raise an exception to the caller.

---

### Requirement 11: Patch Policy Engine (Rejection)

**User Story:** As the pipeline, I need to check whether a patch is safe before running it in the sandbox, so that obviously bad patches are rejected with clear reasons.

#### Acceptance Criteria

1. THE PatchPolicyEngine SHALL analyze each patch diff and reject it if any of the following are true: more than 3 files changed, root file not touched, hardcoded dummy values added (e.g., `user_id = "unknown"`), broad `except Exception` added without re-raise, auth/payment files modified, tests removed.
2. WHEN a patch is rejected, THE System SHALL set `rejected=True` and `rejection_reasons` on the Patch record with a human-readable explanation.
3. REJECTED patches SHALL NOT proceed to sandbox verification.
4. THE PatchPolicyEngine SHALL be applied BEFORE sandbox execution to save time and demonstrate the rejection flow.

---

### Requirement 12: Verification Sandbox (After-Fix)

**User Story:** As the pipeline, I need to verify patches by running the replay test AND regression tests in an isolated container, so that only correct fixes proceed to PR creation.

#### Acceptance Criteria

1. THE VerificationSandbox SHALL create a Docker container (python:3.11-slim), apply the patch, and run: (a) the replay test, (b) the full test suite (pytest).
2. THE VerificationSandbox SHALL enforce a 60-second timeout; IF exceeded, THEN it SHALL kill the container and return (False, "Sandbox timeout (60s)").
3. THE VerificationSandbox SHALL always clean up containers in a finally block regardless of outcome.
4. IF Docker is unavailable, THEN THE VerificationSandbox SHALL fall back to pattern-matching: if the patch contains `data.get('user_id')` AND `db.get(user_id)`, return (True, pre-recorded PASS output); otherwise return (False, pre-recorded FAIL output).
5. THE VerificationSandbox SHALL never raise an exception to the caller.
6. WHEN verification passes, THE System SHALL update the patch with `sandbox_status="passed"` and the test output.
7. WHEN verification fails, THE System SHALL update the patch with `sandbox_status="failed"` and the failure output.

---

### Requirement 13: Risk Score Engine

**User Story:** As the pipeline, I need to score each patch on safety, so that engineers and judges can see a trust signal alongside the fix.

#### Acceptance Criteria

1. THE RiskScoreEngine SHALL compute a score from 0-100 for each non-rejected patch based on: files changed (fewer = better), lines changed (fewer = better), sensitive files touched (auth/payment = penalty), replay test result, regression test result, hardcoded values (penalty), broad exception handling (penalty).
2. THE RiskScoreEngine SHALL classify scores as: 80-100 = "Low Risk" (green), 50-79 = "Medium Risk" (amber), 0-49 = "High Risk" (red).
3. THE risk_score and risk_label SHALL be stored on the Patch record.
4. THE winning patch (selected for PR) SHALL always be the one with the highest risk score among verified patches.

---

### Requirement 14: Root Cause Explainer

**User Story:** As a developer, I want a simple language explanation of what caused the crash, so that I can understand the incident without reading the full stack trace.

#### Acceptance Criteria

1. THE System SHALL generate a root_cause_explanation string for each incident (e.g., "The checkout endpoint accessed payload['user_id'] without validating that user_id existed in the request body. When the frontend sent only cart_id, the backend raised KeyError and returned 500.").
2. THE explanation SHALL be generated by Claude as part of the patch generation call (or rule-based for known patterns).
3. THE explanation SHALL be stored on the Incident record and displayed in the dashboard.

---

### Requirement 15: GitHub PR Creator

**User Story:** As the pipeline, I need to create a recovery pull request with full evidence, so that the fix is visible, trustworthy, and mergeable.

#### Acceptance Criteria

1. THE PRCreator SHALL create a branch `runtimeguard/fix-{incident_id[:8]}`, commit the patched file, and open a PR against main.
2. THE PR title SHALL be: `[RuntimeGuard] Fix {exception_type} in {endpoint}`.
3. THE PR body SHALL include: incident ID, root cause explanation, failing payload, stack trace summary, before/after sandbox results, risk score, replay test, and "Human approval required" note.
4. THE PRCreator SHALL add the label `auto-healed` (creating it if needed).
5. IF the incident was preventable, THE PR body SHALL include: "This crash was preventable. RuntimeGuard warned about this pattern {days} days ago."
6. IF GitHub API fails, THEN THE PRCreator SHALL return a mock PR URL and number, log a WARNING, and never crash the pipeline.
7. THE PRCreator SHALL provide a `close_demo_prs()` function for /demo/reset.

---

### Requirement 16: Persistent Context Engine (Operational Memory)

**User Story:** As the system, I need a persistent operational memory that stores every incident, remediation, and operational event as a connected knowledge structure — so that when a new crash arrives, I can reconstruct full investigation context, surface similar past incidents (even across service renames and topology drift), and suggest historically-validated remediations.

#### Acceptance Criteria

1. THE PersistentContextEngine SHALL ingest all pipeline events as timestamped JSONL records: deploys, logs, metrics, traces, topology changes, incident signals, and remediations.
2. THE PersistentContextEngine SHALL expose two operations: `ingest(events)` and `reconstruct_context(signal, mode)` matching the Anvil PCE interface contract.
3. WHEN `reconstruct_context` is called with an incident signal, THE engine SHALL return a structured Context containing: related_events (ordered, deduped, with provenance), causal_chain (cause→effect edges with confidence), similar_past_incidents (with similarity score and rationale), suggested_remediations (with historical outcome and confidence), overall confidence (0-1), and an explain narrative.
4. THE PersistentContextEngine SHALL perform topology-independent behavioral matching: if a service is renamed (e.g., payments-svc → billing-svc), past incidents involving the old name SHALL still surface as similar when the same behavioral pattern recurs under the new name.
5. THE PersistentContextEngine SHALL synthesize causal relationships dynamically from correlated events (deploy → latency spike → error → crash) without requiring a predefined schema.
6. THE PersistentContextEngine SHALL maintain a remediation history that reinforces successful actions and decays unsuccessful ones, improving suggested_remediations confidence over time.
7. FOR the MVP demo, THE engine SHALL be seeded with a historical incident pattern (deploy → deprecated API crash → rollback) dated 47 days prior, and SHALL surface this as a similar_past_incident when the demo crash fires — demonstrating the "Was preventable" annotation with full causal context.
8. THE `seed_proactive_pr()` function SHALL seed both the ProactivePR record AND the PCE's operational memory with the historical event sequence.
9. THE `reconstruct_context` in "fast" mode SHALL return within 2 seconds; "deep" mode within 6 seconds.
10. THE PersistentContextEngine SHALL support ingestion of at least 1,000 events/second with events becoming queryable within 5 seconds of ingestion.

---

### Requirement 17: Remediation Pipeline Orchestration

**User Story:** As the system, I need a pipeline that chains all services with atomic status updates, so that the frontend shows real-time progress through the full loop.

#### Acceptance Criteria

1. THE pipeline SHALL execute the full loop: Detect → Bundle → Reproduce → Patch → Reject/Verify → PR → Learn.
2. THE pipeline steps SHALL be: parse crash → update status "bundled" → generate replay test → update status "reproducing" → run before-fix sandbox → update status "patching" → call PCE `reconstruct_context` for historical context → generate 2 patches (enriched with PCE context) → apply patch policy (reject bad ones) → update status "verifying" → run verification sandbox on non-rejected patches → compute risk scores → select winner → update status "pr_created" → create PR → check preventability → update status "healed" → ingest resolution event into PCE.
3. THE pipeline SHALL update the Incident status atomically after each step so the frontend shows real-time progress via polling.
4. THE pipeline SHALL never skip a status transition.
5. IF any step fails, THEN THE pipeline SHALL set status to "failed" with a failure_reason and stop execution.
6. THE pipeline SHALL wrap every step in try/except; no unhandled exception SHALL propagate.
7. THE pipeline SHALL call `recalculate_health_score()` after completion.
8. AFTER resolution, THE pipeline SHALL ingest the full incident lifecycle (crash event, patches attempted, verification results, remediation outcome) into the PersistentContextEngine for future recall.

---

### Requirement 18: Webhook Endpoint

**User Story:** As an external system, I want to send crash payloads to RuntimeGuard via webhook, so that the healing process starts automatically (runtime-triggered, not human-triggered).

#### Acceptance Criteria

1. THE System SHALL expose `POST /webhook/crash` that accepts a JSON crash payload.
2. THE endpoint SHALL validate the payload structure (exception_type, exception_message, stacktrace, repo required).
3. THE endpoint SHALL create an Incident record with status "detected" and launch the pipeline as a BackgroundTask.
4. THE endpoint SHALL return HTTP 202 with `{ incident_id, status: "accepted" }`.

---

### Requirement 19: Incident Query Endpoints

**User Story:** As the frontend dashboard, I need to fetch incident data with patches, so that I can display real-time healing progress through every pipeline stage.

#### Acceptance Criteria

1. THE System SHALL expose `GET /incidents` returning all incidents ordered by created_at DESC, each including its patches array with risk scores and rejection reasons.
2. THE System SHALL expose `GET /incidents/{incident_id}` returning full incident detail with patches, replay test code, before-fix result, and root cause explanation.
3. THE response SHALL use Pydantic models for clean serialization matching the TypeScript interfaces.

---

### Requirement 20: Health Score and Proactive Layer

**User Story:** As a developer, I want a health score and proactive PR visibility, so that I can see the value of prevention alongside healing.

#### Acceptance Criteria

1. THE System SHALL expose `GET /health-score?repo={repo}` returning the current score and breakdown.
2. THE System SHALL compute HealthScore as: `max(0, min(100, 100 − (cve×10) − (deprecated×5) − (open_incidents×15) − (risky_patterns×8)))`.
3. THE System SHALL expose `GET /proactive-prs` returning all proactive PR records.
4. THE System SHALL include a `known_breaking_changes.json` with 5 pre-loaded patterns: @app.on_event, requests.get( without timeout, @app.before_first_request, autocommit=True, openai.ChatCompletion.create.
5. THE DependencyScanner SHALL scan Python files for these patterns and report matches.

---

### Requirement 21: Frontend Dashboard

**User Story:** As a presenter, I want a polished real-time dashboard that shows the complete Detect → Bundle → Reproduce → Patch → Verify → PR loop live, so that judges see the system working during the pitch.

#### Acceptance Criteria

1. THE Dashboard SHALL display a top bar with "RUNTIMEGUARD AI" branding, LiveStatusBadge (green pulsing dot + "LIVE"), Demo Trigger button, and Demo Reset button.
2. THE Dashboard SHALL display a HealthScoreGauge (SVG circular, 0-100) with color coding: green ≥80, amber 50-79, red <50, with animated transitions and breakdown grid.
3. THE Dashboard SHALL display an incident timeline showing the full pipeline progression with status badges colored by state (detected=red, bundled/reproducing=amber, patching/verifying=amber+pulse, pr_created=blue, healed=green, failed=red).
4. THE Dashboard SHALL display a PreventableAnnotation component: amber background banner with AlertTriangle icon, text "Was preventable — PR #{number} warned about this deprecation {days} days ago", bold and visually prominent.
5. THE Dashboard SHALL display PatchCards showing: candidate number, REJECTED badge with reasons (for Patch 1), VERIFIED badge with risk score (for Patch 2), SELECTED tag on winner, collapsible sandbox output, and before/after comparison.
6. THE Dashboard SHALL display the replay test code and before-fix result ("Bug confirmed: test fails on unfixed code").
7. THE Dashboard SHALL display the root cause explanation in plain language.
8. THE Dashboard SHALL display a risk score badge on the winning patch (e.g., "Risk Score: 94/100 — Low Risk").
9. THE Dashboard SHALL display a "Context Engine" panel showing the PCE's reconstructed context: causal chain visualization, similar past incidents with similarity scores, and suggested remediations with confidence levels.
10. THE Dashboard SHALL display the PCE's `explain` narrative as a human-readable investigation summary.
11. THE Dashboard SHALL poll `GET /incidents` and `GET /health-score` every 5 seconds using a generic `usePolling` hook.
12. THE Dashboard SHALL use a dark theme (bg-gray-950 text-white).

---

### Requirement 22: End-to-End Demo Reliability

**User Story:** As a presenter, I want the full demo loop to complete reliably every time with the complete Detect → Bundle → Reproduce → Patch → Reject → Verify → PR → Learn flow visible.

#### Acceptance Criteria

1. THE full demo loop SHALL complete in under 2 minutes.
2. EVERY external API call (Anthropic, GitHub, Docker) SHALL have a try/except with a pre-baked fallback that allows the pipeline to complete.
3. THE System SHALL log all fallback activations with level WARNING.
4. THE `/demo/reset` endpoint SHALL return the system to a clean state ready for another demo run.
5. THE demo SHALL be repeatable: trigger → reset → trigger → reset with consistent results.
6. THE demo SHALL show: (a) bug reproduction confirmed, (b) Patch 1 rejected with reasons, (c) Patch 2 verified with passing tests, (d) risk score computed, (e) PR created, (f) "Was preventable" annotation.

---

### Requirement 23: CORS and API Security

**User Story:** As a developer, I want proper CORS configuration and basic security, so that the frontend can communicate with the backend and no secrets are exposed.

#### Acceptance Criteria

1. THE System SHALL configure CORS middleware allowing `http://localhost:5173` (Vite dev server).
2. THE System SHALL never log or expose API key values in application logs or API responses.
3. THE System SHALL apply secret redaction before any LLM call.
4. THE System SHALL use Python logging module for all output.
5. Every external API call SHALL have try/except with fallback, max 1 retry, 10s timeout.
