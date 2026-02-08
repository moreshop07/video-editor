"""Celery task definitions for the video-editor backend.

Every task runs inside a synchronous Celery worker, so we use the *sync*
SQLAlchemy engine (``DATABASE_URL_SYNC``) and plain ``Session`` objects
rather than the async equivalents used in the FastAPI layer.
"""

from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import tempfile
from pathlib import Path

import redis as sync_redis
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.storage import (
    get_presigned_url,
    minio_client,
    upload_file,
)
from app.models.analysis import VideoAnalysis
from app.models.asset import Asset, AssetType
from app.models.download import DownloadedVideo
from app.models.music import MusicTrack
from app.models.processing import JobStatus, ProcessingJob
from app.models.project import Project
from app.models.subtitle import SubtitleSegment, SubtitleTrack
from app.models.tts import TTSTrack
from app.services import ai as ai_service
from app.services import ffmpeg as ffmpeg_service
from app.services import piapi as piapi_service
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Synchronous database helpers
# ---------------------------------------------------------------------------

_sync_engine = create_engine(
    settings.DATABASE_URL_SYNC,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
)

SyncSessionLocal = sessionmaker(
    bind=_sync_engine,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


def get_sync_session() -> Session:
    """Return a new synchronous SQLAlchemy ``Session``."""
    return SyncSessionLocal()


# ---------------------------------------------------------------------------
# Synchronous Redis helper (for progress publishing from workers)
# ---------------------------------------------------------------------------

_redis_sync = sync_redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)


def _publish_progress(job_id: int, progress: float, detail: str | None = None) -> None:
    """Publish a progress update to ``job:{job_id}:progress`` via Redis."""
    payload: dict = {
        "job_id": job_id,
        "progress": progress,
        "status": JobStatus.PROCESSING.value,
    }
    if detail:
        payload["detail"] = detail
    _redis_sync.publish(f"job:{job_id}:progress", json.dumps(payload))


def _update_job_status(
    session: Session,
    job: ProcessingJob,
    status: str,
    *,
    progress: float | None = None,
    result: dict | None = None,
    error_message: str | None = None,
) -> None:
    """Persist a job status change and publish it via Redis."""
    job.status = status
    if progress is not None:
        job.progress = progress
    if result is not None:
        job.result = result
    if error_message is not None:
        job.error_message = error_message
    session.commit()

    # Also broadcast so WebSocket listeners get a real-time update
    payload: dict = {
        "job_id": job.id,
        "status": status,
        "progress": job.progress,
    }
    if error_message:
        payload["error_message"] = error_message
    _redis_sync.publish(f"job:{job.id}:progress", json.dumps(payload))


# ---------------------------------------------------------------------------
# Helper to download a MinIO object to a local temp file
# ---------------------------------------------------------------------------

def _download_from_minio(file_path: str, suffix: str = "") -> str:
    """Download a MinIO object described by ``/{bucket}/{object_name}`` to a
    local temporary file and return the local path.
    """
    parts = file_path.strip("/").split("/", 1)
    bucket = parts[0]
    object_name = parts[1] if len(parts) > 1 else parts[0]

    if not suffix:
        suffix = Path(object_name).suffix or ".bin"

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp.close()
    minio_client.fget_object(bucket, object_name, tmp.name)
    return tmp.name


# =========================================================================
# Task: process_asset_metadata
# =========================================================================

@celery_app.task(name="app.workers.tasks.process_asset_metadata", bind=True, max_retries=3)
def process_asset_metadata(self, asset_id: int) -> dict:
    """Extract metadata from an uploaded asset using ffprobe, generate a
    thumbnail and (for audio/video) a waveform image, then upload both to
    MinIO and update the asset record.
    """
    session = get_sync_session()
    try:
        asset: Asset | None = session.get(Asset, asset_id)
        if asset is None:
            raise ValueError(f"Asset {asset_id} not found")

        # Download asset from MinIO to a temp file
        local_path = _download_from_minio(asset.file_path)

        try:
            # --- Probe metadata ---
            probe_data = ffmpeg_service.probe_file(local_path)

            format_info = probe_data.get("format", {})
            duration_sec = float(format_info.get("duration", 0))
            duration_ms = int(duration_sec * 1000)

            width: int | None = None
            height: int | None = None
            codec: str | None = None
            for stream in probe_data.get("streams", []):
                if stream.get("codec_type") == "video":
                    width = int(stream.get("width", 0)) or None
                    height = int(stream.get("height", 0)) or None
                    codec = stream.get("codec_name")
                    break

            metadata_json = {
                "format": format_info.get("format_name"),
                "duration": duration_sec,
                "bit_rate": format_info.get("bit_rate"),
                "codec": codec,
                "streams": [
                    {
                        "codec_type": s.get("codec_type"),
                        "codec_name": s.get("codec_name"),
                        "width": s.get("width"),
                        "height": s.get("height"),
                        "sample_rate": s.get("sample_rate"),
                        "channels": s.get("channels"),
                    }
                    for s in probe_data.get("streams", [])
                ],
            }

            # --- Generate thumbnail ---
            thumbnail_url: str | None = None
            thumb_tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
            thumb_tmp.close()
            try:
                time_sec = min(1.0, duration_sec / 2) if duration_sec > 0 else 0
                ffmpeg_service.extract_thumbnail(local_path, thumb_tmp.name, time_sec=time_sec)

                thumb_object = f"assets/{asset_id}/thumbnail.jpg"
                with open(thumb_tmp.name, "rb") as f:
                    thumbnail_url = upload_file(
                        settings.MINIO_BUCKET_THUMBNAILS,
                        thumb_object,
                        f.read(),
                        content_type="image/jpeg",
                    )
            except subprocess.CalledProcessError:
                logger.warning("Thumbnail generation failed for asset %s", asset_id)
            finally:
                os.unlink(thumb_tmp.name)

            # --- Generate waveform (for audio / video with audio) ---
            waveform_url: str | None = None
            has_audio = any(
                s.get("codec_type") == "audio"
                for s in probe_data.get("streams", [])
            )
            if has_audio:
                wave_tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
                wave_tmp.close()
                try:
                    ffmpeg_service.generate_waveform(local_path, wave_tmp.name)
                    wave_object = f"assets/{asset_id}/waveform.png"
                    with open(wave_tmp.name, "rb") as f:
                        waveform_url = upload_file(
                            settings.MINIO_BUCKET_THUMBNAILS,
                            wave_object,
                            f.read(),
                            content_type="image/png",
                        )
                except subprocess.CalledProcessError:
                    logger.warning("Waveform generation failed for asset %s", asset_id)
                finally:
                    os.unlink(wave_tmp.name)

            # --- Update asset record ---
            asset.metadata_json = metadata_json
            asset.duration_ms = duration_ms
            if width:
                asset.width = width
            if height:
                asset.height = height
            if thumbnail_url:
                asset.thumbnail_url = thumbnail_url
            if waveform_url:
                asset.waveform_url = waveform_url

            session.commit()

            return {
                "asset_id": asset_id,
                "duration_ms": duration_ms,
                "width": width,
                "height": height,
                "thumbnail_url": thumbnail_url,
                "waveform_url": waveform_url,
            }

        finally:
            os.unlink(local_path)

    except Exception as exc:
        session.rollback()
        logger.exception("process_asset_metadata failed for asset %s", asset_id)
        raise self.retry(exc=exc, countdown=30)
    finally:
        session.close()


