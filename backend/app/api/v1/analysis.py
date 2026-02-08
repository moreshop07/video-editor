from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.analysis import VideoAnalysis
from app.models.asset import Asset
from app.models.processing import JobStatus, JobType, ProcessingJob
from app.models.user import User
from app.schemas.analysis import AnalysisRequest, AnalysisResponse
from app.schemas.processing import JobResponse
from app.workers.tasks import analyze_video

router = APIRouter(prefix="/analysis", tags=["analysis"])


@router.post("/", response_model=JobResponse, status_code=status.HTTP_202_ACCEPTED)
async def start_analysis(
    body: AnalysisRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProcessingJob:
    """Start a video analysis job for an asset."""
    # Verify asset ownership
    result = await db.execute(
        select(Asset).where(
            Asset.id == body.asset_id,
            Asset.user_id == current_user.id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found",
        )

    job = ProcessingJob(
        user_id=current_user.id,
        project_id=body.project_id,
        job_type=JobType.ANALYZE_VIDEO.value,
        status=JobStatus.PENDING.value,
        input_params={"asset_id": body.asset_id},
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    task = analyze_video.delay(job.id)
    job.celery_task_id = task.id
    await db.flush()
    await db.refresh(job)

    return job


@router.get("/{asset_id}", response_model=AnalysisResponse)
async def get_analysis(
    asset_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VideoAnalysis:
    """Get the analysis results for an asset."""
    # Verify asset ownership
    asset_result = await db.execute(
        select(Asset).where(
            Asset.id == asset_id,
            Asset.user_id == current_user.id,
        )
    )
    if asset_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found",
        )

    result = await db.execute(
        select(VideoAnalysis)
        .where(VideoAnalysis.asset_id == asset_id)
        .order_by(VideoAnalysis.created_at.desc())
        .limit(1)
    )
    analysis = result.scalar_one_or_none()
    if analysis is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No analysis found for this asset",
        )
    return analysis
