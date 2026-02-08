import { create } from 'zustand';
import { temporal } from 'zundo';
import type { ClipFilters, TrackAudioSettings } from '@/effects/types';
import { DEFAULT_CLIP_FILTERS } from '@/effects/types';
import type { Transition } from '@/types/transitions';
import type { KeyframeTracks, AnimatableProperty } from '@/types/keyframes';
import type { PipBorder } from '@/engine/types';
import { setKeyframe, removeKeyframe } from '@/utils/keyframeUtils';

// Collaboration broadcast support
let _suppressBroadcast = false;
let _broadcastFn: ((opType: string, payload: unknown) => void) | null = null;

export function setBroadcastFn(fn: ((opType: string, payload: unknown) => void) | null): void {
  _broadcastFn = fn;
}

function broadcast(opType: string, payload: unknown): void {
  if (!_suppressBroadcast && _broadcastFn) {
    _broadcastFn(opType, payload);
  }
}

export function applyRemoteOp(opType: string, payload: Record<string, unknown>): void {
  _suppressBroadcast = true;
  const state = useTimelineStore.getState();
  switch (opType) {
    case 'add_clip':
      state.addClip(payload.trackId as string, payload.clip as Omit<Clip, 'trackId'>);
      break;
    case 'remove_clip':
      state.removeClip(payload.trackId as string, payload.clipId as string);
      break;
    case 'update_clip':
      state.updateClip(
        payload.trackId as string,
        payload.clipId as string,
        payload.updates as Partial<Clip>,
      );
      break;
    case 'move_clip':
      state.moveClip(
        payload.fromTrackId as string,
        payload.toTrackId as string,
        payload.clipId as string,
        payload.newStartTime as number,
      );
      break;
    case 'split_clip':
      state.splitClip(
        payload.trackId as string,
        payload.clipId as string,
        payload.splitTime as number,
      );
      break;
    case 'add_track':
      state.addTrack(payload.type as Track['type'], payload.name as string | undefined);
      break;
    case 'remove_track':
      state.removeTrack(payload.trackId as string);
      break;
    case 'toggle_track_mute':
      state.toggleTrackMute(payload.trackId as string);
      break;
  }
  _suppressBroadcast = false;
}

export interface Clip {
  id: string;
  assetId: string;
  trackId: string;
  startTime: number;    // position on timeline in ms
  endTime: number;       // end position on timeline in ms
  trimStart: number;     // trim from start of source in ms
  trimEnd: number;       // trim from end of source in ms
  duration: number;      // source duration in ms
  name: string;
  type: string;          // video, audio, image, text
  filters: ClipFilters;
  volume?: number;
  fadeInMs: number;
  fadeOutMs: number;
  positionX?: number;  // 0–1, default 0.5 = center
  positionY?: number;  // 0–1, default 0.5 = center
  scaleX?: number;     // default 1.0
  scaleY?: number;     // default 1.0
  rotation?: number;   // degrees, default 0
  transitionIn?: Transition; // transition at start of clip

  // Text-specific properties
  textContent?: string;           // The text to render
  fontSize?: number;              // Font size in pixels
  fontFamily?: string;            // Font family name
  fontColor?: string;             // Text color (#RRGGBB)
  fontWeight?: 'normal' | 'bold';
  textAlign?: 'left' | 'center' | 'right';
  backgroundColor?: string;       // Optional background color
  backgroundOpacity?: number;     // 0-1, default 0 (no background)

  // Text animation presets
  textAnimationIn?: string;       // Entrance animation preset name
  textAnimationOut?: string;      // Exit animation preset name

  // Keyframe animation
  keyframes?: KeyframeTracks;     // Animated property keyframes

  // PiP border
  pipBorder?: PipBorder;

  // Crop
  cropTop?: number;     // 0–1, fraction of source height
  cropBottom?: number;
  cropLeft?: number;    // 0–1, fraction of source width
  cropRight?: number;
}

export interface Track {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'music' | 'sfx' | 'subtitle' | 'sticker' | 'text';
  clips: Clip[];
  muted: boolean;
  locked: boolean;
  height: number;
  visible: boolean;
  audioSettings?: TrackAudioSettings;
}

