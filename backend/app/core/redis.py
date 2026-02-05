from __future__ import annotations

import json
from collections.abc import AsyncGenerator
from typing import Any

import redis.asyncio as aioredis

from app.core.config import settings

redis_pool = aioredis.ConnectionPool.from_url(
    settings.REDIS_URL,
    decode_responses=True,
    max_connections=20,
)

redis_client = aioredis.Redis(connection_pool=redis_pool)


async def get_redis() -> AsyncGenerator[aioredis.Redis, None]:
    """FastAPI dependency that yields a Redis client.

    Usage::

        @router.get("/status")
        async def get_status(redis: aioredis.Redis = Depends(get_redis)):
            ...
    """
    try:
        yield redis_client
    finally:
        pass


# ---------------------------------------------------------------------------
# Pub/Sub helpers for broadcasting real-time job status updates
# ---------------------------------------------------------------------------

JOB_STATUS_CHANNEL = "job_status"


async def publish_job_status(
    job_id: str,
    status: str,
    *,
    progress: float | None = None,
    detail: str | None = None,
    extra: dict[str, Any] | None = None,
) -> int:
    """Publish a job status update to the ``job_status`` Redis channel.

    Parameters
    ----------
    job_id:
        Unique identifier for the background job.
    status:
        Current status string (e.g. ``"pending"``, ``"processing"``,
        ``"completed"``, ``"failed"``).
    progress:
        Optional progress percentage (0-100).
    detail:
        Optional human-readable detail message.
    extra:
        Optional dict of additional metadata to include in the payload.

    Returns
    -------
    int
        Number of subscribers that received the message.
    """
    payload: dict[str, Any] = {
        "job_id": job_id,
        "status": status,
    }
    if progress is not None:
        payload["progress"] = progress
    if detail is not None:
        payload["detail"] = detail
    if extra:
        payload.update(extra)

    return await redis_client.publish(JOB_STATUS_CHANNEL, json.dumps(payload))


async def subscribe_job_status() -> aioredis.client.PubSub:
    """Return a PubSub instance subscribed to the job-status channel.

    Callers should iterate over messages with::

        pubsub = await subscribe_job_status()
        async for message in pubsub.listen():
            if message["type"] == "message":
                data = json.loads(message["data"])
                ...
    """
    pubsub = redis_client.pubsub()
    await pubsub.subscribe(JOB_STATUS_CHANNEL)
    return pubsub
