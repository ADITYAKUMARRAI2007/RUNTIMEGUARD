"""
Log ingestion router — accepts production error logs from any source.
Parses logs, detects errors, and triggers the remediation pipeline.
"""
import logging
import re
from typing import Optional
from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.database import get_db, SessionLocal
from backend.models.incident import Incident
from backend.config import load_settings

logger = logging.getLogger(__name__)
router = APIRouter()


# === Request Models ===

class LogEntry(BaseModel):
    """A single log entry from production."""
    timestamp: Optional[str] = None
    level: str = "ERROR"  # ERROR, CRITICAL, WARNING
    message: str
    source: Optional[str] = None  # service name or file
    stacktrace: Optional[str] = None  # raw stacktrace string
    repo: Optional[str] = None  # which repo this belongs to
    environment: Optional[str] = "production"
    metadata: Optional[dict] = None  # extra context


class LogBatch(BaseModel):
    """Batch of log entries."""
    logs: list[LogEntry]
    repo: Optional[str] = None  # default repo for all entries


class SentryWebhook(BaseModel):
    """Sentry-compatible webhook payload."""
    event: Optional[dict] = None
    project: Optional[str] = None
    level: Optional[str] = None
    message: Optional[str] = None
    culprit: Optional[str] = None
    url: Optional[str] = None


# === Endpoints ===

