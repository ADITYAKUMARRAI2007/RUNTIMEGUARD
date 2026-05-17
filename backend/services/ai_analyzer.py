"""
AI Code Analyzer Agent — uses Gemini (or Claude) to deeply analyze repository code.
Goes beyond regex pattern matching to understand context, detect issues,
and suggest intelligent fixes.
"""
import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

ANALYSIS_SYSTEM_PROMPT = """You are RuntimeGuard AI, a code analysis agent. Your job is to scan source code files and identify:

1. **Deprecated APIs** — functions, methods, or patterns that are deprecated in newer versions
2. **Security vulnerabilities** — unsafe patterns, missing input validation, injection risks
3. **Breaking changes** — code that will break with upcoming framework/library updates
4. **Outdated patterns** — code using old idioms when better alternatives exist
5. **Production risks** — patterns likely to cause runtime errors (missing error handling, type issues)

For each issue found, return a JSON array of findings. Each finding must have:
- "finding_type": one of "deprecated_api", "vulnerability", "breaking_change", "outdated_pattern", "production_risk"
- "title": short descriptive title (under 80 chars)
- "description": explanation of why this is a problem
- "file_path": the file where it was found
- "line_number": approximate line number (or null)
- "severity": "CRITICAL", "HIGH", "MEDIUM", or "LOW"
- "package_name": related package/framework (or null)
- "fix_hint": how to fix it (one sentence)

Return ONLY valid JSON array. No markdown, no explanation outside the JSON.
If no issues are found, return an empty array: []"""


async def analyze_code_with_ai(
    files: dict[str, str],
    repo_name: str,
    settings,
) -> list[dict]:
    """
    Send code files to AI for deep analysis.
    Tries Vorflux first (OpenAI-compatible), then Gemini, then Claude.
    Returns a list of findings.
    """
    # Try Vorflux first (OpenAI-compatible)
    if settings.vorflux_api_key:
        findings = await _analyze_with_vorflux(files, repo_name, settings)
        if findings is not None:
            return findings

    # Try Gemini
    if settings.gemini_api_key:
        findings = await _analyze_with_gemini(files, repo_name, settings)
        if findings is not None:
            return findings

    # Fall back to Claude
    if settings.anthropic_api_key:
        findings = await _analyze_with_claude(files, repo_name, settings)
        if findings is not None:
            return findings

    logger.info("No AI API key configured, skipping AI analysis")
    return []


async def _analyze_with_vorflux(
    files: dict[str, str],
    repo_name: str,
    settings,
) -> Optional[list[dict]]:
    """Analyze code using Vorflux (OpenAI-compatible) API."""
    try:
        import httpx

        file_context = _build_file_context(files, max_chars=20000)
        if not file_context.strip():
            return []

        user_message = (
            f"Analyze the following code from the repository '{repo_name}'. "
            f"Identify all deprecated APIs, security vulnerabilities, breaking changes, "
            f"outdated patterns, and production risks.\n\n"
            f"{file_context}"
        )

        payload = {
            "model": "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": ANALYSIS_SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            "temperature": 0.2,
            "max_tokens": 4000,
        }

        headers = {
            "Authorization": f"Bearer {settings.vorflux_api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            # Try with /v1/chat/completions first, then without /v1
            url = f"{settings.vorflux_base_url}/v1/chat/completions"
            response = await client.post(url, json=payload, headers=headers)
            if response.status_code == 404 or response.status_code == 405:
                url = f"{settings.vorflux_base_url}/chat/completions"
                response = await client.post(url, json=payload, headers=headers)

        if response.status_code != 200:
            logger.warning(f"Vorflux API returned {response.status_code}: {response.text[:200]}")
            return None

        result = response.json()
        raw_text = result["choices"][0]["message"]["content"]

        findings = _parse_ai_response(raw_text, repo_name)
        logger.info(f"Vorflux analysis for {repo_name}: found {len(findings)} issues")
        return findings

    except Exception as e:
        logger.warning(f"Vorflux analysis failed for {repo_name}: {e}")
        return None


async def _analyze_with_gemini(
    files: dict[str, str],
    repo_name: str,
    settings,
) -> Optional[list[dict]]:
    """Analyze code using Google Gemini API."""
    try:
        import httpx

        file_context = _build_file_context(files, max_chars=20000)
        if not file_context.strip():
            return []

        prompt = (
            f"{ANALYSIS_SYSTEM_PROMPT}\n\n"
            f"Analyze the following code from the repository '{repo_name}'. "
            f"Identify all deprecated APIs, security vulnerabilities, breaking changes, "
            f"outdated patterns, and production risks.\n\n"
            f"{file_context}"
        )

        # Gemini API call
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={settings.gemini_api_key}"

        payload = {
            "contents": [
                {
                    "parts": [{"text": prompt}]
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 4000,
                "responseMimeType": "application/json",
            }
        }

        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(url, json=payload)

        if response.status_code != 200:
            logger.warning(f"Gemini API returned {response.status_code}: {response.text[:200]}")
            return None

        result = response.json()

        # Extract text from Gemini response
        candidates = result.get("candidates", [])
        if not candidates:
            logger.warning("Gemini returned no candidates")
            return None

        raw_text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        if not raw_text:
            return []

        # Parse JSON
        findings = _parse_ai_response(raw_text, repo_name)
        logger.info(f"Gemini analysis for {repo_name}: found {len(findings)} issues")
        return findings

    except Exception as e:
        logger.warning(f"Gemini analysis failed for {repo_name}: {e}")
        return None


async def _analyze_with_claude(
    files: dict[str, str],
    repo_name: str,
    settings,
) -> Optional[list[dict]]:
    """Analyze code using Anthropic Claude API."""
    try:
        import anthropic

        client = anthropic.Anthropic(
            api_key=settings.anthropic_api_key,
            timeout=30.0,
            max_retries=1,
        )

        file_context = _build_file_context(files, max_chars=15000)
        if not file_context.strip():
            return []

        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4000,
            system=ANALYSIS_SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Analyze the following code from the repository '{repo_name}'. "
                        f"Identify all deprecated APIs, security vulnerabilities, breaking changes, "
                        f"outdated patterns, and production risks.\n\n"
                        f"{file_context}"
                    ),
                }
            ],
        )

        raw_text = response.content[0].text.strip()
        findings = _parse_ai_response(raw_text, repo_name)
        logger.info(f"Claude analysis for {repo_name}: found {len(findings)} issues")
        return findings

    except Exception as e:
        logger.warning(f"Claude analysis failed for {repo_name}: {e}")
        return None


