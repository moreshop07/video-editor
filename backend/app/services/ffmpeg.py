"""FFmpeg / FFprobe helper functions used by Celery tasks.

Every function in this module is **synchronous** (blocking) because it is
designed to run inside a Celery worker process.
"""

from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# ffprobe
# ---------------------------------------------------------------------------

def probe_file(file_path: str) -> dict[str, Any]:
    """Run *ffprobe* on ``file_path`` and return the parsed JSON output.

    The returned dict follows the ffprobe JSON schema and typically contains
    ``"streams"`` and ``"format"`` keys.
    """
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        file_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


# ---------------------------------------------------------------------------
# Thumbnail extraction
# ---------------------------------------------------------------------------

def extract_thumbnail(
    input_path: str,
    output_path: str,
    time_sec: float = 1.0,
) -> None:
    """Extract a single frame from ``input_path`` at *time_sec* seconds and
    write it as a JPEG to ``output_path``.
    """
    cmd = [
        "ffmpeg",
        "-y",
        "-ss", str(time_sec),
        "-i", input_path,
        "-frames:v", "1",
        "-q:v", "2",
        output_path,
    ]
    subprocess.run(cmd, capture_output=True, text=True, check=True)


# ---------------------------------------------------------------------------
# Waveform image generation
# ---------------------------------------------------------------------------

def generate_waveform(
    input_path: str,
    output_path: str,
    width: int = 800,
    height: int = 200,
) -> None:
    """Generate a waveform PNG from an audio / video file using ffmpeg's
    ``showwavespic`` filter.
    """
    cmd = [
        "ffmpeg",
        "-y",
        "-i", input_path,
        "-filter_complex",
        f"showwavespic=s={width}x{height}:colors=#3b82f6",
        "-frames:v", "1",
        output_path,
    ]
    subprocess.run(cmd, capture_output=True, text=True, check=True)


# ---------------------------------------------------------------------------
# Effect filter helpers
# ---------------------------------------------------------------------------

# Mapping from frontend effect IDs to FFmpeg filter builders.
# Each builder takes the effect value and returns an FFmpeg filter string or None.
_EFFECT_BUILDERS: dict[str, Any] = {
    "blur": lambda v: f"boxblur={max(1, round(v))}:{max(1, round(v))}" if v > 0 else None,
    "brightness": lambda v: f"eq=brightness={v - 1:.2f}" if abs(v - 1) > 0.01 else None,
    "contrast": lambda v: f"eq=contrast={v:.2f}" if abs(v - 1) > 0.01 else None,
    "saturation": lambda v: f"eq=saturation={v:.2f}" if abs(v - 1) > 0.01 else None,
    "grayscale": lambda v: "hue=s=0" if v >= 0.95 else (f"eq=saturation={1 - v:.2f}" if v > 0 else None),
    "sepia": lambda v: (
        f"colorchannelmixer="
        f"{0.393 * v + (1 - v):.3f}:{0.769 * v:.3f}:{0.189 * v:.3f}:0:"
        f"{0.349 * v:.3f}:{0.686 * v + (1 - v):.3f}:{0.168 * v:.3f}:0:"
        f"{0.272 * v:.3f}:{0.534 * v:.3f}:{0.131 * v + (1 - v):.3f}:0"
    ) if v > 0 else None,
    "hueRotate": lambda v: f"hue=h={v}" if v > 0 else None,
    "invert": lambda v: "negate" if v >= 0.5 else None,
}


def build_effect_filters(filters: dict[str, Any] | None) -> list[str]:
    """Convert a clip's filters dict to a list of FFmpeg filter strings.

    ``filters`` has the shape ``{"effects": [...], "speed": 1.0}``.
    Returns a list of FFmpeg filter strings (without surrounding brackets).
    """
    if not filters:
        return []

    parts: list[str] = []

    for effect in filters.get("effects", []):
        if not effect.get("enabled", True):
            continue
        effect_id = effect.get("id", "")
        value = effect.get("value", 0)
        builder = _EFFECT_BUILDERS.get(effect_id)
        if builder:
            result = builder(value)
            if result:
                parts.append(result)

    return parts


def _build_atempo_chain(speed: float) -> list[str]:
    """Build atempo filter chain for a given speed.

    FFmpeg's atempo filter only accepts values between 0.5 and 100.0,
    so extreme slow speeds need to be chained.
    """
    if abs(speed - 1.0) < 0.01:
        return []

    parts: list[str] = []
    remaining = speed

    while remaining < 0.5:
        parts.append("atempo=0.5")
        remaining /= 0.5
    while remaining > 100.0:
        parts.append("atempo=100.0")
        remaining /= 100.0

    if abs(remaining - 1.0) > 0.01:
        parts.append(f"atempo={remaining:.4f}")

    return parts


