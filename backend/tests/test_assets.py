"""Tests for asset upload / list / delete endpoints.

MinIO storage and Celery tasks are mocked so tests don't need external services.
"""

from unittest.mock import MagicMock, patch

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
@patch("app.api.v1.assets.process_asset_metadata", new_callable=MagicMock)
@patch("app.api.v1.assets.upload_file", return_value="/1/abc123.mp4")
async def test_upload_asset(
    mock_upload: MagicMock,
    mock_task: MagicMock,
    authenticated_client: AsyncClient,
):
    mock_task.delay = MagicMock()

    resp = await authenticated_client.post(
        "/api/v1/assets/upload",
        files={"file": ("test.mp4", b"fakevideo", "video/mp4")},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["original_filename"] == "test.mp4"
    assert data["mime_type"] == "video/mp4"
    assert data["asset_type"] == "video"
    mock_upload.assert_called_once()
    mock_task.delay.assert_called_once()


@pytest.mark.asyncio
async def test_upload_unsupported_type(authenticated_client: AsyncClient):
    resp = await authenticated_client.post(
        "/api/v1/assets/upload",
        files={"file": ("readme.txt", b"hello", "text/plain")},
    )
    assert resp.status_code == 415


@pytest.mark.asyncio
@patch("app.api.v1.assets.process_asset_metadata", new_callable=MagicMock)
@patch("app.api.v1.assets.upload_file", return_value="/1/abc.mp4")
async def test_list_assets(
    mock_upload: MagicMock,
    mock_task: MagicMock,
    authenticated_client: AsyncClient,
):
    mock_task.delay = MagicMock()

    # Upload one asset first
    await authenticated_client.post(
        "/api/v1/assets/upload",
        files={"file": ("clip.mp4", b"fakedata", "video/mp4")},
    )

    resp = await authenticated_client.get("/api/v1/assets")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1


@pytest.mark.asyncio
@patch("app.api.v1.assets.delete_file")
@patch("app.api.v1.assets.process_asset_metadata", new_callable=MagicMock)
@patch("app.api.v1.assets.upload_file", return_value="/1/del.mp4")
async def test_delete_asset(
    mock_upload: MagicMock,
    mock_task: MagicMock,
    mock_delete: MagicMock,
    authenticated_client: AsyncClient,
):
    mock_task.delay = MagicMock()

    create_resp = await authenticated_client.post(
        "/api/v1/assets/upload",
        files={"file": ("delete_me.mp4", b"data", "video/mp4")},
    )
    asset_id = create_resp.json()["id"]

    resp = await authenticated_client.delete(f"/api/v1/assets/{asset_id}")
    assert resp.status_code == 204
