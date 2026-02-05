from __future__ import annotations

from datetime import datetime
from typing import List

from sqlalchemy import Boolean, DateTime, Float, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class MusicTrack(Base):
    __tablename__ = "music_tracks"
    __table_args__ = (
        Index("ix_music_tracks_mood_tags", "mood_tags", postgresql_using="gin"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    artist: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    bpm: Mapped[float | None] = mapped_column(Float, nullable=True)
    key_signature: Mapped[str | None] = mapped_column(String(10), nullable=True)
    energy: Mapped[float | None] = mapped_column(Float, nullable=True)
    mood_tags: Mapped[List[str] | None] = mapped_column(
        ARRAY(String), nullable=False, server_default="{}"
    )
    genre_tags: Mapped[List[str] | None] = mapped_column(
        ARRAY(String), nullable=False, server_default="{}"
    )
    beat_timestamps: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    is_premium: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    license_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="free"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    def __repr__(self) -> str:
        return f"<MusicTrack id={self.id} title={self.title!r}>"


class SoundEffect(Base):
    __tablename__ = "sound_effects"
    __table_args__ = (
        Index("ix_sound_effects_tags", "tags", postgresql_using="gin"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    tags: Mapped[List[str] | None] = mapped_column(
        ARRAY(String), nullable=False, server_default="{}"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    def __repr__(self) -> str:
        return f"<SoundEffect id={self.id} title={self.title!r}>"
