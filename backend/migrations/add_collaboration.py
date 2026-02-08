"""
Migration: Add collaboration support.

Creates the project_collaborators table and adds a version column to projects.
Run once manually:
    python -m migrations.add_collaboration
"""

import asyncio

from sqlalchemy import text

from app.core.database import engine


async def migrate() -> None:
    async with engine.begin() as conn:
        # Add version column to projects (if not exists)
        await conn.execute(text("""
            ALTER TABLE projects
            ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0
        """))

        # Create project_collaborators table
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS project_collaborators (
                id SERIAL PRIMARY KEY,
                project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                role VARCHAR(20) NOT NULL DEFAULT 'editor',
                invited_by INTEGER NOT NULL REFERENCES users(id),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT uq_project_user UNIQUE (project_id, user_id)
            )
        """))

        # Add indexes
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_project_collaborators_project_id
            ON project_collaborators(project_id)
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_project_collaborators_user_id
            ON project_collaborators(user_id)
        """))

    print("Migration completed: collaboration tables created.")


if __name__ == "__main__":
    asyncio.run(migrate())
