from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.processing import JobStatus, JobType, ProcessingJob
from app.models.project import Project
from app.models.user import User
from app.schemas.processing import AudioProcessRequest, ExportRequest, JobResponse
from app.workers.tasks import export_video, process_audio

router = APIRouter(prefix="/processing", tags=["processing"])


# ---------------------------------------------------------------------------
# POST /processing/export
# ---------------------------------------------------------------------------
@router.post("/export", response_model=JobResponse, status_code=status.HTTP_202_ACCEPTED)
async def start_export(
    body: ExportRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProcessingJob:
    """Dispatch a video export / render task.

    Creates a ``ProcessingJob`` and enqueues the heavy rendering work on the
    Celery worker pool.
    """

    # Verify project ownership
    result = await db.execute(
        select(Project).where(
            Project.id == body.project_id,
            Project.user_id == current_user.id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    job = ProcessingJob(
        user_id=current_user.id,
        project_id=body.project_id,
        job_type=JobType.EXPORT.value,
        status=JobStatus.PENDING.value,
        input_params={
            "format": body.format,
            "quality": body.quality,
            "resolution": body.resolution,
            "include_subtitles": body.include_subtitles,
            "subtitle_track_id": body.subtitle_track_id,
        },
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    task = export_video.delay(job.id)
    job.celery_task_id = task.id
    await db.flush()
    await db.refresh(job)

    return job


# ---------------------------------------------------------------------------
# POST /processing/audio/noise-reduction
# ---------------------------------------------------------------------------
@router.post(
    "/audio/noise-reduction",
    response_model=JobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start_noise_reduction(
    body: AudioProcessRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProcessingJob:
    """Dispatch a noise reduction task for the specified audio asset."""

    job = ProcessingJob(
        user_id=current_user.id,
        job_type=JobType.NOISE_REDUCTION.value,
        status=JobStatus.PENDING.value,
        input_params={
            "asset_id": body.asset_id,
            "operation": body.operation,
            "params": body.params,
        },
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    task = process_audio.delay(job.id)
    job.celery_task_id = task.id
    await db.flush()
    await db.refresh(job)

    return job


# ---------------------------------------------------------------------------
# POST /processing/audio/normalize
# ---------------------------------------------------------------------------
@router.post(
    "/audio/normalize",
    response_model=JobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start_normalization(
    body: AudioProcessRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProcessingJob:
    """Dispatch an audio normalization task for the specified audio asset."""

    job = ProcessingJob(
        user_id=current_user.id,
        job_type=JobType.NORMALIZE.value,
        status=JobStatus.PENDING.value,
        input_params={
            "asset_id": body.asset_id,
            "operation": body.operation,
            "params": body.params,
        },
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    task = process_audio.delay(job.id)
    job.celery_task_id = task.id
    await db.flush()
    await db.refresh(job)

    return job


# ---------------------------------------------------------------------------
# GET /processing/jobs/{id}
# ---------------------------------------------------------------------------
@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProcessingJob:
    """Get the status of a processing job."""

    result = await db.execute(
        select(ProcessingJob).where(
            ProcessingJob.id == job_id,
            ProcessingJob.user_id == current_user.id,
        )
    )
    job = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Processing job not found",
        )
    return job


# ---------------------------------------------------------------------------
# GET /processing/jobs
# ---------------------------------------------------------------------------
@router.get("/jobs", response_model=List[JobResponse])
async def list_jobs(
    status_filter: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ProcessingJob]:
    """List the current user's processing jobs with optional status filter."""

    stmt = select(ProcessingJob).where(ProcessingJob.user_id == current_user.id)

    if status_filter:
        stmt = stmt.where(ProcessingJob.status == status_filter)

    offset = (page - 1) * per_page
    stmt = stmt.order_by(ProcessingJob.created_at.desc()).offset(offset).limit(per_page)

    result = await db.execute(stmt)
    return list(result.scalars().all())
