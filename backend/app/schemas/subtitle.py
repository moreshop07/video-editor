from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict


class SubtitleGenerateRequest(BaseModel):
    project_id: int
    asset_id: int
    language: str = "zh-TW"
    provider: str = "openai"  # "openai" or "whisper_local"


class SubtitleTranslateRequest(BaseModel):
    track_id: int
    target_language: str = "en"
    context_hint: Optional[str] = None
    provider: str = "gpt4"  # "gpt4" or "claude"


class CaptionStyle(BaseModel):
    fontSize: Optional[float] = None
    fontFamily: Optional[str] = None
    fontColor: Optional[str] = None
    fontWeight: Optional[str] = None
    bgColor: Optional[str] = None
    bgOpacity: Optional[float] = None
    position: Optional[str] = None  # "top", "center", "bottom"
    outline: Optional[bool] = None


class TrackStyleUpdate(BaseModel):
    style: CaptionStyle


class SpeakerDetectRequest(BaseModel):
    track_id: int


class SoundDescribeRequest(BaseModel):
    track_id: int
    asset_id: int


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
    style: Optional[Dict] = None
    segments: List[SubtitleSegmentResponse]
    created_at: datetime


class SubtitleSegmentUpdate(BaseModel):
    text: Optional[str] = None
    translated_text: Optional[str] = None
    start_ms: Optional[int] = None
    end_ms: Optional[int] = None
