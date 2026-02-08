"""Fish Audio TTS service.

Uses the Fish Audio API for voice cloning and AI character voices.
Requires FISH_AUDIO_API_KEY to be set in the environment.
"""

from __future__ import annotations

import logging
import tempfile
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


def is_available() -> bool:
    """Return True if Fish Audio API key is configured."""
    return bool(settings.FISH_AUDIO_API_KEY)


def generate_tts(
    text: str,
    model_id: str,
    output_path: str | None = None,
    reference_audio_path: str | None = None,
    speed: float = 1.0,
) -> str:
    """Generate TTS audio using Fish Audio API (synchronous).

    Parameters
    ----------
    text:
        The text to convert to speech.
    model_id:
        Fish Audio model ID from the marketplace.
    output_path:
        Path to save the output audio. Auto-generated if None.
    reference_audio_path:
        Optional local path to reference audio for voice cloning.
    speed:
        Speech speed multiplier (default 1.0).

    Returns
    -------
    str
        Path to the generated audio file.
    """
    if not is_available():
        raise ValueError("Fish Audio API key not configured")

    if output_path is None:
        tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
        tmp.close()
        output_path = tmp.name

    url = f"{settings.FISH_AUDIO_BASE_URL}/tts"
    headers = {
        "Authorization": f"Bearer {settings.FISH_AUDIO_API_KEY}",
    }

    if reference_audio_path:
        # Multipart request with reference audio
        with open(reference_audio_path, "rb") as ref_f:
            files = {"reference_audio": ("reference.mp3", ref_f, "audio/mpeg")}
            data = {
                "text": text,
                "reference_id": model_id,
                "speed": str(speed),
            }
            with httpx.Client(timeout=60.0) as client:
                response = client.post(url, headers=headers, data=data, files=files)
    else:
        # JSON request without reference audio
        payload = {
            "text": text,
            "reference_id": model_id,
            "speed": speed,
        }
        headers["Content-Type"] = "application/json"
        with httpx.Client(timeout=60.0) as client:
            response = client.post(url, headers=headers, json=payload)

    response.raise_for_status()

    with open(output_path, "wb") as f:
        f.write(response.content)

    logger.info("Fish Audio TTS generated: %s (%d bytes)", output_path, len(response.content))
    return output_path


def list_marketplace_voices(page: int = 1, page_size: int = 20) -> list[dict[str, Any]]:
    """Fetch popular voice models from Fish Audio marketplace.

    Returns a list of model dicts with id, name, description, etc.
    """
    if not is_available():
        return []

    url = f"{settings.FISH_AUDIO_BASE_URL}/models"
    headers = {
        "Authorization": f"Bearer {settings.FISH_AUDIO_API_KEY}",
    }
    params = {"page": page, "page_size": page_size}

    try:
        with httpx.Client(timeout=15.0) as client:
            response = client.get(url, headers=headers, params=params)
        response.raise_for_status()
        data = response.json()
        return data.get("items", data) if isinstance(data, dict) else data
    except Exception:
        logger.exception("Failed to fetch Fish Audio marketplace voices")
        return []
