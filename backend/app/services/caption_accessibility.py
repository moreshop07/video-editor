"""Caption accessibility services: speaker detection + sound description.

Synchronous functions designed to run inside Celery worker tasks.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import librosa
import numpy as np
from openai import OpenAI

from app.core.config import settings

logger = logging.getLogger(__name__)


def _get_openai_client() -> OpenAI:
    return OpenAI(api_key=settings.OPENAI_API_KEY)


# ---------------------------------------------------------------------------
# Speaker Detection
# ---------------------------------------------------------------------------


def detect_speakers(
    segments: list[dict[str, Any]],
) -> list[dict[str, str]]:
    """Use GPT-4 to identify and label speakers from transcribed segments.

    Args:
        segments: List of dicts with keys ``index`` and ``text``.

    Returns:
        List of dicts ``[{index, speaker}]`` with inferred speaker labels.
    """
    if not segments:
        return []

    client = _get_openai_client()

    segment_texts = []
    for seg in segments:
        segment_texts.append(f"[{seg['index']}] {seg['text']}")

    prompt = (
        "You are a speaker identification assistant. Given the following "
        "transcribed subtitle segments from a video, identify distinct speakers "
        "and assign labels like 'Speaker A', 'Speaker B', etc. If you can infer "
        "names or roles (e.g., 'Host', 'Guest', 'Narrator'), use those instead.\n\n"
        "Segments:\n"
        + "\n".join(segment_texts)
        + "\n\nReturn a JSON array of objects: "
        '[{"index": <number>, "speaker": "<label>"}] '
        "for each segment. Return ONLY the JSON array, no other text."
    )

    response = client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=4096,
    )

    content = response.choices[0].message.content or "[]"
    content = content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1]
        content = content.rsplit("```", 1)[0]

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        logger.warning("Failed to parse speaker detection response: %s", content[:200])
        return []


# ---------------------------------------------------------------------------
# Sound Description
# ---------------------------------------------------------------------------

SOUND_LABELS = [
    "MUSIC",
    "APPLAUSE",
    "LAUGHTER",
    "SILENCE",
    "CROWD_NOISE",
    "PHONE_RINGING",
    "DOOR_KNOCKING",
    "TYPING",
    "FOOTSTEPS",
    "BIRD_CHIRPING",
    "TRAFFIC",
    "RAIN",
    "THUNDER",
    "DOG_BARKING",
]


def detect_sound_events(
    audio_path: str,
    segments: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Detect non-speech audio events in gaps between subtitle segments.

    Uses librosa for audio feature extraction + GPT-4 for labeling.

    Args:
        audio_path: Path to WAV/audio file.
        segments: Existing subtitle segments ``[{start_ms, end_ms, text}]``.

    Returns:
        Description segments ``[{start_ms, end_ms, text: "[LABEL]"}]``.
    """
    y, sr = librosa.load(audio_path, sr=22050, mono=True)
    total_duration_ms = int(len(y) / sr * 1000)

    # Find gaps >500ms between existing subtitle segments
    gaps: list[dict[str, int]] = []
    sorted_segs = sorted(segments, key=lambda s: s["start_ms"])

    if sorted_segs and sorted_segs[0]["start_ms"] > 500:
        gaps.append({"start_ms": 0, "end_ms": sorted_segs[0]["start_ms"]})

    for i in range(len(sorted_segs) - 1):
        gap_start = sorted_segs[i]["end_ms"]
        gap_end = sorted_segs[i + 1]["start_ms"]
        if gap_end - gap_start > 500:
            gaps.append({"start_ms": gap_start, "end_ms": gap_end})

    if sorted_segs and total_duration_ms - sorted_segs[-1]["end_ms"] > 500:
        gaps.append({"start_ms": sorted_segs[-1]["end_ms"], "end_ms": total_duration_ms})

    if not gaps:
        return []

    # Extract audio features for each gap
    gap_features = []
    for gap in gaps:
        start_sample = int(gap["start_ms"] / 1000 * sr)
        end_sample = int(gap["end_ms"] / 1000 * sr)
        segment_audio = y[start_sample:end_sample]

        if len(segment_audio) < int(sr * 0.1):
            continue

        rms = float(np.mean(librosa.feature.rms(y=segment_audio)))
        zcr = float(np.mean(librosa.feature.zero_crossing_rate(segment_audio)))
        spectral_centroid = float(
            np.mean(librosa.feature.spectral_centroid(y=segment_audio, sr=sr))
        )
        mfcc = librosa.feature.mfcc(y=segment_audio, sr=sr, n_mfcc=5)
        mfcc_means = [float(np.mean(m)) for m in mfcc]

        gap_features.append(
            {
                **gap,
                "rms": round(rms, 4),
                "zcr": round(zcr, 4),
                "spectral_centroid": round(spectral_centroid, 2),
                "mfcc": [round(v, 2) for v in mfcc_means],
            }
        )

    if not gap_features:
        return []

    # Use GPT-4 to classify each gap
    client = _get_openai_client()
    prompt = (
        "You are an audio event classifier for video accessibility. "
        "Given audio features for non-speech gaps in a video, classify each gap "
        f"with one of these labels: {', '.join(SOUND_LABELS)}.\n\n"
        "Gap features:\n"
        + json.dumps(gap_features, indent=2)
        + '\n\nReturn a JSON array: [{"start_ms": <n>, "end_ms": <n>, "label": "<LABEL>"}]. '
        "Only include gaps that have a clear identifiable sound. Skip gaps that "
        "are just ambient noise or silence. Return ONLY the JSON array."
    )

    response = client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=2048,
    )

    content = response.choices[0].message.content or "[]"
    content = content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1]
        content = content.rsplit("```", 1)[0]

    try:
        labeled_gaps = json.loads(content)
    except json.JSONDecodeError:
        logger.warning("Failed to parse sound event response: %s", content[:200])
        return []

    description_segments = []
    for gap in labeled_gaps:
        description_segments.append(
            {
                "start_ms": gap["start_ms"],
                "end_ms": gap["end_ms"],
                "text": f"[{gap['label']}]",
            }
        )

    return description_segments
