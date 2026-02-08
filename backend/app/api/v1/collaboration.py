from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.collaborator import ProjectCollaborator
from app.models.project import Project
from app.models.user import User
from app.schemas.collaboration import (
    CollaboratorInvite,
    CollaboratorResponse,
    CollaboratorUpdate,
)

router = APIRouter(prefix="/projects", tags=["collaboration"])


async def _get_owned_project(
    project_id: int,
    user: User,
    db: AsyncSession,
) -> Project:
    """Fetch a project and verify ownership (only owners can manage collaborators)."""
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found or not owned by you",
        )
    return project


# ---------------------------------------------------------------------------
# POST /projects/{id}/collaborators
# ---------------------------------------------------------------------------
@router.post(
    "/{project_id}/collaborators",
    response_model=CollaboratorResponse,
    status_code=status.HTTP_201_CREATED,
)
async def invite_collaborator(
    project_id: int,
    body: CollaboratorInvite,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CollaboratorResponse:
    """Invite a user to collaborate on a project by email."""
    project = await _get_owned_project(project_id, current_user, db)

    if body.role not in ("editor", "viewer"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role must be 'editor' or 'viewer'",
        )

    # Find user by email
    result = await db.execute(select(User).where(User.email == body.email))
    target_user = result.scalar_one_or_none()
    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found with that email",
        )

    if target_user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot invite yourself",
        )

    # Check if already a collaborator
    existing = await db.execute(
        select(ProjectCollaborator).where(
            ProjectCollaborator.project_id == project.id,
            ProjectCollaborator.user_id == target_user.id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a collaborator",
        )

    collab = ProjectCollaborator(
        project_id=project.id,
        user_id=target_user.id,
        role=body.role,
        invited_by=current_user.id,
    )
    db.add(collab)
    await db.flush()
    await db.refresh(collab)

    return CollaboratorResponse(
        id=collab.id,
        project_id=collab.project_id,
        user_id=collab.user_id,
        role=collab.role,
        invited_by=collab.invited_by,
        created_at=collab.created_at,
        username=target_user.username,
        email=target_user.email,
    )


# ---------------------------------------------------------------------------
# GET /projects/{id}/collaborators
# ---------------------------------------------------------------------------
@router.get(
    "/{project_id}/collaborators",
    response_model=List[CollaboratorResponse],
)
async def list_collaborators(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CollaboratorResponse]:
    """List all collaborators of a project. Owner or collaborator can view."""
    # Check access (owner or collaborator)
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    is_owner = project.user_id == current_user.id
    if not is_owner:
        collab_check = await db.execute(
            select(ProjectCollaborator).where(
                ProjectCollaborator.project_id == project_id,
                ProjectCollaborator.user_id == current_user.id,
            )
        )
        if collab_check.scalar_one_or_none() is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    result = await db.execute(
        select(ProjectCollaborator, User)
        .join(User, ProjectCollaborator.user_id == User.id)
        .where(ProjectCollaborator.project_id == project_id)
    )
    rows = result.all()

    return [
        CollaboratorResponse(
            id=collab.id,
            project_id=collab.project_id,
            user_id=collab.user_id,
            role=collab.role,
            invited_by=collab.invited_by,
            created_at=collab.created_at,
            username=user.username,
            email=user.email,
        )
        for collab, user in rows
    ]


# ---------------------------------------------------------------------------
# PATCH /projects/{id}/collaborators/{user_id}
# ---------------------------------------------------------------------------
@router.patch(
    "/{project_id}/collaborators/{user_id}",
    response_model=CollaboratorResponse,
)
async def update_collaborator_role(
    project_id: int,
    user_id: int,
    body: CollaboratorUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CollaboratorResponse:
    """Update a collaborator's role. Only owner can update."""
    await _get_owned_project(project_id, current_user, db)

    if body.role not in ("editor", "viewer"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role must be 'editor' or 'viewer'",
        )

    result = await db.execute(
        select(ProjectCollaborator).where(
            ProjectCollaborator.project_id == project_id,
            ProjectCollaborator.user_id == user_id,
        )
    )
    collab = result.scalar_one_or_none()
    if collab is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collaborator not found")

    collab.role = body.role
    await db.flush()
    await db.refresh(collab)

    # Fetch username
    user_result = await db.execute(select(User).where(User.id == user_id))
    target_user = user_result.scalar_one()

    return CollaboratorResponse(
        id=collab.id,
        project_id=collab.project_id,
        user_id=collab.user_id,
        role=collab.role,
        invited_by=collab.invited_by,
        created_at=collab.created_at,
        username=target_user.username,
        email=target_user.email,
    )


# ---------------------------------------------------------------------------
# DELETE /projects/{id}/collaborators/{user_id}
# ---------------------------------------------------------------------------
@router.delete(
    "/{project_id}/collaborators/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_collaborator(
    project_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Remove a collaborator. Owner can remove anyone; collaborators can remove themselves."""
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    is_owner = project.user_id == current_user.id
    if not is_owner and user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner can remove other collaborators",
        )

    result = await db.execute(
        select(ProjectCollaborator).where(
            ProjectCollaborator.project_id == project_id,
            ProjectCollaborator.user_id == user_id,
        )
    )
    collab = result.scalar_one_or_none()
    if collab is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collaborator not found")

    await db.delete(collab)
    await db.flush()
