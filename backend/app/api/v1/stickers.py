from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.sticker import Sticker, StickerPack
from app.models.user import User
from app.schemas.sticker import StickerPackResponse, StickerResponse

router = APIRouter(prefix="/stickers", tags=["stickers"])


# ---------------------------------------------------------------------------
# GET /stickers/packs
# ---------------------------------------------------------------------------
@router.get("/packs", response_model=List[StickerPackResponse])
async def list_sticker_packs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[StickerPack]:
    """List all available sticker packs.

    Each pack includes a ``sticker_count`` populated from the relationship.
    """

    result = await db.execute(
        select(StickerPack).order_by(StickerPack.name)
    )
    packs = list(result.scalars().all())

    # Manually annotate sticker_count for the response schema
    for pack in packs:
        pack.sticker_count = len(pack.stickers) if pack.stickers else 0

    return packs


# ---------------------------------------------------------------------------
# GET /stickers/pack/{id}
# ---------------------------------------------------------------------------
@router.get("/pack/{pack_id}", response_model=StickerPackResponse)
async def get_sticker_pack(
    pack_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StickerPack:
    """Get a sticker pack with its stickers."""

    result = await db.execute(
        select(StickerPack).where(StickerPack.id == pack_id)
    )
    pack = result.scalar_one_or_none()
    if pack is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sticker pack not found",
        )

    pack.sticker_count = len(pack.stickers) if pack.stickers else 0
    return pack


# ---------------------------------------------------------------------------
# GET /stickers/{id}
# ---------------------------------------------------------------------------
@router.get("/{sticker_id}", response_model=StickerResponse)
async def get_sticker(
    sticker_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Sticker:
    """Get a single sticker by ID."""

    result = await db.execute(
        select(Sticker).where(Sticker.id == sticker_id)
    )
    sticker = result.scalar_one_or_none()
    if sticker is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sticker not found",
        )
    return sticker
