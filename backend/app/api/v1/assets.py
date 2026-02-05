from __future__ import annotations

import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.storage import delete_file, upload_file
from app.models.asset import Asset
from app.models.user import User
from app.schemas.asset import AssetResponse, AssetSearchParams
from app.workers.tasks import process_asset_metadata

router = APIRouter(prefix="/assets", tags=["assets"])

# Allowed MIME-type prefixes for upload validation
_ALLOWED_PREFIXES = ("video/", "audio/", "image/")


def _detect_asset_type(mime_type: str) -> str:
    """Map a MIME type to a high-level asset type string."""
    if mime_type.startswith("video/"):
        return "video"
    if mime_type.startswith("audio/"):
        return "audio"
    if mime_type.startswith("image/"):
        return "image"
    return "video"  # fallback


# ---------------------------------------------------------------------------
# POST /assets/upload
# ---------------------------------------------------------------------------
@router.post(
    "/upload",
    response_model=AssetResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_asset(
    file: UploadFile,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Asset:
    """Upload a media file, store it in MinIO, and dispatch metadata extraction.

    The file is persisted to the configured MinIO assets bucket and a database
    record is created immediately.  A Celery task is dispatched asynchronously
    to extract thumbnails, waveforms, and technical metadata.
    """

    if file.content_type is None or not file.content_type.startswith(_ALLOWED_PREFIXES):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type: {file.content_type}",
        )

    # Read file contents
    contents = await file.read()
    file_size = len(contents)

    # Check storage quota
    if current_user.storage_used_bytes + file_size > current_user.storage_limit_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Storage quota exceeded",
        )

    # Generate a unique storage filename
    ext = (file.filename or "upload").rsplit(".", 1)[-1] if file.filename else "bin"
    unique_filename = f"{uuid.uuid4().hex}.{ext}"
    object_name = f"{current_user.id}/{unique_filename}"

    # Upload to MinIO
    file_path = upload_file(
        bucket=settings.MINIO_BUCKET_ASSETS,
        object_name=object_name,
        file_data=contents,
        content_type=file.content_type,
    )

    # Create DB record
    asset = Asset(
        user_id=current_user.id,
        filename=unique_filename,
        original_filename=file.filename or "upload",
        file_path=file_path,
        file_size=file_size,
        mime_type=file.content_type,
        asset_type=_detect_asset_type(file.content_type),
    )
    db.add(asset)
    await db.flush()
    await db.refresh(asset)

    # Update user storage counter
    current_user.storage_used_bytes += file_size
    await db.flush()

    # Dispatch async metadata extraction (thumbnail, waveform, duration, etc.)
    process_asset_metadata.delay(asset.id)

    return asset


# ---------------------------------------------------------------------------
# GET /assets
# ---------------------------------------------------------------------------
@router.get("", response_model=List[AssetResponse])
async def list_assets(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Asset]:
    """List the current user's assets with pagination."""

    offset = (page - 1) * per_page
    result = await db.execute(
        select(Asset)
        .where(Asset.user_id == current_user.id)
        .order_by(Asset.created_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# GET /assets/search
# ---------------------------------------------------------------------------
@router.get("/search", response_model=List[AssetResponse])
async def search_assets(
    asset_type: str | None = Query(None),
    tags: list[str] | None = Query(None),
    mood: list[str] | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Asset]:
    """Search user's assets by type, tags, and/or mood."""

    query = select(Asset).where(Asset.user_id == current_user.id)

    if asset_type is not None:
        query = query.where(Asset.asset_type == asset_type)

    if tags:
        query = query.where(Asset.auto_tags.overlap(tags))

    if mood:
        query = query.where(Asset.mood_tags.overlap(mood))

    offset = (page - 1) * per_page
    query = query.order_by(Asset.created_at.desc()).offset(offset).limit(per_page)

    result = await db.execute(query)
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# GET /assets/{id}
# ---------------------------------------------------------------------------
@router.get("/{asset_id}", response_model=AssetResponse)
async def get_asset(
    asset_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Asset:
    """Get a single asset by ID."""

    result = await db.execute(
        select(Asset).where(Asset.id == asset_id, Asset.user_id == current_user.id)
    )
    asset = result.scalar_one_or_none()
    if asset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found",
        )
    return asset


# ---------------------------------------------------------------------------
# GET /assets/{id}/stream
# ---------------------------------------------------------------------------
@router.get("/{asset_id}/stream")
async def stream_asset(
    asset_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Stream an asset file from MinIO with Range header support."""
    from fastapi.responses import StreamingResponse
    from starlette.responses import Response
    import io

    result = await db.execute(
        select(Asset).where(Asset.id == asset_id, Asset.user_id == current_user.id)
    )
    asset = result.scalar_one_or_none()
    if asset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found",
        )

    # Get presigned URL for the object
    from app.core.storage import get_presigned_url
    url = get_presigned_url(
        bucket=settings.MINIO_BUCKET_ASSETS,
        object_name=asset.file_path.lstrip("/").split("/", 1)[-1],
        expires=3600,
    )

    # Redirect to MinIO presigned URL for streaming
    from starlette.responses import RedirectResponse
    return RedirectResponse(url=url, status_code=307)


# ---------------------------------------------------------------------------
# GET /assets/{id}/thumbnail
# ---------------------------------------------------------------------------
@router.get("/{asset_id}/thumbnail")
async def get_asset_thumbnail(
    asset_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a presigned URL for the asset thumbnail."""
    from starlette.responses import RedirectResponse
    from app.core.storage import get_presigned_url

    result = await db.execute(
        select(Asset).where(Asset.id == asset_id, Asset.user_id == current_user.id)
    )
    asset = result.scalar_one_or_none()
    if asset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found",
        )

    if not asset.thumbnail_url:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Thumbnail not available",
        )

    # thumbnail_url is stored as "/{bucket}/{object_name}"
    parts = asset.thumbnail_url.lstrip("/").split("/", 1)
    bucket = parts[0]
    object_name = parts[1] if len(parts) > 1 else parts[0]

    url = get_presigned_url(bucket=bucket, object_name=object_name, expires=3600)
    return RedirectResponse(url=url, status_code=307)


# ---------------------------------------------------------------------------
# DELETE /assets/{id}
# ---------------------------------------------------------------------------
@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset(
    asset_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete an asset from storage and the database."""

    result = await db.execute(
        select(Asset).where(Asset.id == asset_id, Asset.user_id == current_user.id)
    )
    asset = result.scalar_one_or_none()
    if asset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found",
        )

    # Remove from MinIO
    object_name = asset.file_path.lstrip("/").split("/", 1)[-1]
    try:
        delete_file(bucket=settings.MINIO_BUCKET_ASSETS, object_name=object_name)
    except Exception:
        pass  # best-effort cleanup

    # Update user storage counter
    current_user.storage_used_bytes = max(
        0, current_user.storage_used_bytes - asset.file_size
    )

    await db.delete(asset)
    await db.flush()
