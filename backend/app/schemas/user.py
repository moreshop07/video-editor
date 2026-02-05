from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

try:
    from pydantic import EmailStr as _EmailStr
    import email_validator as _ev  # noqa: F401

    EmailStr = _EmailStr
except (ImportError, ModuleNotFoundError):
    EmailStr = str  # type: ignore[assignment,misc]


class UserCreate(BaseModel):
    email: EmailStr  # type: ignore[valid-type]
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class UserLogin(BaseModel):
    email: EmailStr  # type: ignore[valid-type]
    password: str


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    username: str
    preferred_language: str
    storage_used_bytes: int
    storage_limit_bytes: int
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
