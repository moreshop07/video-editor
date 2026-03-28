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


class FullPipelineRequest(BaseModel):
    """一鍵全流程：素材 → 辨識 → 翻譯 → 匯出 9:16 MP4"""
    project_id: int
    asset_object_path: str           # MinIO path: /{bucket}/{object}
    language: str = "zh"             # source language
    target_language: str = "en"      # translation target
    include_english_export: bool = True
    subtitle_role: str = "main"      # preset color role
    subtitle_tier: str = "subtitle"  # preset size tier


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
