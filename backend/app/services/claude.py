"""Anthropic Claude translation service.

Synchronous functions designed to run inside Celery worker tasks.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

_client: Any = None


def _get_client() -> Any:
    """Return a lazily-initialised Anthropic client."""
    global _client  # noqa: PLW0603
    if _client is None:
        from anthropic import Anthropic
        _client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _client


def translate_with_claude(
    segments: list[dict[str, Any]],
    source_lang: str,
    target_lang: str,
) -> list[str]:
    """Translate subtitle segments using Anthropic Claude.

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
    batch_size = 15
    translated: list[str] = []

    system_prompt = (
        f"You are a professional subtitle translator. "
        f"Translate from {source_lang} to {target_lang}. "
        f"Rules: "
        f"1) Maintain consistent terminology across segments. "
        f"2) Use natural subtitle length — concise but complete. "
        f"3) Adapt cultural references when appropriate. "
        f"4) Use context from surrounding segments for coherence. "
        f"Return ONLY a JSON array of translated strings, one per input segment. "
        f"No commentary or explanations."
    )

    for batch_start in range(0, len(segments), batch_size):
        batch = segments[batch_start : batch_start + batch_size]

        # Build numbered segment list
        lines: list[str] = []
        for i, seg in enumerate(batch):
            lines.append(f"{i + 1}. {seg['text']}")

        # Include surrounding context
        user_msg = ""
        if batch_start > 0:
            prev = segments[max(0, batch_start - 3) : batch_start]
            context_before = " | ".join(s["text"] for s in prev)
            user_msg += f"[Previous context]: {context_before}\n\n"

        user_msg += "Translate the following segments:\n" + "\n".join(lines)

        after_start = batch_start + batch_size
        if after_start < len(segments):
            nxt = segments[after_start : after_start + 3]
            context_after = " | ".join(s["text"] for s in nxt)
            user_msg += f"\n\n[Following context]: {context_after}"

        response = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=4096,
            system=system_prompt,
            messages=[{"role": "user", "content": user_msg}],
        )

        reply = response.content[0].text.strip()

        try:
            batch_translations = json.loads(reply)
            if not isinstance(batch_translations, list):
                raise ValueError("Expected a JSON array")
        except (json.JSONDecodeError, ValueError):
            logger.warning(
                "Claude did not return valid JSON for translation batch; "
                "falling back to line-by-line parsing."
            )
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

        while len(batch_translations) < len(batch):
            batch_translations.append("")

        translated.extend(batch_translations[: len(batch)])

    return translated
