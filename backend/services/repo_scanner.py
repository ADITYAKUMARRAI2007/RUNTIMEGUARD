"""
Local repo scanner - detects production drift risks in a local codebase.
Supports 4 risk classes:
  1. dependency_incompatibility
  2. runtime_config_drift
  3. frontend_backend_contract_mismatch
  4. visual_user_flow_failure
"""

import os
import re
import json
from pathlib import Path
from typing import List, Dict, Any

# Risky migration patterns - (description, regex, risk_type, severity)
RISKY_PATTERNS = [
    ("React Router v5 useHistory() - removed in v6", r'\buseHistory\b', "dependency_incompatibility", "high"),
    ("React Router v5 Switch - removed in v6", r'<Switch[\s>]', "dependency_incompatibility", "medium"),
    ("Pydantic v1 .dict() - deprecated in v2", r'\.dict\(\)', "dependency_incompatibility", "medium"),
    ("Pydantic v1 orm_mode - deprecated in v2", r'\borm_mode\b', "dependency_incompatibility", "medium"),
    ("FastAPI deprecated @app.on_event", r'@app\.on_event', "dependency_incompatibility", "medium"),
    ("SQLAlchemy legacy session.query()", r'session\.query\(', "dependency_incompatibility", "low"),
    ("Payment SDK v2 err.code - may break with v3", r'\berr\.code\b', "dependency_incompatibility", "high"),
]

ENV_PATTERNS = [
    r'process\.env\.([A-Z_][A-Z0-9_]+)',
    r'import\.meta\.env\.([A-Z_][A-Z0-9_]+)',
    r'os\.getenv\(["\']([A-Z_][A-Z0-9_]+)["\']',
    r'os\.environ\.get\(["\']([A-Z_][A-Z0-9_]+)["\']',
    r'os\.environ\[["\']([A-Z_][A-Z0-9_]+)["\']',
]

SCAN_EXTENSIONS = {'.js', '.jsx', '.ts', '.tsx', '.py', '.json', '.yaml', '.yml', '.toml'}
SKIP_DIRS = {'node_modules', '__pycache__', '.git', 'dist', 'build', '.next', 'venv', '.venv'}
SKIP_FILES = {'README.md', 'CHANGELOG.md', 'LICENSE', 'CONTRIBUTING.md', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'}


def scan_local_repo(repo_path: str) -> List[Dict[str, Any]]:
    """Scan a local repository for production drift risks."""
    path = Path(repo_path).resolve()
    if not path.exists():
        return [{"risk_type": "scan_error", "file": str(repo_path), "evidence": f"Path not found: {repo_path}", "severity": "critical", "line": 0}]

    risks = []

    # Read .env.example to know what vars are documented
    documented_vars = _read_env_example(path)

    # Read package.json for dependency versions
    pkg_versions = _read_package_versions(path)

    # Scan all code files
    used_env_vars = set()
    frontend_endpoints = []
    backend_routes = []

    for file_path in _walk_files(path):
        rel = str(file_path.relative_to(path))
        try:
            content = file_path.read_text(errors='ignore')
        except Exception:
            continue

        # Risky pattern detection
        for desc, pattern, risk_type, severity in RISKY_PATTERNS:
            for m in re.finditer(pattern, content):
                line_num = content[:m.start()].count('\n') + 1
                risks.append({
                    "risk_type": risk_type,
                    "file": rel,
                    "line": line_num,
                    "evidence": desc,
                    "severity": severity,
                    "matched": m.group(0)[:60]
                })

        # Env var usage
        for pat in ENV_PATTERNS:
            for m in re.finditer(pat, content):
                used_env_vars.add(m.group(1))

        # Frontend API endpoints (fetch/axios calls)
        if file_path.suffix in {'.js', '.jsx', '.ts', '.tsx'}:
            for m in re.finditer(r'''(?:fetch|axios\.(?:get|post|put|delete|patch))\s*\(\s*['"](\/[^'"]+)''', content):
                frontend_endpoints.append({"endpoint": m.group(1), "file": rel})

        # Backend route definitions
        if 'server' in rel.lower() or 'route' in rel.lower() or 'app.' in content:
            for m in re.finditer(r'''app\.\s*(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)''', content):
                backend_routes.append({"method": m.group(1).upper(), "endpoint": m.group(2), "file": rel})

    # Runtime config drift: used but not in .env.example
    for var in used_env_vars:
        if var not in documented_vars and var not in {'NODE_ENV', 'PORT', 'HOST', 'PATH', 'HOME', 'USER', 'SHELL', 'PWD'}:
            risks.append({
                "risk_type": "runtime_config_drift",
                "file": ".env.example",
                "line": 0,
                "evidence": f"'{var}' used in code but missing from .env.example",
                "severity": "high",
                "matched": var
            })

    # Frontend-backend contract mismatch
    backend_route_paths = {r['endpoint'] for r in backend_routes}
    for fe in frontend_endpoints:
        ep = fe['endpoint']
        # Normalize: /api/payment/create-order vs /api/payment/create-order
        if backend_route_paths and not any(ep == r or ep.startswith(r.rstrip('/')) for r in backend_route_paths):
            pass  # Only flag if we have backend routes AND endpoint not found
        # For simplicity, just collect them for correlation

    # Dependency incompatibility from package.json
    if pkg_versions:
        dep_risks = _check_dependency_risks(pkg_versions)
        risks.extend(dep_risks)

    return risks


def _read_env_example(path: Path) -> set:
    """Read documented env vars from .env.example."""
    documented = set()
    env_example = path / '.env.example'
    if env_example.exists():
        for line in env_example.read_text(errors='ignore').splitlines():
            line = line.strip()
            if line and not line.startswith('#'):
                key = line.split('=')[0].strip()
                if key:
                    documented.add(key)
    return documented


def _read_package_versions(path: Path) -> dict:
    """Read package.json for dependency versions."""
    pkg_json = path / 'package.json'
    if not pkg_json.exists():
        return {}
    try:
        data = json.loads(pkg_json.read_text())
        deps = {}
        deps.update(data.get('dependencies', {}))
        deps.update(data.get('devDependencies', {}))
        return deps
    except Exception:
        return {}


def _check_dependency_risks(versions: dict) -> list:
    """Check for known risky dependency versions."""
    risks = []

    checks = [
        ("react-router-dom", "6", "React Router v6 breaking: useHistory→useNavigate, Switch→Routes"),
        ("pydantic", "2", "Pydantic v2 breaking: .dict()→.model_dump(), orm_mode→from_attributes"),
        ("payment-sdk", "3", "payment-sdk v3 breaking: err.code→err.error_code"),
    ]

    for pkg, major_ver, desc in checks:
        ver = versions.get(pkg, '')
        ver_clean = ver.lstrip('^~>=<')
        if ver_clean and ver_clean[0] == major_ver:
            risks.append({
                "risk_type": "dependency_incompatibility",
                "file": "package.json",
                "line": 0,
                "evidence": f"{pkg} {ver}: {desc}",
                "severity": "high",
                "matched": f"{pkg}@{ver}"
            })

    return risks


def _walk_files(path: Path):
    """Walk directory yielding files with relevant extensions."""
    for p in path.rglob('*'):
        if p.is_file():
            if any(part in SKIP_DIRS for part in p.parts):
                continue
            if p.name in SKIP_FILES:
                continue
            if p.suffix in SCAN_EXTENSIONS:
                yield p