# =========================================================================
# Task: export_video
# =========================================================================

@celery_app.task(name="app.workers.tasks.export_video", bind=True, max_retries=2)
def export_video(self, job_id: int) -> dict:
    """Build and execute an FFmpeg export from the project timeline, track
    progress, and upload the result to MinIO.
    """
    session = get_sync_session()
    try:
        job: ProcessingJob | None = session.get(ProcessingJob, job_id)
        if job is None:
            raise ValueError(f"Job {job_id} not found")

        _update_job_status(session, job, JobStatus.PROCESSING.value, progress=0.0)

        # Retrieve project data
        project: Project | None = session.get(Project, job.project_id)
        if project is None or not project.project_data:
            raise ValueError(f"Project {job.project_id} has no timeline data")

        project_data = project.project_data

        # Prepare output path
        output_tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4")
        output_tmp.close()

        try:
            # Build the FFmpeg command
            cmd = ffmpeg_service.build_export_command(project_data, output_tmp.name)

            # Run FFmpeg with progress tracking via stderr
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                universal_newlines=True,
            )

            # Determine total duration for progress calculation
            total_duration_ms = project.duration_ms or 0
            if total_duration_ms == 0:
                # Estimate from timeline
                timeline = project_data.get("timeline", {})
                for track in timeline.get("tracks", []):
                    for clip in track.get("clips", []):
                        end = clip.get("end_ms", 0)
                        total_duration_ms = max(total_duration_ms, end)

            # Parse ffmpeg progress from stderr
            stderr_output = []
            for line in iter(process.stderr.readline, ""):
                stderr_output.append(line)
                # ffmpeg outputs lines like "frame=  123 ... time=00:01:23.45 ..."
                time_match = re.search(r"time=(\d+):(\d+):(\d+\.\d+)", line)
                if time_match and total_duration_ms > 0:
                    h, m, s = time_match.groups()
                    current_ms = (
                        int(h) * 3_600_000
                        + int(m) * 60_000
                        + int(float(s) * 1000)
                    )
                    pct = min(95.0, (current_ms / total_duration_ms) * 100)
                    _publish_progress(job_id, pct)
                    job.progress = pct
                    session.commit()

            process.wait()
            if process.returncode != 0:
                full_err = "".join(stderr_output)
                raise RuntimeError(f"FFmpeg export failed (rc={process.returncode}): {full_err[-2000:]}")

            _publish_progress(job_id, 95.0, detail="Uploading result...")

            # Upload to MinIO
            export_object = f"exports/{job.user_id}/{job_id}/output.mp4"
            with open(output_tmp.name, "rb") as f:
                upload_file(
                    settings.MINIO_BUCKET_EXPORTS,
                    export_object,
                    f.read(),
                    content_type="video/mp4",
                )

            download_url = get_presigned_url(
                settings.MINIO_BUCKET_EXPORTS, export_object, expires=86400,
            )

            _update_job_status(
                session, job, JobStatus.COMPLETED.value,
                progress=100.0,
                result={"download_url": download_url, "object_path": f"/{settings.MINIO_BUCKET_EXPORTS}/{export_object}"},
            )

            return {"job_id": job_id, "download_url": download_url}

        finally:
            if os.path.exists(output_tmp.name):
                os.unlink(output_tmp.name)

    except Exception as exc:
        session.rollback()
        logger.exception("export_video failed for job %s", job_id)
        try:
            if job:
                _update_job_status(
                    session, job, JobStatus.FAILED.value,
                    error_message=str(exc)[:2000],
                )
        except Exception:
            logger.exception("Failed to update job status to FAILED")
        raise self.retry(exc=exc, countdown=60)
    finally:
        session.close()


# =========================================================================
# Task: process_audio
# =========================================================================

@celery_app.task(name="app.workers.tasks.process_audio", bind=True, max_retries=2)
def process_audio(self, job_id: int) -> dict:
    """Apply audio processing (noise reduction or loudness normalisation)
    to a source file.
    """
    session = get_sync_session()
    try:
        job: ProcessingJob | None = session.get(ProcessingJob, job_id)
        if job is None:
            raise ValueError(f"Job {job_id} not found")

        _update_job_status(session, job, JobStatus.PROCESSING.value, progress=0.0)

        input_params = job.input_params or {}
        operation = input_params.get("operation", job.job_type)
        source_path = input_params.get("source_path", "")

        if not source_path:
            raise ValueError("No source_path specified in input_params")

        # Download source from MinIO
        local_input = _download_from_minio(source_path)
        local_output = tempfile.NamedTemporaryFile(
            delete=False, suffix=Path(source_path).suffix or ".wav",
        ).name

        try:
            _publish_progress(job_id, 10.0, detail="Processing audio...")

            if operation in ("noise_reduction", JobStatus.PROCESSING.value):
                ffmpeg_service.apply_noise_reduction(local_input, local_output)
            elif operation == "normalize":
                target_lufs = float(input_params.get("target_lufs", -14.0))
                ffmpeg_service.apply_loudnorm(local_input, local_output, target_lufs=target_lufs)
            else:
                raise ValueError(f"Unknown audio operation: {operation}")

            _publish_progress(job_id, 80.0, detail="Uploading processed audio...")

            # Upload processed audio
            output_object = f"processed/{job.user_id}/{job_id}/output{Path(source_path).suffix or '.wav'}"
            with open(local_output, "rb") as f:
                result_path = upload_file(
                    settings.MINIO_BUCKET_ASSETS,
                    output_object,
                    f.read(),
                    content_type="audio/wav",
                )

            download_url = get_presigned_url(
                settings.MINIO_BUCKET_ASSETS, output_object, expires=86400,
            )

            _update_job_status(
                session, job, JobStatus.COMPLETED.value,
                progress=100.0,
                result={
                    "download_url": download_url,
                    "object_path": result_path,
                    "operation": operation,
                },
            )

            return {"job_id": job_id, "download_url": download_url}

        finally:
            for p in (local_input, local_output):
                if os.path.exists(p):
                    os.unlink(p)

    except Exception as exc:
        session.rollback()
        logger.exception("process_audio failed for job %s", job_id)
        try:
            if job:
                _update_job_status(
                    session, job, JobStatus.FAILED.value,
                    error_message=str(exc)[:2000],
                )
        except Exception:
            logger.exception("Failed to update job status to FAILED")
        raise self.retry(exc=exc, countdown=60)
    finally:
        session.close()


# =========================================================================
# Task: transcribe_audio
# =========================================================================

