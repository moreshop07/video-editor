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
from app.models.collaborator import ProjectCollaborator
from app.models.project import Project
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])

# ---------------------------------------------------------------------------
# User colors for presence (cycle through these)
# ---------------------------------------------------------------------------
_USER_COLORS = [
    "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#a855f7",
    "#ec4899", "#06b6d4", "#f97316", "#6366f1", "#14b8a6",
]
_color_counter = 0


def _next_color() -> str:
    global _color_counter
    color = _USER_COLORS[_color_counter % len(_USER_COLORS)]
    _color_counter += 1
    return color


# ---------------------------------------------------------------------------
# In-memory mapping: project_id -> dict[WebSocket, user_meta]
# ---------------------------------------------------------------------------
_project_rooms: dict[int, dict[WebSocket, dict[str, Any]]] = {}


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
    """Check that the user owns or collaborates on the project."""
    async with AsyncSessionLocal() as db:
        # Check ownership
        result = await db.execute(
            select(Project).where(
                Project.id == project_id,
                Project.user_id == user.id,
            )
        )
        if result.scalar_one_or_none() is not None:
            return True

        # Check collaborator
        result = await db.execute(
            select(ProjectCollaborator).where(
                ProjectCollaborator.project_id == project_id,
                ProjectCollaborator.user_id == user.id,
            )
        )
        return result.scalar_one_or_none() is not None


async def _broadcast_to_room(
    project_id: int,
    message: dict[str, Any],
    *,
    exclude: WebSocket | None = None,
) -> None:
    """Send a JSON message to every client in a project room, optionally excluding one."""
    room = _project_rooms.get(project_id, {})
    payload = json.dumps(message)
    dead: list[WebSocket] = []
    for ws in room:
        if ws is exclude:
            continue
        try:
            await ws.send_text(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        room.pop(ws, None)


async def _send(ws: WebSocket, message: dict[str, Any]) -> None:
    """Send a JSON message to a single WebSocket."""
    try:
        await ws.send_text(json.dumps(message))
    except Exception:
        pass


def _get_room_users(project_id: int) -> list[dict[str, Any]]:
    """Get list of user metadata for all users in a room."""
    room = _project_rooms.get(project_id, {})
    return list(room.values())


async def _redis_listener(project_id: int) -> None:
    """Subscribe to Redis pub/sub and relay job status updates to the room."""
    pubsub = await subscribe_job_status()
    try:
        async for message in pubsub.listen():
            if not _project_rooms.get(project_id):
                break
            if message["type"] != "message":
                continue
            try:
                data = json.loads(message["data"])
            except (json.JSONDecodeError, TypeError):
                continue
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

    **Authentication** via ``token`` query parameter.

    **Client → Server messages**:
    * ``auto_save`` — persist ``project_data``
    * ``operation`` — broadcast an edit operation to other clients
    * ``selection`` — broadcast clip selection state
    * ``cursor`` — broadcast playhead position
    * ``heartbeat`` — keep-alive

    **Server → Client messages**:
    * ``job_status`` — background job updates
    * ``auto_save_ack`` — save confirmation with version
    * ``presence`` — list of connected users (sent on join)
    * ``user_joined`` — a new user connected
    * ``user_left`` — a user disconnected
    * ``remote_op`` — edit operation from another user
    * ``selection_update`` — another user's selection changed
    * ``cursor_update`` — another user's playhead moved
    * ``heartbeat_ack`` — heartbeat response
    * ``error`` — error message
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

    # User metadata for this connection
    user_meta = {
        "user_id": user.id,
        "username": user.username,
        "color": _next_color(),
    }

    # Join room
    if project_id not in _project_rooms:
        _project_rooms[project_id] = {}
    _project_rooms[project_id][websocket] = user_meta

    # Start Redis listener if first connection
    start_listener = len(_project_rooms[project_id]) == 1
    listener_task: asyncio.Task | None = None
    if start_listener:
        listener_task = asyncio.create_task(_redis_listener(project_id))

    # Send current presence to the new user
    await _send(websocket, {
        "type": "presence",
        "users": _get_room_users(project_id),
    })

    # Notify others that this user joined
    await _broadcast_to_room(
        project_id,
        {"type": "user_joined", **user_meta},
        exclude=websocket,
    )

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await _send(websocket, {"type": "error", "detail": "Invalid JSON"})
                continue

            msg_type = msg.get("type")

            if msg_type == "auto_save":
                project_data = msg.get("project_data")
                if project_data is not None:
                    version = 0
                    async with AsyncSessionLocal() as db:
                        result = await db.execute(
                            select(Project).where(Project.id == project_id)
                        )
                        project = result.scalar_one_or_none()
                        if project is not None:
                            project.project_data = project_data
                            project.version = (project.version or 0) + 1
                            version = project.version
                            await db.commit()
                    await _send(websocket, {
                        "type": "auto_save_ack",
                        "success": True,
                        "version": version,
                    })
                else:
                    await _send(websocket, {
                        "type": "error",
                        "detail": "Missing project_data in auto_save message",
                    })

            elif msg_type == "operation":
                # Broadcast edit operation to all other clients
                await _broadcast_to_room(
                    project_id,
                    {
                        "type": "remote_op",
                        "user_id": user.id,
                        "op_type": msg.get("op_type"),
                        "payload": msg.get("payload"),
                    },
                    exclude=websocket,
                )

            elif msg_type == "selection":
                await _broadcast_to_room(
                    project_id,
                    {
                        "type": "selection_update",
                        "user_id": user.id,
                        "selectedClipIds": msg.get("selectedClipIds", []),
                    },
                    exclude=websocket,
                )

            elif msg_type == "cursor":
                await _broadcast_to_room(
                    project_id,
                    {
                        "type": "cursor_update",
                        "user_id": user.id,
                        "currentTime": msg.get("currentTime", 0),
                    },
                    exclude=websocket,
                )

            elif msg_type == "heartbeat":
                await _send(websocket, {"type": "heartbeat_ack"})

            else:
                await _send(websocket, {
                    "type": "error",
                    "detail": f"Unknown message type: {msg_type}",
                })

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: user=%s project=%s", user.id, project_id)
    finally:
        # Leave room
        room = _project_rooms.get(project_id, {})
        room.pop(websocket, None)

        # Notify others
        await _broadcast_to_room(
            project_id,
            {"type": "user_left", "user_id": user.id},
        )

        if not _project_rooms.get(project_id):
            _project_rooms.pop(project_id, None)
            if listener_task is not None:
                listener_task.cancel()
