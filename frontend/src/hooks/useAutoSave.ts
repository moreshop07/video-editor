import { useEffect, useRef, useCallback } from 'react';
import { useTimelineStore } from '@/store/timelineStore';
import { serializeForSave } from '@/store/timelineStore';
import { useProjectStore } from '@/store/projectStore';
import type { ProjectWebSocket } from '@/api/websocket';
import type { ProjectData } from '@/store/timelineStore';

const AUTO_SAVE_DEBOUNCE_MS = 2000;

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}

export function useAutoSave(ws: ProjectWebSocket | null) {
  const setAutoSaveStatus = useProjectStore((s) => s.setAutoSaveStatus);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();
  const lastSavedHash = useRef<number>(0);
  const pendingData = useRef<ProjectData | null>(null);

  const performSave = useCallback(
    (data: ProjectData) => {
      if (!ws?.isConnected) {
        setAutoSaveStatus('error');
        return;
      }

      setAutoSaveStatus('saving');
      ws.sendAutoSave(data);
    },
    [ws, setAutoSaveStatus],
  );

  // Listen for auto_save_ack from server
  useEffect(() => {
    if (!ws) return;
    const unsub = ws.onAutoSaveAck(() => {
      if (pendingData.current) {
        lastSavedHash.current = simpleHash(
          JSON.stringify(pendingData.current),
        );
        pendingData.current = null;
      }
      setAutoSaveStatus('saved');
    });
    return unsub;
  }, [ws, setAutoSaveStatus]);

  // Subscribe to timeline state changes (excluding playback-only fields)
  useEffect(() => {
    const unsub = useTimelineStore.subscribe(
      (state) => ({
        tracks: state.tracks,
        markers: state.markers,
        zoom: state.zoom,
        scrollX: state.scrollX,
        snapEnabled: state.snapEnabled,
      }),
      (selected) => {
        const serialized = serializeForSave(selected);
        const hash = simpleHash(JSON.stringify(serialized));

        if (hash === lastSavedHash.current) return;

        // Don't auto-save during playback
        if (useTimelineStore.getState().isPlaying) return;

        setAutoSaveStatus('unsaved');

        if (debounceTimer.current) {
          clearTimeout(debounceTimer.current);
        }

        debounceTimer.current = setTimeout(() => {
          pendingData.current = serialized;
          performSave(serialized);
        }, AUTO_SAVE_DEBOUNCE_MS);
      },
      { equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
    );

    return () => {
      unsub();
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [performSave, setAutoSaveStatus]);

  // Save on pause if there were changes during playback
  useEffect(() => {
    const unsub = useTimelineStore.subscribe(
      (state) => state.isPlaying,
      (isPlaying) => {
        if (!isPlaying && debounceTimer.current) {
          // Was playing and had pending changes — save now
          clearTimeout(debounceTimer.current);
          const state = useTimelineStore.getState();
          const serialized = serializeForSave(state);
          const hash = simpleHash(JSON.stringify(serialized));
          if (hash !== lastSavedHash.current) {
            pendingData.current = serialized;
            performSave(serialized);
          }
        }
      },
    );
    return unsub;
  }, [performSave]);
}