// Project data format persisted to backend JSONB
export interface ProjectData {
  version: number;
  timeline: {
    tracks: Array<{
      id: string;
      name: string;
      type: string;
      muted: boolean;
      locked: boolean;
      height: number;
      visible: boolean;
      audioSettings?: TrackAudioSettings;
      clips: Array<{
        id: string;
        assetId: string;
        startTime: number;
        endTime: number;
        trimStart: number;
        trimEnd: number;
        duration: number;
        name: string;
        type: string;
        volume: number;
        filters: ClipFilters;
        fadeInMs: number;
        fadeOutMs: number;
        positionX?: number;
        positionY?: number;
        scaleX?: number;
        scaleY?: number;
        rotation?: number;
        transitionIn?: Transition;
        // Text properties
        textContent?: string;
        fontSize?: number;
        fontFamily?: string;
        fontColor?: string;
        fontWeight?: 'normal' | 'bold';
        textAlign?: 'left' | 'center' | 'right';
        backgroundColor?: string;
        backgroundOpacity?: number;
        textAnimationIn?: string;
        textAnimationOut?: string;
        keyframes?: KeyframeTracks;
        pipBorder?: PipBorder;
        cropTop?: number;
        cropBottom?: number;
        cropLeft?: number;
        cropRight?: number;
      }>;
    }>;
    zoom: number;
    scrollX: number;
    snapEnabled: boolean;
  };
}

export function serializeForSave(state: {
  tracks: Track[];
  zoom: number;
  scrollX: number;
  snapEnabled: boolean;
}): ProjectData {
  return {
    version: 1,
    timeline: {
      tracks: state.tracks.map((t) => ({
        id: t.id,
        name: t.name,
        type: t.type,
        muted: t.muted,
        locked: t.locked,
        height: t.height,
        visible: t.visible,
        audioSettings: t.audioSettings,
        clips: t.clips.map((c) => ({
          id: c.id,
          assetId: c.assetId,
          startTime: c.startTime,
          endTime: c.endTime,
          trimStart: c.trimStart,
          trimEnd: c.trimEnd,
          duration: c.duration,
          name: c.name,
          type: c.type,
          volume: c.volume ?? 1,
          filters: c.filters ?? DEFAULT_CLIP_FILTERS,
          fadeInMs: c.fadeInMs ?? 0,
          fadeOutMs: c.fadeOutMs ?? 0,
          positionX: c.positionX,
          positionY: c.positionY,
          scaleX: c.scaleX,
          scaleY: c.scaleY,
          rotation: c.rotation,
          transitionIn: c.transitionIn,
          // Text properties
          textContent: c.textContent,
          fontSize: c.fontSize,
          fontFamily: c.fontFamily,
          fontColor: c.fontColor,
          fontWeight: c.fontWeight,
          textAlign: c.textAlign,
          backgroundColor: c.backgroundColor,
          backgroundOpacity: c.backgroundOpacity,
          textAnimationIn: c.textAnimationIn,
          textAnimationOut: c.textAnimationOut,
          // Keyframe animation
          keyframes: c.keyframes,
          // PiP border
          pipBorder: c.pipBorder,
          // Crop
          cropTop: c.cropTop,
          cropBottom: c.cropBottom,
          cropLeft: c.cropLeft,
          cropRight: c.cropRight,
        })),
      })),
      zoom: state.zoom,
      scrollX: state.scrollX,
      snapEnabled: state.snapEnabled,
    },
  };
}

interface TimelineState {
  tracks: Track[];
  currentTime: number;
  isPlaying: boolean;
  duration: number;
  zoom: number;
  scrollX: number;
  selectedClipIds: string[];
  selectedTrackId: string | null;
  snapEnabled: boolean;
  snapLine: number | null;

  // Track operations
  addTrack: (type: Track['type'], name?: string) => void;
  removeTrack: (trackId: string) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackLock: (trackId: string) => void;
  toggleTrackVisibility: (trackId: string) => void;
  updateTrackAudio: (trackId: string, settings: Partial<TrackAudioSettings>) => void;

