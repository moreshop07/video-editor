from __future__ import annotations

import uuid
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.storage import upload_file
from app.models.asset import Asset
from app.models.user import User
from app.schemas.asset import AssetResponse

router = APIRouter(prefix="/external", tags=["external"])

# ---------------------------------------------------------------------------
# Source configuration
# ---------------------------------------------------------------------------
_SOURCE_CONFIGS: dict[str, dict[str, Any]] = {
    "pexels": {
        "search_url": "https://api.pexels.com/v1/search",
        "video_search_url": "https://api.pexels.com/videos/search",
        "api_key_header": "Authorization",
        "get_key": lambda: settings.PEXELS_API_KEY,
    },
    "pixabay": {
        "search_url": "https://pixabay.com/api/",
        "video_search_url": "https://pixabay.com/api/videos/",
        "api_key_param": "key",
        "get_key": lambda: settings.PIXABAY_API_KEY,
    },
    "freesound": {
        "search_url": "https://freesound.org/apiv2/search/text/",
        "api_key_header": "Authorization",
        "auth_prefix": "Token ",
        "get_key": lambda: settings.FREESOUND_API_KEY,
    },
}


def _get_source_config(source: str) -> dict[str, Any]:
    """Validate and return the configuration for a given external source."""
    source_lower = source.lower()
    if source_lower not in _SOURCE_CONFIGS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported source: {source}. Supported: {', '.join(_SOURCE_CONFIGS)}",
        )
    config = _SOURCE_CONFIGS[source_lower]
    api_key = config["get_key"]()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"API key for {source} is not configured",
        )
    return config


# ---------------------------------------------------------------------------
# GET /external/{source}/search
# ---------------------------------------------------------------------------
@router.get("/{source}/search")
async def search_external(
    source: str,
    query: str = Query(..., min_length=1),
    media_type: str = Query("image", regex="^(image|video|audio)$"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=80),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Proxy a search request to an external asset provider.

    Supported sources: ``pexels``, ``pixabay``, ``freesound``.

    The response structure varies by provider, but the raw API response is
    returned as-is so the frontend can parse provider-specific fields.
    """

    config = _get_source_config(source)
    api_key = config["get_key"]()
    source_lower = source.lower()

    headers: dict[str, str] = {}
    params: dict[str, Any] = {
        "query": query,
        "page": page,
        "per_page": per_page,
    }

    # Build provider-specific request
    if source_lower == "pexels":
        headers[config["api_key_header"]] = api_key
        url = config["video_search_url"] if media_type == "video" else config["search_url"]

    elif source_lower == "pixabay":
        params[config["api_key_param"]] = api_key
        params["q"] = query
        del params["query"]
        url = config["video_search_url"] if media_type == "video" else config["search_url"]

    elif source_lower == "freesound":
        headers[config["api_key_header"]] = f"{config['auth_prefix']}{api_key}"
        url = config["search_url"]
    else:
        url = config["search_url"]

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, headers=headers, params=params)

    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"External API returned {resp.status_code}",
        )

    return resp.json()


# ---------------------------------------------------------------------------
# POST /external/import
# ---------------------------------------------------------------------------
from pydantic import BaseModel


class ExternalImportRequest(BaseModel):
    url: str
    source: str
    original_filename: str
    content_type: str = "image/jpeg"


@router.post("/import", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
async def import_external_asset(
    body: ExternalImportRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Asset:
    """Download an asset from an external URL and import it into the user's library.

    The file is fetched server-side, stored in MinIO, and a corresponding
    database record is created.
    """

    # Download the external file
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        resp = await client.get(body.url)

    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to download external asset",
        )

    contents = resp.content
    file_size = len(contents)

    # Storage quota check
    if current_user.storage_used_bytes + file_size > current_user.storage_limit_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Storage quota exceeded",
        )

    # Determine asset type from content_type
    content_type = body.content_type
    if content_type.startswith("video/"):
        asset_type = "video"
    elif content_type.startswith("audio/"):
        asset_type = "audio"
    else:
        asset_type = "image"

    ext = body.original_filename.rsplit(".", 1)[-1] if "." in body.original_filename else "bin"
    unique_filename = f"{uuid.uuid4().hex}.{ext}"
    object_name = f"{current_user.id}/{unique_filename}"

    file_path = upload_file(
        bucket=settings.MINIO_BUCKET_ASSETS,
        object_name=object_name,
        file_data=contents,
        content_type=content_type,
    )

    asset = Asset(
        user_id=current_user.id,
        filename=unique_filename,
        original_filename=body.original_filename,
        file_path=file_path,
        file_size=file_size,
        mime_type=content_type,
        asset_type=asset_type,
    )
    db.add(asset)
    await db.flush()
    await db.refresh(asset)

    current_user.storage_used_bytes += file_size
    await db.flush()

    return asset
