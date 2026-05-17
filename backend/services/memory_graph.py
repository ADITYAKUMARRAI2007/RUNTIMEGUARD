import logging
from datetime import datetime

logger = logging.getLogger(__name__)


def check_preventable(db, file_path: str):
    """
    Query proactive_prs table for a matching file_path.
    Returns ProactivePR record if found, None otherwise.
    Never raises.
    """
    try:
        from backend.models.proactive_pr import ProactivePR

        result = db.query(ProactivePR).filter(
            ProactivePR.file_path == file_path
        ).first()

        if result:
            logger.info(
                f"Found preventable PR for {file_path}: "
                f"PR #{result.pr_number} ({result.days_since_created} days ago)"
            )
        return result
    except Exception as e:
        logger.warning(f"check_preventable failed: {e}")
        return None


def seed_proactive_pr(db, repo: str) -> None:
    """
    Create a ProactivePR record with fixed demo values.
    Called from main.py lifespan and /demo/reset.
    Never raises.
    """
    try:
        from backend.models.proactive_pr import ProactivePR

        # Check if already seeded
        existing = db.query(ProactivePR).filter(
            ProactivePR.file_path == "demo-app/app.py"
        ).first()

        if existing:
            logger.info("Proactive PR already seeded")
            return

        proactive = ProactivePR(
            file_path="demo-app/app.py",
            pattern_matched="@app.on_event (deprecated lifecycle hook)",
            pr_url=f"https://github.com/{repo}/pull/142",
            pr_number=142,
            pr_title="[RuntimeGuard] Replace deprecated @app.on_event with lifespan",
            days_since_created=47,
            repo=repo,
        )
        db.add(proactive)
        db.commit()
        logger.info("Seeded proactive PR: demo-app/app.py @app.on_event pattern")
    except Exception as e:
        logger.warning(f"seed_proactive_pr failed: {e}")
        try:
            db.rollback()
        except Exception:
            pass


def recalculate_health_score(db, repo: str) -> None:
    """
    Compute health score: max(0, min(100, 100 - cve*10 - deprecated*5 - incidents*15 - patterns*8))
    Updates or creates the HealthScore record.
    Never raises.
    """
    try:
        from backend.models.health_score import HealthScore
        from backend.models.incident import Incident

        # Count open incidents for this repo
        open_incidents = (
            db.query(Incident)
            .filter(Incident.source_repo == repo)
            .filter(Incident.status.notin_(["healed", "failed"]))
            .count()
        )

        # Get or create health score record
        health = db.query(HealthScore).filter(HealthScore.repo == repo).first()
        if not health:
            health = HealthScore(repo=repo)
            db.add(health)

        # Update counts
        health.open_incidents = open_incidents

        # Compute score
        score = 100
        score -= health.cve_count * 10
        score -= health.deprecated_count * 5
        score -= health.open_incidents * 15
        score -= health.risky_patterns * 8
        score = max(0, min(100, score))

        health.score = score
        health.last_updated = datetime.utcnow()
        db.commit()

        logger.info(f"Health score for {repo}: {score}/100 "
                    f"(cve={health.cve_count}, deprecated={health.deprecated_count}, "
                    f"incidents={health.open_incidents}, patterns={health.risky_patterns})")
    except Exception as e:
        logger.warning(f"recalculate_health_score failed: {e}")
        try:
            db.rollback()
        except Exception:
            pass