@celery_app.task(name="app.workers.tasks.transcribe_audio", bind=True, max_retries=2)
def transcribe_audio(self, job_id: int) -> dict:
    """Transcribe audio using the OpenAI Whisper API, creating subtitle
    track and segment records.
    """
    session = get_sync_session()
    try:
        job: ProcessingJob | None = session.get(ProcessingJob, job_id)
        if job is None:
            raise ValueError(f"Job {job_id} not found")

        _update_job_status(session, job, JobStatus.PROCESSING.value, progress=0.0)

        input_params = job.input_params or {}
        source_path = input_params.get("source_path", "")
        language = input_params.get("language", "zh")
        project_id = job.project_id

        if not source_path:
            raise ValueError("No source_path specified in input_params")
        if not project_id:
            raise ValueError("No project_id specified for transcription job")

        # Download source from MinIO
        local_path = _download_from_minio(source_path)

        try:
            _publish_progress(job_id, 10.0, detail="Preparing audio for transcription...")

            # Split if larger than 25 MB
            chunks = ffmpeg_service.split_audio_at_silence(local_path, max_size_mb=24)

            all_segments: list[dict] = []
            time_offset_ms = 0

            for chunk_idx, chunk_path in enumerate(chunks):
                pct = 10.0 + (chunk_idx / len(chunks)) * 70.0
                _publish_progress(job_id, pct, detail=f"Transcribing chunk {chunk_idx + 1}/{len(chunks)}...")

                result = ai_service.transcribe_audio(chunk_path, language=language)

                # Accumulate segments with offset
                for seg in result.get("segments", []):
                    all_segments.append({
                        "start_ms": int(seg.get("start", 0) * 1000) + time_offset_ms,
                        "end_ms": int(seg.get("end", 0) * 1000) + time_offset_ms,
                        "text": seg.get("text", "").strip(),
                        "confidence": seg.get("avg_logprob"),
                        "words": [
                            {
                                "word": w.get("word", ""),
                                "start": w.get("start", 0) + time_offset_ms / 1000.0,
                                "end": w.get("end", 0) + time_offset_ms / 1000.0,
                            }
                            for w in seg.get("words", [])
                        ],
                    })

                # Update offset for next chunk
                if all_segments:
                    time_offset_ms = all_segments[-1]["end_ms"]

                # Clean up chunk file (but not the original)
                if chunk_path != local_path and os.path.exists(chunk_path):
                    os.unlink(chunk_path)

            _publish_progress(job_id, 85.0, detail="Saving subtitle records...")

            # Create SubtitleTrack
            track = SubtitleTrack(
                project_id=project_id,
                language=language,
                label=f"Auto-generated ({language})",
                is_auto_generated=True,
            )
            session.add(track)
            session.flush()  # Get track.id

            # Create SubtitleSegment records
            for idx, seg in enumerate(all_segments):
                segment = SubtitleSegment(
                    track_id=track.id,
                    index=idx,
                    start_ms=seg["start_ms"],
                    end_ms=seg["end_ms"],
                    text=seg["text"],
                    confidence=seg.get("confidence"),
                    word_timestamps={"words": seg.get("words", [])},
                )
                session.add(segment)

            session.commit()

            _update_job_status(
                session, job, JobStatus.COMPLETED.value,
                progress=100.0,
                result={
                    "track_id": track.id,
                    "segment_count": len(all_segments),
                    "language": language,
                },
            )

            return {
                "job_id": job_id,
                "track_id": track.id,
                "segment_count": len(all_segments),
            }

        finally:
            if os.path.exists(local_path):
                os.unlink(local_path)

    except Exception as exc:
        session.rollback()
        logger.exception("transcribe_audio failed for job %s", job_id)
        try:
            if job:
                _update_job_status(
                    session, job, JobStatus.FAILED.value,
                    error_message=str(exc)[:2000],
                )
        except Exception:
            logger.exception("Failed to update job status to FAILED")
        raise self.retry(exc=exc, countdown=60)
    finally:
        session.close()


# =========================================================================
# Task: translate_subtitles
# =========================================================================

@celery_app.task(name="app.workers.tasks.translate_subtitles", bind=True, max_retries=2)
def translate_subtitles(self, job_id: int) -> dict:
    """Translate subtitle segments from one language to another using GPT-4."""
    session = get_sync_session()
    try:
        job: ProcessingJob | None = session.get(ProcessingJob, job_id)
        if job is None:
            raise ValueError(f"Job {job_id} not found")

        _update_job_status(session, job, JobStatus.PROCESSING.value, progress=0.0)

        input_params = job.input_params or {}
        track_id = input_params.get("track_id")
        source_lang = input_params.get("source_lang", "Chinese")
        target_lang = input_params.get("target_lang", "English")

        if not track_id:
            raise ValueError("No track_id specified in input_params")

        # Load subtitle track and segments
        track: SubtitleTrack | None = session.get(SubtitleTrack, track_id)
        if track is None:
            raise ValueError(f"SubtitleTrack {track_id} not found")

        segments = (
            session.query(SubtitleSegment)
            .filter(SubtitleSegment.track_id == track_id)
            .order_by(SubtitleSegment.index)
            .all()
        )

        if not segments:
            _update_job_status(
                session, job, JobStatus.COMPLETED.value,
                progress=100.0,
                result={"track_id": track_id, "translated_count": 0},
            )
            return {"job_id": job_id, "translated_count": 0}

        _publish_progress(job_id, 10.0, detail="Translating subtitles...")

        # Prepare segment dicts for the AI service
        segment_dicts = [{"text": seg.text, "index": seg.index} for seg in segments]

        # Call translation service (handles batching internally)
        translations = ai_service.translate_segments(
            segment_dicts, source_lang=source_lang, target_lang=target_lang,
        )

        _publish_progress(job_id, 85.0, detail="Saving translations...")

        # Update each segment with translated text
        for seg, translated_text in zip(segments, translations):
            seg.translated_text = translated_text

        session.commit()

        _update_job_status(
            session, job, JobStatus.COMPLETED.value,
            progress=100.0,
            result={
                "track_id": track_id,
                "translated_count": len(translations),
                "source_lang": source_lang,
                "target_lang": target_lang,
            },
        )

        return {
            "job_id": job_id,
            "track_id": track_id,
            "translated_count": len(translations),
        }

    except Exception as exc:
        session.rollback()
        logger.exception("translate_subtitles failed for job %s", job_id)
        try:
            if job:
                _update_job_status(
                    session, job, JobStatus.FAILED.value,
                    error_message=str(exc)[:2000],
                )
        except Exception:
            logger.exception("Failed to update job status to FAILED")
        raise self.retry(exc=exc, countdown=60)
    finally:
        session.close()


# =========================================================================
# Task: match_music
# =========================================================================

