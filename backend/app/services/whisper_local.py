"""Local Whisper transcription service.

Uses the open-source Whisper model running locally — no API key required.
Synchronous functions designed to run inside Celery worker tasks.
"""

from __future__ import annotations

import logging
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

# Cache the loaded model to avoid reloading on every call
_model: Any = None


def _get_model(model_name: str | None = None) -> Any:
    """Load and cache the Whisper model."""
    global _model  # noqa: PLW0603
    model_name = model_name or settings.WHISPER_MODEL

    if _model is None:
        import whisper
        logger.info("Loading Whisper model: %s", model_name)
        _model = whisper.load_model(model_name)
    return _model


def transcribe_local(
    audio_path: str,
    model_name: str | None = None,
    language: str = "zh",
) -> list[dict[str, Any]]:
    """Transcribe an audio file using the local Whisper model.

    Parameters
    ----------
    audio_path:
        Path to the audio file on disk.
    model_name:
        Whisper model size (tiny, base, small, medium, large).
        Defaults to settings.WHISPER_MODEL.
    language:
        Language hint for Whisper (ISO-639-1).

    Returns
    -------
    list[dict]
        A list of segments: [{start, end, text}].
    """
    model = _get_model(model_name)

    result = model.transcribe(
        audio_path,
        language=language,
        verbose=False,
    )

    segments = []
    for seg in result.get("segments", []):
        segments.append({
            "start": round(seg["start"], 3),
            "end": round(seg["end"], 3),
            "text": seg["text"].strip(),
        })

    return segments
