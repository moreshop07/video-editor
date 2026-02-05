"""Unit tests for the FFmpeg service helpers (no DB or external services needed)."""

import os

import pytest

from app.services.ffmpeg import (
    _build_atempo_chain,
    _generate_temp_srt,
    build_effect_filters,
    build_export_command,
)


# ---------------------------------------------------------------------------
# build_effect_filters
# ---------------------------------------------------------------------------

class TestBuildEffectFilters:
    def test_blur(self):
        filters = {"effects": [{"id": "blur", "value": 5, "enabled": True}]}
        result = build_effect_filters(filters)
        assert result == ["boxblur=5:5"]

    def test_disabled_effect(self):
        filters = {"effects": [{"id": "blur", "value": 5, "enabled": False}]}
        result = build_effect_filters(filters)
        assert result == []

    def test_brightness(self):
        filters = {"effects": [{"id": "brightness", "value": 1.5, "enabled": True}]}
        result = build_effect_filters(filters)
        assert len(result) == 1
        assert "eq=brightness=0.50" in result[0]

    def test_none_input(self):
        assert build_effect_filters(None) == []

    def test_empty_effects(self):
        assert build_effect_filters({"effects": []}) == []


# ---------------------------------------------------------------------------
# _build_atempo_chain
# ---------------------------------------------------------------------------

class TestBuildAtempoChain:
    def test_normal_speed(self):
        assert _build_atempo_chain(1.0) == []

    def test_fast_speed(self):
        result = _build_atempo_chain(2.0)
        assert result == ["atempo=2.0000"]

    def test_very_slow_speed(self):
        """Speed 0.25 requires chaining because atempo min is 0.5."""
        result = _build_atempo_chain(0.25)
        # 0.25 → atempo=0.5, remaining=0.5 → atempo=0.5000
        assert len(result) == 2
        assert result[0] == "atempo=0.5"
        assert result[1].startswith("atempo=")

    def test_moderate_slow(self):
        result = _build_atempo_chain(0.5)
        assert result == ["atempo=0.5000"]


# ---------------------------------------------------------------------------
# _generate_temp_srt
# ---------------------------------------------------------------------------

class TestGenerateTempSrt:
    def test_basic_srt(self):
        segments = [
            {"start_ms": 0, "end_ms": 2000, "text": "Hello"},
            {"start_ms": 2000, "end_ms": 4500, "text": "World"},
        ]
        srt_path = _generate_temp_srt(segments)
        try:
            with open(srt_path, encoding="utf-8") as f:
                content = f.read()
            assert "1\n" in content
            assert "00:00:00,000 --> 00:00:02,000" in content
            assert "Hello" in content
            assert "2\n" in content
            assert "World" in content
        finally:
            os.unlink(srt_path)

    def test_bilingual(self):
        segments = [
            {
                "start_ms": 0,
                "end_ms": 3000,
                "text": "Hello",
                "translated_text": "Bonjour",
            },
        ]
        srt_path = _generate_temp_srt(segments, include_translated=True)
        try:
            with open(srt_path, encoding="utf-8") as f:
                content = f.read()
            assert "Hello" in content
            assert "Bonjour" in content
        finally:
            os.unlink(srt_path)


# ---------------------------------------------------------------------------
# build_export_command
# ---------------------------------------------------------------------------

class TestBuildExportCommand:
    def test_basic_command(self):
        project_data = {
            "timeline": {
                "tracks": [
                    {
                        "type": "video",
                        "clips": [
                            {
                                "source": "/tmp/input.mp4",
                                "start_ms": 0,
                                "end_ms": 5000,
                                "trim_start_ms": 0,
                                "trim_end_ms": 5000,
                            }
                        ],
                    }
                ]
            },
            "output": {
                "width": 1280,
                "height": 720,
                "fps": 30,
                "codec": "libx264",
                "audio_codec": "aac",
                "preset": "fast",
                "crf": 23,
            },
        }
        cmd = build_export_command(project_data, "/tmp/output.mp4")

        assert cmd[0] == "ffmpeg"
        assert "-y" in cmd
        assert "/tmp/input.mp4" in cmd
        assert "-filter_complex" in cmd
        assert "/tmp/output.mp4" == cmd[-1]
        assert "-c:v" in cmd
        assert "libx264" in cmd

    def test_empty_project(self):
        cmd = build_export_command({}, "/tmp/out.mp4")
        assert cmd[0] == "ffmpeg"
        assert "/tmp/out.mp4" == cmd[-1]
