from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, List

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.project import Project


class SubtitleTrack(Base):
    __tablename__ = "subtitle_tracks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    language: Mapped[str] = mapped_column(
        String(10), nullable=False, default="zh-TW"
    )
    label: Mapped[str] = mapped_column(
        String(100), nullable=False, default="\u4e3b\u8981\u5b57\u5e55"
    )
    is_auto_generated: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    style: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
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
    project: Mapped["Project"] = relationship(
        "Project", back_populates="subtitle_tracks"
    )
    segments: Mapped[List["SubtitleSegment"]] = relationship(
        "SubtitleSegment",
        back_populates="track",
        lazy="selectin",
        order_by="SubtitleSegment.index",
    )

    def __repr__(self) -> str:
        return f"<SubtitleTrack id={self.id} lang={self.language!r}>"


class SubtitleSegment(Base):
    __tablename__ = "subtitle_segments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    track_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("subtitle_tracks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    index: Mapped[int] = mapped_column(Integer, nullable=False)
    start_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    end_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    translated_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    word_timestamps: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    speaker: Mapped[str | None] = mapped_column(String(100), nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    track: Mapped["SubtitleTrack"] = relationship(
        "SubtitleTrack", back_populates="segments"
    )

    def __repr__(self) -> str:
        return f"<SubtitleSegment id={self.id} index={self.index} [{self.start_ms}-{self.end_ms}]>"
