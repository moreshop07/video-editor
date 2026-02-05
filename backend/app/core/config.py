from __future__ import annotations

import json
from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables / .env file."""

    # --- Database -----------------------------------------------------------
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/video_editor"
    DATABASE_URL_SYNC: str = "postgresql://postgres:postgres@localhost:5432/video_editor"

    # --- Redis --------------------------------------------------------------
    REDIS_URL: str = "redis://localhost:6379/0"

    # --- MinIO / S3 ---------------------------------------------------------
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_USE_SSL: bool = False
    MINIO_BUCKET_ASSETS: str = "assets"
    MINIO_BUCKET_EXPORTS: str = "exports"
    MINIO_BUCKET_THUMBNAILS: str = "thumbnails"

    # --- OpenAI -------------------------------------------------------------
    OPENAI_API_KEY: Optional[str] = None

    # --- Auth / Security ----------------------------------------------------
    SECRET_KEY: str = "change-me-in-production"

    # --- CORS ---------------------------------------------------------------
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # --- External media APIs ------------------------------------------------
    PEXELS_API_KEY: Optional[str] = None
    PIXABAY_API_KEY: Optional[str] = None
    FREESOUND_API_KEY: Optional[str] = None

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }

    @classmethod
    def __get_validators__(cls):  # pragma: no cover – kept for compat
        yield cls._validate

    @classmethod
    def _validate(cls, v):  # pragma: no cover
        return v

    def __init__(self, **kwargs):
        """Allow CORS_ORIGINS to be provided as a JSON-encoded string."""
        if "CORS_ORIGINS" in kwargs and isinstance(kwargs["CORS_ORIGINS"], str):
            try:
                kwargs["CORS_ORIGINS"] = json.loads(kwargs["CORS_ORIGINS"])
            except (json.JSONDecodeError, TypeError):
                kwargs["CORS_ORIGINS"] = [
                    origin.strip()
                    for origin in kwargs["CORS_ORIGINS"].split(",")
                    if origin.strip()
                ]
        super().__init__(**kwargs)


settings = Settings()
