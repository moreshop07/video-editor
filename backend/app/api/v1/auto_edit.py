from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.asset import Asset
from app.models.processing import JobStatus, JobType, ProcessingJob
from app.models.user import User
from app.schemas.auto_edit import AutoEditRequest
from app.schemas.processing import JobResponse
from app.workers.tasks import auto_edit_video

router = APIRouter(prefix="/auto-edit", tags=["auto-edit"])


@router.post(
    "/silence-removal",
    response_model=JobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start_silence_removal(
    body: AutoEditRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProcessingJob:
    """Start a silence removal job for a video asset."""
    # Verify asset ownership
    result = await db.execute(
        select(Asset).where(
            Asset.id == body.asset_id,
            Asset.user_id == current_user.id,
        )
    )
    asset = result.scalar_one_or_none()
    if asset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found",
        )

    job = ProcessingJob(
        user_id=current_user.id,
        project_id=body.project_id,
        job_type=JobType.AUTO_EDIT.value,
        status=JobStatus.PENDING.value,
        input_params={
            "source_path": asset.file_path,
            "operation": "silence_removal",
            "margin": body.margin,
        },
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    task = auto_edit_video.delay(job.id)
    job.celery_task_id = task.id
    await db.flush()
    await db.refresh(job)

    return job


@router.post(
    "/jump-cut",
    response_model=JobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start_jump_cut(
    body: AutoEditRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProcessingJob:
    """Start a jump cut editing job for a video asset."""
    result = await db.execute(
        select(Asset).where(
            Asset.id == body.asset_id,
            Asset.user_id == current_user.id,
        )
    )
    asset = result.scalar_one_or_none()
    if asset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found",
        )

    job = ProcessingJob(
        user_id=current_user.id,
        project_id=body.project_id,
        job_type=JobType.AUTO_EDIT.value,
        status=JobStatus.PENDING.value,
        input_params={
            "source_path": asset.file_path,
            "operation": "jump_cut",
        },
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    task = auto_edit_video.delay(job.id)
    job.celery_task_id = task.id
    await db.flush()
    await db.refresh(job)

    return job
