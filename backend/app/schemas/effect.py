from datetime import datetime
from typing import Dict, Optional

from pydantic import BaseModel, ConfigDict


class EffectPresetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    category: str
    params: Dict
    thumbnail_url: Optional[str]
    is_system: bool
    created_at: datetime


class EffectPresetCreate(BaseModel):
    name: str
    category: str
    params: Dict
