"""Tests for the projects CRUD endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_project(authenticated_client: AsyncClient):
    resp = await authenticated_client.post(
        "/api/v1/projects",
        json={"name": "My Video", "width": 1920, "height": 1080, "fps": 30.0},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "My Video"
    assert data["width"] == 1920
    assert data["height"] == 1080
    assert "id" in data


@pytest.mark.asyncio
async def test_list_projects(authenticated_client: AsyncClient):
    await authenticated_client.post(
        "/api/v1/projects", json={"name": "Project A"}
    )
    await authenticated_client.post(
        "/api/v1/projects", json={"name": "Project B"}
    )
    resp = await authenticated_client.get("/api/v1/projects")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 2


@pytest.mark.asyncio
async def test_get_project_detail(authenticated_client: AsyncClient):
    create_resp = await authenticated_client.post(
        "/api/v1/projects", json={"name": "Detail Test"}
    )
    pid = create_resp.json()["id"]

    resp = await authenticated_client.get(f"/api/v1/projects/{pid}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Detail Test"
    assert "project_data" in data


@pytest.mark.asyncio
async def test_get_project_not_found(authenticated_client: AsyncClient):
    resp = await authenticated_client.get("/api/v1/projects/999999")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_project(authenticated_client: AsyncClient):
    create_resp = await authenticated_client.post(
        "/api/v1/projects", json={"name": "Old Name"}
    )
    pid = create_resp.json()["id"]

    resp = await authenticated_client.patch(
        f"/api/v1/projects/{pid}", json={"name": "New Name"}
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"


@pytest.mark.asyncio
async def test_patch_project_data(authenticated_client: AsyncClient):
    create_resp = await authenticated_client.post(
        "/api/v1/projects", json={"name": "Data Patch Test"}
    )
    pid = create_resp.json()["id"]

    resp = await authenticated_client.patch(
        f"/api/v1/projects/{pid}/data",
        json={"ops": [{"op": "add", "path": "/timeline", "value": {"tracks": []}}]},
    )
    assert resp.status_code == 200
    assert resp.json()["project_data"]["timeline"] == {"tracks": []}


@pytest.mark.asyncio
async def test_delete_project(authenticated_client: AsyncClient):
    create_resp = await authenticated_client.post(
        "/api/v1/projects", json={"name": "To Delete"}
    )
    pid = create_resp.json()["id"]

    resp = await authenticated_client.delete(f"/api/v1/projects/{pid}")
    assert resp.status_code == 204

    # Verify gone
    resp2 = await authenticated_client.get(f"/api/v1/projects/{pid}")
    assert resp2.status_code == 404


@pytest.mark.asyncio
async def test_project_isolation(client: AsyncClient):
    """Another user should not see the first user's projects."""
    # User 1
    r1 = await client.post(
        "/api/v1/auth/register",
        json={"email": "user1@example.com", "username": "user1", "password": "pass"},
    )
    token1 = r1.json()["access_token"]
    create_resp = await client.post(
        "/api/v1/projects",
        json={"name": "User1 Project"},
        headers={"Authorization": f"Bearer {token1}"},
    )
    pid = create_resp.json()["id"]

    # User 2
    r2 = await client.post(
        "/api/v1/auth/register",
        json={"email": "user2@example.com", "username": "user2", "password": "pass"},
    )
    token2 = r2.json()["access_token"]
    resp = await client.get(
        f"/api/v1/projects/{pid}",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert resp.status_code == 404
