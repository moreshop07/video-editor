from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.user_template import UserTemplate
from app.schemas.user_template import (
    UserTemplateCreate,
    UserTemplateListResponse,
    UserTemplateResponse,
    UserTemplateUpdate,
)

router = APIRouter(prefix="/templates", tags=["templates"])


# ---------------------------------------------------------------------------
# GET /templates
# ---------------------------------------------------------------------------
@router.get("", response_model=UserTemplateListResponse)
async def list_templates(
    category: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """List user's templates with optional category filter."""
    stmt = select(UserTemplate).where(UserTemplate.user_id == current_user.id)
    if category:
        stmt = stmt.where(UserTemplate.category == category)
    stmt = stmt.order_by(UserTemplate.updated_at.desc())
    result = await db.execute(stmt)
    templates = list(result.scalars().all())
    return {"templates": templates}


# ---------------------------------------------------------------------------
# POST /templates
# ---------------------------------------------------------------------------
@router.post(
    "",
    response_model=UserTemplateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_template(
    body: UserTemplateCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserTemplate:
    """Create a user template from the request body."""
    template = UserTemplate(
        user_id=current_user.id,
        name=body.name,
        description=body.description,
        category=body.category,
        template_data=body.template_data,
        width=body.width,
        height=body.height,
        fps=body.fps,
    )
    db.add(template)
    await db.flush()
    await db.refresh(template)
    return template


# ---------------------------------------------------------------------------
# GET /templates/{id}
# ---------------------------------------------------------------------------
@router.get("/{template_id}", response_model=UserTemplateResponse)
async def get_template(
    template_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserTemplate:
    """Get a single user template with ownership check."""
    result = await db.execute(
        select(UserTemplate).where(UserTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Template not found"
        )
    if template.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not own this template",
        )
    return template


# ---------------------------------------------------------------------------
# PATCH /templates/{id}
# ---------------------------------------------------------------------------
@router.patch("/{template_id}", response_model=UserTemplateResponse)
async def update_template(
    template_id: int,
    body: UserTemplateUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserTemplate:
    """Update name, description, or category of a user template."""
    result = await db.execute(
        select(UserTemplate).where(UserTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Template not found"
        )
    if template.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not own this template",
        )
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(template, key, value)
    await db.flush()
    await db.refresh(template)
    return template


# ---------------------------------------------------------------------------
# DELETE /templates/{id}
# ---------------------------------------------------------------------------
@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a user template."""
    result = await db.execute(
        select(UserTemplate).where(UserTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Template not found"
        )
    if template.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not own this template",
        )
    await db.delete(template)
    await db.flush()
