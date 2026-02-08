from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.storage import upload_file as minio_upload
from app.models.processing import JobStatus, JobType, ProcessingJob
from app.models.user import User
from app.models.voice_profile import VoiceProfile
from app.schemas.processing import JobResponse
from app.schemas.tts import (
    TTSRequest,
    TTSVoicesExtendedResponse,
    TTSVoicesResponse,
    VoiceoverMultiVoiceRequest,
    VoiceoverRequest,
    VoicePreviewRequest,
    VoiceProfileCreate,
    VoiceProfileListResponse,
    VoiceProfileResponse,
    VoiceProfileUpdate,
    VoiceResponse,
)
from app.services.tts import get_available_voices
from app.workers.tasks import generate_tts_task, generate_voiceover, generate_voiceover_multi_voice

router = APIRouter(prefix="/tts", tags=["tts"])


# ---- Existing endpoints (unchanged) ------------------------------------


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


# ---- Voice Profile CRUD ------------------------------------------------


@router.post("/voice-profiles", response_model=VoiceProfileResponse, status_code=status.HTTP_201_CREATED)
async def create_voice_profile(
    body: VoiceProfileCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VoiceProfile:
    """Create a new voice profile."""
    if body.provider == "fish_audio" and not settings.FISH_AUDIO_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Fish Audio API key not configured",
        )

    profile = VoiceProfile(
        user_id=current_user.id,
        name=body.name,
        description=body.description,
        provider=body.provider,
        provider_voice_id=body.provider_voice_id,
        settings=body.settings,
    )
    db.add(profile)
    await db.flush()
    await db.refresh(profile)
    return profile


@router.get("/voice-profiles", response_model=VoiceProfileListResponse)
async def list_voice_profiles(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VoiceProfileListResponse:
    """List all voice profiles for the current user."""
    result = await db.execute(
        select(VoiceProfile)
        .where(VoiceProfile.user_id == current_user.id)
        .order_by(VoiceProfile.created_at.desc())
    )
    profiles = result.scalars().all()
    return VoiceProfileListResponse(profiles=profiles)


@router.get("/voice-profiles/{profile_id}", response_model=VoiceProfileResponse)
async def get_voice_profile(
    profile_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VoiceProfile:
    """Get a specific voice profile."""
    profile = await db.get(VoiceProfile, profile_id)
    if profile is None or profile.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Voice profile not found")
    return profile


@router.patch("/voice-profiles/{profile_id}", response_model=VoiceProfileResponse)
async def update_voice_profile(
    profile_id: int,
    body: VoiceProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VoiceProfile:
    """Update a voice profile."""
    profile = await db.get(VoiceProfile, profile_id)
    if profile is None or profile.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Voice profile not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(profile, key, value)

    await db.flush()
    await db.refresh(profile)
    return profile


@router.delete("/voice-profiles/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_voice_profile(
    profile_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a voice profile."""
    profile = await db.get(VoiceProfile, profile_id)
    if profile is None or profile.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Voice profile not found")
    await db.delete(profile)
    await db.flush()


@router.post("/voice-profiles/{profile_id}/sample-audio", response_model=VoiceProfileResponse)
async def upload_sample_audio(
    profile_id: int,
    file: UploadFile,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VoiceProfile:
    """Upload reference audio for voice cloning (Fish Audio profiles)."""
    profile = await db.get(VoiceProfile, profile_id)
    if profile is None or profile.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Voice profile not found")

    content = await file.read()
    ext = os.path.splitext(file.filename or "sample.mp3")[1] or ".mp3"
    object_name = f"voice_profiles/{current_user.id}/{profile_id}/sample{ext}"
    minio_upload(
        settings.MINIO_BUCKET_ASSETS,
        object_name,
        content,
        content_type=file.content_type or "audio/mpeg",
    )

    profile.sample_audio_path = f"/{settings.MINIO_BUCKET_ASSETS}/{object_name}"
    await db.flush()
    await db.refresh(profile)
    return profile


# ---- Voice Preview -----------------------------------------------------


@router.post("/voice-preview")
async def preview_voice(
    body: VoicePreviewRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Quick voice preview — returns audio stream directly.

    Limits text to 200 chars for fast response.
    """
    from app.services import tts as tts_service

    text = body.text[:200]
    local_path: str | None = None

    try:
        if body.voice_profile_id:
            profile = await db.get(VoiceProfile, body.voice_profile_id)
            if profile is None or profile.user_id != current_user.id:
                raise HTTPException(status_code=404, detail="Voice profile not found")
            local_path = tts_service.generate_tts_with_profile(text, profile)
        else:
            voice = body.voice or settings.TTS_VOICE_ZH
            local_path = tts_service.generate_tts(text, voice=voice)

        def iterfile():
            with open(local_path, "rb") as f:
                yield from iter(lambda: f.read(8192), b"")
            os.unlink(local_path)

        return StreamingResponse(iterfile(), media_type="audio/mpeg")

    except HTTPException:
        raise
    except Exception as exc:
        if local_path and os.path.exists(local_path):
            os.unlink(local_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Voice preview failed: {exc}",
        )


# ---- Multi-Voice Voiceover --------------------------------------------


@router.post("/voiceover-multi-voice", response_model=JobResponse, status_code=status.HTTP_202_ACCEPTED)
async def start_voiceover_multi_voice(
    body: VoiceoverMultiVoiceRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProcessingJob:
    """Generate voiceover with per-segment voice profile assignments."""
    job = ProcessingJob(
        user_id=current_user.id,
        project_id=body.project_id,
        job_type=JobType.GENERATE_VOICEOVER_MULTI.value,
        status=JobStatus.PENDING.value,
        input_params={
            "track_id": body.track_id,
            "voice_profile_id": body.voice_profile_id,
            "segment_voices": body.segment_voices,
        },
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    task = generate_voiceover_multi_voice.delay(job.id)
    job.celery_task_id = task.id
    await db.flush()
    await db.refresh(job)

    return job


# ---- Extended Voices ---------------------------------------------------


@router.get("/voices-extended", response_model=TTSVoicesExtendedResponse)
async def list_voices_extended() -> TTSVoicesExtendedResponse:
    """List all available voices including Fish Audio availability."""
    from app.services import fish_audio

    voices = get_available_voices()
    return TTSVoicesExtendedResponse(
        voices=[
            VoiceResponse(voice_id=vid, label=label)
            for vid, label in voices.items()
        ],
        fish_audio_available=fish_audio.is_available(),
    )
