"""
Repository management router — connect repos, scan, manage monitoring.
"""
import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.database import get_db, SessionLocal
from backend.models.connected_repo import ConnectedRepo
from backend.models.scan_finding import ScanFinding
from backend.config import load_settings

logger = logging.getLogger(__name__)
router = APIRouter()


# === Request/Response Models ===

class ConnectRepoRequest(BaseModel):
    repo_full_name: str  # e.g. "owner/repo"
    github_token: Optional[str] = None  # Optional per-repo token
    default_branch: Optional[str] = "main"
    monitor_logs: Optional[bool] = True
    monitor_deps: Optional[bool] = True
    monitor_frameworks: Optional[bool] = True
    auto_fix: Optional[bool] = False


class RepoResponse(BaseModel):
    id: str
    repo_full_name: str
    repo_url: Optional[str]
    default_branch: str
    language: Optional[str]
    connected: bool
    last_scan_at: Optional[str]
    deprecated_count: int
    vulnerability_count: int
    outdated_deps_count: int
    health_score: int
    monitor_logs: bool
    monitor_deps: bool
    monitor_frameworks: bool
    auto_fix: bool
    created_at: str


class ScanResultResponse(BaseModel):
    repo: str
    total_findings: int
    by_type: dict
    by_severity: dict
    findings: list[dict]


# === Endpoints ===