# ---------------------------------------------------------------------------
# Export command builder
# ---------------------------------------------------------------------------

def _generate_temp_srt(
    segments: list[dict[str, Any]],
    include_translated: bool = False,
) -> str:
    """Generate a temporary SRT file from subtitle segments.

    Each segment dict should have: ``start_ms``, ``end_ms``, ``text``,
    and optionally ``translated_text``.

    Returns the path to the generated temporary SRT file.
    """
    tmpfile = tempfile.NamedTemporaryFile(
        mode="w",
        suffix=".srt",
        delete=False,
        encoding="utf-8",
    )

    for idx, seg in enumerate(segments, start=1):
        start_ms = seg["start_ms"]
        end_ms = seg["end_ms"]
        text = seg.get("text", "")
        translated = seg.get("translated_text")

        def _fmt_srt(ms: int) -> str:
            total_s = ms // 1000
            h = total_s // 3600
            m = (total_s % 3600) // 60
            s = total_s % 60
            millis = ms % 1000
            return f"{h:02d}:{m:02d}:{s:02d},{millis:03d}"

        line = text
        if include_translated and translated:
            line += f"\n{translated}"

        tmpfile.write(f"{idx}\n")
        tmpfile.write(f"{_fmt_srt(start_ms)} --> {_fmt_srt(end_ms)}\n")
        tmpfile.write(f"{line}\n\n")

    tmpfile.close()
    return tmpfile.name


