from __future__ import annotations

import io
from datetime import timedelta

from minio import Minio

from app.core.config import settings

minio_client = Minio(
    endpoint=settings.MINIO_ENDPOINT,
    access_key=settings.MINIO_ACCESS_KEY,
    secret_key=settings.MINIO_SECRET_KEY,
    secure=settings.MINIO_USE_SSL,
)


def _ensure_bucket(bucket: str) -> None:
    """Create the bucket if it does not already exist."""
    if not minio_client.bucket_exists(bucket):
        minio_client.make_bucket(bucket)


def ensure_buckets() -> None:
    """Create all configured buckets (call once at application startup)."""
    for bucket in (
        settings.MINIO_BUCKET_ASSETS,
        settings.MINIO_BUCKET_EXPORTS,
        settings.MINIO_BUCKET_THUMBNAILS,
    ):
        _ensure_bucket(bucket)


def upload_file(
    bucket: str,
    object_name: str,
    file_data: bytes | io.BytesIO,
    content_type: str = "application/octet-stream",
) -> str:
    """Upload a file to the specified MinIO bucket.

    Parameters
    ----------
    bucket:
        Target bucket name.
    object_name:
        Object key inside the bucket (e.g. ``"videos/abc123.mp4"``).
    file_data:
        Raw bytes or a ``BytesIO`` stream to upload.
    content_type:
        MIME type of the file.

    Returns
    -------
    str
        The URL path ``"/{bucket}/{object_name}"`` that can be used to
        retrieve the object.
    """
    _ensure_bucket(bucket)

    if isinstance(file_data, bytes):
        file_data = io.BytesIO(file_data)

    file_data.seek(0, io.SEEK_END)
    length = file_data.tell()
    file_data.seek(0)

    minio_client.put_object(
        bucket_name=bucket,
        object_name=object_name,
        data=file_data,
        length=length,
        content_type=content_type,
    )

    return f"/{bucket}/{object_name}"


def get_presigned_url(
    bucket: str,
    object_name: str,
    expires: int = 3600,
) -> str:
    """Generate a presigned URL for downloading an object.

    Parameters
    ----------
    bucket:
        Bucket containing the object.
    object_name:
        Object key.
    expires:
        URL validity period in seconds (default 1 hour).

    Returns
    -------
    str
        A presigned URL string.
    """
    return minio_client.presigned_get_object(
        bucket_name=bucket,
        object_name=object_name,
        expires=timedelta(seconds=expires),
    )


def delete_file(bucket: str, object_name: str) -> None:
    """Delete an object from a MinIO bucket.

    Parameters
    ----------
    bucket:
        Bucket containing the object.
    object_name:
        Object key to delete.
    """
    minio_client.remove_object(
        bucket_name=bucket,
        object_name=object_name,
    )
