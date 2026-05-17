import logging
import time

logger = logging.getLogger(__name__)

# Fallback source code — exact content of demo-app/routes/user.py
FALLBACK_SOURCE = '''from fastapi import APIRouter

router = APIRouter()

# Simple in-memory database
db = {"user_1": {"name": "Alice", "email": "alice@example.com"}}


@router.post("/user")
async def get_user(data: dict):
    """Buggy endpoint — crashes with KeyError when user_id is missing from request."""
    # BUG: direct dict access without validation
    # If data doesn't contain 'user_id', this raises KeyError
    return db[data['user_id']]
'''


def fetch_file(repo: str, file_path: str, token: str) -> str:
    """
    Fetch file from GitHub. 3 retries, 10s timeout.
    Falls back to embedded constant on failure. Never raises.
    """
    logger.info(f"Fetching {file_path} from {repo}")

    if not token:
        logger.warning("No GitHub token configured, using fallback source")
        return FALLBACK_SOURCE

    for attempt in range(3):
        try:
            from github import Github
            g = Github(token, timeout=10)
            repo_obj = g.get_repo(repo)
            content = repo_obj.get_contents(file_path)
            decoded = content.decoded_content.decode("utf-8")
            logger.info(f"Successfully fetched {file_path} ({len(decoded)} chars)")
            return decoded
        except Exception as e:
            logger.warning(f"GitHub fetch attempt {attempt + 1}/3 failed: {e}")
            if attempt < 2:
                time.sleep(2 ** attempt)

    logger.warning(f"All GitHub fetch attempts failed for {file_path}, using fallback source")
    return FALLBACK_SOURCE
