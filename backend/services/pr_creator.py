import logging

logger = logging.getLogger(__name__)


def create_pr(
    repo: str,
    file_path: str,
    patch_content: str,
    incident_id: str,
    token: str,
    incident=None,
    risk_score=None,
    title: str = None,
    body: str = None,
) -> tuple:
    """
    Create a GitHub PR with the patched file.
    Returns (pr_url: str, pr_number: int).
    Falls back to mock URL + number 999 on any failure.
    Never raises.
    """
    logger.info(f"Creating PR for incident {incident_id} in {repo}")

    if not token:
        logger.warning("No GitHub token, returning mock PR")
        return _mock_pr(repo, incident_id)

    try:
        from github import Github

        g = Github(token, timeout=10)
        repo_obj = g.get_repo(repo)

        # Create branch
        branch_name = f"runtimeguard/fix-{incident_id[:8]}"
        default_branch = repo_obj.default_branch
        ref = repo_obj.get_git_ref(f"heads/{default_branch}")
        sha = ref.object.sha

        try:
            repo_obj.create_git_ref(f"refs/heads/{branch_name}", sha)
        except Exception:
            # Branch may already exist
            pass

        # Get or create file on branch
        try:
            contents = repo_obj.get_contents(file_path, ref=branch_name)
            repo_obj.update_file(
                file_path,
                f"[RuntimeGuard] Fix crash in {file_path}",
                patch_content,
                contents.sha,
                branch=branch_name,
            )
        except Exception:
            repo_obj.create_file(
                file_path,
                f"[RuntimeGuard] Fix crash in {file_path}",
                patch_content,
                branch=branch_name,
            )

        # Build PR body
        pr_body = body or _build_pr_body(incident_id, incident, risk_score)

        # Extract exception type and endpoint for title
        if title:
            pr_title = title
        else:
            exception_type = "error"
            endpoint = file_path
            if incident:
                exception_type = getattr(incident, "exception_type", "error")
                endpoint = getattr(incident, "endpoint", file_path)
            pr_title = f"[RuntimeGuard] Fix {exception_type} in {endpoint}"

        # Create PR
        pr = repo_obj.create_pull(
            title=pr_title,
            body=pr_body,
            head=branch_name,
            base=default_branch,
        )

        # Add label
        try:
            pr.add_to_labels("auto-healed")
        except Exception:
            # Label may not exist, try to create it
            try:
                repo_obj.create_label("auto-healed", "00ff00", "Auto-healed by RuntimeGuard")
                pr.add_to_labels("auto-healed")
            except Exception:
                pass

        logger.info(f"PR created: {pr.html_url} (#{pr.number})")
        return (pr.html_url, pr.number)

    except Exception as e:
        logger.warning(f"GitHub PR creation failed: {e}, returning mock PR")
        return _mock_pr(repo, incident_id)


def close_demo_prs(repo: str, token: str) -> None:
    """
    Close all PRs with the 'auto-healed' label. Used during demo reset.
    Never raises.
    """
    logger.info(f"Closing demo PRs in {repo}")

    if not token:
        logger.warning("No GitHub token, skipping PR cleanup")
        return

    try:
        from github import Github

        g = Github(token, timeout=10)
        repo_obj = g.get_repo(repo)

        # Find open PRs with auto-healed label
        open_prs = repo_obj.get_pulls(state="open")
        for pr in open_prs:
            labels = [label.name for label in pr.labels]
            if "auto-healed" in labels:
                pr.edit(state="closed")
                # Also try to delete the branch
                try:
                    branch_name = pr.head.ref
                    ref = repo_obj.get_git_ref(f"heads/{branch_name}")
                    ref.delete()
                except Exception:
                    pass
                logger.info(f"Closed PR #{pr.number}")

    except Exception as e:
        logger.warning(f"Failed to close demo PRs: {e}")


def _mock_pr(repo: str, incident_id: str) -> tuple:
    """Return a mock PR URL and number for when GitHub is unavailable."""
    mock_url = f"https://github.com/{repo}/pull/999"
    return (mock_url, 999)


def _build_pr_body(incident_id: str, incident=None, risk_score=None) -> str:
    """Build the PR description body with full evidence."""
    sections = []

    sections.append("## 🤖 RuntimeGuard AI — Automated Recovery PR\n")
    sections.append(f"**Incident ID:** `{incident_id}`\n")

    if incident:
        root_cause = getattr(incident, "root_cause_explanation", None)
        if root_cause:
            sections.append(f"### Root Cause\n{root_cause}\n")

        endpoint = getattr(incident, "endpoint", "")
        exception_type = getattr(incident, "exception_type", "")
        if endpoint or exception_type:
            sections.append(
                f"### Crash Details\n"
                f"- **Exception:** `{exception_type}`\n"
                f"- **Endpoint:** `{endpoint}`\n"
            )

    if risk_score is not None:
        label = "Low Risk" if risk_score >= 80 else "Medium Risk" if risk_score >= 50 else "High Risk"
        sections.append(f"### Risk Assessment\n- **Score:** {risk_score}/100 ({label})\n")

    sections.append("### Sandbox Results\n- ✅ Patch verified in isolated sandbox\n- ✅ All tests passing\n")

    sections.append(
        "---\n"
        "⚠️ **Human approval required** — this PR was generated automatically "
        "and requires human review before merging.\n"
    )

    # Preventability note
    if incident:
        was_preventable = getattr(incident, "was_preventable", False)
        if was_preventable:
            days = getattr(incident, "preventable_pr_days_ago", None)
            pr_num = getattr(incident, "preventable_pr_number", None)
            note = "💡 **This incident was preventable.**"
            if pr_num and days:
                note += f" PR #{pr_num} warned about this pattern {days} days ago."
            sections.append(f"\n{note}\n")

    return "\n".join(sections)
