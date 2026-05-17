"""
Patch generator for scan-detected incidents.
Uses deterministic templates for the 4 drift classes.
"""
from typing import List, Dict, Any, Optional


def generate_patch(incident_type: str, repo_path: str, repo_risks: List[Dict]) -> Optional[Dict[str, Any]]:
    """Generate a patch based on incident type and evidence."""

    if incident_type == "dependency_incompatibility":
        return _patch_dependency_incompatibility(repo_path, repo_risks)
    elif incident_type == "runtime_config_drift":
        return _patch_runtime_config_drift(repo_path, repo_risks)
    elif incident_type == "frontend_backend_contract_mismatch":
        return _patch_contract_mismatch(repo_path, repo_risks)
    elif incident_type == "visual_user_flow_failure":
        return _patch_visual_flow_failure(repo_path, repo_risks)
    return None


def _patch_dependency_incompatibility(repo_path: str, risks: List[Dict]) -> Dict:
    # Look for payment SDK err.code pattern
    payment_risks = [r for r in risks if 'err.code' in r.get('evidence', '') or 'payment-sdk' in r.get('matched', '')]

    if payment_risks:
        file_to_patch = next((r.get('file') for r in payment_risks if r.get('file', '').endswith('.js')), 'backend/payment.js')

        return {
            "patch_id": "patch_sdk_compat_001",
            "strategy": "sdk_compatibility_adapter",
            "files_changed": [file_to_patch],
            "description": "Add SDK v2/v3 compatibility adapter for error response shape",
            "diff": f"""--- a/{file_to_patch}
+++ b/{file_to_patch}
@@ -payment error handling @@
-    const errorCode = err.code
+    // SDK v3 compatibility: err.code (v2) -> err.error_code (v3)
+    const errorCode = err.code || err.error_code || 'UNKNOWN_ERROR'
""",
            "full_patch": {
                file_to_patch: {
                    "find": "const errorCode = err.code",
                    "replace": "// SDK v3 compatibility: err.code (v2) -> err.error_code (v3)\n    const errorCode = err.code || err.error_code || 'UNKNOWN_ERROR'"
                }
            },
            "explanation": "payment-sdk v3 changed error shape: err.code -> err.error_code. Added compatibility adapter that handles both v2 and v3."
        }

    # Generic dependency patch
    return {
        "patch_id": "patch_dep_compat_001",
        "strategy": "dependency_compatibility_adapter",
        "files_changed": [],
        "description": "Update code to handle new library API",
        "diff": "# Review required: update deprecated API usage in flagged files",
        "explanation": "Dependency version incompatibility detected. Manual review of flagged patterns required."
    }


def _patch_runtime_config_drift(repo_path: str, risks: List[Dict]) -> Dict:
    config_risks = [r for r in risks if r.get('risk_type') == 'runtime_config_drift']
    missing_vars = [r.get('matched', '') for r in config_risks if r.get('matched')]

    startup_check = '\n'.join([
        f"if (!process.env.{var}) {{ throw new Error('{var} is required but not set'); }}"
        for var in missing_vars[:5]
    ]) or "// Add startup validation for required env vars"

    return {
        "patch_id": "patch_config_validation_001",
        "strategy": "startup_config_validation",
        "files_changed": ["backend/server.js"],
        "description": f"Add startup validation for missing env vars: {', '.join(missing_vars[:5])}",
        "diff": f"""--- a/backend/server.js
+++ b/backend/server.js
@@ startup @@
+// Startup validation: fail fast if required config missing
+{startup_check}
""",
        "full_patch": {
            "backend/server.js": {
                "prepend": f"// RuntimeGuard: Startup config validation\n{startup_check}\n\n"
            }
        },
        "explanation": f"Added startup validation for environment variables: {', '.join(missing_vars)}"
    }


def _patch_contract_mismatch(repo_path: str, risks: List[Dict]) -> Dict:
    return {
        "patch_id": "patch_contract_001",
        "strategy": "api_contract_alignment",
        "files_changed": [],
        "description": "Align frontend API calls with backend route definitions",
        "diff": "# Review frontend fetch() calls and backend route definitions",
        "explanation": "Frontend is calling endpoints that don't match backend routes. Update either frontend URL or add backend route."
    }


def _patch_visual_flow_failure(repo_path: str, risks: List[Dict]) -> Dict:
    return {
        "patch_id": "patch_ui_flow_001",
        "strategy": "button_error_state",
        "files_changed": ["src/App.jsx"],
        "description": "Add error handling and loading states to interactive elements",
        "diff": """--- a/src/App.jsx
+++ b/src/App.jsx
@@ button click handler @@
-  const handleClick = async () => {
+  const handleClick = async () => {
+    setLoading(true)
+    setError(null)
     try {
       // ... existing code
+    } catch (err) {
+      setError(err.message || 'An error occurred')
     } finally {
+      setLoading(false)
     }
   }""",
        "explanation": "Button click has no error handling. Added loading state and error display."
    }
