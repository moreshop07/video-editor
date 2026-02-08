from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class CollaboratorInvite(BaseModel):
    email: str
    role: str = "editor"  # "editor" | "viewer"


class CollaboratorUpdate(BaseModel):
    role: str  # "editor" | "viewer"


class CollaboratorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    user_id: int
    role: str
    invited_by: int
    created_at: datetime
    username: Optional[str] = None
    email: Optional[str] = None
