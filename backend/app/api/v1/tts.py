from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.processing import JobStatus, JobType, ProcessingJob
from app.models.user import User
from app.schemas.processing import JobResponse
from app.schemas.tts import TTSRequest, TTSVoicesResponse, VoiceoverRequest, VoiceResponse
from app.services.tts import get_available_voices
from app.workers.tasks import generate_tts_task, generate_voiceover

router = APIRouter(prefix="/tts", tags=["tts"])


@router.post("/generate", response_model=JobResponse, status_code=status.HTTP_202_ACCEPTED)
async def start_tts(
    body: TTSRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProcessingJob:
    """Generate TTS audio from text."""
    job = ProcessingJob(
        user_id=current_user.id,
        project_id=body.project_id,
        job_type=JobType.GENERATE_TTS.value,
        status=JobStatus.PENDING.value,
        input_params={
            "text": body.text,
            "voice": body.voice,
        },
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    task = generate_tts_task.delay(job.id)
    job.celery_task_id = task.id
    await db.flush()
    await db.refresh(job)

    return job


@router.post("/voiceover", response_model=JobResponse, status_code=status.HTTP_202_ACCEPTED)
async def start_voiceover(
    body: VoiceoverRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProcessingJob:
    """Generate voiceover from subtitle track segments."""
    job = ProcessingJob(
        user_id=current_user.id,
        project_id=body.project_id,
        job_type=JobType.GENERATE_VOICEOVER.value,
        status=JobStatus.PENDING.value,
        input_params={
            "track_id": body.track_id,
            "voice": body.voice,
        },
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    task = generate_voiceover.delay(job.id)
    job.celery_task_id = task.id
    await db.flush()
    await db.refresh(job)

    return job


@router.get("/voices", response_model=TTSVoicesResponse)
async def list_voices() -> TTSVoicesResponse:
    """List available TTS voices."""
    voices = get_available_voices()
    return TTSVoicesResponse(
        voices=[
            VoiceResponse(voice_id=vid, label=label)
            for vid, label in voices.items()
        ]
    )
