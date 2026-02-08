from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.asset import Asset
    from app.models.project import Project


class VideoAnalysis(Base):
    __tablename__ = "video_analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    asset_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("assets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    scenes: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    audio_analysis: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    hook_analysis: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    rhythm_analysis: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    project: Mapped["Project | None"] = relationship("Project", lazy="selectin")
    asset: Mapped["Asset"] = relationship("Asset", lazy="selectin")

    def __repr__(self) -> str:
        return f"<VideoAnalysis id={self.id} asset_id={self.asset_id}>"
