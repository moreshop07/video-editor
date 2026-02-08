"""Video downloader service using yt-dlp.

Synchronous functions designed to run inside Celery worker tasks.
"""

from __future__ import annotations

import logging
import os
import re
from typing import Any, Callable

import yt_dlp

from app.core.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Platform detection
# ---------------------------------------------------------------------------

_PLATFORM_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("youtube", re.compile(r"(youtube\.com|youtu\.be)")),
    ("instagram", re.compile(r"instagram\.com")),
    ("tiktok", re.compile(r"tiktok\.com")),
    ("facebook", re.compile(r"(facebook\.com|fb\.watch)")),
    ("twitter", re.compile(r"(twitter\.com|x\.com)")),
    ("bilibili", re.compile(r"bilibili\.com")),
]


def detect_platform(url: str) -> str:
    """Detect the video platform from a URL."""
    for name, pattern in _PLATFORM_PATTERNS:
        if pattern.search(url):
            return name
    return "other"


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------

def download_video(
    url: str,
    output_dir: str | None = None,
    progress_callback: Callable[[float], None] | None = None,
) -> dict[str, Any]:
    """Download a video from the given URL using yt-dlp.

    Parameters
    ----------
    url:
        The video URL to download.
    output_dir:
        Directory to save the downloaded file. Defaults to settings.DOWNLOAD_DIR.
    progress_callback:
        Optional callback invoked with progress percentage (0-100).

    Returns
    -------
    dict
        Contains keys: file_path, title, duration, platform, thumbnail, metadata.
    """
    output_dir = output_dir or settings.DOWNLOAD_DIR
    os.makedirs(output_dir, exist_ok=True)

    platform = detect_platform(url)
    info: dict[str, Any] = {}

    def _progress_hook(d: dict[str, Any]) -> None:
        if d["status"] == "downloading" and progress_callback:
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes", 0)
            if total > 0:
                progress_callback(downloaded / total * 100)
        elif d["status"] == "finished":
            if progress_callback:
                progress_callback(100)

    ydl_opts: dict[str, Any] = {
        "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "outtmpl": os.path.join(output_dir, "%(id)s.%(ext)s"),
        "merge_output_format": "mp4",
        "progress_hooks": [_progress_hook],
        "quiet": True,
        "no_warnings": True,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)

    if info is None:
        raise RuntimeError(f"Failed to download video from {url}")

    # Determine the downloaded file path
    video_id = info.get("id", "unknown")
    ext = info.get("ext", "mp4")
    file_path = os.path.join(output_dir, f"{video_id}.{ext}")

    # Try the requested_downloads path if available
    if "requested_downloads" in info and info["requested_downloads"]:
        file_path = info["requested_downloads"][0].get("filepath", file_path)

    return {
        "file_path": file_path,
        "title": info.get("title", "Untitled"),
        "duration": info.get("duration", 0),
        "platform": platform,
        "thumbnail": info.get("thumbnail"),
        "metadata": {
            "uploader": info.get("uploader"),
            "upload_date": info.get("upload_date"),
            "view_count": info.get("view_count"),
            "description": info.get("description", "")[:500],
            "width": info.get("width"),
            "height": info.get("height"),
            "fps": info.get("fps"),
            "filesize": info.get("filesize"),
        },
    }
