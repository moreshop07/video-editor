import { useState, useEffect, useCallback } from 'react';
import { useTimelineStore, type Clip } from '@/store/timelineStore';
import { useProjectStore } from '@/store/projectStore';

// Internal clipboard (not system clipboard)
let clipboardClips: Array<Clip & { _sourceTrackId: string }> = [];

function getSelectedClipsWithTracks(): Array<Clip & { _sourceTrackId: string }> {
  const state = useTimelineStore.getState();
  const ids = new Set(state.selectedClipIds);
  const result: Array<Clip & { _sourceTrackId: string }> = [];
  for (const track of state.tracks) {
    for (const clip of track.clips) {
      if (ids.has(clip.id)) {
        result.push({ ...clip, _sourceTrackId: track.id });
      }
    }
  }
  return result;
}

function copySelectedClips(): void {
  clipboardClips = getSelectedClipsWithTracks().map((c) => ({
    ...structuredClone(c),
  }));
}

function pasteClipsAtPlayhead(): void {
  if (clipboardClips.length === 0) return;
  const state = useTimelineStore.getState();
  const currentTime = state.currentTime;

  // Calculate offset: shift all clips so earliest starts at playhead
  const minStart = Math.min(...clipboardClips.map((c) => c.startTime));
  const offset = currentTime - minStart;

  const newClipIds: string[] = [];
  for (const clip of clipboardClips) {
    const duration = clip.endTime - clip.startTime;
    const newId = `clip_paste_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newClip: Omit<Clip, 'trackId'> = {
      ...clip,
      id: newId,
      startTime: clip.startTime + offset,
      endTime: clip.startTime + offset + duration,
    };
    // Remove internal metadata before adding
    const { _sourceTrackId: _, ...cleanClip } = newClip as Clip & { _sourceTrackId: string };

    // Find the track to paste into (use source track if it exists, else first matching type)
    const targetTrack =
      state.tracks.find((t) => t.id === clip._sourceTrackId) ??
      state.tracks.find((t) => t.type === clip.type) ??
      state.tracks[0];

    if (targetTrack) {
      state.addClip(targetTrack.id, cleanClip);
      newClipIds.push(newId);
    }
  }

  // Select newly pasted clips
  if (newClipIds.length > 0) {
    useTimelineStore.getState().selectClips(newClipIds);
  }
}

function duplicateSelectedClips(): void {
  const selected = getSelectedClipsWithTracks();
  if (selected.length === 0) return;

  const state = useTimelineStore.getState();
  // Place duplicates right after the latest selected clip
  const maxEnd = Math.max(...selected.map((c) => c.endTime));
  const minStart = Math.min(...selected.map((c) => c.startTime));
  const offset = maxEnd - minStart;

  const newClipIds: string[] = [];
  for (const clip of selected) {
    const duration = clip.endTime - clip.startTime;
    const newId = `clip_dup_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const { _sourceTrackId, ...rest } = clip;
    const newClip: Omit<Clip, 'trackId'> = {
      ...rest,
      id: newId,
      startTime: clip.startTime + offset,
      endTime: clip.startTime + offset + duration,
    };

    const targetTrack = state.tracks.find((t) => t.id === _sourceTrackId);
    if (targetTrack) {
      state.addClip(targetTrack.id, newClip);
      newClipIds.push(newId);
    }
  }

  if (newClipIds.length > 0) {
    useTimelineStore.getState().selectClips(newClipIds);
  }
}

function splitAtPlayhead(): void {
  const state = useTimelineStore.getState();
  const { selectedClipIds, currentTime, tracks } = state;

  // Find first selected clip that spans currentTime
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (
        selectedClipIds.includes(clip.id) &&
        currentTime > clip.startTime &&
        currentTime < clip.endTime
      ) {
        state.splitClip(track.id, clip.id, currentTime);
        return;
      }
    }
  }
}

export function useKeyboardShortcuts() {
  const [showHelp, setShowHelp] = useState(false);

  const toggleHelp = useCallback(() => {
    setShowHelp((prev) => !prev);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip when typing in inputs/textareas
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      const state = useTimelineStore.getState();

      // --- Modifier combos (check first to avoid conflict with plain keys) ---

      if (mod) {
        switch (e.key.toLowerCase()) {
          case 's':
            e.preventDefault();
            useProjectStore.getState().saveProject();
            return;

          case 'z':
            e.preventDefault();
            if (e.shiftKey) {
              useTimelineStore.temporal.getState().redo();
            } else {
              useTimelineStore.temporal.getState().undo();
            }
            return;

          case 'y':
            e.preventDefault();
            useTimelineStore.temporal.getState().redo();
            return;

          case 'a':
            e.preventDefault();
            state.selectClips(
              state.tracks.flatMap((t) => t.clips.map((c) => c.id)),
            );
            return;

          case 'c':
            e.preventDefault();
            copySelectedClips();
            return;

          case 'x':
            e.preventDefault();
            copySelectedClips();
            state.removeSelectedClips();
            return;

          case 'v':
            e.preventDefault();
            pasteClipsAtPlayhead();
            return;

          case 'd':
            e.preventDefault();
            duplicateSelectedClips();
            return;
        }
        return; // Don't process plain keys if modifier is held
      }

      // --- Plain keys ---

      switch (e.key) {
        case ' ':
          e.preventDefault();
          state.togglePlay();
          break;

        case 'ArrowRight':
          e.preventDefault();
          state.setCurrentTime(state.currentTime + (e.shiftKey ? 5000 : 1000));
          break;

        case 'ArrowLeft':
          e.preventDefault();
          state.setCurrentTime(
            Math.max(0, state.currentTime - (e.shiftKey ? 5000 : 1000)),
          );
          break;

        case 'Delete':
        case 'Backspace':
          if (state.selectedClipIds.length > 0) {
            state.removeSelectedClips();
          }
          break;

        case 'Escape':
          if (showHelp) {
            setShowHelp(false);
          } else {
            state.selectClip(null);
          }
          break;

        case 's':
        case 'S':
          splitAtPlayhead();
          break;

        case 'n':
        case 'N':
          state.toggleSnap();
          break;

        case 'm':
        case 'M':
          if (state.selectedTrackId) {
            state.toggleTrackMute(state.selectedTrackId);
          }
          break;

        case '=':
        case '+':
          e.preventDefault();
          state.zoomIn();
          break;

        case '-':
          e.preventDefault();
          state.zoomOut();
          break;

        case 'Home':
          e.preventDefault();
          state.setCurrentTime(0);
          break;

        case 'End':
          e.preventDefault();
          state.setCurrentTime(state.getTimelineDuration());
          break;

        case '?':
          toggleHelp();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showHelp, toggleHelp]);

  return { showHelp, setShowHelp };
}
