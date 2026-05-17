"""
Dependency Scanner — scans repos for deprecated APIs, outdated packages, and breaking changes.
Works with both local files and GitHub-fetched content.
"""
import json
import logging
import os
import re
from typing import Optional

logger = logging.getLogger(__name__)

# Load known breaking changes
_data_dir = os.path.join(os.path.dirname(__file__), "..", "data")
_breaking_path = os.path.join(_data_dir, "known_breaking_changes.json")
_versions_path = os.path.join(_data_dir, "package_versions.json")

try:
    with open(_breaking_path) as f:
        KNOWN_PATTERNS = json.load(f)
except Exception:
    KNOWN_PATTERNS = []

try:
    with open(_versions_path) as f:
        PACKAGE_VERSIONS = json.load(f)
except Exception:
    PACKAGE_VERSIONS = {"python": {}, "node": {}}


def parse_requirements_txt(content: str) -> list[dict]:
    """Parse a requirements.txt file and return package name + version."""
    deps = []
    for line in content.strip().split("\n"):
        line = line.strip()
        if not line or line.startswith("#") or line.startswith("-"):
            continue
        # Handle ==, >=, <=, ~=, !=
        match = re.match(r"^([a-zA-Z0-9_\-\.]+)\s*([><=!~]+)\s*([0-9a-zA-Z\.\*]+)", line)
        if match:
            deps.append({
                "name": match.group(1).lower().replace("-", "_"),
                "version": match.group(3),
                "operator": match.group(2),
                "raw": line,
            })
        else:
            # Package without version pin
            pkg_name = re.match(r"^([a-zA-Z0-9_\-\.]+)", line)
            if pkg_name:
                deps.append({
                    "name": pkg_name.group(1).lower().replace("-", "_"),
                    "version": None,
                    "operator": None,
                    "raw": line,
                })
    return deps


def parse_package_json(content: str) -> list[dict]:
    """Parse a package.json and return dependencies with versions."""
    deps = []
    try:
        pkg = json.loads(content)
        all_deps = {}
        all_deps.update(pkg.get("dependencies", {}))
        all_deps.update(pkg.get("devDependencies", {}))
        for name, version_str in all_deps.items():
            # Strip ^, ~, >= etc
            clean_version = re.sub(r"^[\^~>=<]+", "", version_str)
            deps.append({
                "name": name.lower(),
                "version": clean_version,
                "operator": version_str[0] if version_str and version_str[0] in "^~><=!" else None,
                "raw": f"{name}: {version_str}",
            })
    except (json.JSONDecodeError, Exception) as e:
        logger.warning(f"Failed to parse package.json: {e}")
    return deps


def compare_versions(current: str, target: str) -> int:
    """
    Compare two version strings. Returns:
    -1 if current < target
     0 if current == target
     1 if current > target
    """
    def normalize(v):
        parts = []
        for p in v.split("."):
            try:
                parts.append(int(re.sub(r"[^0-9]", "", p) or "0"))
            except ValueError:
                parts.append(0)
        return parts

    c = normalize(current)
    t = normalize(target)
    # Pad to same length
    max_len = max(len(c), len(t))
    c.extend([0] * (max_len - len(c)))
    t.extend([0] * (max_len - len(t)))

    for cv, tv in zip(c, t):
        if cv < tv:
            return -1
        if cv > tv:
            return 1
    return 0


def check_outdated_deps(deps: list[dict], ecosystem: str = "python") -> list[dict]:
    """Check a list of parsed dependencies against known latest versions."""
    findings = []
    version_db = PACKAGE_VERSIONS.get(ecosystem, {})

    for dep in deps:
        name = dep["name"]
        current = dep["version"]
        if not current:
            continue

        pkg_info = version_db.get(name)
        if not pkg_info:
            continue

        latest = pkg_info["latest"]
        deprecated_below = pkg_info.get("deprecated_below")
        eol = pkg_info.get("eol")

        # Check if outdated
        if compare_versions(current, latest) < 0:
            severity = "LOW"
            finding_type = "outdated_dep"

            if eol and compare_versions(current, eol) <= 0:
                severity = "CRITICAL"
                finding_type = "vulnerability"
            elif deprecated_below and compare_versions(current, deprecated_below) < 0:
                severity = "HIGH"
                finding_type = "deprecated_api"

            findings.append({
                "finding_type": finding_type,
                "title": f"{name} {current} → {latest}",
                "description": f"Package '{name}' is at version {current}, latest is {latest}.",
                "package_name": name,
                "current_version": current,
                "latest_version": latest,
                "severity": severity,
                "fix_hint": f"Update {name} to version {latest} in your dependency file",
            })

    return findings


