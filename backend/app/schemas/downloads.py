from datetime import datetime
from typing import Dict, Optional

from pydantic import BaseModel, ConfigDict


class DownloadRequest(BaseModel):
    url: str


class DownloadResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_url: str
    platform: str
    title: Optional[str]
    asset_id: Optional[int]
    metadata_info: Optional[Dict]
    created_at: datetime