  // Clip operations
  addClip: (trackId: string, clip: Omit<Clip, 'trackId'>) => void;
  removeClip: (trackId: string, clipId: string) => void;
  moveClip: (fromTrackId: string, toTrackId: string, clipId: string, newStartTime: number) => void;
  trimClip: (trackId: string, clipId: string, side: 'start' | 'end', newTime: number) => void;
  splitClip: (trackId: string, clipId: string, splitTime: number) => void;
  updateClip: (trackId: string, clipId: string, updates: Partial<Clip>) => void;
  setClipTransition: (clipId: string, transition: Transition | undefined) => void;
  setClipKeyframe: (clipId: string, property: AnimatableProperty, timeMs: number, value: number) => void;
  removeClipKeyframe: (clipId: string, property: AnimatableProperty, timeMs: number) => void;
  removeClipKeyframeTrack: (trackId: string, clipId: string, property: string) => void;

  // Batch operations
  removeSelectedClips: () => void;
  updateSelectedClips: (updates: Partial<Clip>) => void;

  // Playback
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setCurrentTime: (time: number) => void;
  seekForward: (ms?: number) => void;
  seekBackward: (ms?: number) => void;

  // Selection
  selectClip: (clipId: string | null) => void;
  toggleClipSelection: (clipId: string) => void;
  addClipRangeSelection: (clipId: string) => void;
  selectClips: (clipIds: string[]) => void;
  selectTrack: (trackId: string | null) => void;

  // View
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setScrollX: (x: number) => void;
  setSnapLine: (time: number | null) => void;
  toggleSnap: () => void;

  // Serialization
  loadFromProjectData: (data: ProjectData) => void;

  // Utility
  getTimelineDuration: () => number;
  getClipAt: (trackId: string, time: number) => Clip | undefined;
}

let trackCounter = 0;
let clipCounter = 0;
const genTrackId = () => `track_${++trackCounter}_${Date.now()}`;
const genClipId = () => `clip_${++clipCounter}_${Date.now()}`;

