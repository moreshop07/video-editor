from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.processing import JobStatus, JobType, ProcessingJob
from app.models.user import User
from app.schemas.processing import JobResponse
from app.workers.tasks import generate_ai_video

router = APIRouter(prefix="/ai-video", tags=["ai-video"])


class AIVideoRequest(BaseModel):
    task_type: str = "wan26-txt2video"
    prompt: str
    image_url: Optional[str] = None
    resolution: str = "720P"
    duration: int = 5
    aspect_ratio: str = "16:9"
    project_id: Optional[int] = None


@router.post("/generate", response_model=JobResponse, status_code=status.HTTP_202_ACCEPTED)
async def generate_ai_video_endpoint(
    body: AIVideoRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProcessingJob:
    """Start an AI video generation job via PiAPI (WAN PRO)."""
    if not settings.PIAPI_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PiAPI API key is not configured",
        )

    if body.task_type not in ("wan26-txt2video", "wan26-img2video"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="task_type must be wan26-txt2video or wan26-img2video",
        )

    if body.task_type == "wan26-img2video" and not body.image_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="image_url is required for wan26-img2video",
        )

    job = ProcessingJob(
        user_id=current_user.id,
        project_id=body.project_id,
        job_type=JobType.AI_VIDEO.value,
        status=JobStatus.PENDING.value,
        input_params={
            "task_type": body.task_type,
            "prompt": body.prompt,
            "image_url": body.image_url,
            "resolution": body.resolution,
            "duration": body.duration,
            "aspect_ratio": body.aspect_ratio,
        },
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    task = generate_ai_video.delay(job.id)
    job.celery_task_id = task.id
    await db.flush()
    await db.refresh(job)

    return job
