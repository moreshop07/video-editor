from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.asset import Asset
from app.models.processing import JobStatus, JobType, ProcessingJob
from app.models.user import User
from app.schemas.processing import JobResponse
from app.schemas.smart_edit import (
    BeatSyncRequest,
    HighlightDetectRequest,
    MontageRequest,
    PlatformOptimizeRequest,
)
from app.workers.tasks import smart_edit_task

router = APIRouter(prefix="/smart-edit", tags=["smart-edit"])


async def _verify_asset(asset_id: int, user: User, db: AsyncSession) -> None:
    """Verify an asset exists and belongs to the user."""
    result = await db.execute(
        select(Asset).where(Asset.id == asset_id, Asset.user_id == user.id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found",
        )


@router.post(
    "/beat-sync",
    response_model=JobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start_beat_sync(
    body: BeatSyncRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProcessingJob:
    """Start a beat-sync auto-edit job."""
    await _verify_asset(body.asset_id, current_user, db)

    job = ProcessingJob(
        user_id=current_user.id,
        project_id=body.project_id,
        job_type=JobType.SMART_EDIT.value,
        status=JobStatus.PENDING.value,
        input_params={
            "operation": "beat_sync",
            "asset_id": body.asset_id,
            "music_track_id": body.music_track_id,
            "music_asset_id": body.music_asset_id,
            "sensitivity": body.sensitivity,
            "min_clip_duration_ms": body.min_clip_duration_ms,
            "include_transitions": body.include_transitions,
            "transition_type": body.transition_type,
        },
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    task = smart_edit_task.delay(job.id)
    job.celery_task_id = task.id
    await db.flush()
    await db.refresh(job)
    return job


@router.post(
    "/montage",
    response_model=JobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start_montage(
    body: MontageRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProcessingJob:
    """Start a montage builder job."""
    for aid in body.asset_ids:
        await _verify_asset(aid, current_user, db)

    job = ProcessingJob(
        user_id=current_user.id,
        project_id=body.project_id,
        job_type=JobType.SMART_EDIT.value,
        status=JobStatus.PENDING.value,
        input_params={
            "operation": "montage",
            "asset_ids": body.asset_ids,
            "style": body.style,
            "target_duration_ms": body.target_duration_ms,
            "music_track_id": body.music_track_id,
            "include_transitions": body.include_transitions,
        },
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    task = smart_edit_task.delay(job.id)
    job.celery_task_id = task.id
    await db.flush()
    await db.refresh(job)
    return job


@router.post(
    "/platform-optimize",
    response_model=JobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start_platform_optimize(
    body: PlatformOptimizeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProcessingJob:
    """Start a platform optimization analysis job."""
    job = ProcessingJob(
        user_id=current_user.id,
        project_id=body.project_id,
        job_type=JobType.SMART_EDIT.value,
        status=JobStatus.PENDING.value,
        input_params={
            "operation": "platform_optimize",
            "project_id": body.project_id,
            "platform": body.platform,
            "asset_id": body.asset_id,
        },
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    task = smart_edit_task.delay(job.id)
    job.celery_task_id = task.id
    await db.flush()
    await db.refresh(job)
    return job


@router.post(
    "/highlight-detect",
    response_model=JobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start_highlight_detect(
    body: HighlightDetectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProcessingJob:
    """Start a highlight detection job."""
    await _verify_asset(body.asset_id, current_user, db)

    job = ProcessingJob(
        user_id=current_user.id,
        project_id=body.project_id,
        job_type=JobType.SMART_EDIT.value,
        status=JobStatus.PENDING.value,
        input_params={
            "operation": "highlight_detect",
            "asset_id": body.asset_id,
            "max_highlights": body.max_highlights,
            "min_highlight_duration_ms": body.min_highlight_duration_ms,
            "max_highlight_duration_ms": body.max_highlight_duration_ms,
        },
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    task = smart_edit_task.delay(job.id)
    job.celery_task_id = task.id
    await db.flush()
    await db.refresh(job)
    return job
