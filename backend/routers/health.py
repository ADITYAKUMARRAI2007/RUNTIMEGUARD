import logging
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.health_score import HealthScore
from backend.models.proactive_pr import ProactivePR
from backend.config import load_settings

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/health-score")
async def get_health_score(repo: str = Query(default=None), db: Session = Depends(get_db)):
    """Get current health score and breakdown for a repo."""
    settings = load_settings()
    target_repo = repo or settings.github_repo

    health = db.query(HealthScore).filter_by(repo=target_repo).first()
    if not health:
        return {
            "repo": target_repo,
            "score": 100,
            "cve_count": 0,
            "deprecated_count": 0,
            "open_incidents": 0,
            "risky_patterns": 0,
        }

    return {
        "repo": health.repo,
        "score": health.score,
        "cve_count": health.cve_count,
        "deprecated_count": health.deprecated_count,
        "open_incidents": health.open_incidents,
        "risky_patterns": health.risky_patterns,
    }


@router.get("/proactive-prs")
async def get_proactive_prs(db: Session = Depends(get_db)):
    """Get all proactive PR records."""
    prs = db.query(ProactivePR).order_by(ProactivePR.created_at.desc()).all()
    return [
        {
            "id": pr.id,
            "created_at": str(pr.created_at) if pr.created_at else "",
            "file_path": pr.file_path,
            "pattern_matched": pr.pattern_matched,
            "pr_url": pr.pr_url,
            "pr_number": pr.pr_number,
            "pr_title": pr.pr_title,
            "days_since_created": pr.days_since_created,
            "repo": pr.repo,
        }
        for pr in prs
    ]