@celery_app.task(name="app.workers.tasks.match_music", bind=True, max_retries=2)
def match_music(self, job_id: int) -> dict:
    """Analyze the video content mood and recommend matching music tracks
    from the library.
    """
    session = get_sync_session()
    try:
        job: ProcessingJob | None = session.get(ProcessingJob, job_id)
        if job is None:
            raise ValueError(f"Job {job_id} not found")

        _update_job_status(session, job, JobStatus.PROCESSING.value, progress=0.0)

        input_params = job.input_params or {}
        project_id = job.project_id
        mood_hints = input_params.get("mood_hints", "")

        # Gather subtitle text from the project for mood analysis
        subtitle_text = ""
        if project_id:
            tracks = (
                session.query(SubtitleTrack)
                .filter(SubtitleTrack.project_id == project_id)
                .all()
            )
            for track in tracks:
                segments = (
                    session.query(SubtitleSegment)
                    .filter(SubtitleSegment.track_id == track.id)
                    .order_by(SubtitleSegment.index)
                    .all()
                )
                subtitle_text += " ".join(seg.text for seg in segments) + "\n"

        analysis_input = ""
        if subtitle_text.strip():
            analysis_input += f"Video subtitle content:\n{subtitle_text.strip()}\n\n"
        if mood_hints:
            analysis_input += f"Mood hints from user: {mood_hints}\n"
        if not analysis_input:
            analysis_input = "General background music needed for a video project."

        _publish_progress(job_id, 20.0, detail="Analyzing video mood...")

        # Call AI mood analysis
        mood_analysis = ai_service.analyze_mood(analysis_input)

        _publish_progress(job_id, 50.0, detail="Searching music library...")

        # Query music tracks matching the analysis
        mood_tags = mood_analysis.get("mood_tags", [])
        energy = mood_analysis.get("energy", 0.5)
        tempo_min = mood_analysis.get("tempo_min", 60)
        tempo_max = mood_analysis.get("tempo_max", 180)
        genre_suggestions = mood_analysis.get("genre_suggestions", [])

        # Build query with filters
        query = session.query(MusicTrack)

        # Filter by BPM range if tracks have BPM data
        query = query.filter(
            MusicTrack.bpm.isnot(None),
            MusicTrack.bpm >= tempo_min,
            MusicTrack.bpm <= tempo_max,
        )

        # Filter by energy range (within 0.3 tolerance)
        energy_min = max(0.0, energy - 0.3)
        energy_max = min(1.0, energy + 0.3)
        query = query.filter(
            MusicTrack.energy.isnot(None),
            MusicTrack.energy >= energy_min,
            MusicTrack.energy <= energy_max,
        )

        matching_tracks = query.limit(20).all()

        # Score and rank results based on mood tag overlap
        scored_tracks: list[dict] = []
        for mt in matching_tracks:
            track_moods = set(mt.mood_tags or [])
            track_genres = set(mt.genre_tags or [])
            mood_overlap = len(track_moods & set(mood_tags))
            genre_overlap = len(track_genres & set(genre_suggestions))
            score = mood_overlap * 2 + genre_overlap

            scored_tracks.append({
                "track_id": mt.id,
                "title": mt.title,
                "artist": mt.artist,
                "duration_ms": mt.duration_ms,
                "bpm": mt.bpm,
                "energy": mt.energy,
                "mood_tags": mt.mood_tags,
                "genre_tags": mt.genre_tags,
                "file_path": mt.file_path,
                "score": score,
            })

        # Sort by score descending
        scored_tracks.sort(key=lambda t: t["score"], reverse=True)
        recommendations = scored_tracks[:10]

        _update_job_status(
            session, job, JobStatus.COMPLETED.value,
            progress=100.0,
            result={
                "mood_analysis": mood_analysis,
                "recommendations": recommendations,
                "total_matches": len(scored_tracks),
            },
        )

        return {
            "job_id": job_id,
            "recommendation_count": len(recommendations),
        }

    except Exception as exc:
        session.rollback()
        logger.exception("match_music failed for job %s", job_id)
        try:
            if job:
                _update_job_status(
                    session, job, JobStatus.FAILED.value,
                    error_message=str(exc)[:2000],
                )
        except Exception:
            logger.exception("Failed to update job status to FAILED")
        raise self.retry(exc=exc, countdown=60)
    finally:
        session.close()


# =========================================================================
# Task: download_video
# =========================================================================

@celery_app.task(name="app.workers.tasks.download_video", bind=True, max_retries=2)
def download_video(self, job_id: int) -> dict:
    """Download a video from URL using yt-dlp, upload to MinIO, and create
    an asset record.
    """
    from app.services import downloader as dl_service

    session = get_sync_session()
    try:
        job: ProcessingJob | None = session.get(ProcessingJob, job_id)
        if job is None:
            raise ValueError(f"Job {job_id} not found")

        _update_job_status(session, job, JobStatus.PROCESSING.value, progress=0.0)

        input_params = job.input_params or {}
        url = input_params.get("url", "")
        if not url:
            raise ValueError("No url specified in input_params")

        def _on_progress(pct: float) -> None:
            _publish_progress(job_id, min(70.0, pct * 0.7), detail="Downloading...")

        result = dl_service.download_video(url, progress_callback=_on_progress)
        local_path = result["file_path"]

        try:
            _publish_progress(job_id, 75.0, detail="Uploading to storage...")

            filename = os.path.basename(local_path)
            object_name = f"downloads/{job.user_id}/{job_id}/{filename}"
            with open(local_path, "rb") as f:
                upload_file(
                    settings.MINIO_BUCKET_ASSETS,
                    object_name,
                    f.read(),
                    content_type="video/mp4",
                )

            file_path_minio = f"/{settings.MINIO_BUCKET_ASSETS}/{object_name}"
            file_size = os.path.getsize(local_path)

            _publish_progress(job_id, 90.0, detail="Creating asset record...")

            asset = Asset(
                user_id=job.user_id,
                filename=filename,
                original_filename=result.get("title", filename),
                file_path=file_path_minio,
                file_size=file_size,
                mime_type="video/mp4",
                asset_type=AssetType.VIDEO.value,
                duration_ms=int((result.get("duration") or 0) * 1000),
                width=result.get("metadata", {}).get("width"),
                height=result.get("metadata", {}).get("height"),
            )
            session.add(asset)
            session.flush()

            downloaded = DownloadedVideo(
                user_id=job.user_id,
                source_url=url,
                platform=result["platform"],
                title=result.get("title"),
                asset_id=asset.id,
                metadata_info=result.get("metadata"),
            )
            session.add(downloaded)
            session.commit()

            _update_job_status(
                session, job, JobStatus.COMPLETED.value,
                progress=100.0,
                result={
                    "asset_id": asset.id,
                    "download_id": downloaded.id,
                    "title": result.get("title"),
                    "platform": result["platform"],
                    "duration": result.get("duration"),
                },
            )

            process_asset_metadata.delay(asset.id)

            return {"job_id": job_id, "asset_id": asset.id}

        finally:
            if os.path.exists(local_path):
                os.unlink(local_path)

    except Exception as exc:
        session.rollback()
        logger.exception("download_video failed for job %s", job_id)
        try:
            if job:
                _update_job_status(
                    session, job, JobStatus.FAILED.value,
                    error_message=str(exc)[:2000],
                )
        except Exception:
            logger.exception("Failed to update job status to FAILED")
        raise self.retry(exc=exc, countdown=60)
    finally:
        session.close()


# =========================================================================
# Task: analyze_video
# =========================================================================