@router.post("/ingest")
async def ingest_logs(
    batch: LogBatch,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Ingest a batch of production logs.
    Automatically detects errors and triggers remediation for actionable ones.
    """
    settings = load_settings()
    default_repo = batch.repo or settings.github_repo

    processed = 0
    incidents_created = 0

    for entry in batch.logs:
        processed += 1

        # Only process ERROR and CRITICAL
        if entry.level.upper() not in ("ERROR", "CRITICAL", "FATAL"):
            continue

        # Try to extract exception info from the log
        exception_info = _parse_log_entry(entry)
        if not exception_info:
            continue

        # Create an incident
        repo = entry.repo or default_repo
        incident = Incident(
            exception_type=exception_info["exception_type"],
            exception_msg=exception_info["exception_message"],
            source_repo=repo,
            raw_stack_trace=exception_info.get("stacktrace", entry.message),
            status="detected",
        )
        db.add(incident)
        db.commit()
        db.refresh(incident)
        incidents_created += 1

        # Build crash payload for pipeline
        crash_payload = {
            "exception_type": exception_info["exception_type"],
            "exception_message": exception_info["exception_message"],
            "stacktrace": exception_info.get("frames", []),
            "repo": repo,
            "endpoint": exception_info.get("endpoint"),
            "payload": entry.metadata,
        }

        # Fire pipeline
        background_tasks.add_task(_run_pipeline, incident.id, crash_payload)

    return {
        "processed": processed,
        "incidents_created": incidents_created,
        "message": f"Processed {processed} log entries, created {incidents_created} incidents",
    }


@router.post("/sentry")
async def sentry_webhook(
    payload: SentryWebhook,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Sentry-compatible webhook endpoint.
    Accepts Sentry alert payloads and creates incidents.
    """
    settings = load_settings()

    event = payload.event or {}
    exception_data = event.get("exception", {})
    values = exception_data.get("values", [])

    if not values and not payload.message:
        return {"status": "ignored", "reason": "No exception data"}

    # Extract from Sentry format
    if values:
        exc = values[0]
        exception_type = exc.get("type", "UnknownError")
        exception_message = exc.get("value", payload.message or "")
        frames = exc.get("stacktrace", {}).get("frames", [])
        stacktrace_frames = [
            {
                "file": f.get("filename", ""),
                "line": f.get("lineno", 0),
                "function": f.get("function", ""),
                "text": f.get("context_line", ""),
            }
            for f in frames[-5:]  # Last 5 frames
        ]
    else:
        exception_type = "Error"
        exception_message = payload.message or ""
        stacktrace_frames = []

    repo = settings.github_repo
    incident = Incident(
        exception_type=exception_type,
        exception_msg=exception_message,
        source_repo=repo,
        raw_stack_trace=str(stacktrace_frames),
        status="detected",
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)

    crash_payload = {
        "exception_type": exception_type,
        "exception_message": exception_message,
        "stacktrace": stacktrace_frames,
        "repo": repo,
    }

    background_tasks.add_task(_run_pipeline, incident.id, crash_payload)

    return {
        "status": "accepted",
        "incident_id": incident.id,
        "exception_type": exception_type,
    }


@router.post("/raw")
async def ingest_raw_log(
    background_tasks: BackgroundTasks,
    message: str = "",
    repo: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Simple raw log ingestion — just paste an error log and we'll parse it.
    Useful for quick testing.
    """
    if not message:
        raise HTTPException(status_code=400, detail="message is required")

    settings = load_settings()
    target_repo = repo or settings.github_repo

    # Parse the raw log
    exception_info = _parse_raw_stacktrace(message)

    incident = Incident(
        exception_type=exception_info.get("exception_type", "Error"),
        exception_msg=exception_info.get("exception_message", message[:200]),
        source_repo=target_repo,
        raw_stack_trace=message,
        status="detected",
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)

    crash_payload = {
        "exception_type": exception_info.get("exception_type", "Error"),
        "exception_message": exception_info.get("exception_message", message[:200]),
        "stacktrace": exception_info.get("frames", []),
        "repo": target_repo,
    }

    background_tasks.add_task(_run_pipeline, incident.id, crash_payload)

    return {
        "status": "accepted",
        "incident_id": incident.id,
        "parsed": exception_info,
    }


# === Helpers ===

def _parse_log_entry(entry: LogEntry) -> Optional[dict]:
    """Parse a structured log entry to extract exception info."""
    message = entry.message

    # Try to detect Python exceptions
    python_exc = re.search(
        r"(\w+Error|\w+Exception|\w+Warning):\s*(.+?)(?:\n|$)", message
    )
    if python_exc:
        result = {
            "exception_type": python_exc.group(1),
            "exception_message": python_exc.group(2).strip(),
        }
        if entry.stacktrace:
            result["stacktrace"] = entry.stacktrace
            result["frames"] = _parse_python_traceback(entry.stacktrace)
        return result

    # Try to detect Node.js errors
    node_exc = re.search(r"(TypeError|ReferenceError|SyntaxError|RangeError):\s*(.+?)(?:\n|$)", message)
    if node_exc:
        return {
            "exception_type": node_exc.group(1),
            "exception_message": node_exc.group(2).strip(),
            "frames": [],
        }

    # Generic error detection
    if "error" in message.lower() or "exception" in message.lower() or "traceback" in message.lower():
        return {
            "exception_type": "RuntimeError",
            "exception_message": message[:200],
            "frames": [],
        }

    return None


def _parse_raw_stacktrace(raw: str) -> dict:
    """Parse a raw stacktrace string (Python format)."""
    result = {
        "exception_type": "Error",
        "exception_message": "",
        "frames": [],
    }

    # Python traceback format
    exc_match = re.search(r"(\w+Error|\w+Exception):\s*(.+?)(?:\n|$)", raw)
    if exc_match:
        result["exception_type"] = exc_match.group(1)
        result["exception_message"] = exc_match.group(2).strip()

    result["frames"] = _parse_python_traceback(raw)
    return result


def _parse_python_traceback(text: str) -> list[dict]:
    """Extract frames from a Python traceback."""
    frames = []
    # Match: File "path", line N, in function
    for match in re.finditer(
        r'File "([^"]+)", line (\d+), in (\w+)', text
    ):
        frames.append({
            "file": match.group(1),
            "line": int(match.group(2)),
            "function": match.group(3),
            "text": "",
        })
    return frames


async def _run_pipeline(incident_id: str, payload: dict):
    """Run the remediation pipeline as a background task."""
    try:
        from backend.services.pipeline import run_remediation_pipeline
        await run_remediation_pipeline(incident_id, payload)
    except Exception as e:
        logger.error(f"Pipeline failed for {incident_id}: {e}")
        db = SessionLocal()
        try:
            incident = db.query(Incident).filter_by(id=incident_id).first()
            if incident:
                incident.status = "failed"
                incident.failure_reason = str(e)
                db.commit()
        finally:
            db.close()
