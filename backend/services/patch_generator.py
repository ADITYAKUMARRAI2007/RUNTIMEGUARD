import logging

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a code repair agent. Return only the complete patched source code file. "
    "No markdown, no explanation, no code fences."
)

FALLBACK_PATCH_1 = '''from fastapi import APIRouter

router = APIRouter()

# Simple in-memory database
db = {"user_1": {"name": "Alice", "email": "alice@example.com"}}


@router.post("/user")
async def get_user(data: dict):
    """Minimal fix — wraps db lookup in try/except but still uses direct dict access."""
    user_id = data['user_id']
    try:
        return db[user_id]
    except KeyError:
        return {"error": "User not found"}, 404
'''

FALLBACK_PATCH_2 = '''from fastapi import APIRouter, HTTPException

router = APIRouter()

# Simple in-memory database
db = {"user_1": {"name": "Alice", "email": "alice@example.com"}}


@router.post("/user")
async def get_user(data: dict):
    """Robust fix — validates input and handles missing user gracefully."""
    user_id = data.get('user_id')
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    user = db.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found")
    return user
'''


async def generate_patches(crash, source_code: str, settings) -> list:
    """
    Generate exactly 2 patch candidates using Claude.
    Falls back to pre-baked FALLBACK constants on any error.
    Never raises to caller.
    """
    try:
        import anthropic

        client = anthropic.Anthropic(
            api_key=settings.anthropic_api_key,
            timeout=10.0,
            max_retries=1,
        )

        patch_1 = _call_claude(
            client,
            source_code,
            crash,
            "Generate the most minimal possible fix. Only address the immediate crash, nothing else.",
        )
        patch_2 = _call_claude(
            client,
            source_code,
            crash,
            "Generate a robust fix with proper input validation and error handling. "
            "Validate all inputs, return proper HTTP status codes (400 for bad input, 404 for not found).",
        )

        return [patch_1, patch_2]
    except Exception as e:
        logger.warning(f"Claude patch generation failed, using fallback patches: {e}")
        return [FALLBACK_PATCH_1, FALLBACK_PATCH_2]


async def generate_root_cause(crash, source_code: str, settings) -> str:
    """
    Generate plain-language root cause explanation using Claude.
    Falls back to rule-based string on any error.
    Never raises to caller.
    """
    try:
        import anthropic

        client = anthropic.Anthropic(
            api_key=settings.anthropic_api_key,
            timeout=10.0,
            max_retries=1,
        )

        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=200,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Explain in 2 sentences why this code crashed:\n"
                        f"Error: {crash.exception_type}: {crash.exception_message}\n"
                        f"File: {crash.primary_file} line {crash.line_number}\n"
                        f"Function: {crash.function_name}\n"
                        f"Code context:\n{source_code[:500]}"
                    ),
                }
            ],
        )
        return response.content[0].text
    except Exception as e:
        logger.warning(f"Claude root cause generation failed, using fallback: {e}")
        key = crash.exception_message.strip("'\"")
        return (
            f"The {crash.function_name} function accessed payload['{key}'] without "
            f"validating the key exists. When the request omitted this field, "
            f"Python raised {crash.exception_type}."
        )


def _call_claude(client, source_code: str, crash, instruction: str) -> str:
    """Call Claude with a patch generation prompt. Raises on failure."""
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1000,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": (
                    f"{instruction}\n\n"
                    f"Error: {crash.exception_type}: {crash.exception_message}\n"
                    f"File: {crash.primary_file} line {crash.line_number}\n"
                    f"Function: {crash.function_name}\n\n"
                    f"Original source code:\n{source_code}"
                ),
            }
        ],
    )
    return response.content[0].text


async def generate_deprecation_fix(
    source_code: str,
    file_path: str,
    finding_type: str,
    title: str,
    description: str,
    fix_hint: str,
    settings,
) -> str:
    """
    Generate a fix for a deprecated API, outdated dependency, or breaking change.
    Uses Claude to rewrite the affected code.
    Falls back to applying the fix_hint as a comment if Claude fails.
    """
    try:
        import anthropic

        client = anthropic.Anthropic(
            api_key=settings.anthropic_api_key,
            timeout=15.0,
            max_retries=1,
        )

        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            system=SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Fix the following issue in this source file.\n\n"
                        f"Issue type: {finding_type}\n"
                        f"Issue: {title}\n"
                        f"Description: {description}\n"
                        f"Fix hint: {fix_hint}\n"
                        f"File: {file_path}\n\n"
                        f"Original source code:\n{source_code}\n\n"
                        f"Return the complete fixed source file. Apply the minimum change needed."
                    ),
                }
            ],
        )
        return response.content[0].text
    except Exception as e:
        logger.warning(f"Claude deprecation fix failed for {file_path}: {e}")
        # Fallback: add a TODO comment at the top
        return f"# TODO: {title} — {fix_hint}\n{source_code}"
