from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class AssetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    filename: str
    original_filename: str
    file_size: int
    mime_type: str
    asset_type: str
    duration_ms: Optional[int]
    width: Optional[int]
    height: Optional[int]
    thumbnail_url: Optional[str]
    waveform_url: Optional[str]
    auto_tags: List[str]
    mood_tags: List[str]
    color_palette: List[str]
    created_at: datetime


class AssetSearchParams(BaseModel):
    query: Optional[str] = None
    asset_type: Optional[str] = None
    mood_tags: Optional[List[str]] = None
    auto_tags: Optional[List[str]] = None
    page: int = 1
    per_page: int = 20