@celery_app.task(name="app.workers.tasks.analyze_video", bind=True, max_retries=2)
def analyze_video(self, job_id: int) -> dict:
    """Perform comprehensive video analysis: scenes, audio, hooks, rhythm."""
    from app.services import analyzer as analyzer_service

    session = get_sync_session()
    try:
        job: ProcessingJob | None = session.get(ProcessingJob, job_id)
        if job is None:
            raise ValueError(f"Job {job_id} not found")

        _update_job_status(session, job, JobStatus.PROCESSING.value, progress=0.0)

        input_params = job.input_params or {}
        asset_id = input_params.get("asset_id")
        if not asset_id:
            raise ValueError("No asset_id specified in input_params")

        asset: Asset | None = session.get(Asset, asset_id)
        if asset is None:
            raise ValueError(f"Asset {asset_id} not found")

        local_path = _download_from_minio(asset.file_path)

        try:
            _publish_progress(job_id, 10.0, detail="Detecting scenes...")
            scenes = analyzer_service.detect_scenes(local_path)

            _publish_progress(job_id, 40.0, detail="Analyzing audio...")
            audio_analysis = analyzer_service.analyze_audio(local_path)

            _publish_progress(job_id, 60.0, detail="Analyzing hooks...")
            hook_analysis = analyzer_service.analyze_hooks(local_path, scenes)

            _publish_progress(job_id, 80.0, detail="Analyzing rhythm...")
            rhythm_analysis = analyzer_service.analyze_rhythm(scenes)

            _publish_progress(job_id, 90.0, detail="Saving analysis results...")

            analysis = VideoAnalysis(
                project_id=job.project_id,
                asset_id=asset_id,
                scenes=scenes,
                audio_analysis=audio_analysis,
                hook_analysis=hook_analysis,
                rhythm_analysis=rhythm_analysis,
            )
            session.add(analysis)
            session.commit()

            _update_job_status(
                session, job, JobStatus.COMPLETED.value,
                progress=100.0,
                result={
                    "analysis_id": analysis.id,
                    "scene_count": len(scenes),
                    "bpm": audio_analysis.get("bpm"),
                    "hook_score": hook_analysis.get("hook_score"),
                    "pace": rhythm_analysis.get("pace"),
                },
            )

            return {"job_id": job_id, "analysis_id": analysis.id}

        finally:
            if os.path.exists(local_path):
                os.unlink(local_path)

    except Exception as exc:
        session.rollback()
        logger.exception("analyze_video failed for job %s", job_id)
        try:
            if job:
                _update_job_status(
                    session, job, JobStatus.FAILED.value,
                    error_message=str(exc)[:2000],
                )
        except Exception:
            logger.exception("Failed to update job status to FAILED")
        raise self.retry(exc=exc, countdown=120)
    finally:
        session.close()


# =========================================================================
# Task: transcribe_local
# =========================================================================

@celery_app.task(name="app.workers.tasks.transcribe_local_task", bind=True, max_retries=2)
def transcribe_local_task(self, job_id: int) -> dict:
    """Transcribe audio using the local Whisper model (no API key needed)."""
    from app.services import whisper_local as whisper_service

    session = get_sync_session()
    try:
        job: ProcessingJob | None = session.get(ProcessingJob, job_id)
        if job is None:
            raise ValueError(f"Job {job_id} not found")

        _update_job_status(session, job, JobStatus.PROCESSING.value, progress=0.0)

        input_params = job.input_params or {}
        source_path = input_params.get("source_path", "")
        language = input_params.get("language", "zh")
        project_id = job.project_id

        if not source_path:
            raise ValueError("No source_path specified in input_params")
        if not project_id:
            raise ValueError("No project_id specified for transcription job")

        local_path = _download_from_minio(source_path)

        try:
            _publish_progress(job_id, 10.0, detail="Loading Whisper model...")
            _publish_progress(job_id, 20.0, detail="Transcribing with local Whisper...")

            segments = whisper_service.transcribe_local(local_path, language=language)

            _publish_progress(job_id, 85.0, detail="Saving subtitle records...")

            track = SubtitleTrack(
                project_id=project_id,
                language=language,
                label=f"Local Whisper ({language})",
                is_auto_generated=True,
            )
            session.add(track)
            session.flush()

            for idx, seg in enumerate(segments):
                segment = SubtitleSegment(
                    track_id=track.id,
                    index=idx,
                    start_ms=int(seg["start"] * 1000),
                    end_ms=int(seg["end"] * 1000),
                    text=seg["text"],
                )
                session.add(segment)

            session.commit()

            _update_job_status(
                session, job, JobStatus.COMPLETED.value,
                progress=100.0,
                result={
                    "track_id": track.id,
                    "segment_count": len(segments),
                    "language": language,
                    "provider": "whisper_local",
                },
            )

            return {"job_id": job_id, "track_id": track.id, "segment_count": len(segments)}

        finally:
            if os.path.exists(local_path):
                os.unlink(local_path)

    except Exception as exc:
        session.rollback()
        logger.exception("transcribe_local_task failed for job %s", job_id)
        try:
            if job:
                _update_job_status(
                    session, job, JobStatus.FAILED.value,
                    error_message=str(exc)[:2000],
                )
        except Exception:
            logger.exception("Failed to update job status to FAILED")
        raise self.retry(exc=exc, countdown=120)
    finally:
        session.close()


# =========================================================================
# Task: translate_claude
# =========================================================================

@celery_app.task(name="app.workers.tasks.translate_claude", bind=True, max_retries=2)
def translate_claude(self, job_id: int) -> dict:
    """Translate subtitle segments using Anthropic Claude."""
    from app.services import claude as claude_service

    session = get_sync_session()
    try:
        job: ProcessingJob | None = session.get(ProcessingJob, job_id)
        if job is None:
            raise ValueError(f"Job {job_id} not found")

        _update_job_status(session, job, JobStatus.PROCESSING.value, progress=0.0)

        input_params = job.input_params or {}
        track_id = input_params.get("track_id")
        source_lang = input_params.get("source_lang", "Chinese")
        target_lang = input_params.get("target_lang", "English")

        if not track_id:
            raise ValueError("No track_id specified in input_params")

        track: SubtitleTrack | None = session.get(SubtitleTrack, track_id)
        if track is None:
            raise ValueError(f"SubtitleTrack {track_id} not found")

        segments = (
            session.query(SubtitleSegment)
            .filter(SubtitleSegment.track_id == track_id)
            .order_by(SubtitleSegment.index)
            .all()
        )

        if not segments:
            _update_job_status(
                session, job, JobStatus.COMPLETED.value,
                progress=100.0,
                result={"track_id": track_id, "translated_count": 0},
            )
            return {"job_id": job_id, "translated_count": 0}

        _publish_progress(job_id, 10.0, detail="Translating with Claude...")

        segment_dicts = [{"text": seg.text, "index": seg.index} for seg in segments]
        translations = claude_service.translate_with_claude(
            segment_dicts, source_lang=source_lang, target_lang=target_lang,
        )

        _publish_progress(job_id, 85.0, detail="Saving translations...")

        for seg, translated_text in zip(segments, translations):
            seg.translated_text = translated_text

        session.commit()

        _update_job_status(
            session, job, JobStatus.COMPLETED.value,
            progress=100.0,
            result={
                "track_id": track_id,
                "translated_count": len(translations),
                "provider": "claude",
            },
        )

        return {"job_id": job_id, "track_id": track_id, "translated_count": len(translations)}

    except Exception as exc:
        session.rollback()
        logger.exception("translate_claude failed for job %s", job_id)
        try:
            if job:
                _update_job_status(
                    session, job, JobStatus.FAILED.value,
                    error_message=str(exc)[:2000],
                )
        except Exception:
            logger.exception("Failed to update job status to FAILED")
        raise self.retry(exc=exc, countdown=60)
    finally:
        session.close()


# =========================================================================
# Task: generate_tts
# =========================================================================

