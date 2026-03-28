"""HeyGen Video Translation export service.

Submits a finished Chinese MP4 to HeyGen's Video Translation API,
polls for completion, and downloads the English-dubbed result.

This module is designed as a **non-blocking sidecar** to the main
export pipeline — HeyGen failure never blocks the primary output.

Usage (sync, inside Celery worker)::

    from app.services.heygen_export import heygen_translate

    result = heygen_translate(
        video_url="https://minio.example.com/exports/xxx/output.mp4",
        output_dir="/tmp/exports/xxx",
    )
    # result = {"status": "success", "output_path": "/tmp/.../main_en_heygen.mp4"}

Usage (dry-run)::

    result = heygen_translate(video_url="...", output_dir="...", dry_run=True)
    # Prints parameters, returns without calling API.
"""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Any

import requests

from app.core.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

HEYGEN_BASE_URL = "https://api.heygen.com"
POLL_INTERVAL_SEC = 30
MAX_POLL_DURATION_SEC = 30 * 60  # 30 minutes

SOURCE_LANGUAGE = "zh"      # Chinese
TARGET_LANGUAGE = "en"      # English


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_headers() -> dict[str, str]:
    """Return auth headers for HeyGen API."""
    api_key = settings.HEYGEN_API_KEY
    if not api_key:
        raise RuntimeError(
            "HEYGEN_API_KEY is not set. "
            "Add it to .env or export it as an environment variable."
        )
    return {
        "x-api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _submit_translation(
    video_url: str,
    title: str | None = None,
) -> str:
    """Submit a video translation job to HeyGen.

    Returns the ``video_translate_id``.
    """
    url = f"{HEYGEN_BASE_URL}/v2/video_translate"
    payload: dict[str, Any] = {
        "video_url": video_url,
        "output_language": TARGET_LANGUAGE,
        "translate_audio_only": False,
        "mode": "quality",
    }
    if title:
        payload["title"] = title

    logger.info("HeyGen submit: POST %s | payload=%s", url, json.dumps(payload))

    resp = requests.post(url, headers=_get_headers(), json=payload, timeout=60)
    resp.raise_for_status()
    data = resp.json()

    if data.get("error"):
        raise RuntimeError(f"HeyGen submit error: {data['error']}")

    translate_id = data["data"]["video_translate_id"]
    logger.info("HeyGen job submitted: video_translate_id=%s", translate_id)
    return translate_id


def _poll_status(translate_id: str) -> dict[str, Any]:
    """Poll HeyGen until the translation job completes or fails.

    Returns the final status payload from the API.

    Raises ``TimeoutError`` if polling exceeds ``MAX_POLL_DURATION_SEC``.
    """
    url = f"{HEYGEN_BASE_URL}/v2/video_translate/{translate_id}"
    elapsed = 0

    while elapsed < MAX_POLL_DURATION_SEC:
        resp = requests.get(url, headers=_get_headers(), timeout=30)
        resp.raise_for_status()
        data = resp.json()

        status = data["data"]["status"]
        logger.info(
            "HeyGen poll [%s]: status=%s (elapsed %ds)",
            translate_id, status, elapsed,
        )

        if status == "success":
            return data["data"]
        if status == "failed":
            msg = data["data"].get("message", "unknown error")
            raise RuntimeError(f"HeyGen translation failed: {msg}")

        # pending / running → wait and retry
        time.sleep(POLL_INTERVAL_SEC)
        elapsed += POLL_INTERVAL_SEC

    raise TimeoutError(
        f"HeyGen translation timed out after {MAX_POLL_DURATION_SEC}s "
        f"(id={translate_id})"
    )


def _download_video(download_url: str, output_path: str) -> str:
    """Download the translated video to a local file.

    Returns the final output path.
    """
    logger.info("HeyGen download: %s → %s", download_url, output_path)
    resp = requests.get(download_url, stream=True, timeout=300)
    resp.raise_for_status()

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            f.write(chunk)

    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    logger.info("HeyGen download complete: %.1f MB → %s", size_mb, output_path)
    return output_path


def _write_job_log(
    output_dir: str,
    translate_id: str | None,
    status: str,
    detail: str = "",
) -> None:
    """Append a line to heygen_job.log in the output directory."""
    log_path = os.path.join(output_dir, "heygen_job.log")
    os.makedirs(output_dir, exist_ok=True)
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(f"[{timestamp}] id={translate_id} status={status} {detail}\n")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def heygen_translate(
    video_url: str,
    output_dir: str,
    title: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Run the full HeyGen Video Translation pipeline.

    1. Submit the video for translation (zh → en)
    2. Poll until completion
    3. Download the result to ``output_dir/main_en_heygen.mp4``

    Parameters
    ----------
    video_url:
        Public URL of the source MP4 (e.g. MinIO presigned URL).
    output_dir:
        Local directory for output files.
    title:
        Optional title for the HeyGen job.
    dry_run:
        If True, log the parameters without calling the API.

    Returns
    -------
    dict
        ``{"status": "success"|"skipped"|"failed",
          "output_path": str|None,
          "translate_id": str|None,
          "error": str|None}``
    """
    output_path = os.path.join(output_dir, "main_en_heygen.mp4")

    # --- Dry-run mode ---
    if dry_run:
        params = {
            "video_url": video_url,
            "output_language": TARGET_LANGUAGE,
            "source_language": SOURCE_LANGUAGE,
            "translate_audio_only": False,
            "mode": "quality",
            "title": title,
            "output_path": output_path,
        }
        logger.info("HeyGen DRY-RUN: would submit with params=%s", json.dumps(params, ensure_ascii=False))
        _write_job_log(output_dir, None, "dry_run", json.dumps(params, ensure_ascii=False))
        return {
            "status": "skipped",
            "output_path": None,
            "translate_id": None,
            "error": None,
        }

    # --- Check API key ---
    if not settings.HEYGEN_API_KEY:
        msg = "HEYGEN_API_KEY not configured, skipping English export"
        logger.warning(msg)
        _write_job_log(output_dir, None, "skipped", msg)
        return {
            "status": "skipped",
            "output_path": None,
            "translate_id": None,
            "error": msg,
        }

    translate_id: str | None = None
    try:
        # Step 1: Submit
        _write_job_log(output_dir, None, "submitting", f"url={video_url}")
        translate_id = _submit_translation(video_url, title=title)
        _write_job_log(output_dir, translate_id, "submitted")

        # Step 2: Poll
        result_data = _poll_status(translate_id)
        _write_job_log(output_dir, translate_id, "success", f"url={result_data.get('url', '')}")

        # Step 3: Download
        download_url = result_data.get("url")
        if not download_url:
            raise RuntimeError("HeyGen returned success but no download URL")

        _download_video(download_url, output_path)
        _write_job_log(output_dir, translate_id, "downloaded", output_path)

        return {
            "status": "success",
            "output_path": output_path,
            "translate_id": translate_id,
            "error": None,
        }

    except Exception as exc:
        error_msg = f"{type(exc).__name__}: {exc}"
        logger.error("HeyGen export failed: %s", error_msg, exc_info=True)
        _write_job_log(output_dir, translate_id, "failed", error_msg)
        return {
            "status": "failed",
            "output_path": None,
            "translate_id": translate_id,
            "error": error_msg,
        }