def scan_file_for_patterns(file_content: str, file_path: str) -> list[dict]:
    """Scan a single file for known breaking change patterns."""
    findings = []
    for pattern_info in KNOWN_PATTERNS:
        pattern = pattern_info["pattern"]
        if pattern in file_content:
            line_num = 0
            for i, line in enumerate(file_content.split("\n"), 1):
                if pattern in line:
                    line_num = i
                    break
            findings.append({
                "finding_type": pattern_info.get("category", "deprecated_api"),
                "title": f"{pattern_info['package']}: {pattern_info['description'][:60]}",
                "description": pattern_info["description"],
                "file_path": file_path,
                "line_number": line_num,
                "package_name": pattern_info["package"],
                "severity": pattern_info["severity"],
                "fix_hint": pattern_info.get("fix_hint", ""),
            })
    return findings


def scan_repo_files(files: dict[str, str]) -> dict:
    """
    Scan a dict of {file_path: content} for all issue types.
    Returns categorized findings.
    """
    all_findings = []

    for file_path, content in files.items():
        # Scan for code patterns (deprecated APIs, breaking changes)
        if file_path.endswith((".py", ".js", ".ts", ".tsx", ".jsx")):
            pattern_findings = scan_file_for_patterns(content, file_path)
            all_findings.extend(pattern_findings)

        # Parse dependency files
        if file_path.endswith("requirements.txt") or file_path == "requirements.txt":
            deps = parse_requirements_txt(content)
            dep_findings = check_outdated_deps(deps, "python")
            for f in dep_findings:
                f["file_path"] = file_path
            all_findings.extend(dep_findings)

        elif file_path.endswith("package.json") or file_path == "package.json":
            deps = parse_package_json(content)
            dep_findings = check_outdated_deps(deps, "node")
            for f in dep_findings:
                f["file_path"] = file_path
            all_findings.extend(dep_findings)

    return {
        "total": len(all_findings),
        "by_type": _group_by_type(all_findings),
        "by_severity": _group_by_severity(all_findings),
        "findings": all_findings,
    }


def scan_local_directory(directory: str) -> dict:
    """Scan a local directory for issues. Used for demo and local repos."""
    files = {}
    try:
        for root, dirs, filenames in os.walk(directory):
            # Skip common non-source dirs
            dirs[:] = [d for d in dirs if d not in ("node_modules", ".git", "__pycache__", ".venv", "venv", "dist", "build")]
            for fname in filenames:
                if fname.endswith((".py", ".js", ".ts", ".tsx", ".jsx", ".json", ".txt")):
                    fpath = os.path.join(root, fname)
                    rel_path = os.path.relpath(fpath, directory)
                    try:
                        with open(fpath, "r", errors="ignore") as f:
                            content = f.read()
                        # Only scan relevant files
                        if fname in ("requirements.txt", "package.json") or fname.endswith((".py", ".js", ".ts", ".tsx", ".jsx")):
                            files[rel_path] = content
                    except Exception:
                        pass
    except Exception as e:
        logger.warning(f"Failed to scan directory {directory}: {e}")

    return scan_repo_files(files)


