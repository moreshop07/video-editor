from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.processing import JobStatus, JobType, ProcessingJob
from app.models.project import Project
from app.models.subtitle import SubtitleSegment, SubtitleTrack
from app.models.user import User
from app.schemas.processing import JobResponse
from app.schemas.subtitle import (
    SubtitleGenerateRequest,
    SubtitleSegmentResponse,
    SubtitleSegmentUpdate,
    SubtitleTrackResponse,
    SubtitleTranslateRequest,
)
from app.workers.tasks import (
    transcribe_audio,
    transcribe_local_task,
    translate_claude,
    translate_subtitles,
)

router = APIRouter(prefix="/subtitles", tags=["subtitles"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
async def _verify_project_ownership(
    project_id: int,
    user: User,
    db: AsyncSession,
) -> Project:
    """Ensure the project exists and belongs to the user."""
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    return project


async def _get_track_for_user(
    track_id: int,
    user: User,
    db: AsyncSession,
) -> SubtitleTrack:
    """Fetch a subtitle track and verify the user owns the parent project."""
    result = await db.execute(
        select(SubtitleTrack).where(SubtitleTrack.id == track_id)
    )
    track = result.scalar_one_or_none()
    if track is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subtitle track not found",
        )
    # Verify project ownership
    await _verify_project_ownership(track.project_id, user, db)
    return track


# ---------------------------------------------------------------------------
# POST /subtitles/generate
# ---------------------------------------------------------------------------
@router.post("/generate", response_model=JobResponse, status_code=status.HTTP_202_ACCEPTED)
async def generate_subtitles(
    body: SubtitleGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProcessingJob:
    """Dispatch a Whisper transcription task for the given asset.

    Creates a ``ProcessingJob`` record and enqueues a Celery task.  The client
    can poll the job or listen on the WebSocket for progress updates.
    """

    # Verify project ownership
    await _verify_project_ownership(body.project_id, current_user, db)

    use_local = body.provider == "whisper_local"
    job_type = JobType.TRANSCRIBE_LOCAL.value if use_local else JobType.TRANSCRIBE.value

    job = ProcessingJob(
        user_id=current_user.id,
        project_id=body.project_id,
        job_type=job_type,
        status=JobStatus.PENDING.value,
        input_params={
            "asset_id": body.asset_id,
            "language": body.language,
            "provider": body.provider,
        },
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    celery_task = transcribe_local_task if use_local else transcribe_audio
    task = celery_task.delay(job.id)
    job.celery_task_id = task.id
    await db.flush()
    await db.refresh(job)

    return job


# ---------------------------------------------------------------------------
# POST /subtitles/translate
# ---------------------------------------------------------------------------
@router.post("/translate", response_model=JobResponse, status_code=status.HTTP_202_ACCEPTED)
async def translate_subtitle_track(
    body: SubtitleTranslateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProcessingJob:
    """Dispatch a GPT-4 translation task for an existing subtitle track."""

    track = await _get_track_for_user(body.track_id, current_user, db)

    use_claude = body.provider == "claude"
    job_type = JobType.TRANSLATE_CLAUDE.value if use_claude else JobType.TRANSLATE.value

    job = ProcessingJob(
        user_id=current_user.id,
        project_id=track.project_id,
        job_type=job_type,
        status=JobStatus.PENDING.value,
        input_params={
            "track_id": body.track_id,
            "target_language": body.target_language,
            "context_hint": body.context_hint,
            "provider": body.provider,
        },
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    celery_task = translate_claude if use_claude else translate_subtitles
    task = celery_task.delay(job.id)
    job.celery_task_id = task.id
    await db.flush()
    await db.refresh(job)

    return job


# ---------------------------------------------------------------------------
# GET /subtitles/tracks/{project_id}
# ---------------------------------------------------------------------------
@router.get("/tracks/{project_id}", response_model=List[SubtitleTrackResponse])
async def list_subtitle_tracks(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[SubtitleTrack]:
    """List all subtitle tracks for a project."""

    await _verify_project_ownership(project_id, current_user, db)

    result = await db.execute(
        select(SubtitleTrack)
        .where(SubtitleTrack.project_id == project_id)
        .order_by(SubtitleTrack.created_at)
    )
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# GET /subtitles/track/{track_id}
# ---------------------------------------------------------------------------
@router.get("/track/{track_id}", response_model=SubtitleTrackResponse)
async def get_subtitle_track(
    track_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubtitleTrack:
    """Get a single subtitle track with all its segments."""
    return await _get_track_for_user(track_id, current_user, db)


# ---------------------------------------------------------------------------
# PATCH /subtitles/segment/{segment_id}
# ---------------------------------------------------------------------------
@router.patch("/segment/{segment_id}", response_model=SubtitleSegmentResponse)
async def update_subtitle_segment(
    segment_id: int,
    body: SubtitleSegmentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubtitleSegment:
    """Update the text or timing of a single subtitle segment."""

    result = await db.execute(
        select(SubtitleSegment).where(SubtitleSegment.id == segment_id)
    )
    segment = result.scalar_one_or_none()
    if segment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subtitle segment not found",
        )

    # Verify ownership through track -> project
    await _get_track_for_user(segment.track_id, current_user, db)

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(segment, field, value)

    await db.flush()
    await db.refresh(segment)
    return segment


# ---------------------------------------------------------------------------
# DELETE /subtitles/track/{track_id}
# ---------------------------------------------------------------------------
@router.delete("/track/{track_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subtitle_track(
    track_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a subtitle track and all its segments."""

    track = await _get_track_for_user(track_id, current_user, db)
    await db.delete(track)
    await db.flush()
