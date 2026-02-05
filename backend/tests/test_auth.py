"""Tests for authentication endpoints (register, login, me)."""

import pytest
from httpx import AsyncClient


# ---------------------------------------------------------------------------
# Register
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_register_success(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "newuser@example.com",
            "username": "newuser",
            "password": "securepass",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient):
    payload = {
        "email": "dup@example.com",
        "username": "dup1",
        "password": "password",
    }
    resp1 = await client.post("/api/v1/auth/register", json=payload)
    assert resp1.status_code == 201

    resp2 = await client.post(
        "/api/v1/auth/register",
        json={**payload, "username": "dup2"},
    )
    assert resp2.status_code == 409


@pytest.mark.asyncio
async def test_register_duplicate_username(client: AsyncClient):
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "first@example.com",
            "username": "dupuser",
            "password": "password",
        },
    )
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "second@example.com",
            "username": "dupuser",
            "password": "password",
        },
    )
    assert resp.status_code == 409


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_login_success(client: AsyncClient):
    # Register first
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "login@example.com",
            "username": "loginuser",
            "password": "mypassword",
        },
    )
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "login@example.com", "password": "mypassword"},
    )
    assert resp.status_code == 200
    assert "access_token" in resp.json()


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient):
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "wrongpw@example.com",
            "username": "wrongpwuser",
            "password": "correct",
        },
    )
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "wrongpw@example.com", "password": "incorrect"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_nonexistent_email(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "whatever"},
    )
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /me
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_me_authenticated(authenticated_client: AsyncClient):
    resp = await authenticated_client.get("/api/v1/auth/me")
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "testuser@example.com"
    assert data["username"] == "testuser"
    assert "id" in data


@pytest.mark.asyncio
async def test_get_me_no_token(client: AsyncClient):
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_get_me_invalid_token(client: AsyncClient):
    resp = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer invalidtokenxyz"},
    )
    assert resp.status_code == 401
