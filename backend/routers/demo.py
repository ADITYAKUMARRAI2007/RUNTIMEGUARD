import logging
from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from backend.database import get_db, SessionLocal
from backend.models.incident import Incident
from backend.models.patch import Patch
from backend.models.proactive_pr import ProactivePR
from backend.models.health_score import HealthScore
from backend.config import load_settings

logger = logging.getLogger(__name__)
router = APIRouter()

# Fixed demo crash payload from demo-contracts.md
DEMO_CRASH_PAYLOAD = {
    "exception_type": "KeyError",
    "exception_message": "'user_id'",
    "stacktrace": [
        {
            "file": "demo-app/routes/user.py",
            "line": 12,
            "function": "get_user",
            "text": "return db[data['user_id']]"
        }
    ],
    "repo": "owner/demo-app",
    "endpoint": "POST /user",
    "payload": {"cart_id": "c123"}
}


@router.post("/trigger")
async def demo_trigger(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Trigger the full demo loop. Creates incident and fires pipeline."""
    logger.info("Demo trigger received")

    # Create incident from hardcoded payload
    incident = Incident(
        exception_type=DEMO_CRASH_PAYLOAD["exception_type"],
        exception_msg=DEMO_CRASH_PAYLOAD["exception_message"],
        source_repo=DEMO_CRASH_PAYLOAD["repo"],
        raw_stack_trace=str(DEMO_CRASH_PAYLOAD["stacktrace"]),
        status="detected",
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)

    logger.info(f"Demo incident created: {incident.id}")

    # Fire remediation pipeline as background task
    # (pipeline.py will be created in Task 12)
    background_tasks.add_task(_run_pipeline, incident.id, DEMO_CRASH_PAYLOAD)

    return {
        "incident_id": incident.id,
        "status": "detected",
        "message": "Demo triggered — pipeline running in background"
    }


@router.post("/reset")
async def demo_reset(db: Session = Depends(get_db)):
    """Reset all demo data to clean state."""
    logger.info("Demo reset received")
    settings = load_settings()

    # Delete all patches first (FK constraint)
    db.query(Patch).delete()
    # Delete all incidents
    db.query(Incident).delete()
    # Delete proactive PRs
    db.query(ProactivePR).delete()
    db.commit()

    # Reset health score
    hs = db.query(HealthScore).filter_by(repo=settings.github_repo).first()
    if hs:
        hs.score = 100
        hs.cve_count = 0
        hs.deprecated_count = 0
        hs.open_incidents = 0
        hs.risky_patterns = 0
        db.commit()

    # Re-seed proactive PR
    from backend.main import seed_proactive_pr
    seed_proactive_pr(db)

    # Attempt to close GitHub PRs (with fallback)
    try:
        from backend.services.pr_creator import close_demo_prs
        close_demo_prs(settings.github_repo, settings.github_token)
    except Exception as e:
        logger.warning(f"Failed to close demo PRs (non-critical): {e}")

    logger.info("Demo reset complete")
    return {"message": "Demo reset complete"}


async def _run_pipeline(incident_id: str, payload: dict):
    """Wrapper to run the remediation pipeline. Falls back gracefully."""
    try:
        from backend.services.pipeline import run_remediation_pipeline
        await run_remediation_pipeline(incident_id, payload)
    except ImportError:
        # Pipeline not yet implemented — update status to show progress
        logger.warning("Pipeline not yet implemented, simulating status progression")
        db = SessionLocal()
        try:
            incident = db.query(Incident).filter_by(id=incident_id).first()
            if incident:
                incident.status = "healed"
                incident.was_preventable = True
                incident.preventable_pr_number = 142
                incident.preventable_pr_days_ago = 47
                db.commit()
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Pipeline failed: {e}")
        db = SessionLocal()
        try:
            incident = db.query(Incident).filter_by(id=incident_id).first()
            if incident:
                incident.status = "failed"
                incident.failure_reason = str(e)
                db.commit()
        finally:
            db.close()
