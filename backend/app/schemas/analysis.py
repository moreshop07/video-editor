from datetime import datetime
from typing import Dict, Optional

from pydantic import BaseModel, ConfigDict


class AnalysisRequest(BaseModel):
    asset_id: int
    project_id: Optional[int] = None


class AnalysisResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: Optional[int]
    asset_id: int
    scenes: Optional[Dict]
    audio_analysis: Optional[Dict]
    hook_analysis: Optional[Dict]
    rhythm_analysis: Optional[Dict]
    created_at: datetime
