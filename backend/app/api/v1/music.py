from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.music import MusicTrack, SoundEffect
from app.models.processing import JobStatus, ProcessingJob
from app.models.user import User
from app.schemas.music import (
    MusicMatchRequest,
    MusicSearchParams,
    MusicTrackResponse,
    SoundEffectResponse,
)
from app.schemas.processing import JobResponse
from app.workers.tasks import match_music

router = APIRouter(tags=["music"])


# ---------------------------------------------------------------------------
# GET /music/library
# ---------------------------------------------------------------------------
@router.get("/music/library", response_model=List[MusicTrackResponse])
async def browse_music(
    query: str | None = Query(None),
    mood: str | None = Query(None),
    genre: str | None = Query(None),
    min_bpm: float | None = Query(None),
    max_bpm: float | None = Query(None),
    min_energy: float | None = Query(None),
    max_energy: float | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MusicTrack]:
    """Browse the music library with optional search and filter parameters."""

    stmt = select(MusicTrack)

    if query:
        pattern = f"%{query}%"
        stmt = stmt.where(
            or_(
                MusicTrack.title.ilike(pattern),
                MusicTrack.artist.ilike(pattern),
            )
        )

    if mood:
        stmt = stmt.where(MusicTrack.mood_tags.any(mood))

    if genre:
        stmt = stmt.where(MusicTrack.genre_tags.any(genre))

    if min_bpm is not None:
        stmt = stmt.where(MusicTrack.bpm >= min_bpm)

    if max_bpm is not None:
        stmt = stmt.where(MusicTrack.bpm <= max_bpm)

    if min_energy is not None:
        stmt = stmt.where(MusicTrack.energy >= min_energy)

    if max_energy is not None:
        stmt = stmt.where(MusicTrack.energy <= max_energy)

    offset = (page - 1) * per_page
    stmt = stmt.order_by(MusicTrack.title).offset(offset).limit(per_page)

    result = await db.execute(stmt)
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# GET /music/{id}
# ---------------------------------------------------------------------------
@router.get("/music/{track_id}", response_model=MusicTrackResponse)
async def get_music_track(
    track_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MusicTrack:
    """Get a single music track by ID."""

    result = await db.execute(
        select(MusicTrack).where(MusicTrack.id == track_id)
    )
    track = result.scalar_one_or_none()
    if track is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Music track not found",
        )
    return track


# ---------------------------------------------------------------------------
# POST /music/match
# ---------------------------------------------------------------------------
@router.post("/music/match", response_model=JobResponse, status_code=status.HTTP_202_ACCEPTED)
async def auto_score_match(
    body: MusicMatchRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProcessingJob:
    """Dispatch an AI-powered music recommendation task.

    Analyzes the project timeline and/or subtitle text to suggest the most
    fitting background music tracks.
    """

    job = ProcessingJob(
        user_id=current_user.id,
        project_id=body.project_id,
        job_type="music_match",
        status=JobStatus.PENDING.value,
        input_params={
            "project_id": body.project_id,
            "subtitle_text": body.subtitle_text,
            "preferred_mood": body.preferred_mood,
        },
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    # Dispatch Celery task (job.input_params carries all match parameters)
    task = match_music.delay(job.id)
    job.celery_task_id = task.id
    await db.flush()
    await db.refresh(job)

    return job


# ---------------------------------------------------------------------------
# GET /sfx
# ---------------------------------------------------------------------------
@router.get("/sfx", response_model=List[SoundEffectResponse])
async def list_sound_effects(
    query: str | None = Query(None),
    category: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[SoundEffect]:
    """List sound effects with optional search and category filter."""

    stmt = select(SoundEffect)

    if query:
        pattern = f"%{query}%"
        stmt = stmt.where(
            or_(
                SoundEffect.title.ilike(pattern),
                SoundEffect.tags.any(query),
            )
        )

    if category:
        stmt = stmt.where(SoundEffect.category == category)

    offset = (page - 1) * per_page
    stmt = stmt.order_by(SoundEffect.title).offset(offset).limit(per_page)

    result = await db.execute(stmt)
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# GET /sfx/{id}
# ---------------------------------------------------------------------------
@router.get("/sfx/{sfx_id}", response_model=SoundEffectResponse)
async def get_sound_effect(
    sfx_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SoundEffect:
    """Get a single sound effect by ID."""

    result = await db.execute(
        select(SoundEffect).where(SoundEffect.id == sfx_id)
    )
    sfx = result.scalar_one_or_none()
    if sfx is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sound effect not found",
        )
    return sfx