async def generate_ai_fix(
    source_code: str,
    file_path: str,
    finding: dict,
    settings,
) -> Optional[str]:
    """
    Use AI to generate a fix for a specific finding.
    Tries Vorflux first, then Gemini, then Claude.
    Returns the complete patched source code, or None on failure.
    """
    fix_prompt = (
        f"Fix the following issue in this file. Return ONLY the complete patched source code. "
        f"No markdown, no explanation, no code fences.\n\n"
        f"Issue: {finding.get('title', 'Unknown')}\n"
        f"Type: {finding.get('finding_type', 'unknown')}\n"
        f"Description: {finding.get('description', '')}\n"
        f"Fix hint: {finding.get('fix_hint', '')}\n"
        f"File: {file_path}\n\n"
        f"Source code:\n{source_code}"
    )

    # Try Vorflux
    if settings.vorflux_api_key:
        result = await _generate_fix_vorflux(fix_prompt, settings)
        if result:
            return result

    # Try Gemini
    if settings.gemini_api_key:
        result = await _generate_fix_gemini(fix_prompt, settings)
        if result:
            return result

    # Try Claude
    if settings.anthropic_api_key:
        result = await _generate_fix_claude(fix_prompt, settings)
        if result:
            return result

    return None


async def _generate_fix_vorflux(prompt: str, settings) -> Optional[str]:
    """Generate fix using Vorflux (OpenAI-compatible)."""
    try:
        import httpx

        payload = {
            "model": "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": "You are a code repair agent. Return ONLY the complete patched source code. No markdown, no explanation, no code fences."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.1,
            "max_tokens": 3000,
        }

        headers = {
            "Authorization": f"Bearer {settings.vorflux_api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{settings.vorflux_base_url}/chat/completions",
                json=payload,
                headers=headers,
            )

        if response.status_code != 200:
            return None

        result = response.json()
        text = result["choices"][0]["message"]["content"].strip()
        # Clean markdown fences
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])
        return text if text else None

    except Exception as e:
        logger.warning(f"Vorflux fix generation failed: {e}")
        return None


async def _generate_fix_gemini(prompt: str, settings) -> Optional[str]:
    """Generate fix using Gemini."""
    try:
        import httpx

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={settings.gemini_api_key}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.1, "maxOutputTokens": 3000},
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json=payload)

        if response.status_code != 200:
            return None

        result = response.json()
        candidates = result.get("candidates", [])
        if not candidates:
            return None

        text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        # Clean markdown fences
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])
        return text.strip() if text.strip() else None

    except Exception as e:
        logger.warning(f"Gemini fix generation failed: {e}")
        return None


async def _generate_fix_claude(prompt: str, settings) -> Optional[str]:
    """Generate fix using Claude."""
    try:
        import anthropic

        client = anthropic.Anthropic(
            api_key=settings.anthropic_api_key,
            timeout=20.0,
            max_retries=1,
        )

        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=3000,
            system="You are a code repair agent. Return ONLY the complete patched source code. No markdown, no explanation, no code fences.",
            messages=[{"role": "user", "content": prompt}],
        )

        text = response.content[0].text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])
        return text if text else None

    except Exception as e:
        logger.warning(f"Claude fix generation failed: {e}")
        return None


