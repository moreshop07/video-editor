from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class UserTemplateCreate(BaseModel):
    name: str = Field(..., max_length=255)
    description: Optional[str] = None
    category: str = Field("custom", max_length=50)
    template_data: Dict[str, Any]
    width: int = 1920
    height: int = 1080
    fps: float = 30.0


class UserTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    category: Optional[str] = Field(None, max_length=50)


class UserTemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    name: str
    description: Optional[str] = None
    category: str
    thumbnail_url: Optional[str] = None
    template_data: Dict[str, Any]
    width: int
    height: int
    fps: float
    created_at: datetime
    updated_at: datetime


class UserTemplateListResponse(BaseModel):
    templates: List[UserTemplateResponse]
