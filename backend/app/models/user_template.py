from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class UserTemplate(Base):
    __tablename__ = "user_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="custom"
    )
    thumbnail_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    template_data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1920")
    height: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1080")
    fps: Mapped[float] = mapped_column(Float, nullable=False, server_default="30.0")
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
    user: Mapped["User"] = relationship("User", lazy="selectin")

    def __repr__(self) -> str:
        return f"<UserTemplate id={self.id} name={self.name!r} category={self.category!r}>"