export const useTimelineStore = create<TimelineState>()(
  temporal(
    (set, get) => ({
      tracks: [
        {
          id: 'track_video_default',
          name: 'Video 1',
          type: 'video',
          clips: [],
          muted: false,
          locked: false,
          height: 60,
          visible: true,
        },
        {
          id: 'track_audio_default',
          name: 'Audio 1',
          type: 'audio',
          clips: [],
          muted: false,
          locked: false,
          height: 40,
          visible: true,
        },
      ],
      currentTime: 0,
      isPlaying: false,
      duration: 0,
      zoom: 1,
      scrollX: 0,
      selectedClipIds: [],
      selectedTrackId: null,
      snapEnabled: true,
      snapLine: null,

      addTrack: (type, name) => {
        set((state) => ({
          tracks: [
            ...state.tracks,
            {
              id: genTrackId(),
              name: name || `${type.charAt(0).toUpperCase() + type.slice(1)} ${state.tracks.filter((t) => t.type === type).length + 1}`,
              type,
              clips: [],
              muted: false,
              locked: false,
              height: type === 'video' ? 60 : 40,
              visible: true,
            },
          ],
        }));
        broadcast('add_track', { type, name });
      },

      removeTrack: (trackId) => {
        set((state) => ({
          tracks: state.tracks.filter((t) => t.id !== trackId),
        }));
        broadcast('remove_track', { trackId });
      },

      toggleTrackMute: (trackId) => {
        set((state) => ({
          tracks: state.tracks.map((t) =>
            t.id === trackId ? { ...t, muted: !t.muted } : t
          ),
        }));
        broadcast('toggle_track_mute', { trackId });
      },

      toggleTrackLock: (trackId) =>
        set((state) => ({
          tracks: state.tracks.map((t) =>
            t.id === trackId ? { ...t, locked: !t.locked } : t
          ),
        })),

      toggleTrackVisibility: (trackId) =>
        set((state) => ({
          tracks: state.tracks.map((t) =>
            t.id === trackId ? { ...t, visible: !t.visible } : t
          ),
        })),

      updateTrackAudio: (trackId, settings) =>
        set((state) => ({
          tracks: state.tracks.map((t) =>
            t.id === trackId
              ? { ...t, audioSettings: { ...(t.audioSettings ?? { volume: 1, pan: 0 }), ...settings } }
              : t
          ),
        })),

      addClip: (trackId, clip) => {
        set((state) => ({
          tracks: state.tracks.map((track) => {
            if (track.id !== trackId) return track;
            const newClip: Clip = {
              ...clip,
              id: clip.id || genClipId(),
              trackId,
              filters: clip.filters ?? DEFAULT_CLIP_FILTERS,
              fadeInMs: clip.fadeInMs ?? 0,
              fadeOutMs: clip.fadeOutMs ?? 0,
            };
            return { ...track, clips: [...track.clips, newClip] };
          }),
        }));
        broadcast('add_clip', { trackId, clip });
      },

      removeClip: (trackId, clipId) => {
        set((state) => ({
          tracks: state.tracks.map((track) => {
            if (track.id !== trackId) return track;
            return { ...track, clips: track.clips.filter((c) => c.id !== clipId) };
          }),
          selectedClipIds: state.selectedClipIds.filter((id) => id !== clipId),
        }));
        broadcast('remove_clip', { trackId, clipId });
      },

      moveClip: (fromTrackId, toTrackId, clipId, newStartTime) => {
        set((state) => {
          const sourceTrack = state.tracks.find((t) => t.id === fromTrackId);
          const clipToMove = sourceTrack?.clips.find((c) => c.id === clipId);
          if (!clipToMove) return state;

          const clipDuration = clipToMove.endTime - clipToMove.startTime;
          const proposedStart = Math.max(0, newStartTime);
          const proposedEnd = proposedStart + clipDuration;

          // Check for overlaps on the target track
          const targetTrack = state.tracks.find((t) => t.id === toTrackId);
          if (targetTrack) {
            const hasOverlap = targetTrack.clips.some((c) => {
              if (c.id === clipId) return false;
              return proposedStart < c.endTime && proposedEnd > c.startTime;
            });
            if (hasOverlap) return state;
          }

          // Remove from source
          const tracks = state.tracks.map((track) => {
            if (track.id === fromTrackId) {
              return { ...track, clips: track.clips.filter((c) => c.id !== clipId) };
            }
            return track;
          });

          // Add to target with updated position
          const movedClip: Clip = {
            ...clipToMove,
            startTime: proposedStart,
            endTime: proposedEnd,
            trackId: toTrackId,
          };

          return {
            tracks: tracks.map((track) => {
              if (track.id === toTrackId) {
                return { ...track, clips: [...track.clips, movedClip] };
              }
              return track;
            }),
          };
        });
        broadcast('move_clip', { fromTrackId, toTrackId, clipId, newStartTime });
      },

      trimClip: (trackId, clipId, side, newTime) =>
        set((state) => ({
          tracks: state.tracks.map((track) => {
            if (track.id !== trackId) return track;
            return {
              ...track,
              clips: track.clips.map((clip) => {
                if (clip.id !== clipId) return clip;
                if (side === 'start') {
                  const minStart = 0;
                  const maxStart = clip.endTime - 100; // minimum 100ms clip
                  const clamped = Math.max(minStart, Math.min(maxStart, newTime));
                  const trimDelta = clamped - clip.startTime;
                  return {
                    ...clip,
                    startTime: clamped,
                    trimStart: Math.max(0, clip.trimStart + trimDelta),
                  };
                } else {
                  const minEnd = clip.startTime + 100;
                  const clamped = Math.max(minEnd, newTime);
                  return {
                    ...clip,
                    endTime: clamped,
                    trimEnd: Math.max(0, clip.duration - (clamped - clip.startTime + clip.trimStart)),
                  };
                }
              }),
            };
          }),
        })),

      splitClip: (trackId, clipId, splitTime) => {
        set((state) => ({
          tracks: state.tracks.map((track) => {
            if (track.id !== trackId) return track;
            const clipIndex = track.clips.findIndex((c) => c.id === clipId);
            if (clipIndex === -1) return track;

            const clip = track.clips[clipIndex];
            if (splitTime <= clip.startTime || splitTime >= clip.endTime) return track;

            const leftClip: Clip = {
              ...clip,
              id: genClipId(),
              endTime: splitTime,
            };

            const rightClip: Clip = {
              ...clip,
              id: genClipId(),
              startTime: splitTime,
              trimStart: clip.trimStart + (splitTime - clip.startTime),
            };

            const newClips = [...track.clips];
            newClips.splice(clipIndex, 1, leftClip, rightClip);
            return { ...track, clips: newClips };
          }),
        }));
        broadcast('split_clip', { trackId, clipId, splitTime });
      },

      updateClip: (trackId, clipId, updates) => {
        set((state) => ({
          tracks: state.tracks.map((track) => {
            if (track.id !== trackId) return track;
            return {
              ...track,
              clips: track.clips.map((c) =>
                c.id === clipId ? { ...c, ...updates } : c
              ),
            };
          }),
        }));
        broadcast('update_clip', { trackId, clipId, updates });
      },

      setClipTransition: (clipId, transition) =>
        set((state) => ({
          tracks: state.tracks.map((track) => ({
            ...track,
            clips: track.clips.map((c) =>
              c.id === clipId ? { ...c, transitionIn: transition } : c
            ),
          })),
        })),

      setClipKeyframe: (clipId, property, timeMs, value) =>
        set((state) => ({
          tracks: state.tracks.map((track) => ({
            ...track,
            clips: track.clips.map((c) =>
              c.id === clipId
                ? { ...c, keyframes: setKeyframe(c.keyframes, property, timeMs, value) }
                : c
            ),
          })),
        })),

      removeClipKeyframe: (clipId, property, timeMs) =>
        set((state) => ({
          tracks: state.tracks.map((track) => ({
            ...track,
            clips: track.clips.map((c) =>
              c.id === clipId
                ? { ...c, keyframes: removeKeyframe(c.keyframes, property, timeMs) }
                : c
            ),
          })),
        })),

      removeClipKeyframeTrack: (trackId, clipId, property) =>
        set((state) => ({
          tracks: state.tracks.map((track) =>
            track.id === trackId
              ? {
                  ...track,
                  clips: track.clips.map((c) => {
                    if (c.id !== clipId || !c.keyframes) return c;
                    const { [property]: _, ...rest } = c.keyframes;
                    return { ...c, keyframes: Object.keys(rest).length > 0 ? rest : undefined };
                  }),
                }
              : track
          ),
        })),

      play: () => set({ isPlaying: true }),
      pause: () => set({ isPlaying: false }),
      togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
      setCurrentTime: (time) => set({ currentTime: Math.max(0, time) }),
      seekForward: (ms = 1000) => set((s) => ({ currentTime: s.currentTime + ms })),
      seekBackward: (ms = 1000) => set((s) => ({ currentTime: Math.max(0, s.currentTime - ms) })),

      removeSelectedClips: () =>
        set((state) => {
          const idsToRemove = new Set(state.selectedClipIds);
          return {
            tracks: state.tracks.map((track) => ({
              ...track,
              clips: track.clips.filter((c) => !idsToRemove.has(c.id)),
            })),
            selectedClipIds: [],
          };
        }),

      updateSelectedClips: (updates) =>
        set((state) => {
          const ids = new Set(state.selectedClipIds);
          return {
            tracks: state.tracks.map((track) => ({
              ...track,
              clips: track.clips.map((c) =>
                ids.has(c.id) ? { ...c, ...updates } : c
              ),
            })),
          };
        }),

      selectClip: (clipId) => set({ selectedClipIds: clipId ? [clipId] : [] }),

      toggleClipSelection: (clipId) =>
        set((state) => {
          const idx = state.selectedClipIds.indexOf(clipId);
          if (idx >= 0) {
            return { selectedClipIds: state.selectedClipIds.filter((id) => id !== clipId) };
          }
          return { selectedClipIds: [...state.selectedClipIds, clipId] };
        }),

      addClipRangeSelection: (clipId) =>
        set((state) => {
          // Find the track containing the clicked clip
          let targetTrack: Track | undefined;
          let clickedClip: Clip | undefined;
          for (const t of state.tracks) {
            const c = t.clips.find((cl) => cl.id === clipId);
            if (c) { targetTrack = t; clickedClip = c; break; }
          }
          if (!targetTrack || !clickedClip) return { selectedClipIds: [clipId] };

          // Find the last selected clip on the same track
          const lastSelected = state.selectedClipIds[state.selectedClipIds.length - 1];
          let anchorClip: Clip | undefined;
          if (lastSelected) {
            anchorClip = targetTrack.clips.find((c) => c.id === lastSelected);
          }
          if (!anchorClip) return { selectedClipIds: [clipId] };

          // Select all clips between anchor and clicked (by startTime)
          const minTime = Math.min(anchorClip.startTime, clickedClip.startTime);
          const maxTime = Math.max(anchorClip.endTime, clickedClip.endTime);
          const rangeIds = targetTrack.clips
            .filter((c) => c.startTime >= minTime && c.endTime <= maxTime)
            .map((c) => c.id);

          // Merge with existing selection from other tracks
          const otherTrackIds = state.selectedClipIds.filter(
            (id) => !targetTrack!.clips.some((c) => c.id === id)
          );
          return { selectedClipIds: [...otherTrackIds, ...rangeIds] };
        }),

      selectClips: (clipIds) => set({ selectedClipIds: clipIds }),

      selectTrack: (trackId) => set({ selectedTrackId: trackId }),

      setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(10, zoom)) }),
      zoomIn: () => set((s) => ({ zoom: Math.min(10, s.zoom * 1.2) })),
      zoomOut: () => set((s) => ({ zoom: Math.max(0.1, s.zoom / 1.2) })),
      setScrollX: (x) => set({ scrollX: Math.max(0, x) }),
      setSnapLine: (time) => set({ snapLine: time }),
      toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),

      getTimelineDuration: () => {
        const { tracks } = get();
        let maxEnd = 0;
        for (const track of tracks) {
          for (const clip of track.clips) {
            maxEnd = Math.max(maxEnd, clip.endTime);
          }
        }
        return maxEnd;
      },

      getClipAt: (trackId, time) => {
        const track = get().tracks.find((t) => t.id === trackId);
        if (!track) return undefined;
        return track.clips.find((c) => time >= c.startTime && time < c.endTime);
      },

      loadFromProjectData: (data: ProjectData) => {
        if (!data?.timeline?.tracks) return;
        set({
          tracks: data.timeline.tracks.map((t) => ({
            id: t.id,
            name: t.name,
            type: t.type as Track['type'],
            muted: t.muted,
            locked: t.locked,
            height: t.height,
            visible: t.visible,
            audioSettings: t.audioSettings,
            clips: t.clips.map((c) => ({
              id: c.id,
              assetId: c.assetId,
              trackId: t.id,
              startTime: c.startTime,
              endTime: c.endTime,
              trimStart: c.trimStart,
              trimEnd: c.trimEnd,
              duration: c.duration,
              name: c.name,
              type: c.type,
              volume: c.volume,
              filters: c.filters ?? DEFAULT_CLIP_FILTERS,
              fadeInMs: c.fadeInMs ?? 0,
              fadeOutMs: c.fadeOutMs ?? 0,
              positionX: c.positionX,
              positionY: c.positionY,
              scaleX: c.scaleX,
              scaleY: c.scaleY,
              rotation: c.rotation,
              transitionIn: c.transitionIn,
              // Text properties
              textContent: c.textContent,
              fontSize: c.fontSize,
              fontFamily: c.fontFamily,
              fontColor: c.fontColor,
              fontWeight: c.fontWeight,
              textAlign: c.textAlign,
              backgroundColor: c.backgroundColor,
              backgroundOpacity: c.backgroundOpacity,
              textAnimationIn: c.textAnimationIn,
              textAnimationOut: c.textAnimationOut,
              // Keyframe animation
              keyframes: c.keyframes,
              // PiP border
              pipBorder: c.pipBorder,
              // Crop
              cropTop: c.cropTop,
              cropBottom: c.cropBottom,
              cropLeft: c.cropLeft,
              cropRight: c.cropRight,
            })),
          })),
          zoom: data.timeline.zoom ?? 1,
          scrollX: data.timeline.scrollX ?? 0,
          snapEnabled: data.timeline.snapEnabled ?? true,
          currentTime: 0,
          isPlaying: false,
          selectedClipIds: [],
          selectedTrackId: null,
        });

        // Clear undo/redo history for fresh project state
        // setTimeout needed because clear() must run after state update completes
        setTimeout(() => {
          useTimelineStore.temporal.getState().clear();
        }, 0);
      },
    }),
    {
      limit: 100,
      partialize: (state) => ({
        // Only track content state, not transient UI state
        tracks: state.tracks,
        zoom: state.zoom,
        scrollX: state.scrollX,
        snapEnabled: state.snapEnabled,
        // Excluded from history:
        // - currentTime (playback position)
        // - isPlaying (playback state)
        // - selectedClipIds, selectedTrackId (selection)
        // - snapLine (visual feedback)
        // - duration (computed)
      }),
    }
  )
);
