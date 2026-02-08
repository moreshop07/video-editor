"""Auto-editing service: silence removal, jump cuts.

Synchronous functions designed to run inside Celery worker tasks.
Uses auto-editor with FFmpeg fallback.
"""

from __future__ import annotations

import logging
import os
import re
import subprocess
import tempfile
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Silence detection
# ---------------------------------------------------------------------------

def detect_silence_segments(
    input_path: str,
    noise_db: float = -30.0,
    min_duration: float = 0.5,
) -> list[dict[str, Any]]:
    """Detect silence segments in a media file using FFmpeg.

    Returns a list of silence segments: [{start, end, duration}].
    """
    cmd = [
        "ffmpeg",
        "-i", input_path,
        "-af", f"silencedetect=noise={noise_db}dB:d={min_duration}",
        "-f", "null",
        "-",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)

    segments = []
    current_start: float | None = None

    for line in result.stderr.splitlines():
        start_match = re.search(r"silence_start:\s*([\d.]+)", line)
        end_match = re.search(r"silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)", line)

        if start_match:
            current_start = float(start_match.group(1))
        elif end_match and current_start is not None:
            end = float(end_match.group(1))
            duration = float(end_match.group(2))
            segments.append({
                "start": current_start,
                "end": end,
                "duration": duration,
            })
            current_start = None

    return segments


# ---------------------------------------------------------------------------
# Silence removal
# ---------------------------------------------------------------------------

def remove_silence(
    input_path: str,
    output_path: str | None = None,
    margin: float = 0.3,
) -> str:
    """Remove silence from a video/audio file.

    Tries auto-editor first, falls back to FFmpeg-based approach.

    Parameters
    ----------
    input_path:
        Path to the input media file.
    output_path:
        Path for the output file. Auto-generated if None.
    margin:
        Seconds of margin to keep around speech (auto-editor).

    Returns
    -------
    str
        Path to the processed output file.
    """
    if output_path is None:
        ext = os.path.splitext(input_path)[1] or ".mp4"
        tmp = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
        tmp.close()
        output_path = tmp.name

    # Try auto-editor first
    try:
        cmd = [
            "auto-editor", input_path,
            "--margin", f"{margin}s",
            "--output", output_path,
            "--no-open",
        ]
        subprocess.run(cmd, capture_output=True, text=True, check=True)
        return output_path
    except (subprocess.CalledProcessError, FileNotFoundError):
        logger.warning("auto-editor failed or not found, falling back to FFmpeg")

    # Fallback: FFmpeg-based silence removal
    return _remove_silence_ffmpeg(input_path, output_path)


def _remove_silence_ffmpeg(
    input_path: str,
    output_path: str,
    noise_db: float = -30.0,
    min_silence: float = 0.5,
    padding: float = 0.2,
) -> str:
    """Remove silence using FFmpeg silencedetect + segment extraction."""
    silence_segments = detect_silence_segments(input_path, noise_db, min_silence)

    if not silence_segments:
        # No silence found — just copy the file
        subprocess.run(
            ["ffmpeg", "-y", "-i", input_path, "-c", "copy", output_path],
            capture_output=True, check=True,
        )
        return output_path

    # Build speech segments (inverse of silence)
    from app.services.ffmpeg import probe_file
    probe = probe_file(input_path)
    duration = float(probe["format"]["duration"])

    speech_segments: list[tuple[float, float]] = []
    prev_end = 0.0

    for seg in silence_segments:
        speech_start = max(0, prev_end - padding)
        speech_end = min(duration, seg["start"] + padding)
        if speech_end > speech_start + 0.1:
            speech_segments.append((speech_start, speech_end))
        prev_end = seg["end"]

    # Last speech segment
    if prev_end < duration:
        speech_segments.append((max(0, prev_end - padding), duration))

    if not speech_segments:
        subprocess.run(
            ["ffmpeg", "-y", "-i", input_path, "-c", "copy", output_path],
            capture_output=True, check=True,
        )
        return output_path

    # Create temp segments and concatenate
    tmpdir = tempfile.mkdtemp(prefix="silence_removal_")
    segment_files = []

    for i, (start, end) in enumerate(speech_segments):
        seg_path = os.path.join(tmpdir, f"seg_{i:04d}.ts")
        cmd = [
            "ffmpeg", "-y",
            "-i", input_path,
            "-ss", str(start),
            "-to", str(end),
            "-c", "copy",
            "-bsf:v", "h264_mp4toannexb",
            "-f", "mpegts",
            seg_path,
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        segment_files.append(seg_path)

    # Concatenate
    concat_input = "concat:" + "|".join(segment_files)
    cmd = [
        "ffmpeg", "-y",
        "-i", concat_input,
        "-c", "copy",
        "-bsf:a", "aac_adtstoasc",
        output_path,
    ]
    subprocess.run(cmd, capture_output=True, text=True, check=True)

    # Cleanup temp files
    for f in segment_files:
        os.unlink(f)
    os.rmdir(tmpdir)

    return output_path


# ---------------------------------------------------------------------------
# Jump cut
# ---------------------------------------------------------------------------

def jump_cut(
    input_path: str,
    output_path: str | None = None,
) -> str:
    """Apply jump cut editing (remove pauses between speech).

    Uses auto-editor with aggressive settings for jump-cut style.

    Parameters
    ----------
    input_path:
        Path to the input media file.
    output_path:
        Path for the output file. Auto-generated if None.

    Returns
    -------
    str
        Path to the processed output file.
    """
    if output_path is None:
        ext = os.path.splitext(input_path)[1] or ".mp4"
        tmp = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
        tmp.close()
        output_path = tmp.name

    try:
        cmd = [
            "auto-editor", input_path,
            "--margin", "0.1s",
            "--output", output_path,
            "--no-open",
        ]
        subprocess.run(cmd, capture_output=True, text=True, check=True)
        return output_path
    except (subprocess.CalledProcessError, FileNotFoundError):
        logger.warning("auto-editor failed for jump cut, falling back to FFmpeg")
        return _remove_silence_ffmpeg(
            input_path, output_path,
            noise_db=-25.0,
            min_silence=0.3,
            padding=0.05,
        )
