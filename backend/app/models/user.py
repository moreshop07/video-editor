from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, List

from sqlalchemy import BigInteger, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.asset import Asset
    from app.models.project import Project


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    preferred_language: Mapped[str] = mapped_column(
        String(10), nullable=False, default="zh-TW"
    )
    storage_used_bytes: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0
    )
    storage_limit_bytes: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=10_737_418_240  # 10 GB
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    projects: Mapped[List["Project"]] = relationship(
        "Project", back_populates="user", lazy="selectin"
    )
    assets: Mapped[List["Asset"]] = relationship(
        "Asset", back_populates="user", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r}>"