@celery_app.task(name="app.workers.tasks.generate_tts_task", bind=True, max_retries=2)
def generate_tts_task(self, job_id: int) -> dict:
    """Generate TTS audio from text using Edge TTS."""
    from app.services import tts as tts_service

    session = get_sync_session()
    try:
        job: ProcessingJob | None = session.get(ProcessingJob, job_id)
        if job is None:
            raise ValueError(f"Job {job_id} not found")

        _update_job_status(session, job, JobStatus.PROCESSING.value, progress=0.0)

        input_params = job.input_params or {}
        text = input_params.get("text", "")
        voice = input_params.get("voice")

        if not text:
            raise ValueError("No text specified in input_params")

        _publish_progress(job_id, 20.0, detail="Generating TTS audio...")

        local_path = tts_service.generate_tts(text, voice=voice)

        try:
            _publish_progress(job_id, 70.0, detail="Uploading TTS audio...")

            filename = os.path.basename(local_path)
            object_name = f"tts/{job.user_id}/{job_id}/{filename}"
            with open(local_path, "rb") as f:
                upload_file(
                    settings.MINIO_BUCKET_ASSETS,
                    object_name,
                    f.read(),
                    content_type="audio/mpeg",
                )

            download_url = get_presigned_url(
                settings.MINIO_BUCKET_ASSETS, object_name, expires=86400,
            )

            _update_job_status(
                session, job, JobStatus.COMPLETED.value,
                progress=100.0,
                result={
                    "download_url": download_url,
                    "object_path": f"/{settings.MINIO_BUCKET_ASSETS}/{object_name}",
                    "voice": voice,
                },
            )

            return {"job_id": job_id, "download_url": download_url}

        finally:
            if os.path.exists(local_path):
                os.unlink(local_path)

    except Exception as exc:
        session.rollback()
        logger.exception("generate_tts_task failed for job %s", job_id)
        try:
            if job:
                _update_job_status(
                    session, job, JobStatus.FAILED.value,
                    error_message=str(exc)[:2000],
                )
        except Exception:
            logger.exception("Failed to update job status to FAILED")
        raise self.retry(exc=exc, countdown=30)
    finally:
        session.close()


# =========================================================================
# Task: auto_edit_video
# =========================================================================

@celery_app.task(name="app.workers.tasks.auto_edit_video", bind=True, max_retries=2)
def auto_edit_video(self, job_id: int) -> dict:
    """Apply auto-editing (silence removal or jump cut) to a video."""
    from app.services import auto_edit as auto_edit_service

    session = get_sync_session()
    try:
        job: ProcessingJob | None = session.get(ProcessingJob, job_id)
        if job is None:
            raise ValueError(f"Job {job_id} not found")

        _update_job_status(session, job, JobStatus.PROCESSING.value, progress=0.0)

        input_params = job.input_params or {}
        source_path = input_params.get("source_path", "")
        operation = input_params.get("operation", "silence_removal")

        if not source_path:
            raise ValueError("No source_path specified in input_params")

        local_input = _download_from_minio(source_path)
        local_output = tempfile.NamedTemporaryFile(
            delete=False, suffix=Path(source_path).suffix or ".mp4",
        ).name

        try:
            _publish_progress(job_id, 10.0, detail=f"Applying {operation}...")

            if operation == "jump_cut":
                auto_edit_service.jump_cut(local_input, local_output)
            else:
                margin = float(input_params.get("margin", 0.3))
                auto_edit_service.remove_silence(local_input, local_output, margin=margin)

            _publish_progress(job_id, 80.0, detail="Uploading processed video...")

            filename = f"auto_edit_{operation}.mp4"
            object_name = f"auto_edit/{job.user_id}/{job_id}/{filename}"
            with open(local_output, "rb") as f:
                upload_file(
                    settings.MINIO_BUCKET_ASSETS,
                    object_name,
                    f.read(),
                    content_type="video/mp4",
                )

            download_url = get_presigned_url(
                settings.MINIO_BUCKET_ASSETS, object_name, expires=86400,
            )

            file_size = os.path.getsize(local_output)
            asset = Asset(
                user_id=job.user_id,
                filename=filename,
                original_filename=f"Auto-edited ({operation})",
                file_path=f"/{settings.MINIO_BUCKET_ASSETS}/{object_name}",
                file_size=file_size,
                mime_type="video/mp4",
                asset_type=AssetType.VIDEO.value,
            )
            session.add(asset)
            session.flush()

            _update_job_status(
                session, job, JobStatus.COMPLETED.value,
                progress=100.0,
                result={
                    "download_url": download_url,
                    "asset_id": asset.id,
                    "operation": operation,
                },
            )

            process_asset_metadata.delay(asset.id)

            return {"job_id": job_id, "asset_id": asset.id}

        finally:
            for p in (local_input, local_output):
                if os.path.exists(p):
                    os.unlink(p)

    except Exception as exc:
        session.rollback()
        logger.exception("auto_edit_video failed for job %s", job_id)
        try:
            if job:
                _update_job_status(
                    session, job, JobStatus.FAILED.value,
                    error_message=str(exc)[:2000],
                )
        except Exception:
            logger.exception("Failed to update job status to FAILED")
        raise self.retry(exc=exc, countdown=60)
    finally:
        session.close()


# =========================================================================
# Task: generate_voiceover
# =========================================================================

@celery_app.task(name="app.workers.tasks.generate_voiceover", bind=True, max_retries=2)
def generate_voiceover(self, job_id: int) -> dict:
    """Generate segment-by-segment TTS voiceover from subtitles, merge into
    a single audio track, and upload.
    """
    from app.services import tts as tts_service

    session = get_sync_session()
    try:
        job: ProcessingJob | None = session.get(ProcessingJob, job_id)
        if job is None:
            raise ValueError(f"Job {job_id} not found")

        _update_job_status(session, job, JobStatus.PROCESSING.value, progress=0.0)

        input_params = job.input_params or {}
        track_id = input_params.get("track_id")
        voice = input_params.get("voice")
        project_id = job.project_id

        if not track_id:
            raise ValueError("No track_id specified in input_params")
        if not project_id:
            raise ValueError("No project_id specified for voiceover job")

        segments = (
            session.query(SubtitleSegment)
            .filter(SubtitleSegment.track_id == track_id)
            .order_by(SubtitleSegment.index)
            .all()
        )

        if not segments:
            _update_job_status(
                session, job, JobStatus.COMPLETED.value,
                progress=100.0,
                result={"track_id": track_id, "segment_count": 0},
            )
            return {"job_id": job_id, "segment_count": 0}

        _publish_progress(job_id, 10.0, detail="Generating segment voiceovers...")

        seg_dicts = [
            {"text": seg.text, "start": seg.start_ms / 1000.0, "end": seg.end_ms / 1000.0}
            for seg in segments
        ]

        segment_results = tts_service.generate_segment_voiceover(seg_dicts, voice=voice)

        _publish_progress(job_id, 60.0, detail="Merging voiceover segments...")

        merged_output = tempfile.NamedTemporaryFile(delete=False, suffix=".m4a")
        merged_output.close()

        try:
            tts_service.merge_voiceover_segments(segment_results, merged_output.name)

            _publish_progress(job_id, 85.0, detail="Uploading voiceover...")

            object_name = f"voiceover/{job.user_id}/{job_id}/voiceover.m4a"
            with open(merged_output.name, "rb") as f:
                upload_file(
                    settings.MINIO_BUCKET_ASSETS,
                    object_name,
                    f.read(),
                    content_type="audio/mp4",
                )

            download_url = get_presigned_url(
                settings.MINIO_BUCKET_ASSETS, object_name, expires=86400,
            )

            tts_track = TTSTrack(
                project_id=project_id,
                voice=voice or settings.TTS_VOICE_ZH,
                language="zh",
                file_path=f"/{settings.MINIO_BUCKET_ASSETS}/{object_name}",
                segments=[
                    {"text": r["text"], "start": r["start"], "end": r["end"]}
                    for r in segment_results
                ],
            )
            session.add(tts_track)
            session.commit()

            _update_job_status(
                session, job, JobStatus.COMPLETED.value,
                progress=100.0,
                result={
                    "download_url": download_url,
                    "tts_track_id": tts_track.id,
                    "segment_count": len(segment_results),
                    "voice": voice,
                },
            )

            return {"job_id": job_id, "tts_track_id": tts_track.id}

        finally:
            if os.path.exists(merged_output.name):
                os.unlink(merged_output.name)
            for r in segment_results:
                fp = r.get("file_path", "")
                if fp and os.path.exists(fp):
                    os.unlink(fp)

    except Exception as exc:
        session.rollback()
        logger.exception("generate_voiceover failed for job %s", job_id)
        try:
            if job:
                _update_job_status(
                    session, job, JobStatus.FAILED.value,
                    error_message=str(exc)[:2000],
                )
        except Exception:
            logger.exception("Failed to update job status to FAILED")
        raise self.retry(exc=exc, countdown=60)
    finally:
        session.close()


