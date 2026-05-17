from fastapi import APIRouter

router = APIRouter()

# Simple in-memory database
db = {"user_1": {"name": "Alice", "email": "alice@example.com"}}


@router.post("/user")
async def get_user(data: dict):
    """Buggy endpoint — crashes with KeyError when user_id is missing from request."""
    # BUG: direct dict access without validation
    # If data doesn't contain 'user_id', this raises KeyError
    return db[data['user_id']]
