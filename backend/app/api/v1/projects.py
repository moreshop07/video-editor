from __future__ import annotations

from typing import List

import jsonpatch
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.collaborator import ProjectCollaborator
from app.models.project import Project
from app.models.user import User
from app.schemas.project import (
    ProjectCreate,
    ProjectDataPatch,
    ProjectDetailResponse,
    ProjectResponse,
    ProjectUpdate,
)

router = APIRouter(prefix="/projects", tags=["projects"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
async def _get_user_project(
    project_id: int,
    user: User,
    db: AsyncSession,
) -> Project:
    """Fetch a project and verify ownership or collaborator access.  Raises 404 if not found."""
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    # Owner always has access
    if project.user_id == user.id:
        return project

    # Check collaborator access
    collab_result = await db.execute(
        select(ProjectCollaborator).where(
            ProjectCollaborator.project_id == project_id,
            ProjectCollaborator.user_id == user.id,
        )
    )
    if collab_result.scalar_one_or_none() is not None:
        return project

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Project not found",
    )


# ---------------------------------------------------------------------------
# POST /projects
# ---------------------------------------------------------------------------
@router.post(
    "",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_project(
    body: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Project:
    """Create a new project for the current user."""

    project = Project(
        user_id=current_user.id,
        name=body.name,
        description=body.description,
        width=body.width,
        height=body.height,
        fps=body.fps,
        project_data={},
    )
    db.add(project)
    await db.flush()
    await db.refresh(project)
    return project


# ---------------------------------------------------------------------------
# GET /projects
# ---------------------------------------------------------------------------
@router.get("", response_model=List[ProjectResponse])
async def list_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Project]:
    """List all projects belonging to the current user."""

    # Include owned projects + projects where user is a collaborator
    collab_project_ids = select(ProjectCollaborator.project_id).where(
        ProjectCollaborator.user_id == current_user.id
    ).scalar_subquery()

    result = await db.execute(
        select(Project)
        .where(
            or_(
                Project.user_id == current_user.id,
                Project.id.in_(collab_project_ids),
            )
        )
        .order_by(Project.updated_at.desc())
    )
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# GET /projects/{id}
# ---------------------------------------------------------------------------
@router.get("/{project_id}", response_model=ProjectDetailResponse)
async def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Project:
    """Get a single project with its full project_data payload."""
    return await _get_user_project(project_id, current_user, db)


# ---------------------------------------------------------------------------
# PATCH /projects/{id}
# ---------------------------------------------------------------------------
@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    body: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Project:
    """Update project metadata (name, description, dimensions, fps)."""

    project = await _get_user_project(project_id, current_user, db)

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(project, field, value)

    await db.flush()
    await db.refresh(project)
    return project


# ---------------------------------------------------------------------------
# PATCH /projects/{id}/data
# ---------------------------------------------------------------------------
@router.patch("/{project_id}/data", response_model=ProjectDetailResponse)
async def patch_project_data(
    project_id: int,
    body: ProjectDataPatch,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Project:
    """Apply a JSON Patch (RFC 6902) to the project_data document.

    The request body should contain an ``ops`` list of JSON Patch operations,
    e.g. ``[{"op": "replace", "path": "/timeline/tracks/0/volume", "value": 0.8}]``.
    """

    project = await _get_user_project(project_id, current_user, db)

    current_data = project.project_data or {}
    try:
        patch = jsonpatch.JsonPatch(body.ops)
        patched = patch.apply(current_data)
    except (jsonpatch.JsonPatchException, jsonpatch.JsonPointerException) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid JSON Patch: {exc}",
        )

    project.project_data = patched
    await db.flush()
    await db.refresh(project)
    return project


# ---------------------------------------------------------------------------
# DELETE /projects/{id}
# ---------------------------------------------------------------------------
@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a project."""

    project = await _get_user_project(project_id, current_user, db)
    await db.delete(project)
    await db.flush()
