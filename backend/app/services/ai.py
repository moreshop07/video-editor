"""OpenAI service helpers for transcription, translation, and mood analysis.

All functions are **synchronous** so they can be called directly from Celery
worker tasks.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from openai import OpenAI

from app.core.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------

_client: OpenAI | None = None


def _get_client() -> OpenAI:
    """Return a lazily-initialised OpenAI client."""
    global _client  # noqa: PLW0603
    if _client is None:
        _client = OpenAI(api_key=settings.OPENAI_API_KEY)
    return _client


# ---------------------------------------------------------------------------
# Whisper transcription
# ---------------------------------------------------------------------------

def transcribe_audio(
    file_path: str,
    language: str = "zh",
) -> dict[str, Any]:
    """Transcribe an audio file using the OpenAI Whisper API.

    Parameters
    ----------
    file_path:
        Path to the audio file on disk.
    language:
        ISO-639-1 language code hint (default ``"zh"`` for Chinese).

    Returns
    -------
    dict
        The full Whisper ``verbose_json`` response which includes
        ``"segments"`` with word-level timestamps.
    """
    client = _get_client()

    with open(file_path, "rb") as audio_file:
        response = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            language=language,
            response_format="verbose_json",
            timestamp_granularities=["word"],
        )

    # The response object is a Pydantic model; convert to plain dict.
    if hasattr(response, "model_dump"):
        return response.model_dump()
    # Fallback for older SDK versions
    return json.loads(response.json()) if hasattr(response, "json") else dict(response)


# ---------------------------------------------------------------------------
# GPT-4 subtitle translation
# ---------------------------------------------------------------------------

def translate_segments(
    segments: list[dict[str, Any]],
    source_lang: str,
    target_lang: str,
) -> list[str]:
    """Translate a list of subtitle segments using GPT-4.

    Segments are processed in batches of up to 10 for context-consistent
    translations.  Each batch includes surrounding context so the model can
    produce coherent, natural-sounding subtitles.

    Parameters
    ----------
    segments:
        A list of dicts, each with at least a ``"text"`` key.
    source_lang:
        Human-readable source language name (e.g. ``"Chinese"``).
    target_lang:
        Human-readable target language name (e.g. ``"English"``).

    Returns
    -------
    list[str]
        Translated text for each segment, in the same order.
    """
    client = _get_client()
    batch_size = 10
    translated: list[str] = []

    system_prompt = (
        f"You are a professional subtitle translator. "
        f"Translate from {source_lang} to {target_lang}. "
        f"Maintain: "
        f"1) Consistent terminology "
        f"2) Cultural adaptation "
        f"3) Natural subtitle length "
        f"4) Context from surrounding segments. "
        f"Return ONLY a JSON array of translated strings, one per input segment. "
        f"Do not add commentary or explanations."
    )

    for batch_start in range(0, len(segments), batch_size):
        batch = segments[batch_start : batch_start + batch_size]

        # Build user message with numbered segments
        lines: list[str] = []
        for i, seg in enumerate(batch):
            lines.append(f"{i + 1}. {seg['text']}")

        # Include surrounding context
        context_before = ""
        if batch_start > 0:
            prev = segments[max(0, batch_start - 3) : batch_start]
            context_before = " | ".join(s["text"] for s in prev)

        context_after = ""
        after_start = batch_start + batch_size
        if after_start < len(segments):
            nxt = segments[after_start : after_start + 3]
            context_after = " | ".join(s["text"] for s in nxt)

        user_msg = ""
        if context_before:
            user_msg += f"[Previous context]: {context_before}\n\n"
        user_msg += "Translate the following segments:\n" + "\n".join(lines)
        if context_after:
            user_msg += f"\n\n[Following context]: {context_after}"

        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.3,
        )

        reply = response.choices[0].message.content.strip()

        # Parse the JSON array from the response
        try:
            batch_translations = json.loads(reply)
            if not isinstance(batch_translations, list):
                raise ValueError("Expected a JSON array")
        except (json.JSONDecodeError, ValueError):
            logger.warning(
                "GPT-4 did not return valid JSON for translation batch; "
                "falling back to line-by-line parsing."
            )
            # Fallback: split by newlines and strip numbering
            batch_translations = []
            for line in reply.splitlines():
                line = line.strip()
                if line:
                    # Remove leading "1. ", "2. " etc.
                    if len(line) > 2 and line[0].isdigit() and line[1] in (".", ")"):
                        line = line[2:].strip()
                    elif len(line) > 3 and line[:2].isdigit() and line[2] in (".", ")"):
                        line = line[3:].strip()
                    batch_translations.append(line)

        # Ensure we have the right number of translations
        while len(batch_translations) < len(batch):
            batch_translations.append("")

        translated.extend(batch_translations[: len(batch)])

    return translated


# ---------------------------------------------------------------------------
# Mood analysis for music matching
# ---------------------------------------------------------------------------

def analyze_mood(text: str) -> dict[str, Any]:
    """Analyse the mood / energy / tempo needs of a video based on its
    subtitle text and any mood hints.

    Parameters
    ----------
    text:
        Combined subtitle text and/or mood description of the video.

    Returns
    -------
    dict
        A dict with keys such as ``"mood_tags"``, ``"energy"`` (0-1),
        ``"tempo"`` (BPM range), and ``"genre_suggestions"``.
    """
    client = _get_client()

    system_prompt = (
        "You are a music supervisor for video production. "
        "Analyze the following video content description and determine the "
        "ideal background music characteristics. "
        "Return a JSON object with the following keys:\n"
        '- "mood_tags": list of mood tags (e.g. ["upbeat", "inspiring", "warm"])\n'
        '- "energy": float from 0.0 (calm) to 1.0 (intense)\n'
        '- "tempo_min": minimum BPM (integer)\n'
        '- "tempo_max": maximum BPM (integer)\n'
        '- "genre_suggestions": list of genre strings\n'
        '- "reasoning": brief explanation of your analysis\n'
        "Return ONLY the JSON object, no other text."
    )

    response = client.chat.completions.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text},
        ],
        temperature=0.5,
    )

    reply = response.choices[0].message.content.strip()

    try:
        return json.loads(reply)
    except json.JSONDecodeError:
        logger.error("Failed to parse mood analysis JSON: %s", reply)
        return {
            "mood_tags": [],
            "energy": 0.5,
            "tempo_min": 80,
            "tempo_max": 130,
            "genre_suggestions": [],
            "reasoning": "Failed to parse AI response.",
        }