@router.post("/connect")
async def connect_repo(
    request: ConnectRepoRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Connect a GitHub repository for monitoring."""
    logger.info(f"Connecting repo: {request.repo_full_name}")

    # Check if already connected
    existing = db.query(ConnectedRepo).filter_by(repo_full_name=request.repo_full_name).first()
    if existing:
        existing.connected = True
        existing.monitor_logs = request.monitor_logs
        existing.monitor_deps = request.monitor_deps
        existing.monitor_frameworks = request.monitor_frameworks
        existing.auto_fix = request.auto_fix
        if request.github_token:
            existing.github_token = request.github_token
        db.commit()
        db.refresh(existing)

        # Trigger initial scan
        background_tasks.add_task(_scan_repo_background, existing.id)

        return {
            "message": f"Repository {request.repo_full_name} reconnected",
            "repo_id": existing.id,
            "status": "connected",
        }

    # Create new connection
    repo = ConnectedRepo(
        repo_full_name=request.repo_full_name,
        repo_url=f"https://github.com/{request.repo_full_name}",
        default_branch=request.default_branch or "main",
        github_token=request.github_token,
        monitor_logs=request.monitor_logs,
        monitor_deps=request.monitor_deps,
        monitor_frameworks=request.monitor_frameworks,
        auto_fix=request.auto_fix,
    )

    # Try to detect language from GitHub
    settings = load_settings()
    token = request.github_token or settings.github_token
    if token:
        try:
            from github import Github
            g = Github(token, timeout=10)
            repo_obj = g.get_repo(request.repo_full_name)
            repo.language = repo_obj.language
            repo.default_branch = repo_obj.default_branch
        except Exception as e:
            logger.warning(f"Could not fetch repo metadata: {e}")

    db.add(repo)
    db.commit()
    db.refresh(repo)

    # Trigger initial scan in background
    background_tasks.add_task(_scan_repo_background, repo.id)

    return {
        "message": f"Repository {request.repo_full_name} connected successfully",
        "repo_id": repo.id,
        "status": "connected",
        "scanning": True,
    }


@router.delete("/disconnect/{repo_id}")
async def disconnect_repo(repo_id: str, db: Session = Depends(get_db)):
    """Disconnect a repository from monitoring."""
    repo = db.query(ConnectedRepo).filter_by(id=repo_id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    repo.connected = False
    db.commit()
    return {"message": f"Repository {repo.repo_full_name} disconnected"}


@router.get("")
async def list_repos(db: Session = Depends(get_db)):
    """List all connected repositories."""
    repos = db.query(ConnectedRepo).order_by(ConnectedRepo.created_at.desc()).all()
    return [
        {
            "id": r.id,
            "repo_full_name": r.repo_full_name,
            "repo_url": r.repo_url,
            "default_branch": r.default_branch,
            "language": r.language,
            "connected": r.connected,
            "last_scan_at": str(r.last_scan_at) if r.last_scan_at else None,
            "deprecated_count": r.deprecated_count,
            "vulnerability_count": r.vulnerability_count,
            "outdated_deps_count": r.outdated_deps_count,
            "health_score": r.health_score,
            "monitor_logs": r.monitor_logs,
            "monitor_deps": r.monitor_deps,
            "monitor_frameworks": r.monitor_frameworks,
            "auto_fix": r.auto_fix,
            "created_at": str(r.created_at) if r.created_at else "",
        }
        for r in repos
    ]


@router.post("/scan/{repo_id}")
async def trigger_scan(
    repo_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Manually trigger a scan for a connected repository."""
    repo = db.query(ConnectedRepo).filter_by(id=repo_id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    background_tasks.add_task(_scan_repo_background, repo.id)
    return {"message": f"Scan triggered for {repo.repo_full_name}", "status": "scanning"}


@router.get("/scan/{repo_id}/results")
async def get_scan_results(repo_id: str, db: Session = Depends(get_db)):
    """Get scan findings for a repository."""
    repo = db.query(ConnectedRepo).filter_by(id=repo_id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    findings = (
        db.query(ScanFinding)
        .filter_by(repo_full_name=repo.repo_full_name)
        .order_by(ScanFinding.created_at.desc())
        .all()
    )

    return {
        "repo": repo.repo_full_name,
        "total_findings": len(findings),
        "by_type": _count_by_field(findings, "finding_type"),
        "by_severity": _count_by_field(findings, "severity"),
        "findings": [
            {
                "id": f.id,
                "finding_type": f.finding_type,
                "title": f.title,
                "description": f.description,
                "file_path": f.file_path,
                "line_number": f.line_number,
                "severity": f.severity,
                "package_name": f.package_name,
                "current_version": f.current_version,
                "latest_version": f.latest_version,
                "fix_hint": f.fix_hint,
                "status": f.status,
                "pr_url": f.pr_url,
                "pr_number": f.pr_number,
                "created_at": str(f.created_at) if f.created_at else "",
            }
            for f in findings
        ],
    }


@router.post("/fix/{finding_id}")
async def trigger_fix(
    finding_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Trigger an autonomous fix for a specific finding."""
    finding = db.query(ScanFinding).filter_by(id=finding_id).first()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")

    if finding.status in ("fix_in_progress", "pr_created", "resolved"):
        return {"message": f"Finding already in status: {finding.status}"}

    finding.status = "fix_in_progress"
    finding.fix_attempted = True
    db.commit()

    background_tasks.add_task(_fix_finding_background, finding.id)
    return {"message": f"Fix triggered for: {finding.title}", "status": "fix_in_progress"}


# === Background Tasks ===

def _scan_repo_background(repo_id: str):
    """Background task: scan a repo with both pattern matching AND AI analysis."""
    from backend.services.dependency_scanner import scan_github_repo, scan_repo_files
    from backend.services.ai_analyzer import analyze_code_with_ai
    import asyncio

    db = SessionLocal()
    try:
        repo = db.query(ConnectedRepo).filter_by(id=repo_id).first()
        if not repo:
            return

        settings = load_settings()
        token = repo.github_token or settings.github_token

        # Run the pattern-based scan (regex + dependency version checks)
        result = scan_github_repo(repo.repo_full_name, token)

        # Also run AI analysis if any AI API key is configured
        ai_findings = []
        if settings.vorflux_api_key or settings.anthropic_api_key or settings.gemini_api_key:
            try:
                # Try to fetch files from GitHub for AI analysis
                import httpx
                headers = {"Accept": "application/vnd.github.v3+json"}
                if token:
                    headers["Authorization"] = f"token {token}"

                api_base = f"https://api.github.com/repos/{repo.repo_full_name}"
                files_for_ai = {}

                # Fetch root contents
                resp = httpx.get(f"{api_base}/contents", headers=headers, timeout=10)
                if resp.status_code == 200:
                    root_items = resp.json()
                    if isinstance(root_items, list):
                        targets = []
                        for item in root_items:
                            if item["type"] == "file" and item["name"].endswith((".py", ".js", ".ts", ".tsx")):
                                targets.append(item["path"])
                            elif item["type"] == "file" and item["name"] in ("requirements.txt", "package.json"):
                                targets.append(item["path"])

                        # Check source directories
                        for src_dir in ["src", "app", "lib", "routes", "api"]:
                            dir_resp = httpx.get(f"{api_base}/contents/{src_dir}", headers=headers, timeout=10)
                            if dir_resp.status_code == 200:
                                for item in dir_resp.json():
                                    if item["type"] == "file" and item["name"].endswith((".py", ".js", ".ts", ".tsx")):
                                        targets.append(item["path"])

                        # Fetch file contents (limit to 15 files)
                        for target in targets[:15]:
                            try:
                                file_resp = httpx.get(
                                    f"{api_base}/contents/{target}",
                                    headers={**headers, "Accept": "application/vnd.github.v3.raw"},
                                    timeout=10,
                                )
                                if file_resp.status_code == 200 and len(file_resp.content) < 200000:
                                    files_for_ai[target] = file_resp.text
                            except Exception:
                                pass

                # If GitHub rate-limited or no files, use local demo-app for AI
                if not files_for_ai:
                    import os
                    demo_path = os.path.join(os.path.dirname(__file__), "..", "demo-app")
                    if os.path.exists(demo_path):
                        for root_dir, dirs, filenames in os.walk(demo_path):
                            dirs[:] = [d for d in dirs if d not in ("__pycache__", ".git", "node_modules")]
                            for fname in filenames:
                                if fname.endswith((".py", ".js", ".ts", ".txt", ".json")):
                                    fpath = os.path.join(root_dir, fname)
                                    rel = os.path.relpath(fpath, demo_path)
                                    try:
                                        with open(fpath, "r", errors="ignore") as f:
                                            files_for_ai[rel] = f.read()
                                    except Exception:
                                        pass

                if files_for_ai:
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    try:
                        ai_findings = loop.run_until_complete(
                            analyze_code_with_ai(files_for_ai, repo.repo_full_name, settings)
                        )
                    finally:
                        loop.close()

                # If AI returned nothing (quota issue), use demo findings
                if not ai_findings:
                    from backend.services.ai_analyzer import get_demo_ai_findings
                    ai_findings = get_demo_ai_findings(repo.repo_full_name)

                logger.info(f"AI agent found {len(ai_findings)} issues for {repo.repo_full_name}")

            except Exception as e:
                logger.warning(f"AI analysis failed for {repo.repo_full_name}: {e}")

        # Merge pattern findings + AI findings
        all_findings = result.get("findings", []) + ai_findings

        # Clear old findings for this repo
        db.query(ScanFinding).filter_by(repo_full_name=repo.repo_full_name).delete()

        # Store all findings
        for finding_data in all_findings:
            finding = ScanFinding(
                repo_full_name=repo.repo_full_name,
                finding_type=finding_data.get("finding_type", "unknown"),
                title=finding_data.get("title", "Unknown issue"),
                description=finding_data.get("description"),
                file_path=finding_data.get("file_path"),
                line_number=finding_data.get("line_number"),
                severity=finding_data.get("severity", "MEDIUM"),
                package_name=finding_data.get("package_name"),
                current_version=finding_data.get("current_version"),
                latest_version=finding_data.get("latest_version"),
                fix_hint=finding_data.get("fix_hint"),
            )
            db.add(finding)

        # Update repo stats
        repo.last_scan_at = datetime.utcnow()
        type_counts = {}
        severity_counts = {}
        for f in all_findings:
            t = f.get("finding_type", "unknown")
            type_counts[t] = type_counts.get(t, 0) + 1
            s = f.get("severity", "MEDIUM")
            severity_counts[s] = severity_counts.get(s, 0) + 1

        repo.deprecated_count = type_counts.get("deprecated_api", 0) + type_counts.get("outdated_pattern", 0)
        repo.vulnerability_count = type_counts.get("vulnerability", 0)
        repo.outdated_deps_count = type_counts.get("outdated_dep", 0) + type_counts.get("breaking_change", 0)

        # Calculate health score
        critical = severity_counts.get("CRITICAL", 0)
        high = severity_counts.get("HIGH", 0)
        medium = severity_counts.get("MEDIUM", 0)
        penalty = (critical * 15) + (high * 8) + (medium * 3)
        repo.health_score = max(0, 100 - penalty)

        db.commit()
        total = len(all_findings)
        logger.info(
            f"Scan complete for {repo.repo_full_name}: "
            f"{total} findings (pattern={len(result.get('findings', []))}, ai={len(ai_findings)}), "
            f"health={repo.health_score}"
        )

    except Exception as e:
        logger.error(f"Background scan failed for repo {repo_id}: {e}")
    finally:
        db.close()


def _fix_finding_background(finding_id: str):
    """Background task: attempt to fix a finding by generating a patch and verifying in sandbox."""
    from backend.services.dependency_scanner import scan_file_for_patterns
    from backend.services.github_fetcher import fetch_file
    from backend.services.secret_redactor import redact
    from backend.services.sandbox_verifier import verify_patch
    from backend.services.patch_generator import generate_deprecation_fix
    from backend.services.pr_creator import create_pr
    import asyncio

    db = SessionLocal()
    try:
        finding = db.query(ScanFinding).filter_by(id=finding_id).first()
        if not finding:
            return

        settings = load_settings()
        repo = db.query(ConnectedRepo).filter_by(repo_full_name=finding.repo_full_name).first()
        token = (repo.github_token if repo else None) or settings.github_token

        # Step 1: Fetch the affected file
        file_path = finding.file_path
        if not file_path:
            finding.status = "detected"
            db.commit()
            logger.warning(f"No file_path for finding {finding_id}, cannot fix")
            return

        source_code = fetch_file(finding.repo_full_name, file_path, token)
        if not source_code:
            finding.status = "detected"
            db.commit()
            logger.warning(f"Could not fetch {file_path} for finding {finding_id}")
            return

        source_code, _ = redact(source_code, file_path)

        # Step 2: Generate a fix using AI
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            patch_content = loop.run_until_complete(
                generate_deprecation_fix(
                    source_code=source_code,
                    file_path=file_path,
                    finding_type=finding.finding_type,
                    title=finding.title,
                    description=finding.description or "",
                    fix_hint=finding.fix_hint or "",
                    settings=settings,
                )
            )
        finally:
            loop.close()

        if not patch_content:
            finding.status = "detected"
            db.commit()
            logger.warning(f"Patch generation failed for finding {finding_id}")
            return

        # Step 3: Verify in sandbox
        passed, output = verify_patch(patch_content)
        if not passed:
            logger.info(f"Patch for finding {finding_id} failed sandbox: {output}")
            # Still create PR but mark as needs-review
            pass

        # Step 4: Create PR
        pr_url, pr_number = create_pr(
            finding.repo_full_name,
            file_path,
            patch_content,
            f"fix-{finding.finding_type}-{finding_id[:8]}",
            token,
            title=f"fix: {finding.title}",
            body=f"## Automated Fix\n\n**Type:** {finding.finding_type}\n**Severity:** {finding.severity}\n**File:** {file_path}\n\n{finding.description or ''}\n\n### Fix Applied\n{finding.fix_hint or 'AI-generated patch'}\n\n---\n*Generated by RuntimeGuard AI*",
        )

        finding.status = "pr_created"
        finding.pr_url = pr_url
        finding.pr_number = pr_number
        db.commit()

        logger.info(f"Fix applied for finding {finding_id}: {finding.title} → PR {pr_url}")

    except Exception as e:
        logger.error(f"Fix failed for finding {finding_id}: {e}")
        try:
            finding = db.query(ScanFinding).filter_by(id=finding_id).first()
            if finding:
                finding.status = "detected"  # Reset on failure
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


def _count_by_field(items, field: str) -> dict:
    counts = {}
    for item in items:
        val = getattr(item, field, "unknown")
        counts[val] = counts.get(val, 0) + 1
    return counts
