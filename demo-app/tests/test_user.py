import pytest
from httpx import AsyncClient, ASGITransport
from app import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_existing_user(client):
    """Should return user data for existing user."""
    response = await client.post("/user", json={"user_id": "user_1"})
    assert response.status_code == 200
    assert response.json()["name"] == "Alice"


@pytest.mark.asyncio
async def test_missing_user(client):
    """Should return 404 for non-existent user."""
    response = await client.post("/user", json={"user_id": "nonexistent"})
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_missing_key(client):
    """Should return 400/422 when user_id field is missing entirely."""
    response = await client.post("/user", json={"cart_id": "c123"})
    assert response.status_code in (400, 422)
