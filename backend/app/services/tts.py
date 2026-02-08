"""Edge TTS text-to-speech service.

Uses Microsoft Edge TTS (free, no API key required).
Functions use asyncio internally but expose sync wrappers for Celery tasks.
"""

from __future__ import annotations

import asyncio
import logging
import os
import subprocess
import tempfile
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

# Available TTS voices
TTS_VOICES: dict[str, str] = {
    "zh-TW-HsiaoChenNeural": "曉臻 (女)",
    "zh-TW-YunJheNeural": "雲哲 (男)",
    "zh-TW-HsiaoYuNeural": "曉雨 (女)",
    "zh-CN-XiaoxiaoNeural": "曉曉 (女)",
    "zh-CN-YunxiNeural": "雲希 (男)",
    "en-US-AriaNeural": "Aria (Female)",
    "en-US-GuyNeural": "Guy (Male)",
    "en-US-JennyNeural": "Jenny (Female)",
    "ja-JP-NanamiNeural": "七海 (Female)",
    "ko-KR-SunHiNeural": "선히 (Female)",
}


def get_available_voices() -> dict[str, str]:
    """Return the dict of available TTS voices."""
    return TTS_VOICES.copy()


async def _generate_tts_async(
    text: str,
    voice: str,
    output_path: str,
) -> str:
    """Generate TTS audio using Edge TTS (async)."""
    import edge_tts

    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(output_path)
    return output_path


def generate_tts(
    text: str,
    voice: str | None = None,
    output_path: str | None = None,
) -> str:
    """Generate TTS audio from text (sync wrapper).

    Parameters
    ----------
    text:
        The text to convert to speech.
    voice:
        Edge TTS voice name. Defaults to settings.TTS_VOICE_ZH.
    output_path:
        Path to save the output audio. Auto-generated if None.

    Returns
    -------
    str
        Path to the generated audio file.
    """
    voice = voice or settings.TTS_VOICE_ZH
    if output_path is None:
        tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
        tmp.close()
        output_path = tmp.name

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_generate_tts_async(text, voice, output_path))
    finally:
        loop.close()

    return output_path


async def _generate_segment_voiceover_async(
    segments: list[dict[str, Any]],
    voice: str,
    output_dir: str,
) -> list[dict[str, Any]]:
    """Generate TTS for each subtitle segment (async)."""
    import edge_tts

    results = []
    for i, seg in enumerate(segments):
        text = seg.get("text", "")
        if not text.strip():
            continue

        output_path = os.path.join(output_dir, f"seg_{i:04d}.mp3")
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(output_path)

        results.append({
            "index": i,
            "text": text,
            "start": seg.get("start", 0),
            "end": seg.get("end", 0),
            "file_path": output_path,
        })

    return results


def generate_segment_voiceover(
    segments: list[dict[str, Any]],
    voice: str | None = None,
    output_dir: str | None = None,
) -> list[dict[str, Any]]:
    """Generate TTS for each subtitle segment (sync wrapper).

    Parameters
    ----------
    segments:
        List of subtitle segments with text, start, end.
    voice:
        Edge TTS voice name.
    output_dir:
        Directory to save segment audio files.

    Returns
    -------
    list[dict]
        List of dicts with segment info and file_path.
    """
    voice = voice or settings.TTS_VOICE_ZH
    if output_dir is None:
        output_dir = tempfile.mkdtemp(prefix="tts_segments_")
    os.makedirs(output_dir, exist_ok=True)

    loop = asyncio.new_event_loop()
    try:
        results = loop.run_until_complete(
            _generate_segment_voiceover_async(segments, voice, output_dir)
        )
    finally:
        loop.close()

    return results


def merge_voiceover_segments(
    segment_files: list[dict[str, Any]],
    output_path: str,
    total_duration: float | None = None,
) -> str:
    """Merge individual TTS segment files into a single audio track.

    Each segment is placed at its corresponding start time, creating
    a full voiceover track aligned with the video timeline.

    Returns the output_path.
    """
    if not segment_files:
        raise ValueError("No segment files to merge")

    # Build FFmpeg command with adelay for positioning
    cmd = ["ffmpeg", "-y"]
    filter_parts = []

    for i, seg in enumerate(segment_files):
        cmd.extend(["-i", seg["file_path"]])
        delay_ms = int(seg.get("start", 0) * 1000)
        filter_parts.append(f"[{i}:a]adelay={delay_ms}|{delay_ms}[a{i}]")

    # Mix all delayed audio streams
    mix_inputs = "".join(f"[a{i}]" for i in range(len(segment_files)))
    filter_parts.append(f"{mix_inputs}amix=inputs={len(segment_files)}:normalize=0[out]")

    cmd.extend([
        "-filter_complex", ";".join(filter_parts),
        "-map", "[out]",
        "-c:a", "aac",
        "-b:a", "192k",
        output_path,
    ])

    subprocess.run(cmd, capture_output=True, text=True, check=True)
    return output_path
