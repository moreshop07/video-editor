"""Video analysis service: scene detection, audio analysis, hook analysis.

Synchronous functions designed to run inside Celery worker tasks.
Requires: scenedetect, librosa, numpy.
"""

from __future__ import annotations

import logging
import subprocess
import tempfile
from typing import Any

import librosa
import numpy as np

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Scene detection
# ---------------------------------------------------------------------------

def detect_scenes(
    video_path: str,
    threshold: float = 27.0,
) -> list[dict[str, Any]]:
    """Detect scene changes using PySceneDetect's ContentDetector.

    Returns a list of scene dicts: [{start, end, duration}].
    """
    from scenedetect import SceneManager, open_video
    from scenedetect.detectors import ContentDetector

    video = open_video(video_path)
    scene_manager = SceneManager()
    scene_manager.add_detector(ContentDetector(threshold=threshold))
    scene_manager.detect_scenes(video)
    scene_list = scene_manager.get_scene_list()

    scenes = []
    for start, end in scene_list:
        scenes.append({
            "start": start.get_seconds(),
            "end": end.get_seconds(),
            "duration": (end - start).get_seconds(),
        })

    return scenes


# ---------------------------------------------------------------------------
# Audio analysis
# ---------------------------------------------------------------------------

def _extract_audio(video_path: str) -> str:
    """Extract audio from video to a temporary WAV file."""
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.close()
    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-vn", "-ac", "1", "-ar", "22050",
        tmp.name,
    ]
    subprocess.run(cmd, capture_output=True, check=True)
    return tmp.name


def analyze_audio(video_path: str) -> dict[str, Any]:
    """Analyze audio characteristics using librosa.

    Returns dict with: rms, bpm, spectral_centroid, duration, energy_profile.
    """
    audio_path = _extract_audio(video_path)

    try:
        y, sr = librosa.load(audio_path, sr=22050)
        duration = librosa.get_duration(y=y, sr=sr)

        # RMS energy
        rms = librosa.feature.rms(y=y)[0]
        avg_rms = float(np.mean(rms))

        # BPM / tempo
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        bpm = float(tempo[0]) if hasattr(tempo, '__len__') else float(tempo)

        # Spectral centroid (brightness)
        spectral = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
        avg_spectral = float(np.mean(spectral))

        # Energy profile (split into 10 segments)
        n_segments = 10
        segment_len = len(rms) // n_segments
        energy_profile = []
        for i in range(n_segments):
            seg = rms[i * segment_len : (i + 1) * segment_len]
            energy_profile.append(float(np.mean(seg)) if len(seg) > 0 else 0.0)

        return {
            "duration": duration,
            "rms": avg_rms,
            "bpm": bpm,
            "spectral_centroid": avg_spectral,
            "energy_profile": energy_profile,
        }
    finally:
        import os
        os.unlink(audio_path)


# ---------------------------------------------------------------------------
# Hook analysis
# ---------------------------------------------------------------------------

_HOOK_TYPES = [
    "question", "statistic", "story", "controversy",
    "visual_shock", "promise", "challenge",
]


def analyze_hooks(
    video_path: str,
    scenes: list[dict[str, Any]],
) -> dict[str, Any]:
    """Analyze the first few seconds for hook effectiveness.

    Uses scene density and audio energy in the first 3-5 seconds
    to estimate hook quality.
    """
    audio_path = _extract_audio(video_path)

    try:
        y, sr = librosa.load(audio_path, sr=22050, duration=5.0)

        # RMS energy in first 5 seconds
        rms = librosa.feature.rms(y=y)[0]
        avg_energy = float(np.mean(rms))

        # Onset detection (how many "events" happen)
        onsets = librosa.onset.onset_detect(y=y, sr=sr)
        onset_density = len(onsets) / 5.0

        # Scene changes in first 5 seconds
        early_scenes = [s for s in scenes if s["start"] < 5.0]
        scene_density = len(early_scenes) / 5.0

        # Simple hook score (0-100)
        hook_score = min(100, int(
            (avg_energy * 200) +
            (onset_density * 15) +
            (scene_density * 20)
        ))

        return {
            "has_hook": hook_score > 40,
            "hook_score": hook_score,
            "energy_first_5s": avg_energy,
            "onset_density": onset_density,
            "scene_changes_first_5s": len(early_scenes),
        }
    finally:
        import os
        os.unlink(audio_path)


# ---------------------------------------------------------------------------
# Rhythm / pacing analysis
# ---------------------------------------------------------------------------

def analyze_rhythm(scenes: list[dict[str, Any]]) -> dict[str, Any]:
    """Analyze editing rhythm from scene list.

    Returns pacing metrics: avg_scene_duration, pace, variability.
    """
    if not scenes:
        return {
            "avg_scene_duration": 0,
            "pace": "unknown",
            "scene_count": 0,
            "variability": 0,
        }

    durations = [s["duration"] for s in scenes]
    avg_duration = float(np.mean(durations))
    std_duration = float(np.std(durations))

    # Classify pace
    if avg_duration < 2.0:
        pace = "very_fast"
    elif avg_duration < 4.0:
        pace = "fast"
    elif avg_duration < 8.0:
        pace = "moderate"
    elif avg_duration < 15.0:
        pace = "slow"
    else:
        pace = "very_slow"

    return {
        "avg_scene_duration": round(avg_duration, 2),
        "pace": pace,
        "scene_count": len(scenes),
        "variability": round(std_duration, 2),
        "shortest_scene": round(min(durations), 2),
        "longest_scene": round(max(durations), 2),
    }