# =========================================================================
# Task: generate_ai_video
# =========================================================================

@celery_app.task(name="app.workers.tasks.generate_ai_video", bind=True, max_retries=1)
def generate_ai_video(self, job_id: int) -> dict:
    """Generate an AI video via PiAPI (WAN PRO), download the result,
    upload to MinIO, and create an Asset record.
    """
    import httpx as _httpx

    session = get_sync_session()
    try:
        job: ProcessingJob | None = session.get(ProcessingJob, job_id)
        if job is None:
            raise ValueError(f"Job {job_id} not found")

        _update_job_status(session, job, JobStatus.PROCESSING.value, progress=0.0)

        input_params = job.input_params or {}
        task_type = input_params.get("task_type", "wan26-txt2video")
        prompt = input_params.get("prompt", "")

        if not prompt:
            raise ValueError("No prompt specified in input_params")

        # Build PiAPI input payload
        piapi_input: dict = {"prompt": prompt}
        if input_params.get("image_url"):
            piapi_input["image"] = input_params["image_url"]
        if input_params.get("resolution"):
            piapi_input["resolution"] = input_params["resolution"]
        if input_params.get("duration"):
            piapi_input["duration"] = input_params["duration"]
        if input_params.get("aspect_ratio"):
            piapi_input["aspect_ratio"] = input_params["aspect_ratio"]

        _publish_progress(job_id, 5.0, detail="Creating AI video task...")

        # 1. Create PiAPI task
        piapi_task_id = piapi_service.create_task(task_type, piapi_input)

        _publish_progress(job_id, 10.0, detail="Generating video...")

        # 2. Poll until complete
        def _on_progress(pct: float) -> None:
            # Map PiAPI progress (0-100) to our progress range (10-70)
            mapped = 10.0 + (pct / 100.0) * 60.0
            _publish_progress(job_id, min(70.0, mapped), detail="Generating video...")

        result_data = piapi_service.poll_task(
            piapi_task_id, timeout=600, interval=10, progress_callback=_on_progress,
        )

        _publish_progress(job_id, 75.0, detail="Downloading generated video...")

        # 3. Extract video URL and download
        video_url = piapi_service.get_video_url(result_data)

        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4")
        tmp.close()

        try:
            with _httpx.Client(timeout=120, follow_redirects=True) as client:
                with client.stream("GET", video_url) as resp:
                    resp.raise_for_status()
                    with open(tmp.name, "wb") as f:
                        for chunk in resp.iter_bytes(chunk_size=65536):
                            f.write(chunk)

            file_size = os.path.getsize(tmp.name)

            _publish_progress(job_id, 85.0, detail="Uploading to storage...")

            # 4. Upload to MinIO
            filename = f"ai_video_{job_id}.mp4"
            object_name = f"ai_video/{job.user_id}/{job_id}/{filename}"
            with open(tmp.name, "rb") as f:
                upload_file(
                    settings.MINIO_BUCKET_ASSETS,
                    object_name,
                    f.read(),
                    content_type="video/mp4",
                )

            file_path_minio = f"/{settings.MINIO_BUCKET_ASSETS}/{object_name}"

            _publish_progress(job_id, 92.0, detail="Creating asset record...")

            # 5. Create Asset record
            asset = Asset(
                user_id=job.user_id,
                filename=filename,
                original_filename=f"AI Video - {prompt[:60]}",
                file_path=file_path_minio,
                file_size=file_size,
                mime_type="video/mp4",
                asset_type=AssetType.VIDEO.value,
            )
            session.add(asset)
            session.flush()

            _update_job_status(
                session, job, JobStatus.COMPLETED.value,
                progress=100.0,
                result={
                    "asset_id": asset.id,
                    "task_type": task_type,
                    "piapi_task_id": piapi_task_id,
                    "prompt": prompt,
                },
            )

            # 6. Trigger metadata extraction
            process_asset_metadata.delay(asset.id)

            return {"job_id": job_id, "asset_id": asset.id}

        finally:
            if os.path.exists(tmp.name):
                os.unlink(tmp.name)

    except Exception as exc:
        session.rollback()
        logger.exception("generate_ai_video failed for job %s", job_id)
        try:
            if job:
                _update_job_status(
                    session, job, JobStatus.FAILED.value,
                    error_message=str(exc)[:2000],
                )
        except Exception:
            logger.exception("Failed to update job status to FAILED")
        raise self.retry(exc=exc, countdown=60)
    finally:
        session.close()


# =========================================================================
# Task: smart_edit_task
# =========================================================================

@celery_app.task(name="app.workers.tasks.smart_edit_task", bind=True, max_retries=2)
def smart_edit_task(self, job_id: int) -> dict:
    """Execute a smart edit operation (beat_sync, montage,
    platform_optimize, highlight_detect).
    """
    from app.services import smart_edit as smart_edit_service
    from app.services import analyzer as analyzer_service

    session = get_sync_session()
    job: ProcessingJob | None = None
    try:
        job = session.get(ProcessingJob, job_id)
        if job is None:
            raise ValueError(f"Job {job_id} not found")

        _update_job_status(session, job, JobStatus.PROCESSING.value, progress=0.0)

        input_params = job.input_params or {}
        operation = input_params.get("operation", "")

        if operation == "beat_sync":
            result = _smart_edit_beat_sync(session, job, input_params, smart_edit_service)
        elif operation == "montage":
            result = _smart_edit_montage(session, job, input_params, smart_edit_service)
        elif operation == "platform_optimize":
            result = _smart_edit_platform_optimize(session, job, input_params, smart_edit_service)
        elif operation == "highlight_detect":
            result = _smart_edit_highlight_detect(
                session, job, input_params, smart_edit_service, analyzer_service,
            )
        else:
            raise ValueError(f"Unknown smart edit operation: {operation}")

        _update_job_status(
            session, job, JobStatus.COMPLETED.value,
            progress=100.0, result=result,
        )
        return {"job_id": job_id, **result}

    except Exception as exc:
        session.rollback()
        logger.exception("smart_edit_task failed for job %s", job_id)
        try:
            if job:
                _update_job_status(
                    session, job, JobStatus.FAILED.value,
                    error_message=str(exc)[:2000],
                )
        except Exception:
            logger.exception("Failed to update job status to FAILED")
        raise self.retry(exc=exc, countdown=60)
    finally:
        session.close()


