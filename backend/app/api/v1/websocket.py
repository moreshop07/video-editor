from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.redis import subscribe_job_status
from app.core.security import verify_token
from app.models.project import Project
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])

# ---------------------------------------------------------------------------
# In-memory mapping: project_id -> set of connected WebSocket clients
# ---------------------------------------------------------------------------
_project_rooms: dict[int, set[WebSocket]] = {}


async def _authenticate(websocket: WebSocket) -> User | None:
    """Validate the ``token`` query parameter and return the User, or None."""
    token = websocket.query_params.get("token")
    if not token:
        return None
    try:
        payload = verify_token(token)
    except Exception:
        return None

    user_id = int(payload["sub"])
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()


async def _verify_project_access(
    user: User,
    project_id: int,
) -> bool:
    """Check that the user owns the project."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Project).where(
                Project.id == project_id,
                Project.user_id == user.id,
            )
        )
        return result.scalar_one_or_none() is not None


async def _broadcast_to_room(project_id: int, message: dict[str, Any]) -> None:
    """Send a JSON message to every client in a project room."""
    room = _project_rooms.get(project_id, set())
    payload = json.dumps(message)
    dead: list[WebSocket] = []
    for ws in room:
        try:
            await ws.send_text(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        room.discard(ws)


async def _redis_listener(project_id: int) -> None:
    """Subscribe to Redis pub/sub and relay job status updates to the room.

    This coroutine runs for the lifetime of the first connection in a room.
    It terminates when the room becomes empty.
    """
    pubsub = await subscribe_job_status()
    try:
        async for message in pubsub.listen():
            # Stop if the room is empty (all clients disconnected)
            if not _project_rooms.get(project_id):
                break
            if message["type"] != "message":
                continue
            try:
                data = json.loads(message["data"])
            except (json.JSONDecodeError, TypeError):
                continue
            # Broadcast all job status updates to the project room so the
            # frontend can filter by relevant job IDs.
            await _broadcast_to_room(
                project_id,
                {"type": "job_status", "payload": data},
            )
    finally:
        await pubsub.unsubscribe()
        await pubsub.close()


# ---------------------------------------------------------------------------
# WS /ws/{project_id}
# ---------------------------------------------------------------------------
@router.websocket("/ws/{project_id}")
async def project_websocket(
    websocket: WebSocket,
    project_id: int,
) -> None:
    """WebSocket endpoint for real-time project collaboration.

    **Authentication** is performed via the ``token`` query parameter
    (``ws://host/api/v1/ws/123?token=<jwt>``).

    **Messages from the client** are expected as JSON with a ``type`` field:

    * ``auto_save`` -- contains a ``project_data`` payload that the server
      persists to the database.

    **Messages from the server**:

    * ``job_status`` -- relayed from Redis pub/sub whenever a background job
      publishes a progress update.
    * ``auto_save_ack`` -- acknowledges a successful auto-save.
    * ``error`` -- indicates a problem with a received message.
    """

    # Authenticate
    user = await _authenticate(websocket)
    if user is None:
        await websocket.close(code=4001, reason="Authentication failed")
        return

    # Authorise project access
    if not await _verify_project_access(user, project_id):
        await websocket.close(code=4003, reason="Project not found")
        return

    await websocket.accept()

    # Join room
    if project_id not in _project_rooms:
        _project_rooms[project_id] = set()
    _project_rooms[project_id].add(websocket)

    # Start the Redis listener if this is the first connection for the room
    start_listener = len(_project_rooms[project_id]) == 1
    listener_task: asyncio.Task | None = None
    if start_listener:
        listener_task = asyncio.create_task(_redis_listener(project_id))

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_text(
                    json.dumps({"type": "error", "detail": "Invalid JSON"})
                )
                continue

            msg_type = msg.get("type")

            if msg_type == "auto_save":
                # Persist project_data to the database
                project_data = msg.get("project_data")
                if project_data is not None:
                    async with AsyncSessionLocal() as db:
                        result = await db.execute(
                            select(Project).where(Project.id == project_id)
                        )
                        project = result.scalar_one_or_none()
                        if project is not None:
                            project.project_data = project_data
                            await db.commit()
                    await websocket.send_text(
                        json.dumps({"type": "auto_save_ack", "success": True})
                    )
                else:
                    await websocket.send_text(
                        json.dumps({
                            "type": "error",
                            "detail": "Missing project_data in auto_save message",
                        })
                    )
            else:
                await websocket.send_text(
                    json.dumps({"type": "error", "detail": f"Unknown message type: {msg_type}"})
                )

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: user=%s project=%s", user.id, project_id)
    finally:
        # Leave room
        _project_rooms.get(project_id, set()).discard(websocket)
        if not _project_rooms.get(project_id):
            _project_rooms.pop(project_id, None)
            if listener_task is not None:
                listener_task.cancel()
