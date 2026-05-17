"""
Scan router - RuntimeGuard on-demand scan endpoints.
"""
import json
import logging
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db, SessionLocal
from backend.models.scan_session import ScanSession

logger = logging.getLogger(__name__)
router = APIRouter()


class StartScanRequest(BaseModel):
    repo_path: str
    deployment_url: str
    app_type: Optional[str] = "unknown"
    scan_mode: Optional[str] = "deep"
    login_email: Optional[str] = None
    login_password: Optional[str] = None


@router.post("/start")
async def start_scan(request: StartScanRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Start a new RuntimeGuard scan."""
    scan_id = str(uuid.uuid4())[:12]

    session = ScanSession(
        id=scan_id,
        repo_path=request.repo_path,
        deployment_url=request.deployment_url,
        app_type=request.app_type or "unknown",
        scan_mode=request.scan_mode or "deep",
        login_email=request.login_email,
        status="started",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(session)
    db.commit()

    from backend.services.scan_pipeline import run_scan_pipeline
    background_tasks.add_task(run_scan_pipeline, scan_id)

    logger.info(f"Scan started: {scan_id} for {request.repo_path} -> {request.deployment_url}")
    return {
        "scan_id": scan_id,
        "repo": request.repo_path,
        "deployment_url": request.deployment_url,
        "status": "started",
        "message": "RuntimeGuard scan initiated"
    }


@router.get("/knowledge/patterns")
async def get_knowledge_patterns():
    """Return all stored knowledge patterns."""
    try:
        from backend.services.scan_knowledge import get_all_patterns
        return {"patterns": get_all_patterns()}
    except Exception as e:
        return {"patterns": [], "error": str(e)}


@router.get("")
async def list_scans(db: Session = Depends(get_db)):
    """List all scan sessions."""
    sessions = db.query(ScanSession).order_by(ScanSession.created_at.desc()).limit(20).all()
    return [_serialize_session(s) for s in sessions]


@router.get("/{scan_id}")
async def get_scan(scan_id: str, db: Session = Depends(get_db)):
    """Get current scan status and results."""
    session = db.query(ScanSession).filter_by(id=scan_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Scan not found")

    return _serialize_session(session)


@router.post("/{scan_id}/approve")
async def approve_scan(scan_id: str, db: Session = Depends(get_db)):
    """Approve the generated fix - creates recovery artifact."""
    session = db.query(ScanSession).filter_by(id=scan_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Scan not found")

    if session.status not in ("awaiting_approval", "approved"):
        raise HTTPException(status_code=400, detail=f"Scan is in status '{session.status}', not ready for approval")

    session.status = "approved"
    session.updated_at = datetime.utcnow()
    db.commit()

    # Update knowledge memory (mark as successfully resolved)
    try:
        from backend.services.scan_knowledge import store_pattern
        bundle = json.loads(session.incident_bundle or '{}')
        store_pattern(
            incident_type=session.incident_type or "unknown",
            root_cause=bundle.get('root_cause_hypothesis', ''),
            evidence_signature='; '.join(bundle.get('evidence', [])[:3]),
            fix_strategy=session.recovery_strategy or '',
            files_pattern=session.patch_files or '[]',
            test_strategy="human_approved"
        )
    except Exception as e:
        logger.warning(f"Knowledge update on approval failed: {e}")

    return {
        "scan_id": scan_id,
        "status": "approved",
        "message": "Fix approved. Recovery artifact created. Pattern saved to knowledge memory.",
        "pr_title": session.pr_title,
        "patch_diff": session.patch_diff,
    }


@router.post("/{scan_id}/reject")
async def reject_scan(scan_id: str, db: Session = Depends(get_db)):
    """Reject the generated fix."""
    session = db.query(ScanSession).filter_by(id=scan_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Scan not found")

    session.status = "rejected"
    session.updated_at = datetime.utcnow()
    db.commit()

    return {"scan_id": scan_id, "status": "rejected", "message": "Fix rejected by human reviewer."}


def _serialize_session(s: ScanSession) -> dict:
    return {
        "scan_id": s.id,
        "repo_path": s.repo_path,
        "deployment_url": s.deployment_url,
        "app_type": s.app_type,
        "scan_mode": s.scan_mode,
        "status": s.status,
        "created_at": str(s.created_at) if s.created_at else None,
        "updated_at": str(s.updated_at) if s.updated_at else None,

        "repo_risks": json.loads(s.repo_risks or '[]'),
        "browser_events": json.loads(s.browser_events or '[]'),
        "pages_visited": s.pages_visited or 0,
        "buttons_tested": s.buttons_tested or 0,
        "failed_api_calls": s.failed_api_calls or 0,
        "console_errors": s.console_errors or 0,

        "incident_type": s.incident_type,
        "incident_bundle": json.loads(s.incident_bundle or '{}'),
        "recovery_strategy": s.recovery_strategy,
        "patch_diff": s.patch_diff,
        "patch_files": json.loads(s.patch_files or '[]'),
        "test_code": s.test_code,

        "sandbox_status": s.sandbox_status,
        "sandbox_tests": json.loads(s.sandbox_tests or '[]'),
        "sandbox_duration_ms": s.sandbox_duration_ms or 0,

        "risk_score": s.risk_score,
        "risk_label": s.risk_label,
        "risk_reasons": json.loads(s.risk_reasons or '[]'),

        "pr_title": s.pr_title,
        "pr_body": s.pr_body,

        "failure_reason": s.failure_reason,
    }
