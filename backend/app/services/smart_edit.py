"""Smart auto-editing service: beat-sync, montage builder,
platform optimizer, highlight detection.

Synchronous functions designed to run inside Celery worker tasks.
"""

from __future__ import annotations

import logging
import os
import subprocess
import tempfile
from typing import Any

import librosa
import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PLATFORM_SPECS: dict[str, dict[str, Any]] = {
    "tiktok": {
        "width": 1080,
        "height": 1920,
        "aspect": "9:16",
        "max_duration_ms": 180_000,
        "recommended_duration_ms": 30_000,
        "fps": 30,
    },
    "youtube_shorts": {
        "width": 1080,
        "height": 1920,
        "aspect": "9:16",
        "max_duration_ms": 60_000,
        "recommended_duration_ms": 30_000,
        "fps": 30,
    },
    "instagram_reels": {
        "width": 1080,
        "height": 1920,
        "aspect": "9:16",
        "max_duration_ms": 90_000,
        "recommended_duration_ms": 30_000,
        "fps": 30,
    },
    "youtube": {
        "width": 1920,
        "height": 1080,
        "aspect": "16:9",
        "max_duration_ms": None,
        "recommended_duration_ms": None,
        "fps": 30,
    },
}

STYLE_PRESETS: dict[str, dict[str, Any]] = {
    "fast_paced": {
        "avg_clip_duration_ms": 1500,
        "transition_duration_ms": 200,
        "transition_type": "fade",
    },
    "cinematic": {
        "avg_clip_duration_ms": 4000,
        "transition_duration_ms": 800,
        "transition_type": "fade",
    },
    "slideshow": {
        "avg_clip_duration_ms": 5000,
        "transition_duration_ms": 1000,
        "transition_type": "fade",
    },
}


# ---------------------------------------------------------------------------
# Audio extraction helper
# ---------------------------------------------------------------------------

def extract_audio_to_wav(video_path: str) -> str:
    """Extract audio from video to a temporary WAV file (22050Hz, mono)."""
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.close()
    cmd = [
        "ffmpeg", "-y", "-i", video_path,
        "-vn", "-acodec", "pcm_s16le", "-ar", "22050", "-ac", "1",
        tmp.name,
    ]
    subprocess.run(cmd, capture_output=True, check=True)
    return tmp.name


# ---------------------------------------------------------------------------
# Beat-Sync Auto-Edit
# ---------------------------------------------------------------------------

def detect_beat_timestamps(
    audio_path: str,
    sensitivity: float = 1.0,
    min_clip_duration_ms: int = 500,
) -> list[float]:
    """Detect beat timestamps from an audio file using librosa.

    Returns a list of timestamps in milliseconds.
    ``sensitivity`` controls beat grouping (1.0=every beat, 2.0=every 2nd).
    """
    y, sr = librosa.load(audio_path, sr=22050)
    _tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    beat_times_sec = librosa.frames_to_time(beat_frames, sr=sr)

    # Apply sensitivity: pick every Nth beat
    step = max(1, round(sensitivity))
    filtered_beats = beat_times_sec[::step]

    # Convert to ms and filter by minimum clip duration
    beat_times_ms = [float(t * 1000) for t in filtered_beats]

    result: list[float] = []
    prev = 0.0
    for bt in beat_times_ms:
        if bt - prev >= min_clip_duration_ms:
            result.append(bt)
            prev = bt

    return result


