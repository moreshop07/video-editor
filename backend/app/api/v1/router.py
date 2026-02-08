from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.analysis import router as analysis_router
from app.api.v1.assets import router as assets_router
from app.api.v1.auth import router as auth_router
from app.api.v1.ai_video import router as ai_video_router
from app.api.v1.auto_edit import router as auto_edit_router
from app.api.v1.downloads import router as downloads_router
from app.api.v1.effects import router as effects_router
from app.api.v1.external import router as external_router
from app.api.v1.music import router as music_router
from app.api.v1.processing import router as processing_router
from app.api.v1.projects import router as projects_router
from app.api.v1.stickers import router as stickers_router
from app.api.v1.subtitles import router as subtitles_router
from app.api.v1.tts import router as tts_router
from app.api.v1.websocket import router as websocket_router

api_v1_router = APIRouter()

api_v1_router.include_router(auth_router)
api_v1_router.include_router(projects_router)
api_v1_router.include_router(assets_router)
api_v1_router.include_router(subtitles_router)
api_v1_router.include_router(music_router)
api_v1_router.include_router(processing_router)
api_v1_router.include_router(effects_router)
api_v1_router.include_router(stickers_router)
api_v1_router.include_router(external_router)
api_v1_router.include_router(websocket_router)
api_v1_router.include_router(downloads_router)
api_v1_router.include_router(analysis_router)
api_v1_router.include_router(tts_router)
api_v1_router.include_router(auto_edit_router)
api_v1_router.include_router(ai_video_router)