def _smart_edit_beat_sync(session, job, params, service):
    """Beat-sync sub-operation."""
    asset_id = params["asset_id"]
    asset = session.get(Asset, asset_id)
    if asset is None:
        raise ValueError(f"Asset {asset_id} not found")

    _publish_progress(job.id, 10.0, detail="Downloading video...")
    local_video = _download_from_minio(asset.file_path)

    try:
        # Determine music source
        music_path = None
        music_track_id = params.get("music_track_id")
        music_asset_id = params.get("music_asset_id")

        if music_track_id:
            mt = session.get(MusicTrack, music_track_id)
            if mt and mt.beat_timestamps:
                beat_ms = mt.beat_timestamps.get("beats_ms", [])
                if beat_ms:
                    _publish_progress(job.id, 50.0, detail="Using pre-computed beats...")
                    video_duration = asset.duration_ms or 0
                    clips = service.generate_beat_sync_clips(
                        video_duration, beat_ms, asset_id,
                        params.get("include_transitions", True),
                        params.get("transition_type", "fade"),
                    )
                    return {
                        "operation": "beat_sync",
                        "clips": clips,
                        "beat_count": len(beat_ms),
                        "clip_count": len(clips),
                    }
            if mt:
                music_path = _download_from_minio(mt.file_path)
        elif music_asset_id:
            ma = session.get(Asset, music_asset_id)
            if ma:
                music_path = _download_from_minio(ma.file_path)

        if not music_path:
            # Use the video's own audio for beat detection
            music_path = service.extract_audio_to_wav(local_video)

        _publish_progress(job.id, 30.0, detail="Detecting beats...")

        try:
            beat_ms = service.detect_beat_timestamps(
                music_path,
                sensitivity=params.get("sensitivity", 1.0),
                min_clip_duration_ms=params.get("min_clip_duration_ms", 500),
            )
        finally:
            if music_path and os.path.exists(music_path):
                os.unlink(music_path)

        _publish_progress(job.id, 70.0, detail="Generating beat-synced clips...")

        video_duration = asset.duration_ms or 0
        if not video_duration:
            probe = ffmpeg_service.probe_file(local_video)
            video_duration = int(float(probe["format"]["duration"]) * 1000)

        clips = service.generate_beat_sync_clips(
            video_duration, beat_ms, asset_id,
            params.get("include_transitions", True),
            params.get("transition_type", "fade"),
        )

        return {
            "operation": "beat_sync",
            "clips": clips,
            "beat_count": len(beat_ms),
            "clip_count": len(clips),
        }
    finally:
        if os.path.exists(local_video):
            os.unlink(local_video)


def _smart_edit_montage(session, job, params, service):
    """Montage builder sub-operation."""
    asset_ids = params.get("asset_ids", [])
    if len(asset_ids) < 2:
        raise ValueError("Montage requires at least 2 assets")

    _publish_progress(job.id, 10.0, detail="Loading asset metadata...")

    assets = []
    for aid in asset_ids:
        asset = session.get(Asset, aid)
        if asset is None:
            raise ValueError(f"Asset {aid} not found")
        assets.append({
            "id": asset.id,
            "duration_ms": asset.duration_ms,
            "asset_type": asset.asset_type,
            "original_filename": asset.original_filename,
        })

    _publish_progress(job.id, 40.0, detail="Building montage...")

    clips = service.build_montage_clips(
        assets,
        style=params.get("style", "cinematic"),
        target_duration_ms=params.get("target_duration_ms"),
        include_transitions=params.get("include_transitions", True),
    )

    _publish_progress(job.id, 90.0, detail="Finalizing...")

    # Optionally add music track clip
    music_clip = None
    music_track_id = params.get("music_track_id")
    if music_track_id:
        mt = session.get(MusicTrack, music_track_id)
        if mt:
            total_duration = max((c["endTime"] for c in clips), default=0)
            music_clip = {
                "assetId": str(mt.id),
                "startTime": 0,
                "endTime": min(mt.duration_ms or total_duration, total_duration),
                "trimStart": 0,
                "trimEnd": 0,
                "duration": mt.duration_ms or 0,
                "name": mt.title,
                "type": "audio",
            }

    return {
        "operation": "montage",
        "clips": clips,
        "music_clip": music_clip,
        "clip_count": len(clips),
        "style": params.get("style", "cinematic"),
    }


def _smart_edit_platform_optimize(session, job, params, service):
    """Platform optimizer sub-operation."""
    project_id = params.get("project_id")
    platform = params.get("platform", "tiktok")

    if not project_id:
        raise ValueError("project_id is required for platform optimize")

    project = session.get(Project, project_id)
    if project is None:
        raise ValueError(f"Project {project_id} not found")

    _publish_progress(job.id, 20.0, detail="Analyzing current timeline...")

    # Estimate current duration from project_data timeline
    current_duration = 0
    project_data = project.project_data or {}
    tracks = project_data.get("tracks", [])
    for track in tracks:
        for clip in track.get("clips", []):
            end_time = clip.get("endTime", 0)
            if end_time > current_duration:
                current_duration = end_time

    current_width = project.width or 1920
    current_height = project.height or 1080

    _publish_progress(job.id, 60.0, detail="Computing platform adjustments...")

    adjustments = service.compute_platform_adjustments(
        platform, current_duration, current_width, current_height,
    )

    return {
        "operation": "platform_optimize",
        "adjustments": adjustments,
        "current_duration_ms": current_duration,
    }


def _smart_edit_highlight_detect(session, job, params, service, analyzer_service):
    """Highlight detection sub-operation."""
    asset_id = params["asset_id"]
    asset = session.get(Asset, asset_id)
    if asset is None:
        raise ValueError(f"Asset {asset_id} not found")

    local_path = _download_from_minio(asset.file_path)

    try:
        _publish_progress(job.id, 10.0, detail="Detecting scenes...")
        scenes = analyzer_service.detect_scenes(local_path)

        _publish_progress(job.id, 40.0, detail="Analyzing audio for highlights...")
        highlights = service.detect_highlights(
            local_path, scenes,
            max_highlights=params.get("max_highlights", 5),
            min_duration_ms=params.get("min_highlight_duration_ms", 3000),
            max_duration_ms=params.get("max_highlight_duration_ms", 15000),
        )

        _publish_progress(job.id, 90.0, detail="Finalizing...")

        # Generate clip definitions for each highlight
        highlight_clips = []
        timeline_cursor = 0.0
        for i, h in enumerate(highlights):
            clip: dict = {
                "assetId": str(asset_id),
                "startTime": timeline_cursor,
                "endTime": timeline_cursor + h["duration_ms"],
                "trimStart": h["start_ms"],
                "trimEnd": 0,
                "duration": asset.duration_ms or 0,
                "name": f"Highlight {i + 1}",
                "type": "video",
                "score": h["score"],
                "reasons": h.get("reasons", []),
            }
            if i > 0:
                clip["transitionIn"] = {"type": "fade", "durationMs": 500}
            highlight_clips.append(clip)
            timeline_cursor += h["duration_ms"]

        return {
            "operation": "highlight_detect",
            "highlights": highlights,
            "clips": highlight_clips,
            "highlight_count": len(highlights),
        }
    finally:
        if os.path.exists(local_path):
            os.unlink(local_path)