def build_export_command(
    project_data: dict[str, Any],
    output_path: str,
) -> list[str]:
    """Build an ffmpeg command list from the project timeline data.

    ``project_data`` is expected to have the following structure::

        {
            "timeline": {
                "tracks": [
                    {
                        "type": "video" | "audio",
                        "clips": [
                            {
                                "source": "/path/to/file",
                                "start_ms": 0,
                                "end_ms": 5000,
                                "trim_start_ms": 0,
                                "trim_end_ms": 5000,
                                "filters": {...},
                            },
                            ...
                        ]
                    },
                    ...
                ]
            },
            "output": {
                "width": 1920,
                "height": 1080,
                "fps": 30,
                "codec": "libx264",
                "audio_codec": "aac",
                "preset": "medium",
                "crf": 23
            }
        }
    """
    timeline = project_data.get("timeline", {})
    output_settings = project_data.get("output", {})
    tracks = timeline.get("tracks", [])

    width = output_settings.get("width", 1920)
    height = output_settings.get("height", 1080)
    fps = output_settings.get("fps", 30)
    codec = output_settings.get("codec", "libx264")
    audio_codec = output_settings.get("audio_codec", "aac")
    preset = output_settings.get("preset", "medium")
    crf = output_settings.get("crf", 23)

    cmd: list[str] = ["ffmpeg", "-y"]
    input_index = 0
    filter_parts: list[str] = []
    video_overlays: list[str] = []
    audio_parts: list[str] = []

    # Collect inputs and build per-clip filters
    for track in tracks:
        track_type = track.get("type", "video")
        for clip in track.get("clips", []):
            source = clip["source"]
            trim_start = clip.get("trim_start_ms", 0) / 1000.0
            trim_end = clip.get("trim_end_ms", clip.get("end_ms", 0)) / 1000.0

            cmd.extend(["-i", source])

            # Extract clip filters and speed
            clip_filters = clip.get("filters") or {}
            speed = clip_filters.get("speed", 1.0)
            effect_filter_list = build_effect_filters(clip_filters)

            # Extract fade parameters
            fade_in_ms = clip.get("fade_in_ms", 0)
            fade_out_ms = clip.get("fade_out_ms", 0)
            clip_duration = (trim_end - trim_start) / speed if abs(speed - 1.0) > 0.01 else (trim_end - trim_start)

            if track_type == "video":
                # Trim, speed, effects, then scale each video input
                label = f"v{input_index}"

                # Build setpts with speed adjustment
                if abs(speed - 1.0) > 0.01:
                    setpts = f"setpts=PTS/{speed}"
                else:
                    setpts = "setpts=PTS-STARTPTS"

                # Chain: trim → setpts → effect filters → scale → pad
                chain_parts = [
                    f"[{input_index}:v]",
                    f"trim=start={trim_start}:end={trim_end}",
                    setpts,
                ]
                chain_parts.extend(effect_filter_list)
                chain_parts.extend([
                    f"scale={width}:{height}:force_original_aspect_ratio=decrease",
                    f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2",
                ])

                trim_filter = ",".join(chain_parts[1:])
                filter_parts.append(f"{chain_parts[0]}{trim_filter}[{label}]")
                video_overlays.append(f"[{label}]")

                # Corresponding audio from this video input
                alabel = f"a{input_index}"
                audio_chain = [
                    f"[{input_index}:a]",
                    f"atrim=start={trim_start}:end={trim_end}",
                    "asetpts=PTS-STARTPTS",
                ]
                # Apply speed to audio
                atempo_chain = _build_atempo_chain(speed)
                audio_chain.extend(atempo_chain)

                # Apply audio fade in/out
                if fade_in_ms > 0:
                    audio_chain.append(f"afade=t=in:st=0:d={fade_in_ms / 1000:.3f}")
                if fade_out_ms > 0 and clip_duration > 0:
                    fade_out_start = max(0, clip_duration - fade_out_ms / 1000)
                    audio_chain.append(f"afade=t=out:st={fade_out_start:.3f}:d={fade_out_ms / 1000:.3f}")

                audio_trim = ",".join(audio_chain[1:])
                filter_parts.append(f"{audio_chain[0]}{audio_trim}[{alabel}]")
                audio_parts.append(f"[{alabel}]")

            elif track_type == "audio":
                alabel = f"a{input_index}"
                audio_chain = [
                    f"[{input_index}:a]",
                    f"atrim=start={trim_start}:end={trim_end}",
                    "asetpts=PTS-STARTPTS",
                ]
                atempo_chain = _build_atempo_chain(speed)
                audio_chain.extend(atempo_chain)

                # Apply audio fade in/out
                if fade_in_ms > 0:
                    audio_chain.append(f"afade=t=in:st=0:d={fade_in_ms / 1000:.3f}")
                if fade_out_ms > 0 and clip_duration > 0:
                    fade_out_start = max(0, clip_duration - fade_out_ms / 1000)
                    audio_chain.append(f"afade=t=out:st={fade_out_start:.3f}:d={fade_out_ms / 1000:.3f}")

                audio_trim = ",".join(audio_chain[1:])
                filter_parts.append(f"{audio_chain[0]}{audio_trim}[{alabel}]")
                audio_parts.append(f"[{alabel}]")

            input_index += 1

    # Concatenate video segments
    if video_overlays:
        n = len(video_overlays)
        concat_video = (
            "".join(video_overlays)
            + f"concat=n={n}:v=1:a=0[outv]"
        )
        filter_parts.append(concat_video)

    # Sticker overlays
    sticker_overlays: list[dict[str, Any]] = []
    for track in tracks:
        if track.get("type") != "sticker":
            continue
        for clip in track.get("clips", []):
            sticker_overlays.append(clip)

    current_video_label = "outv"
    for idx, sticker_clip in enumerate(sticker_overlays):
        source = sticker_clip["source"]
        cmd.extend(["-i", source])
        sticker_input = input_index

        start_sec = sticker_clip.get("start_ms", 0) / 1000.0
        end_sec = sticker_clip.get("end_ms", 0) / 1000.0
        pos_x = sticker_clip.get("position_x", 0.5)
        pos_y = sticker_clip.get("position_y", 0.5)
        scale_x = sticker_clip.get("scale_x", 1.0)
        scale_y = sticker_clip.get("scale_y", 1.0)

        next_label = f"stk{idx}"

        # Scale sticker, then overlay with position and time enable
        x_expr = f"{pos_x}*{width}-overlay_w/2"
        y_expr = f"{pos_y}*{height}-overlay_h/2"

        scale_filter = ""
        if abs(scale_x - 1.0) > 0.01 or abs(scale_y - 1.0) > 0.01:
            scale_filter = f"[{sticker_input}:v]scale=iw*{scale_x:.2f}:ih*{scale_y:.2f}[stk_s{idx}];"
            sticker_ref = f"[stk_s{idx}]"
        else:
            sticker_ref = f"[{sticker_input}:v]"

        overlay_filter = (
            f"{scale_filter}"
            f"[{current_video_label}]{sticker_ref}"
            f"overlay=x='{x_expr}':y='{y_expr}'"
            f":enable='between(t,{start_sec:.3f},{end_sec:.3f})'"
            f"[{next_label}]"
        )
        filter_parts.append(overlay_filter)
        current_video_label = next_label
        input_index += 1

    # Replace outv with final sticker label if stickers were added
    if sticker_overlays and video_overlays:
        # Update outv reference for subtitle burn-in and final mapping
        pass  # current_video_label already points to the right label

    # Subtitle burn-in (if subtitle segments provided)
    subtitle_segments = project_data.get("subtitle_segments")
    srt_path: str | None = None
    if subtitle_segments and video_overlays:
        include_translated = project_data.get("subtitle_bilingual", True)
        srt_path = _generate_temp_srt(subtitle_segments, include_translated)
        # Escape path for FFmpeg filter (colons, backslashes, single quotes)
        escaped_path = srt_path.replace("\\", "\\\\").replace(":", "\\:")
        style = (
            "FontSize=24,PrimaryColour=&H00FFFFFF,"
            "OutlineColour=&H00000000,Outline=2,"
            "FontName=Noto Sans TC"
        )
        filter_parts.append(
            f"[{current_video_label}]subtitles=filename='{escaped_path}'"
            f":force_style='{style}'[outsv]"
        )

    # Concatenate / mix audio segments
    if audio_parts:
        n = len(audio_parts)
        if n == 1:
            concat_audio = f"{audio_parts[0]}anull[outa]"
        else:
            concat_audio = (
                "".join(audio_parts)
                + f"concat=n={n}:v=0:a=1[outa]"
            )
        filter_parts.append(concat_audio)

    # Assemble filter_complex
    if filter_parts:
        cmd.extend(["-filter_complex", ";".join(filter_parts)])

    if video_overlays:
        video_label = "[outsv]" if srt_path else f"[{current_video_label}]"
        cmd.extend(["-map", video_label])
    if audio_parts:
        cmd.extend(["-map", "[outa]"])

    # Output encoding settings
    cmd.extend([
        "-c:v", codec,
        "-preset", preset,
        "-crf", str(crf),
        "-c:a", audio_codec,
        "-b:a", "192k",
        "-r", str(fps),
        "-movflags", "+faststart",
        output_path,
    ])

    return cmd


