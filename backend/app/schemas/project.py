from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    width: int = 1920
    height: int = 1080
    fps: float = 30.0


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    fps: Optional[float] = None


class ProjectDataPatch(BaseModel):
    ops: List[Dict]


class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    name: str
    description: Optional[str]
    thumbnail_url: Optional[str]
    duration_ms: int
    width: int
    height: int
    fps: float
    created_at: datetime
    updated_at: datetime


class ProjectDetailResponse(ProjectResponse):
    project_data: Optional[Dict]
