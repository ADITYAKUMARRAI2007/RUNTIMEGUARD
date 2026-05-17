import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.database import init_db, SessionLocal
from backend.config import load_settings

# Configure logging
settings = load_settings()
logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def seed_proactive_pr(db):
    """Seed the demo proactive PR if none exists."""
    from backend.models.proactive_pr import ProactivePR
    existing = db.query(ProactivePR).first()
    if existing:
        return
    pr = ProactivePR(
        file_path="demo-app/app.py",
        pattern_matched="@app.on_event",
        days_since_created=47,
        pr_title="fix: migrate deprecated @app.on_event to lifespan handler",
        repo=settings.github_repo,
        pr_number=142,
    )
    db.add(pr)
    db.commit()
    logger.info("Seeded proactive PR record (47 days ago)")


def seed_health_score(db):
    """Seed initial health score if none exists."""
    from backend.models.health_score import HealthScore
    existing = db.query(HealthScore).filter_by(repo=settings.github_repo).first()
    if existing:
        return
    hs = HealthScore(repo=settings.github_repo, score=100)
    db.add(hs)
    db.commit()
    logger.info("Seeded health score (100)")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: init DB, seed data, start monitor. Shutdown: cleanup."""
    logger.info("RuntimeGuard AI starting up...")
    init_db()
    db = SessionLocal()
    try:
        seed_proactive_pr(db)
        seed_health_score(db)
    finally:
        db.close()

    # Start background monitoring task
    import asyncio
    monitor_task = asyncio.create_task(_monitor_loop())
    logger.info("RuntimeGuard AI ready. Monitoring active.")

    yield

    # Cleanup
    monitor_task.cancel()
    logger.info("RuntimeGuard AI shutting down.")


async def _monitor_loop():
    """Background loop that scans all connected repos periodically."""
    import asyncio
    await asyncio.sleep(5)  # Wait for startup to complete

    while True:
        try:
            db = SessionLocal()
            try:
                from backend.models.connected_repo import ConnectedRepo
                repos = db.query(ConnectedRepo).filter_by(connected=True).all()
                if repos:
                    logger.info(f"Monitor: scanning {len(repos)} connected repos...")
                    for repo in repos:
                        try:
                            from backend.routers.repos import _scan_repo_background
                            _scan_repo_background(repo.id)
                        except Exception as e:
                            logger.warning(f"Monitor: scan failed for {repo.repo_full_name}: {e}")
            finally:
                db.close()
        except Exception as e:
            logger.warning(f"Monitor loop error: {e}")

        # Scan every 60 seconds
        await asyncio.sleep(60)


app = FastAPI(
    title="RuntimeGuard AI",
    description="From production crash to verified recovery PR.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def health_check():
    return {"status": "healthy", "service": "RuntimeGuard AI"}


# Import and include routers
from backend.routers import demo, webhook, incidents, health, repos, logs, scan
app.include_router(demo.router, prefix="/demo", tags=["demo"])
app.include_router(webhook.router, prefix="/webhook", tags=["webhook"])
app.include_router(incidents.router, prefix="/incidents", tags=["incidents"])
app.include_router(health.router, tags=["health"])
app.include_router(repos.router, prefix="/repos", tags=["repos"])
app.include_router(logs.router, prefix="/logs", tags=["logs"])
app.include_router(scan.router, prefix="/scan", tags=["scan"])

# Production-grade API endpoints
from backend.routers.api_scans import scans_router, api_router
app.include_router(scans_router, prefix="/api/scans", tags=["api-scans"])
app.include_router(api_router, prefix="/api", tags=["api-incidents"])
