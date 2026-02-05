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
    "app.workers.tasks.export_video": {"queue": "video"},
    "app.workers.tasks.process_audio": {"queue": "video"},
    "app.workers.tasks.transcribe_audio": {"queue": "ai"},
    "app.workers.tasks.translate_subtitles": {"queue": "ai"},
    "app.workers.tasks.match_music": {"queue": "ai"},
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
