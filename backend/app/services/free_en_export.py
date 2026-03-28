"""Free English video export service.

Produces an English-dubbed version of the main Chinese MP4 using:
1. Claude subtitle translation (already in claude.py)
2. Edge TTS for English voice synthesis
3. FFmpeg to replace audio track + burn in English subtitles

Zero cost. No external paid API required.

Usage (sync, inside Celery worker)::

    from app.services.free_en_export import export_english_version

    result = export_english_version(
        source_video="/tmp/main_zh.mp4",
        subtitle_segments=[{start_ms, end_ms, text, translated_text}, ...],
        output_dir="/tmp/exports/123",
    )
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import time
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Step 1: Translate subtitles (Chinese → English) via Claude
# ---------------------------------------------------------------------------

def _ensure_translations(
    segments: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Ensure every segment has a ``translated_text`` field.

    If translations are missing, calls Claude to translate them.
    Returns a new list with translations filled in.
    """
    needs_translation = [
        s for s in segments
        if not s.get("translated_text")
    ]

    if not needs_translation:
        logger.info("All %d segments already have English translations", len(segments))
        return segments

    logger.info(
        "Translating %d/%d segments via Claude",
        len(needs_translation), len(segments),
    )

    from app.services.claude import translate_with_claude
    translations = translate_with_claude(
        segments=needs_translation,
        source_lang="Traditional Chinese",
        target_lang="English",
    )

    # Map translations back
    result = []
    translation_idx = 0
    for seg in segments:
        new_seg = dict(seg)
        if not new_seg.get("translated_text"):
            if translation_idx < len(translations):
                new_seg["translated_text"] = translations[translation_idx]
                translation_idx += 1
            else:
                new_seg["translated_text"] = ""
        result.append(new_seg)

    return result


# ---------------------------------------------------------------------------
# Step 2: Generate English TTS audio via Edge TTS
# ---------------------------------------------------------------------------

def _generate_tts_audio(
    segments: list[dict[str, Any]],
    output_dir: str,
    voice: str | None = None,
) -> list[dict[str, Any]]:
    """Generate individual TTS audio clips for each segment.

    Returns a list of dicts: [{start_ms, end_ms, audio_path, text}, ...]
    """
    voice = voice or settings.TTS_VOICE_EN  # default: en-US-AriaNeural

    tts_clips: list[dict[str, Any]] = []
    tts_dir = os.path.join(output_dir, "tts_clips")
    os.makedirs(tts_dir, exist_ok=True)

    for i, seg in enumerate(segments):
        en_text = seg.get("translated_text", "").strip()
        if not en_text:
            continue

        clip_path = os.path.join(tts_dir, f"tts_{i:04d}.mp3")

        cmd = [
            "edge-tts",
            "--voice", voice,
            "--text", en_text,
            "--write-media", clip_path,
        ]

        try:
            subprocess.run(cmd, capture_output=True, text=True, check=True)
            tts_clips.append({
                "index": i,
                "start_ms": seg["start_ms"],
                "end_ms": seg["end_ms"],
                "audio_path": clip_path,
                "text": en_text,
            })
        except subprocess.CalledProcessError as e:
            logger.warning("Edge TTS failed for segment %d: %s", i, e.stderr[:200])

    logger.info("Generated %d TTS clips", len(tts_clips))
    return tts_clips


# ---------------------------------------------------------------------------
# Step 3: Build English audio track from TTS clips
# ---------------------------------------------------------------------------

def _build_english_audio_track(
    tts_clips: list[dict[str, Any]],
    total_duration_ms: float,
    output_path: str,
) -> str:
    """Merge individual TTS clips into a single audio track,
    positioned at the correct timestamps.

    Uses FFmpeg adelay + amix to place each clip at its start_ms.
    Returns the path to the merged audio file.
    """
    if not tts_clips:
        # Generate silence
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i",
            f"anullsrc=r=44100:cl=stereo:d={total_duration_ms / 1000:.3f}",
            "-c:a", "aac", "-b:a", "192k",
            output_path,
        ]
        subprocess.run(cmd, capture_output=True, text=True, check=True)
        return output_path

    # Build filter_complex: load each clip, delay it, then amix all
    cmd = ["ffmpeg", "-y"]

    # Input: silent base track
    cmd.extend([
        "-f", "lavfi", "-i",
        f"anullsrc=r=44100:cl=stereo:d={total_duration_ms / 1000:.3f}",
    ])

    # Input: each TTS clip
    for clip in tts_clips:
        cmd.extend(["-i", clip["audio_path"]])

    # Filter: delay each clip to its start_ms, then amix
    filter_parts = []
    input_labels = []

    for idx, clip in enumerate(tts_clips):
        input_idx = idx + 1  # 0 is the silent base
        delay_ms = clip["start_ms"]
        label = f"d{idx}"
        filter_parts.append(
            f"[{input_idx}:a]adelay={int(delay_ms)}|{int(delay_ms)},"
            f"aresample=44100[{label}]"
        )
        input_labels.append(f"[{label}]")

    # Mix: base + all delayed clips
    n_inputs = len(input_labels) + 1  # +1 for silent base
    mix_inputs = "[0:a]" + "".join(input_labels)
    filter_parts.append(
        f"{mix_inputs}amix=inputs={n_inputs}:duration=first:dropout_transition=0[out]"
    )

    cmd.extend(["-filter_complex", ";".join(filter_parts)])
    cmd.extend(["-map", "[out]", "-c:a", "aac", "-b:a", "192k", output_path])

    subprocess.run(cmd, capture_output=True, text=True, check=True)
    logger.info("English audio track built: %s", output_path)
    return output_path


