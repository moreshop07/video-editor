from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class StickerPackResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str]
    thumbnail_url: Optional[str]
    is_premium: bool
    sticker_count: int = 0


class StickerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pack_id: int
    name: str
    file_path: str
    file_format: str
    width: int
    height: int
    duration_ms: Optional[int]
    tags: List[str]
