from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = None
    project_id: Optional[int] = None


class VoiceoverRequest(BaseModel):
    track_id: int
    voice: Optional[str] = None
    project_id: int


class VoiceResponse(BaseModel):
    voice_id: str
    label: str


class TTSVoicesResponse(BaseModel):
    voices: List[VoiceResponse]


# --- Voice Profile schemas ------------------------------------------------


class VoiceProfileCreate(BaseModel):
    name: str = Field(..., max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    provider: str = Field(..., pattern="^(edge_tts|fish_audio)$")
    provider_voice_id: str = Field(..., max_length=200)
    settings: Optional[Dict] = None


class VoiceProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    settings: Optional[Dict] = None
    is_default: Optional[bool] = None


class VoiceProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str] = None
    provider: str
    provider_voice_id: str
    settings: Optional[Dict] = None
    sample_audio_path: Optional[str] = None
    is_default: bool
    created_at: datetime


class VoiceProfileListResponse(BaseModel):
    profiles: List[VoiceProfileResponse]


class VoicePreviewRequest(BaseModel):
    text: str = Field(..., max_length=200)
    voice_profile_id: Optional[int] = None
    voice: Optional[str] = None


class VoiceoverMultiVoiceRequest(BaseModel):
    track_id: int
    project_id: int
    voice_profile_id: Optional[int] = None
    segment_voices: Optional[Dict[int, int]] = None


class TTSVoicesExtendedResponse(BaseModel):
    voices: List[VoiceResponse]
    fish_audio_available: bool