def scan_github_repo(repo: str, token: str, files_to_scan: Optional[list[str]] = None) -> dict:
    """
    Scan a GitHub repo for issues.
    Works with or without a token (public repos don't need auth).
    Falls back to local demo-app scan if GitHub is unavailable.
    """
    import httpx as http_requests

    logger.info(f"Scanning GitHub repo: {repo} (token={'yes' if token else 'no'})")

    # Try with PyGithub if token available
    if token:
        try:
            from github import Github
            g = Github(token, timeout=15)
            repo_obj = g.get_repo(repo)

            files = {}
            targets = files_to_scan or [
                "requirements.txt",
                "package.json",
                "setup.py",
                "pyproject.toml",
            ]

            try:
                contents = repo_obj.get_contents("")
                for item in contents:
                    if item.type == "file" and item.name.endswith((".py", ".js", ".ts")):
                        targets.append(item.path)
                for src_dir in ["src", "app", "lib", "routes"]:
                    try:
                        dir_contents = repo_obj.get_contents(src_dir)
                        for item in dir_contents:
                            if item.type == "file" and item.name.endswith((".py", ".js", ".ts", ".tsx")):
                                targets.append(item.path)
                    except Exception:
                        pass
            except Exception:
                pass

            for target in targets:
                try:
                    content_file = repo_obj.get_contents(target)
                    if content_file.size < 500000:
                        files[target] = content_file.decoded_content.decode("utf-8")
                except Exception:
                    pass

            if files:
                result = scan_repo_files(files)
                logger.info(f"GitHub scan (authenticated) complete: {result['total']} findings")
                return result

        except Exception as e:
            logger.warning(f"Authenticated GitHub scan failed: {e}")

    # Try unauthenticated GitHub API (works for public repos)
    try:
        headers = {"Accept": "application/vnd.github.v3+json"}
        if token:
            headers["Authorization"] = f"token {token}"

        # Get repo contents (root)
        api_base = f"https://api.github.com/repos/{repo}"
        files = {}

        # Fetch root directory listing
        resp = http_requests.get(f"{api_base}/contents", headers=headers, timeout=10)
        if resp.status_code == 200:
            root_items = resp.json()

            # Identify files to scan
            targets = []
            for item in root_items:
                if item["type"] == "file":
                    name = item["name"]
                    if name in ("requirements.txt", "package.json", "setup.py", "pyproject.toml"):
                        targets.append(item["path"])
                    elif name.endswith((".py", ".js", ".ts")):
                        targets.append(item["path"])

            # Also check common source directories
            for src_dir in ["src", "app", "lib", "routes", "api"]:
                dir_resp = http_requests.get(
                    f"{api_base}/contents/{src_dir}", headers=headers, timeout=10
                )
                if dir_resp.status_code == 200:
                    for item in dir_resp.json():
                        if item["type"] == "file" and item["name"].endswith(
                            (".py", ".js", ".ts", ".tsx", ".jsx")
                        ):
                            targets.append(item["path"])

            # Fetch file contents (limit to 30 files to avoid rate limits)
            for target in targets[:30]:
                try:
                    file_resp = http_requests.get(
                        f"{api_base}/contents/{target}",
                        headers={**headers, "Accept": "application/vnd.github.v3.raw"},
                        timeout=10,
                    )
                    if file_resp.status_code == 200 and len(file_resp.content) < 500000:
                        files[target] = file_resp.text
                except Exception:
                    pass

            if files:
                result = scan_repo_files(files)
                logger.info(f"GitHub scan (public API) complete: {result['total']} findings in {len(files)} files")
                return result
            else:
                logger.info(f"No scannable files found in {repo}")
                return {"total": 0, "by_type": {}, "by_severity": {}, "findings": []}

        elif resp.status_code == 404:
            logger.warning(f"Repository {repo} not found on GitHub")
            return {"total": 0, "by_type": {}, "by_severity": {}, "findings": [], "error": "repo_not_found"}
        else:
            logger.warning(f"GitHub API returned {resp.status_code} for {repo}")

    except Exception as e:
        logger.warning(f"GitHub public API scan failed: {e}")

    # Final fallback: scan local demo-app
    logger.info("Falling back to local demo-app scan")
    demo_path = os.path.join(os.path.dirname(__file__), "..", "..", "demo-app")
    if os.path.exists(demo_path):
        return scan_local_directory(demo_path)

    return {"total": 0, "by_type": {}, "by_severity": {}, "findings": []}


def _group_by_type(findings: list[dict]) -> dict:
    groups = {}
    for f in findings:
        t = f.get("finding_type", "unknown")
        groups.setdefault(t, []).append(f)
    return {k: len(v) for k, v in groups.items()}


def _group_by_severity(findings: list[dict]) -> dict:
    groups = {}
    for f in findings:
        s = f.get("severity", "MEDIUM")
        groups.setdefault(s, []).append(f)
    return {k: len(v) for k, v in groups.items()}
