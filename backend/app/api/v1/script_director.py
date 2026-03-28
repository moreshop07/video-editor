"""
AI 腳本導演 API 路由
====================
草稿 → 爆款短影音腳本（含鉤子、分鏡、CTA 設計）
使用 Anthropic Claude Sonnet API
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services.script_director import (
    Hook,
    HookLevel,
    ScriptDirectorResponse,
    ScriptGenerateRequest,
    script_director_service,
)

router = APIRouter(prefix="/script-director", tags=["script-director"])


# ============================================================
# Request Models
# ============================================================

class GenerateScriptRequest(BaseModel):
    """POST /api/v1/script-director/generate"""
    draft: str = Field(..., min_length=10, max_length=5000, description="原始草稿")
    duration: Optional[str] = Field(None, description="30-60s 或 60-90s，不填自動判斷")
    generate_both: bool = Field(True, description="同時產生兩種版本")
    hook_count: int = Field(3, ge=1, le=5, description="鉤子數量")
    target_audience: Optional[str] = Field(None, description="目標受眾")
    voice_dna: Optional[str] = Field(None, max_length=3000, description="Voice DNA 語氣說明書")


class RegenerateHooksRequest(BaseModel):
    """POST /api/v1/script-director/hooks"""
    draft: str = Field(..., min_length=10, max_length=5000)
    count: int = Field(5, ge=1, le=10)
    level: str = Field("S", description="S / A / B")


class OptimizeCTARequest(BaseModel):
    """POST /api/v1/script-director/cta"""
    script_text: str = Field(..., min_length=10, max_length=3000)
    target_action: str = Field("轉發", description="轉發 / 收藏 / 留言 / 追蹤")


# ============================================================
# Helpers
# ============================================================

def _check_api_key() -> None:
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Anthropic API key 未設定",
        )


# ============================================================
# Endpoints
# ============================================================

@router.post("/generate", response_model=ScriptDirectorResponse)
async def generate_script(
    request: GenerateScriptRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """草稿 → 爆款腳本（含鉤子、分鏡、CTA、自我檢查）"""
    _check_api_key()
    try:
        svc_request = ScriptGenerateRequest(
            draft=request.draft,
            duration=request.duration,
            generate_both=request.generate_both,
            hook_count=request.hook_count,
            target_audience=request.target_audience,
            voice_dna=request.voice_dna,
        )
        return await script_director_service.generate_script(svc_request)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"腳本生成失敗: {str(e)}")


@router.post("/hooks", response_model=list[Hook])
async def regenerate_hooks(
    request: RegenerateHooksRequest,
    current_user: User = Depends(get_current_user),
):
    """重新生成鉤子（更高創意溫度）"""
    _check_api_key()
    try:
        level = HookLevel(request.level)
        return await script_director_service.regenerate_hooks(
            draft=request.draft,
            count=request.count,
            level=level,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"鉤子生成失敗: {str(e)}")


@router.post("/cta")
async def optimize_cta(
    request: OptimizeCTARequest,
    current_user: User = Depends(get_current_user),
):
    """優化 CTA 話術（轉發/收藏/留言/追蹤）"""
    _check_api_key()
    try:
        return await script_director_service.optimize_cta(
            script_text=request.script_text,
            target_action=request.target_action,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CTA 優化失敗: {str(e)}")
