"""
Production-grade scan + incident endpoints for RuntimeGuard AI.

Two routers are exported:
  scans_router   → mounted at /api/scans   in main.py
  api_router     → mounted at /api         in main.py  (incidents + memory)

Final URL map
-------------
POST   /api/scans/start
GET    /api/scans/{scan_id}
GET    /api/scans/{scan_id}/repo-report
GET    /api/scans/{scan_id}/visual-report
GET    /api/scans/{scan_id}/incidents
GET    /api/scans/{scan_id}/screenshots

GET    /api/incidents/{incident_id}
POST   /api/incidents/{incident_id}/recover
GET    /api/incidents/{incident_id}/verification
GET    /api/incidents/{incident_id}/pr-preview
POST   /api/incidents/{incident_id}/approve
POST   /api/incidents/{incident_id}/reject

GET    /api/memory/patterns
"""

import json
import logging
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.scan_session import ScanSession

logger = logging.getLogger(__name__)

# Two routers — see module docstring for mounting instructions.
scans_router = APIRouter()
api_router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class Credentials(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None


class StartScanRequest(BaseModel):
    repo_input: str = Field(..., description="GitHub URL (https://github.com/…) or local path")
    deployment_url: str = Field(..., description="Base URL of the deployed application")
    app_type: Optional[str] = Field("auto", description="auto / react / next / node / fastapi / unknown")
    scan_mode: Optional[str] = Field("deep", description="quick / deep / recovery")
    credentials: Optional[Credentials] = None
    anthropic_api_key: Optional[str] = None


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _is_github_url(value: str) -> bool:
    return value.startswith("https://github.com") or value.startswith("http://github.com")


def _session_or_404(scan_id: str, db: Session) -> ScanSession:
    session = db.query(ScanSession).filter_by(id=scan_id).first()
    if not session:
        raise HTTPException(status_code=404, detail=f"Scan '{scan_id}' not found")
    return session


def _safe_json(value: Optional[str], default: Any = None) -> Any:
    if default is None:
        default = []
    if not value:
        return default
    try:
        return json.loads(value)
    except Exception:
        return default


def _serialize_full(s: ScanSession) -> dict:
    """Serialise every field of a ScanSession to a plain dict."""
    return {
        "scan_id": s.id,
        "repo_path": s.repo_path,
        "deployment_url": s.deployment_url,
        "app_type": s.app_type,
        "scan_mode": s.scan_mode,
        "login_email": s.login_email,
        "status": s.status,
        "created_at": str(s.created_at) if s.created_at else None,
        "updated_at": str(s.updated_at) if s.updated_at else None,

        # Repo scan
        "repo_risks": _safe_json(s.repo_risks),
        "app_map": _safe_json(s.app_map, default={}),

        # Browser scan
        "browser_events": _safe_json(s.browser_events),
        "pages_visited": s.pages_visited or 0,
        "buttons_tested": s.buttons_tested or 0,
        "failed_api_calls": s.failed_api_calls or 0,
        "console_errors": s.console_errors or 0,
        "screenshots": _safe_json(s.screenshots),

        # Incident
        "incident_type": s.incident_type,
        "incident_bundle": _safe_json(s.incident_bundle, default={}),
        "recovery_strategy": s.recovery_strategy,
        "patch_diff": s.patch_diff,
        "patch_files": _safe_json(s.patch_files),
        "test_code": s.test_code,

        # Sandbox
        "sandbox_status": s.sandbox_status,
        "sandbox_tests": _safe_json(s.sandbox_tests),
        "sandbox_duration_ms": s.sandbox_duration_ms or 0,

        # Risk
        "risk_score": s.risk_score,
        "risk_label": s.risk_label,
        "risk_reasons": _safe_json(s.risk_reasons),

        # PR
        "pr_title": s.pr_title,
        "pr_body": s.pr_body,

        # Meta
        "knowledge_updated": bool(s.knowledge_updated),
        "failure_reason": s.failure_reason,
    }


def _persist_knowledge(session: ScanSession) -> None:
    """Store approval pattern in knowledge memory (non-fatal)."""
    try:
        from backend.services.scan_knowledge import store_pattern
        bundle: dict = _safe_json(session.incident_bundle, default={})
        store_pattern(
            incident_type=session.incident_type or "unknown",
            root_cause=bundle.get("root_cause_hypothesis", ""),
            evidence_signature="; ".join(bundle.get("evidence", [])[:3]),
            fix_strategy=session.recovery_strategy or "",
            files_pattern=session.patch_files or "[]",
            test_strategy="human_approved",
        )
        session.knowledge_updated = True
    except Exception as exc:
        logger.warning(f"Knowledge persist failed (non-fatal): {exc}")


# ===========================================================================
# scans_router  →  mounted at /api/scans
# ===========================================================================

@scans_router.post("/start", status_code=202)
async def start_scan(
    request: StartScanRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Start a new RuntimeGuard scan.

    - *repo_input* can be a ``https://github.com/…`` URL (cloned automatically)
      or an absolute local path.
    - The scan runs asynchronously. Poll ``GET /api/scans/{scan_id}`` for status.
    """
    scan_id = str(uuid.uuid4())[:12]
    credentials = request.credentials or Credentials()

    session = ScanSession(
        id=scan_id,
        repo_path=request.repo_input,
        deployment_url=request.deployment_url,
        app_type=request.app_type or "auto",
        scan_mode=request.scan_mode or "deep",
        login_email=credentials.email,
        status="queued",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(session)
    db.commit()

    # Surface the API key to downstream services if provided.
    if request.anthropic_api_key:
        os.environ.setdefault("ANTHROPIC_API_KEY", request.anthropic_api_key)

    from backend.services.scan_pipeline import run_scan_pipeline
    background_tasks.add_task(run_scan_pipeline, scan_id)

    logger.info(
        f"[{scan_id}] Scan queued — repo_input={request.repo_input!r} "
        f"deployment={request.deployment_url!r} mode={request.scan_mode}"
    )

    return {
        "scan_id": scan_id,
        "repo_input": request.repo_input,
        "is_github_url": _is_github_url(request.repo_input),
        "deployment_url": request.deployment_url,
        "app_type": request.app_type,
        "scan_mode": request.scan_mode,
        "status": "queued",
        "message": "Scan queued. Poll GET /api/scans/{scan_id} for progress.",
    }


@scans_router.get("/{scan_id}/repo-report")
async def get_repo_report(scan_id: str, db: Session = Depends(get_db)):
    """Repo static-analysis: risks, framework detection, routes, dependencies."""
    session = _session_or_404(scan_id, db)

    repo_risks: List[dict] = _safe_json(session.repo_risks)
    app_map: dict = _safe_json(session.app_map, default={})

    by_severity: Dict[str, list] = {"critical": [], "high": [], "medium": [], "low": []}
    for risk in repo_risks:
        by_severity.setdefault(risk.get("severity", "low"), []).append(risk)

    by_type: Dict[str, list] = {}
    for risk in repo_risks:
        by_type.setdefault(risk.get("risk_type", "unknown"), []).append(risk)

    return {
        "scan_id": scan_id,
        "status": session.status,
        "repo_path": session.repo_path,
        "framework": app_map.get("framework", "unknown"),
        "dependencies_detected": app_map.get("dependencies", {}),
        "backend_routes": app_map.get("backend_routes", []),
        "frontend_api_calls": app_map.get("frontend_api_calls", []),
        "env_vars_by_file": app_map.get("env_vars_by_file", {}),
        "total_risks": len(repo_risks),
        "by_severity": {k: len(v) for k, v in by_severity.items()},
        "by_type": {k: len(v) for k, v in by_type.items()},
        "risks": repo_risks,
    }


@scans_router.get("/{scan_id}/visual-report")
async def get_visual_report(scan_id: str, db: Session = Depends(get_db)):
    """Browser-agent visual scan: events, metrics, screenshots."""
    session = _session_or_404(scan_id, db)

    events: List[dict] = _safe_json(session.browser_events)
    screenshots: List[str] = _safe_json(session.screenshots)

    by_type: Dict[str, list] = {}
    for ev in events:
        by_type.setdefault(ev.get("event_type", "unknown"), []).append(ev)

    return {
        "scan_id": scan_id,
        "status": session.status,
        "deployment_url": session.deployment_url,
        "pages_visited": session.pages_visited or 0,
        "buttons_tested": session.buttons_tested or 0,
        "failed_api_calls": session.failed_api_calls or 0,
        "console_errors": session.console_errors or 0,
        "dead_buttons": len(by_type.get("dead_button", [])),
        "screenshots_count": len(screenshots),
        "screenshots": screenshots,
        "event_summary": {k: len(v) for k, v in by_type.items()},
        "events": events,
    }


@scans_router.get("/{scan_id}/incidents")
async def get_scan_incidents(scan_id: str, db: Session = Depends(get_db)):
    """Incident bundle generated for this scan."""
    session = _session_or_404(scan_id, db)

    if not session.incident_bundle:
        return {
            "scan_id": scan_id,
            "status": session.status,
            "incident": None,
            "message": "Incident bundle not yet generated. Check scan status.",
        }

    return {
        "scan_id": scan_id,
        "status": session.status,
        "incident_type": session.incident_type,
        "incident": _safe_json(session.incident_bundle, default={}),
        "risk_score": session.risk_score,
        "risk_label": session.risk_label,
        "risk_reasons": _safe_json(session.risk_reasons),
    }


@scans_router.get("/{scan_id}/screenshots")
async def get_scan_screenshots(scan_id: str, db: Session = Depends(get_db)):
    """Screenshot paths taken during the visual scan (filters to files that exist on disk)."""
    session = _session_or_404(scan_id, db)
    screenshots: List[str] = _safe_json(session.screenshots)
    existing = [p for p in screenshots if Path(p).exists()]

    return {
        "scan_id": scan_id,
        "status": session.status,
        "total_screenshots": len(screenshots),
        "available_on_disk": len(existing),
        "screenshots": existing,
    }


@scans_router.get("/{scan_id}")
async def get_scan(scan_id: str, db: Session = Depends(get_db)):
    """Full scan record including all pipeline outputs."""
    session = _session_or_404(scan_id, db)
    return _serialize_full(session)


# ===========================================================================
# api_router  →  mounted at /api
# ===========================================================================

@api_router.get("/incidents/{incident_id}")
async def get_incident(incident_id: str, db: Session = Depends(get_db)):
    """Full incident bundle. For MVP scan_id == incident_id."""
    session = _session_or_404(incident_id, db)

    return {
        "incident_id": incident_id,
        "scan_id": incident_id,
        "status": session.status,
        "incident_type": session.incident_type,
        "bundle": _safe_json(session.incident_bundle, default={}),
        "recovery_strategy": session.recovery_strategy,
        "patch_diff": session.patch_diff,
        "patch_files": _safe_json(session.patch_files),
        "test_code": session.test_code,
        "sandbox_status": session.sandbox_status,
        "sandbox_tests": _safe_json(session.sandbox_tests),
        "sandbox_duration_ms": session.sandbox_duration_ms or 0,
        "risk_score": session.risk_score,
        "risk_label": session.risk_label,
        "risk_reasons": _safe_json(session.risk_reasons),
        "pr_title": session.pr_title,
        "pr_body": session.pr_body,
    }


@api_router.post("/incidents/{incident_id}/recover")
async def recover_incident(incident_id: str, db: Session = Depends(get_db)):
    """Trigger recovery (equivalent to approving the fix)."""
    session = _session_or_404(incident_id, db)

    if session.status == "approved":
        return {
            "incident_id": incident_id,
            "status": "approved",
            "message": "Recovery already applied.",
            "pr_title": session.pr_title,
        }

    if session.status not in ("awaiting_approval", "verified"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot recover: scan is in status '{session.status}'.",
        )

    session.status = "approved"
    session.updated_at = datetime.utcnow()
    db.commit()
    _persist_knowledge(session)
    db.commit()

    return {
        "incident_id": incident_id,
        "status": "approved",
        "message": "Recovery triggered. Fix approved and pattern saved to knowledge memory.",
        "pr_title": session.pr_title,
        "patch_diff": session.patch_diff,
    }


@api_router.get("/incidents/{incident_id}/verification")
async def get_verification(incident_id: str, db: Session = Depends(get_db)):
    """Sandbox verification results for this incident."""
    session = _session_or_404(incident_id, db)

    return {
        "incident_id": incident_id,
        "sandbox_status": session.sandbox_status,
        "sandbox_tests": _safe_json(session.sandbox_tests),
        "sandbox_duration_ms": session.sandbox_duration_ms or 0,
        "test_code": session.test_code,
        "risk_score": session.risk_score,
        "risk_label": session.risk_label,
        "risk_reasons": _safe_json(session.risk_reasons),
    }


@api_router.get("/incidents/{incident_id}/pr-preview")
async def get_pr_preview(incident_id: str, db: Session = Depends(get_db)):
    """Generated PR title + body."""
    session = _session_or_404(incident_id, db)

    if not session.pr_title:
        return {
            "incident_id": incident_id,
            "status": session.status,
            "pr_title": None,
            "pr_body": None,
            "message": "PR preview not yet generated.",
        }

    return {
        "incident_id": incident_id,
        "pr_title": session.pr_title,
        "pr_body": session.pr_body,
        "patch_diff": session.patch_diff,
        "patch_files": _safe_json(session.patch_files),
        "risk_score": session.risk_score,
        "risk_label": session.risk_label,
    }


@api_router.post("/incidents/{incident_id}/approve")
async def approve_incident(incident_id: str, db: Session = Depends(get_db)):
    """Approve the generated fix — stores pattern in knowledge memory."""
    session = _session_or_404(incident_id, db)

    if session.status not in ("awaiting_approval", "verified", "approved"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot approve: scan is in status '{session.status}'.",
        )

    session.status = "approved"
    session.updated_at = datetime.utcnow()
    db.commit()
    _persist_knowledge(session)
    db.commit()

    return {
        "incident_id": incident_id,
        "status": "approved",
        "message": "Fix approved. Pattern saved to knowledge memory.",
        "pr_title": session.pr_title,
        "patch_diff": session.patch_diff,
    }


@api_router.post("/incidents/{incident_id}/reject")
async def reject_incident(incident_id: str, db: Session = Depends(get_db)):
    """Reject the generated fix."""
    session = _session_or_404(incident_id, db)

    session.status = "rejected"
    session.updated_at = datetime.utcnow()
    db.commit()

    return {
        "incident_id": incident_id,
        "status": "rejected",
        "message": "Fix rejected by human reviewer.",
    }


@api_router.get("/memory/patterns")
async def get_memory_patterns():
    """All stored knowledge patterns from the memory graph."""
    try:
        from backend.services.scan_knowledge import get_all_patterns
        patterns = get_all_patterns()
        return {"total": len(patterns), "patterns": patterns}
    except Exception as exc:
        logger.warning(f"Knowledge patterns fetch failed: {exc}")
        return {"total": 0, "patterns": [], "error": str(exc)}
