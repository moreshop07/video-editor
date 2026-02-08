from typing import Dict, List, Optional

from pydantic import BaseModel


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