def generate_beat_sync_clips(
    video_duration_ms: float,
    beat_timestamps_ms: list[float],
    asset_id: int,
    include_transitions: bool = True,
    transition_type: str = "fade",
) -> list[dict[str, Any]]:
    """Generate clip definitions cut at beat timestamps.

    Returns a list of clip dicts compatible with the frontend
    timelineStore.addClip() shape.
    """
    clips: list[dict[str, Any]] = []
    cut_points = [0.0] + beat_timestamps_ms
    cut_points = [p for p in cut_points if p < video_duration_ms]
    cut_points.append(video_duration_ms)

    for i in range(len(cut_points) - 1):
        start_ms = cut_points[i]
        end_ms = cut_points[i + 1]
        if end_ms - start_ms < 100:
            continue

        clip: dict[str, Any] = {
            "assetId": str(asset_id),
            "startTime": start_ms,
            "endTime": end_ms,
            "trimStart": start_ms,
            "trimEnd": 0,
            "duration": video_duration_ms,
            "name": f"Beat {i + 1}",
            "type": "video",
        }

        if include_transitions and i > 0:
            clip["transitionIn"] = {
                "type": transition_type,
                "durationMs": min(300, int((end_ms - start_ms) // 4)),
            }

        clips.append(clip)

    return clips


# ---------------------------------------------------------------------------
# Montage Builder
# ---------------------------------------------------------------------------

def build_montage_clips(
    assets: list[dict[str, Any]],
    style: str = "cinematic",
    target_duration_ms: int | None = None,
    include_transitions: bool = True,
) -> list[dict[str, Any]]:
    """Build a montage from multiple asset metadata dicts.

    Each asset dict should contain: id, duration_ms, asset_type, original_filename.
    Returns ordered clip dicts for timeline insertion.
    """
    preset = STYLE_PRESETS.get(style, STYLE_PRESETS["cinematic"])
    avg_clip_ms = preset["avg_clip_duration_ms"]
    trans_ms = preset["transition_duration_ms"]
    trans_type = preset["transition_type"]

    n_assets = len(assets)
    if target_duration_ms and n_assets > 0:
        per_clip_ms = target_duration_ms / n_assets
    else:
        per_clip_ms = avg_clip_ms

    clips: list[dict[str, Any]] = []
    timeline_cursor = 0.0

    for i, asset in enumerate(assets):
        asset_duration = asset.get("duration_ms") or 5000
        clip_duration = min(per_clip_ms, asset_duration)

        # For images, use the preset duration directly
        if asset.get("asset_type") == "image":
            clip_duration = per_clip_ms

        # Trim to center portion of source asset
        if asset_duration > clip_duration:
            trim_start = (asset_duration - clip_duration) / 2
        else:
            trim_start = 0
            clip_duration = asset_duration

        clip: dict[str, Any] = {
            "assetId": str(asset["id"]),
            "startTime": timeline_cursor,
            "endTime": timeline_cursor + clip_duration,
            "trimStart": trim_start,
            "trimEnd": 0,
            "duration": asset_duration,
            "name": asset.get("original_filename", f"Clip {i + 1}"),
            "type": "video" if asset.get("asset_type") != "image" else "image",
        }

        if include_transitions and i > 0:
            clip["transitionIn"] = {
                "type": trans_type,
                "durationMs": trans_ms,
            }

        clips.append(clip)
        timeline_cursor += clip_duration

    return clips


# ---------------------------------------------------------------------------
# Platform Optimizer
# ---------------------------------------------------------------------------

def compute_platform_adjustments(
    platform: str,
    current_duration_ms: float,
    current_width: int,
    current_height: int,
) -> dict[str, Any]:
    """Compute adjustments needed for a target platform.

    Returns a dict of recommended changes.
    """
    spec = PLATFORM_SPECS.get(platform, PLATFORM_SPECS["youtube"])
    result: dict[str, Any] = {
        "platform": platform,
        "target_width": spec["width"],
        "target_height": spec["height"],
        "target_aspect": spec["aspect"],
        "target_fps": spec["fps"],
        "needs_resize": (
            current_width != spec["width"] or current_height != spec["height"]
        ),
        "trim_to_ms": None,
        "speed_adjustment": 1.0,
    }

    max_dur = spec["max_duration_ms"]
    if max_dur and current_duration_ms > max_dur:
        result["trim_to_ms"] = max_dur
        ratio = current_duration_ms / max_dur
        if ratio <= 1.5:
            result["speed_adjustment"] = round(ratio, 2)

    return result


# ---------------------------------------------------------------------------
# Highlight Detection
# ---------------------------------------------------------------------------

def detect_highlights(
    video_path: str,
    scenes: list[dict[str, Any]],
    max_highlights: int = 5,
    min_duration_ms: int = 3000,
    max_duration_ms: int = 15000,
) -> list[dict[str, Any]]:
    """Detect highlight segments based on multi-signal scoring.

    Combines audio energy (RMS), onset strength (speech/events),
    spectral centroid (brightness), and scene change density.
    Returns ranked highlights: [{start_ms, end_ms, duration_ms, score, reasons}].
    """
    audio_path = extract_audio_to_wav(video_path)
    try:
        y, sr = librosa.load(audio_path, sr=22050)

        hop_length = 512
        rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
        spectral = librosa.feature.spectral_centroid(
            y=y, sr=sr, hop_length=hop_length
        )[0]
        onset_env = librosa.onset.onset_strength(
            y=y, sr=sr, hop_length=hop_length
        )

        def normalize(arr: np.ndarray) -> np.ndarray:
            mn, mx = float(arr.min()), float(arr.max())
            if mx - mn < 1e-6:
                return np.zeros_like(arr)
            return (arr - mn) / (mx - mn)

        min_len = min(len(rms), len(spectral), len(onset_env))
        rms_norm = normalize(rms[:min_len])
        spectral_norm = normalize(spectral[:min_len])
        onset_norm = normalize(onset_env[:min_len])

        # Composite score: weighted sum
        composite = 0.4 * rms_norm + 0.3 * onset_norm + 0.2 * spectral_norm

        # Add scene density bonus
        frame_times = librosa.frames_to_time(
            np.arange(min_len), sr=sr, hop_length=hop_length
        )
        scene_density = np.zeros(min_len)
        for scene in scenes:
            for idx, ft in enumerate(frame_times):
                if abs(ft - scene["start"]) < 1.0 or abs(ft - scene["end"]) < 1.0:
                    scene_density[idx] += 0.5
        scene_density_norm = normalize(scene_density)
        composite += 0.1 * scene_density_norm

        # Sliding windows to find high-scoring segments
        window_frames = int((min_duration_ms / 1000.0) * sr / hop_length)
        max_window_frames = int((max_duration_ms / 1000.0) * sr / hop_length)
        mid_window = (window_frames + max_window_frames) // 2

        candidates: list[dict[str, Any]] = []
        for win_size in [window_frames, mid_window, max_window_frames]:
            if win_size > min_len:
                continue
            scores = np.convolve(
                composite, np.ones(win_size) / win_size, mode="valid"
            )
            top_indices = np.argsort(scores)[::-1][: max_highlights * 3]
            for idx in top_indices:
                start_sec = float(frame_times[idx])
                end_idx = min(int(idx) + win_size, min_len - 1)
                end_sec = float(frame_times[end_idx])
                dur_ms = (end_sec - start_sec) * 1000

                if dur_ms < min_duration_ms or dur_ms > max_duration_ms:
                    continue

                candidates.append({
                    "start_ms": round(start_sec * 1000),
                    "end_ms": round(end_sec * 1000),
                    "duration_ms": round(dur_ms),
                    "score": round(float(scores[idx]), 4),
                    "start": round(start_sec, 2),
                    "end": round(end_sec, 2),
                })

        # De-duplicate overlapping candidates
        candidates.sort(key=lambda c: c["score"], reverse=True)
        highlights: list[dict[str, Any]] = []
        for c in candidates:
            overlap = any(
                c["start_ms"] < h["end_ms"] and c["end_ms"] > h["start_ms"]
                for h in highlights
            )
            if not overlap:
                highlights.append(c)
            if len(highlights) >= max_highlights:
                break

        highlights.sort(key=lambda h: h["start_ms"])

        # Add reason annotations
        for h in highlights:
            reasons: list[str] = []
            h_start_frame = int(h["start"] * sr / hop_length)
            h_end_frame = min(int(h["end"] * sr / hop_length), min_len)
            if h_end_frame <= h_start_frame:
                h["reasons"] = reasons
                continue

            seg_rms = float(np.mean(rms_norm[h_start_frame:h_end_frame]))
            seg_onset = float(np.mean(onset_norm[h_start_frame:h_end_frame]))
            seg_spectral = float(np.mean(spectral_norm[h_start_frame:h_end_frame]))

            if seg_rms > 0.6:
                reasons.append("high_energy")
            if seg_onset > 0.5:
                reasons.append("speech_activity")
            if seg_spectral > 0.5:
                reasons.append("audio_brightness")

            scene_changes = sum(
                1 for s in scenes if h["start"] <= s["start"] <= h["end"]
            )
            if scene_changes >= 2:
                reasons.append("scene_density")

            h["reasons"] = reasons

        return highlights

    finally:
        if os.path.exists(audio_path):
            os.unlink(audio_path)
