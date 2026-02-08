"""Add video_analyses, tts_tracks, downloaded_videos tables

Revision ID: 001_analysis_tts_dl
Revises:
Create Date: 2026-02-07
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "001_analysis_tts_dl"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- video_analyses ---
    op.create_table(
        "video_analyses",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=True),
        sa.Column("asset_id", sa.Integer(), nullable=False),
        sa.Column("scenes", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("audio_analysis", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("hook_analysis", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("rhythm_analysis", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_video_analyses_project_id", "video_analyses", ["project_id"])
    op.create_index("ix_video_analyses_asset_id", "video_analyses", ["asset_id"])

    # --- tts_tracks ---
    op.create_table(
        "tts_tracks",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("voice", sa.String(length=100), nullable=False),
        sa.Column("language", sa.String(length=10), nullable=False),
        sa.Column("file_path", sa.String(length=500), nullable=True),
        sa.Column("segments", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tts_tracks_project_id", "tts_tracks", ["project_id"])

    # --- downloaded_videos ---
    op.create_table(
        "downloaded_videos",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("platform", sa.String(length=50), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=True),
        sa.Column("asset_id", sa.Integer(), nullable=True),
        sa.Column("metadata_info", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_downloaded_videos_user_id", "downloaded_videos", ["user_id"])


def downgrade() -> None:
    op.drop_table("downloaded_videos")
    op.drop_table("tts_tracks")
    op.drop_table("video_analyses")
