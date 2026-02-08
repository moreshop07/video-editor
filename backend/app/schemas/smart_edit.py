from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class BeatSyncRequest(BaseModel):
    """Beat-Sync Auto-Edit: cut video to music beats."""

    asset_id: int
    music_track_id: Optional[int] = None
    music_asset_id: Optional[int] = None
    project_id: Optional[int] = None
    sensitivity: float = Field(default=1.0, ge=0.1, le=3.0)
    min_clip_duration_ms: int = Field(default=500, ge=200, le=5000)
    include_transitions: bool = True
    transition_type: str = "fade"


class MontageRequest(BaseModel):
    """Montage Builder: assemble multiple assets into a timeline."""

    asset_ids: List[int] = Field(..., min_length=2)
    project_id: Optional[int] = None
    style: Literal["fast_paced", "cinematic", "slideshow"] = "cinematic"
    target_duration_ms: Optional[int] = None
    music_track_id: Optional[int] = None
    include_transitions: bool = True


class PlatformOptimizeRequest(BaseModel):
    """Platform Optimizer: adjust timeline for target platform."""

    project_id: int
    platform: Literal["tiktok", "youtube_shorts", "instagram_reels", "youtube"]
    asset_id: Optional[int] = None


class HighlightDetectRequest(BaseModel):
    """Highlight Detector: find interesting segments in a long video."""

    asset_id: int
    project_id: Optional[int] = None
    max_highlights: int = Field(default=5, ge=1, le=20)
    min_highlight_duration_ms: int = Field(default=3000, ge=1000, le=30000)
    max_highlight_duration_ms: int = Field(default=15000, ge=3000, le=60000)
