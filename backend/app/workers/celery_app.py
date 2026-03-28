from __future__ import annotations

from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "video_editor",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

# ---------------------------------------------------------------------------
# Task routing -- each task is dispatched to a dedicated queue so that
# heavy video / AI work does not starve lighter asset-processing tasks.
# ---------------------------------------------------------------------------
celery_app.conf.task_routes = {
    # --- Video queue (FFmpeg-heavy) ---
    "app.workers.tasks.export_video": {"queue": "video"},
    "app.workers.tasks.process_audio": {"queue": "video"},
    "app.workers.tasks.auto_edit_video": {"queue": "video"},
    "app.workers.tasks.smart_edit_task": {"queue": "video"},
    "app.workers.tasks.download_video": {"queue": "video"},
    "app.workers.tasks.free_export_en": {"queue": "video"},
    "app.workers.tasks.heygen_export_en": {"queue": "video"},
    "app.workers.tasks.full_pipeline": {"queue": "video"},
    # --- AI queue (LLM / Whisper / TTS) ---
    "app.workers.tasks.transcribe_audio": {"queue": "ai"},
    "app.workers.tasks.transcribe_local_task": {"queue": "ai"},
    "app.workers.tasks.translate_subtitles": {"queue": "ai"},
    "app.workers.tasks.translate_claude": {"queue": "ai"},
    "app.workers.tasks.match_music": {"queue": "ai"},
    "app.workers.tasks.generate_script_director": {"queue": "ai"},
    "app.workers.tasks.generate_tts_task": {"queue": "ai"},
    "app.workers.tasks.generate_voiceover": {"queue": "ai"},
    "app.workers.tasks.generate_voiceover_multi_voice": {"queue": "ai"},
    "app.workers.tasks.generate_ai_video": {"queue": "ai"},
    "app.workers.tasks.analyze_video": {"queue": "ai"},
    "app.workers.tasks.speaker_detect_task": {"queue": "ai"},
    "app.workers.tasks.sound_describe_task": {"queue": "ai"},
    # --- Asset queue (lightweight) ---
    "app.workers.tasks.process_asset_metadata": {"queue": "asset"},
}

# ---------------------------------------------------------------------------
# General Celery configuration
# ---------------------------------------------------------------------------
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    result_expires=86400,  # 24 hours
)

# Auto-discover tasks in the app.workers.tasks module
celery_app.autodiscover_tasks(["app.workers"])
