from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.effect import EffectPreset
from app.models.user import User
from app.schemas.effect import EffectPresetCreate, EffectPresetResponse

router = APIRouter(prefix="/effects", tags=["effects"])


# ---------------------------------------------------------------------------
# GET /effects/presets
# ---------------------------------------------------------------------------
@router.get("/presets", response_model=List[EffectPresetResponse])
async def list_presets(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[EffectPreset]:
    """List all effect presets visible to the user.

    Returns both system-wide presets (``is_system=True``) and the user's own
    custom presets.
    """

    result = await db.execute(
        select(EffectPreset)
        .where(
            or_(
                EffectPreset.is_system.is_(True),
                EffectPreset.user_id == current_user.id,
            )
        )
        .order_by(EffectPreset.category, EffectPreset.name)
    )
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# POST /effects/presets
# ---------------------------------------------------------------------------
@router.post(
    "/presets",
    response_model=EffectPresetResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_preset(
    body: EffectPresetCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EffectPreset:
    """Create a custom effect preset for the current user."""

    preset = EffectPreset(
        user_id=current_user.id,
        name=body.name,
        category=body.category,
        params=body.params,
        is_system=False,
    )
    db.add(preset)
    await db.flush()
    await db.refresh(preset)
    return preset


# ---------------------------------------------------------------------------
# DELETE /effects/presets/{id}
# ---------------------------------------------------------------------------
@router.delete("/presets/{preset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_preset(
    preset_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a custom effect preset owned by the current user.

    System presets cannot be deleted.
    """

    result = await db.execute(
        select(EffectPreset).where(EffectPreset.id == preset_id)
    )
    preset = result.scalar_one_or_none()

    if preset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Effect preset not found",
        )

    if preset.is_system:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System presets cannot be deleted",
        )

    if preset.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not own this preset",
        )

    await db.delete(preset)
    await db.flush()
