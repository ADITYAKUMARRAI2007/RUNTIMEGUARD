import logging
from fastapi import APIRouter, Depends, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.incident import Incident

logger = logging.getLogger(__name__)
router = APIRouter()


class CrashPayload(BaseModel):
    exception_type: str
    exception_message: str
    stacktrace: list
    repo: str
    endpoint: Optional[str] = None
    payload: Optional[dict] = None
    commit_sha: Optional[str] = None


@router.post("/crash", status_code=202)
async def receive_crash(
    payload: CrashPayload,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Receive a production crash webhook and start the healing pipeline."""
    logger.info(f"Crash webhook received: {payload.exception_type} from {payload.repo}")

    incident = Incident(
        exception_type=payload.exception_type,
        exception_msg=payload.exception_message,
        source_repo=payload.repo,
        raw_stack_trace=str(payload.stacktrace),
        status="detected",
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)

    # Fire pipeline
    background_tasks.add_task(_run_pipeline, incident.id, payload.model_dump())

    return {"incident_id": incident.id, "status": "accepted"}


async def _run_pipeline(incident_id: str, payload: dict):
    """Run the remediation pipeline as a background task."""
    try:
        from backend.services.pipeline import run_remediation_pipeline
        await run_remediation_pipeline(incident_id, payload)
    except Exception as e:
        logger.error(f"Pipeline failed for {incident_id}: {e}")
        from backend.database import SessionLocal
        from backend.models.incident import Incident
        db = SessionLocal()
        try:
            incident = db.query(Incident).filter_by(id=incident_id).first()
            if incident:
                incident.status = "failed"
                incident.failure_reason = str(e)
                db.commit()
        finally:
            db.close()