# ---------------------------------------------------------------------------
# Step 4: Compose final English video
# ---------------------------------------------------------------------------

def _compose_english_video(
    source_video: str,
    english_audio: str,
    segments: list[dict[str, Any]],
    output_path: str,
) -> str:
    """Replace audio track + burn in English subtitles.

    Takes the original video (for the video stream), the English audio
    track, and subtitle segments to produce the final English MP4.
    """
    from app.services.ffmpeg import _generate_temp_srt

    # Generate English-only SRT
    en_segments = []
    for seg in segments:
        en_segments.append({
            "start_ms": seg["start_ms"],
            "end_ms": seg["end_ms"],
            "text": seg.get("translated_text", ""),
        })
    srt_path = _generate_temp_srt(en_segments, include_translated=False)

    try:
        # Try drawtext first (precise shadow control)
        from app.core.subtitle_preset import DEFAULT_PRESET
        style = DEFAULT_PRESET.get_ass_style(role="main", tier="subtitle")
    except ImportError:
        style = (
            "FontSize=42,PrimaryColour=&H00FFFFFF,"
            "Outline=0,Shadow=5,FontName=Noto Sans TC"
        )

    escaped_srt = srt_path.replace("\\", "\\\\").replace(":", "\\:")

    cmd = [
        "ffmpeg", "-y",
        "-i", source_video,
        "-i", english_audio,
        "-filter_complex",
        (
            f"[0:v]subtitles=filename='{escaped_srt}'"
            f":force_style='{style}'[outv]"
        ),
        "-map", "[outv]",
        "-map", "1:a",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "23",
        "-c:a", "aac",
        "-b:a", "192k",
        "-r", "30",
        "-movflags", "+faststart",
        output_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, check=False)

    if result.returncode != 0:
        logger.error("FFmpeg compose failed: %s", result.stderr[-1000:])
        raise RuntimeError(f"FFmpeg English compose failed: {result.stderr[-500:]}")

    # Cleanup temp SRT
    try:
        os.unlink(srt_path)
    except OSError:
        pass

    logger.info("English video composed: %s", output_path)
    return output_path


# ---------------------------------------------------------------------------
# Step 5: Write job log
# ---------------------------------------------------------------------------

def _write_log(output_dir: str, status: str, detail: str = "") -> None:
    """Append a line to en_export_job.log."""
    log_path = os.path.join(output_dir, "en_export_job.log")
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(f"[{timestamp}] status={status} {detail}\n")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def export_english_version(
    source_video: str,
    subtitle_segments: list[dict[str, Any]],
    output_dir: str,
    tts_voice: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Full pipeline: Chinese video → English dubbed video.

    Steps:
        1. Ensure English translations exist (Claude)
        2. Generate Edge TTS audio clips
        3. Build merged English audio track
        4. Compose final video (replace audio + burn EN subtitles)

    Parameters
    ----------
    source_video:
        Path to the main Chinese MP4.
    subtitle_segments:
        List of dicts with ``start_ms``, ``end_ms``, ``text``,
        and optionally ``translated_text``.
    output_dir:
        Directory for output files.
    tts_voice:
        Edge TTS voice name. Defaults to config TTS_VOICE_EN.
    dry_run:
        If True, log parameters without executing.

    Returns
    -------
    dict
        ``{"status": "success"|"skipped"|"failed",
          "output_path": str|None,
          "error": str|None}``
    """
    output_path = os.path.join(output_dir, "main_en.mp4")
    os.makedirs(output_dir, exist_ok=True)

    if dry_run:
        params = {
            "source_video": source_video,
            "segments_count": len(subtitle_segments),
            "tts_voice": tts_voice or settings.TTS_VOICE_EN,
            "output_path": output_path,
        }
        logger.info("Free EN export DRY-RUN: %s", json.dumps(params, ensure_ascii=False))
        _write_log(output_dir, "dry_run", json.dumps(params, ensure_ascii=False))
        return {"status": "skipped", "output_path": None, "error": None}

    try:
        # Step 1: Translate
        _write_log(output_dir, "translating")
        segments = _ensure_translations(subtitle_segments)

        # Step 2: TTS
        _write_log(output_dir, "generating_tts")
        tts_clips = _generate_tts_audio(segments, output_dir, voice=tts_voice)

        # Step 3: Build audio track
        _write_log(output_dir, "building_audio")
        from app.services.ffmpeg import probe_file
        probe = probe_file(source_video)
        total_duration_ms = float(probe["format"]["duration"]) * 1000

        audio_path = os.path.join(output_dir, "en_audio.aac")
        _build_english_audio_track(tts_clips, total_duration_ms, audio_path)

        # Step 4: Compose video
        _write_log(output_dir, "composing_video")
        _compose_english_video(source_video, audio_path, segments, output_path)

        size_mb = os.path.getsize(output_path) / (1024 * 1024)
        _write_log(output_dir, "success", f"{size_mb:.1f}MB → {output_path}")

        return {
            "status": "success",
            "output_path": output_path,
            "error": None,
        }

    except Exception as exc:
        error_msg = f"{type(exc).__name__}: {exc}"
        logger.error("Free EN export failed: %s", error_msg, exc_info=True)
        _write_log(output_dir, "failed", error_msg)
        return {
            "status": "failed",
            "output_path": None,
            "error": error_msg,
        }
