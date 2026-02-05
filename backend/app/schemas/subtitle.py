from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict


class SubtitleGenerateRequest(BaseModel):
    project_id: int
    asset_id: int
    language: str = "zh-TW"


class SubtitleTranslateRequest(BaseModel):
    track_id: int
    target_language: str = "en"
    context_hint: Optional[str] = None


class SubtitleSegmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    index: int
    start_ms: int
    end_ms: int
    text: str
    translated_text: Optional[str]
    word_timestamps: Optional[List[Dict]]
    speaker: Optional[str]
    confidence: float


class SubtitleTrackResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    language: str
    label: str
    is_auto_generated: bool
    segments: List[SubtitleSegmentResponse]
    created_at: datetime


class SubtitleSegmentUpdate(BaseModel):
    text: Optional[str] = None
    translated_text: Optional[str] = None
    start_ms: Optional[int] = None
    end_ms: Optional[int] = None
