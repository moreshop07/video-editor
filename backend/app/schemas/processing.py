from datetime import datetime
from typing import Dict, Optional

from pydantic import BaseModel, ConfigDict


class ExportRequest(BaseModel):
    project_id: int
    format: str = "mp4"
    quality: str = "high"
    resolution: Optional[str] = None
    include_subtitles: bool = False
    subtitle_track_id: Optional[int] = None


class AudioProcessRequest(BaseModel):
    asset_id: int
    operation: str
    params: Dict = {}


class JobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_type: str
    status: str
    progress: float
    result: Optional[Dict]
    error_message: Optional[str]
    created_at: datetime
    updated_at: datetime
