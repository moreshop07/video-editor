from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class MusicTrackResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    artist: str
    duration_ms: int
    bpm: float
    key_signature: str
    energy: float
    mood_tags: List[str]
    genre_tags: List[str]
    is_premium: bool
    license_type: str


class MusicSearchParams(BaseModel):
    query: Optional[str] = None
    mood: Optional[str] = None
    min_bpm: Optional[float] = None
    max_bpm: Optional[float] = None
    min_energy: Optional[float] = None
    max_energy: Optional[float] = None
    genre: Optional[str] = None
    page: int = 1
    per_page: int = 20


class MusicMatchRequest(BaseModel):
    project_id: int
    subtitle_text: Optional[str] = None
    preferred_mood: Optional[str] = None


class SoundEffectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    category: str
    duration_ms: int
    tags: List[str]
