import { useEffect, useRef } from 'react';
import type { ProjectWebSocket } from '@/api/websocket';
import { useCollaborationStore } from '@/store/collaborationStore';
import { setBroadcastFn, applyRemoteOp } from '@/store/timelineStore';
import { useTimelineStore } from '@/store/timelineStore';

const CURSOR_THROTTLE_MS = 200;

export function useCollaboration(ws: ProjectWebSocket | null) {
  const lastCursorSent = useRef(0);

  // Wire broadcast function so local edits are sent via WS
  useEffect(() => {
    if (!ws) return;
    setBroadcastFn((opType, payload) => {
      ws.sendOperation(opType, payload);
    });
    return () => {
      setBroadcastFn(null);
    };
  }, [ws]);

  // Subscribe to WS collaboration events
  useEffect(() => {
    if (!ws) return;

    const store = useCollaborationStore.getState();

    const unsubPresence = ws.onPresence((msg: unknown) => {
      const { users } = msg as { users: Array<{ user_id: number; username: string; color: string }> };
      store.setUsers(users);
    });

    const unsubJoined = ws.onUserJoined((msg: unknown) => {
      const { user_id, username, color } = msg as { user_id: number; username: string; color: string };
      store.addUser({ user_id, username, color });
    });

    const unsubLeft = ws.onUserLeft((msg: unknown) => {
      const { user_id } = msg as { user_id: number };
      store.removeUser(user_id);
    });

    const unsubRemoteOp = ws.onRemoteOp((msg: unknown) => {
      const { op_type, payload } = msg as { user_id: number; op_type: string; payload: Record<string, unknown> };
      applyRemoteOp(op_type, payload);
    });

    const unsubSelection = ws.onSelectionUpdate((msg: unknown) => {
      const { user_id, selectedClipIds } = msg as { user_id: number; selectedClipIds: string[] };
      store.updateUserSelection(user_id, selectedClipIds);
    });

    const unsubCursor = ws.onCursorUpdate((msg: unknown) => {
      const { user_id, currentTime } = msg as { user_id: number; currentTime: number };
      store.updateUserCursor(user_id, currentTime);
    });

    return () => {
      unsubPresence();
      unsubJoined();
      unsubLeft();
      unsubRemoteOp();
      unsubSelection();
      unsubCursor();
    };
  }, [ws]);

  // Broadcast local selection changes
  useEffect(() => {
    if (!ws) return;
    const unsub = useTimelineStore.subscribe(
      (state) => state.selectedClipIds,
      (selectedClipIds) => {
        ws.sendSelection(selectedClipIds);
      },
    );
    return unsub;
  }, [ws]);

  // Broadcast local playhead position (throttled)
  useEffect(() => {
    if (!ws) return;
    const unsub = useTimelineStore.subscribe(
      (state) => state.currentTime,
      (currentTime) => {
        const now = Date.now();
        if (now - lastCursorSent.current >= CURSOR_THROTTLE_MS) {
          lastCursorSent.current = now;
          ws.sendCursor(currentTime);
        }
      },
    );
    return unsub;
  }, [ws]);

  // Reset collaboration store on unmount
  useEffect(() => {
    return () => {
      useCollaborationStore.getState().reset();
      setBroadcastFn(null);
    };
  }, []);
}
