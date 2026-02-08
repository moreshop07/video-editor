"""PiAPI client for WAN PRO (Wan 2.6) AI video generation.

Synchronous implementation for use inside Celery workers.
"""

from __future__ import annotations

import logging
import time

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

PIAPI_BASE = "https://api.piapi.ai/api/v1"


class PiAPIError(Exception):
    """Raised when PiAPI returns an error or times out."""


def _get_headers() -> dict[str, str]:
    key = settings.PIAPI_API_KEY
    if not key:
        raise PiAPIError("PIAPI_API_KEY is not configured")
    return {"X-API-Key": key, "Content-Type": "application/json"}


def create_task(task_type: str, input_data: dict) -> str:
    """Create a PiAPI task and return its task_id.

    Args:
        task_type: e.g. ``wan26-txt2video`` or ``wan26-img2video``
        input_data: Task-specific input payload (prompt, image, resolution, etc.)

    Returns:
        The PiAPI task_id string.
    """
    payload = {
        "model": "Wan",
        "task_type": task_type,
        "input": input_data,
    }
    with httpx.Client(timeout=30) as client:
        resp = client.post(
            f"{PIAPI_BASE}/task",
            headers=_get_headers(),
            json=payload,
        )
    resp.raise_for_status()
    data = resp.json()

    task_id = data.get("data", {}).get("task_id")
    if not task_id:
        raise PiAPIError(f"No task_id in PiAPI response: {data}")
    logger.info("PiAPI task created: %s (type=%s)", task_id, task_type)
    return task_id


def poll_task(
    task_id: str,
    *,
    timeout: int = 600,
    interval: int = 10,
    progress_callback: callable | None = None,
) -> dict:
    """Poll a PiAPI task until it completes or fails.

    Args:
        task_id: The PiAPI task ID.
        timeout: Maximum seconds to wait.
        interval: Seconds between polls.
        progress_callback: Optional ``fn(progress_pct: float)`` called on each poll.

    Returns:
        The full task data dict from PiAPI.

    Raises:
        PiAPIError: On timeout or task failure.
    """
    start = time.time()
    headers = _get_headers()

    while True:
        elapsed = time.time() - start
        if elapsed > timeout:
            raise PiAPIError(f"PiAPI task {task_id} timed out after {timeout}s")

        with httpx.Client(timeout=30) as client:
            resp = client.get(f"{PIAPI_BASE}/task/{task_id}", headers=headers)
        resp.raise_for_status()
        data = resp.json().get("data", {})

        status = data.get("status", "")
        logger.debug("PiAPI task %s status=%s", task_id, status)

        # Report progress if available
        if progress_callback:
            pct = data.get("progress", 0)
            if isinstance(pct, (int, float)):
                progress_callback(float(pct))

        if status in ("completed", "success"):
            return data
        if status == "failed":
            error = data.get("error", {})
            raise PiAPIError(f"PiAPI task failed: {error}")

        time.sleep(interval)


def get_video_url(data: dict) -> str:
    """Extract the video URL from a completed PiAPI task response.

    Handles both WanX and Wan 2.6 response structures.
    """
    # Wan 2.6 structure: output.works[0].video.resource (string)
    output = data.get("output", {})
    works = output.get("works")
    if works and isinstance(works, list) and len(works) > 0:
        work = works[0]
        video = work.get("video", {})
        if isinstance(video, dict):
            resource = video.get("resource")
            if isinstance(resource, str) and resource.startswith("http"):
                return resource
        # Fallback: resource at work level
        resource = work.get("resource")
        if isinstance(resource, dict):
            url = resource.get("resource")
            if isinstance(url, str) and url.startswith("http"):
                return url

    # Fallback: output.video_url
    video_url = output.get("video_url")
    if isinstance(video_url, str) and video_url.startswith("http"):
        return video_url

    raise PiAPIError(f"Cannot extract video URL from PiAPI response: {data}")