def _parse_ai_response(raw_text: str, repo_name: str) -> list[dict]:
    """Parse AI response into structured findings."""
    try:
        # Handle markdown code fences
        text = raw_text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            if text.endswith("```"):
                text = text[:-3]

        findings = json.loads(text)

        if not isinstance(findings, list):
            logger.warning(f"AI response for {repo_name} is not a list")
            return []

        # Validate findings
        valid = []
        for f in findings:
            if not isinstance(f, dict) or "title" not in f:
                continue
            valid.append({
                "finding_type": f.get("finding_type", "production_risk"),
                "title": str(f.get("title", "Unknown issue"))[:100],
                "description": str(f.get("description", "")),
                "file_path": f.get("file_path"),
                "line_number": f.get("line_number"),
                "severity": f.get("severity") if f.get("severity") in ("CRITICAL", "HIGH", "MEDIUM", "LOW") else "MEDIUM",
                "package_name": f.get("package_name"),
                "fix_hint": str(f.get("fix_hint", "")),
            })
        return valid

    except json.JSONDecodeError as e:
        logger.warning(f"AI response for {repo_name} is not valid JSON: {e}")
        return []


def _build_file_context(files: dict[str, str], max_chars: int = 15000) -> str:
    """Build a context string from files, truncating to stay within limits."""
    parts = []
    total_chars = 0

    # Prioritize dependency files and source code
    priority_order = []
    other_files = []

    for path, content in files.items():
        if path.endswith(("requirements.txt", "package.json", "pyproject.toml", "setup.py")):
            priority_order.append((path, content))
        else:
            other_files.append((path, content))

    all_files = priority_order + other_files

    for path, content in all_files:
        header = f"\n--- FILE: {path} ---\n"
        truncated_content = content[:3000] if len(content) > 3000 else content
        section = header + truncated_content

        if total_chars + len(section) > max_chars:
            remaining = max_chars - total_chars
            if remaining > 200:
                parts.append(section[:remaining] + "\n[... truncated]")
            break
        parts.append(section)
        total_chars += len(section)

    return "\n".join(parts)


# === DEMO MODE: Pre-baked AI findings for when API quota is exhausted ===

DEMO_AI_FINDINGS = [
    {
        "finding_type": "vulnerability",
        "title": "SQL injection risk in user query endpoint",
        "description": "String interpolation used in SQL query construction instead of parameterized queries. An attacker could inject malicious SQL via the user_id parameter.",
        "file_path": "routes/user.py",
        "line_number": 12,
        "severity": "CRITICAL",
        "package_name": None,
        "fix_hint": "Use parameterized queries or ORM methods instead of f-string SQL construction",
    },
    {
        "finding_type": "deprecated_api",
        "title": "datetime.utcnow() deprecated in Python 3.12",
        "description": "datetime.utcnow() returns naive UTC datetime which is deprecated. Use timezone-aware datetimes instead.",
        "file_path": "app.py",
        "line_number": 8,
        "severity": "MEDIUM",
        "package_name": "python",
        "fix_hint": "Replace datetime.utcnow() with datetime.now(timezone.utc)",
    },
    {
        "finding_type": "production_risk",
        "title": "Missing error handling in API endpoint",
        "description": "The get_user endpoint accesses dict keys directly without checking existence, causing KeyError crashes in production when payload is malformed.",
        "file_path": "routes/user.py",
        "line_number": 15,
        "severity": "HIGH",
        "package_name": None,
        "fix_hint": "Use dict.get() with default values or validate input with Pydantic models",
    },
    {
        "finding_type": "outdated_pattern",
        "title": "Using @app.on_event instead of lifespan handler",
        "description": "FastAPI deprecated @app.on_event('startup') in favor of the lifespan context manager pattern which provides better resource management.",
        "file_path": "app.py",
        "line_number": 22,
        "severity": "HIGH",
        "package_name": "fastapi",
        "fix_hint": "Migrate to async lifespan context manager pattern",
    },
    {
        "finding_type": "vulnerability",
        "title": "No request payload size limit configured",
        "description": "The API accepts arbitrary-size payloads which could be exploited for denial-of-service attacks via memory exhaustion.",
        "file_path": "app.py",
        "line_number": 1,
        "severity": "MEDIUM",
        "package_name": "fastapi",
        "fix_hint": "Add request body size limit middleware or Pydantic model with constrained fields",
    },
    {
        "finding_type": "breaking_change",
        "title": "Pydantic V1 style model usage detected",
        "description": "Code uses Pydantic V1 patterns (class Config, validator decorator) which are incompatible with Pydantic V2. Migration required for FastAPI 0.100+.",
        "file_path": "routes/user.py",
        "line_number": 5,
        "severity": "HIGH",
        "package_name": "pydantic",
        "fix_hint": "Migrate to Pydantic V2: use model_config dict and field_validator decorator",
    },
]


def get_demo_ai_findings(repo_name: str) -> list[dict]:
    """
    Return pre-baked AI findings for demo mode.
    Used when AI API quota is exhausted but we still want to show the feature.
    """
    # Return findings with the repo context
    return [dict(f) for f in DEMO_AI_FINDINGS]
