from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.download import DownloadedVideo
from app.models.processing import JobStatus, JobType, ProcessingJob
from app.models.user import User
from app.schemas.downloads import DownloadRequest, DownloadResponse
from app.schemas.processing import JobResponse
from app.workers.tasks import download_video

router = APIRouter(prefix="/downloads", tags=["downloads"])


@router.post("/", response_model=JobResponse, status_code=status.HTTP_202_ACCEPTED)
async def start_download(
    body: DownloadRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProcessingJob:
    """Start a video download job from a URL."""
    job = ProcessingJob(
        user_id=current_user.id,
        job_type=JobType.DOWNLOAD.value,
        status=JobStatus.PENDING.value,
        input_params={"url": body.url},
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    task = download_video.delay(job.id)
    job.celery_task_id = task.id
    await db.flush()
    await db.refresh(job)

    return job


@router.get("/", response_model=List[DownloadResponse])
async def list_downloads(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[DownloadedVideo]:
    """List the current user's downloaded videos."""
    result = await db.execute(
        select(DownloadedVideo)
        .where(DownloadedVideo.user_id == current_user.id)
        .order_by(DownloadedVideo.created_at.desc())
        .limit(50)
    )
    return list(result.scalars().all())