# ---------------------------------------------------------------------------
# Audio processing helpers
# ---------------------------------------------------------------------------

def apply_noise_reduction(input_path: str, output_path: str) -> str:
    """Apply RNNoise-based noise reduction via ffmpeg's ``arnndn`` filter.

    Returns the *output_path* on success.
    """
    cmd = [
        "ffmpeg",
        "-y",
        "-i", input_path,
        "-af", "arnndn=m=cb.rnnn",
        "-c:v", "copy",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        # Fallback: try the highpass/lowpass approach if arnndn is unavailable
        logger.warning(
            "arnndn filter not available, falling back to highpass+lowpass: %s",
            result.stderr,
        )
        cmd_fallback = [
            "ffmpeg",
            "-y",
            "-i", input_path,
            "-af", "highpass=f=200,lowpass=f=3000,afftdn=nf=-25",
            "-c:v", "copy",
            output_path,
        ]
        subprocess.run(cmd_fallback, capture_output=True, text=True, check=True)
    return output_path


def apply_loudnorm(
    input_path: str,
    output_path: str,
    target_lufs: float = -14.0,
) -> str:
    """Apply EBU R128 loudness normalisation using a two-pass approach.

    Pass 1 measures the current loudness; pass 2 applies corrections to
    reach ``target_lufs`` LUFS.

    Returns the *output_path* on success.
    """
    # --- Pass 1: measure ---
    cmd_pass1 = [
        "ffmpeg",
        "-y",
        "-i", input_path,
        "-af",
        f"loudnorm=I={target_lufs}:TP=-1.5:LRA=11:print_format=json",
        "-f", "null",
        "-",
    ]
    result_pass1 = subprocess.run(
        cmd_pass1, capture_output=True, text=True, check=True,
    )

    # Parse measured loudness values from stderr
    stderr = result_pass1.stderr
    json_start = stderr.rfind("{")
    json_end = stderr.rfind("}") + 1
    if json_start == -1 or json_end == 0:
        raise RuntimeError("Failed to parse loudnorm measurement output")
    measured = json.loads(stderr[json_start:json_end])

    input_i = measured["input_i"]
    input_tp = measured["input_tp"]
    input_lra = measured["input_lra"]
    input_thresh = measured["input_thresh"]
    target_offset = measured["target_offset"]

    # --- Pass 2: apply ---
    cmd_pass2 = [
        "ffmpeg",
        "-y",
        "-i", input_path,
        "-af",
        (
            f"loudnorm=I={target_lufs}:TP=-1.5:LRA=11:"
            f"measured_I={input_i}:"
            f"measured_TP={input_tp}:"
            f"measured_LRA={input_lra}:"
            f"measured_thresh={input_thresh}:"
            f"offset={target_offset}:"
            f"linear=true:print_format=summary"
        ),
        "-c:v", "copy",
        output_path,
    ]
    subprocess.run(cmd_pass2, capture_output=True, text=True, check=True)
    return output_path


# ---------------------------------------------------------------------------
# Silence-based audio splitting
# ---------------------------------------------------------------------------

def split_audio_at_silence(
    input_path: str,
    max_size_mb: int = 24,
) -> list[str]:
    """Split an audio file at silence points so that each resulting chunk
    is smaller than *max_size_mb* megabytes.

    This is used to keep files under the OpenAI Whisper 25 MB upload limit.
    Returns a list of file paths for the produced chunks.
    """
    file_size_mb = os.path.getsize(input_path) / (1024 * 1024)
    if file_size_mb <= max_size_mb:
        return [input_path]

    # Step 1: detect silence timestamps
    cmd_detect = [
        "ffmpeg",
        "-i", input_path,
        "-af", "silencedetect=noise=-30dB:d=0.5",
        "-f", "null",
        "-",
    ]
    result = subprocess.run(cmd_detect, capture_output=True, text=True, check=True)

    silence_ends: list[float] = []
    for line in result.stderr.splitlines():
        match = re.search(r"silence_end:\s*([\d.]+)", line)
        if match:
            silence_ends.append(float(match.group(1)))

    if not silence_ends:
        # No silence detected -- fall back to fixed-duration splitting
        return _split_fixed_duration(input_path, max_size_mb)

    # Step 2: determine split points based on file-size ratio
    probe = probe_file(input_path)
    duration = float(probe["format"]["duration"])
    num_chunks = max(2, int(file_size_mb / max_size_mb) + 1)
    target_duration = duration / num_chunks

    split_points: list[float] = []
    next_target = target_duration
    for se in silence_ends:
        if se >= next_target:
            split_points.append(se)
            next_target = se + target_duration

    # Step 3: split
    chunks: list[str] = []
    tmpdir = tempfile.mkdtemp(prefix="audio_split_")
    ext = Path(input_path).suffix or ".wav"

    start = 0.0
    for i, sp in enumerate(split_points):
        chunk_path = os.path.join(tmpdir, f"chunk_{i:03d}{ext}")
        cmd_split = [
            "ffmpeg", "-y",
            "-i", input_path,
            "-ss", str(start),
            "-to", str(sp),
            "-c", "copy",
            chunk_path,
        ]
        subprocess.run(cmd_split, capture_output=True, text=True, check=True)
        chunks.append(chunk_path)
        start = sp

    # Final remaining chunk
    last_chunk = os.path.join(tmpdir, f"chunk_{len(split_points):03d}{ext}")
    cmd_last = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-ss", str(start),
        "-c", "copy",
        last_chunk,
    ]
    subprocess.run(cmd_last, capture_output=True, text=True, check=True)
    chunks.append(last_chunk)

    return chunks


def _split_fixed_duration(
    input_path: str,
    max_size_mb: int,
) -> list[str]:
    """Fallback: split by fixed segment duration when no silence is found."""
    probe = probe_file(input_path)
    duration = float(probe["format"]["duration"])
    file_size_mb = os.path.getsize(input_path) / (1024 * 1024)
    num_chunks = max(2, int(file_size_mb / max_size_mb) + 1)
    segment_duration = duration / num_chunks

    tmpdir = tempfile.mkdtemp(prefix="audio_split_fixed_")
    ext = Path(input_path).suffix or ".wav"
    chunks: list[str] = []

    for i in range(num_chunks):
        start = i * segment_duration
        chunk_path = os.path.join(tmpdir, f"chunk_{i:03d}{ext}")
        cmd = [
            "ffmpeg", "-y",
            "-i", input_path,
            "-ss", str(start),
            "-t", str(segment_duration),
            "-c", "copy",
            chunk_path,
        ]
        subprocess.run(cmd, capture_output=True, text=True, check=True)
        chunks.append(chunk_path)

    return chunks
