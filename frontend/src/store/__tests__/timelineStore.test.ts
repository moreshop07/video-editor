import { describe, it, expect, beforeEach } from 'vitest';
import { useTimelineStore, serializeForSave } from '../timelineStore';
import { DEFAULT_CLIP_FILTERS } from '@/effects/types';

function getState() {
  return useTimelineStore.getState();
}

function makeClip(overrides: Record<string, unknown> = {}) {
  return {
    id: `clip_test_${Date.now()}`,
    assetId: 'asset_1',
    startTime: 0,
    endTime: 5000,
    trimStart: 0,
    trimEnd: 0,
    duration: 10000,
    name: 'Test Clip',
    type: 'video',
    filters: DEFAULT_CLIP_FILTERS,
    fadeInMs: 0,
    fadeOutMs: 0,
    ...overrides,
  };
}

describe('timelineStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useTimelineStore.setState({
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
    });
  });

  it('should have correct initial state', () => {
    const state = getState();
    expect(state.tracks).toHaveLength(2);
    expect(state.tracks[0].type).toBe('video');
    expect(state.tracks[1].type).toBe('audio');
    expect(state.currentTime).toBe(0);
    expect(state.isPlaying).toBe(false);
    expect(state.zoom).toBe(1);
    expect(state.selectedClipIds).toEqual([]);
  });

  it('addTrack should add a new track', () => {
    getState().addTrack('music');
    const state = getState();
    expect(state.tracks).toHaveLength(3);
    expect(state.tracks[2].type).toBe('music');
    expect(state.tracks[2].clips).toEqual([]);
  });

  it('addClip should add a clip to a track with default filters', () => {
    const clip = makeClip();
    getState().addClip('track_video_default', clip);
    const state = getState();
    const track = state.tracks.find((t) => t.id === 'track_video_default');
    expect(track?.clips).toHaveLength(1);
    expect(track?.clips[0].name).toBe('Test Clip');
    expect(track?.clips[0].filters).toEqual(DEFAULT_CLIP_FILTERS);
  });

  it('removeClip should remove a clip and clear selection', () => {
    const clip = makeClip({ id: 'clip_to_remove' });
    getState().addClip('track_video_default', clip);
    getState().selectClip('clip_to_remove');
    expect(getState().selectedClipIds).toEqual(['clip_to_remove']);

    getState().removeClip('track_video_default', 'clip_to_remove');
    const track = getState().tracks.find((t) => t.id === 'track_video_default');
    expect(track?.clips).toHaveLength(0);
    expect(getState().selectedClipIds).toEqual([]);
  });

  it('moveClip should update startTime and endTime', () => {
    const clip = makeClip({ id: 'clip_move', startTime: 0, endTime: 5000 });
    getState().addClip('track_video_default', clip);

    getState().moveClip(
      'track_video_default',
      'track_video_default',
      'clip_move',
      2000,
    );

    const track = getState().tracks.find((t) => t.id === 'track_video_default');
    const movedClip = track?.clips.find((c) => c.id === 'clip_move');
    expect(movedClip?.startTime).toBe(2000);
    expect(movedClip?.endTime).toBe(7000);
  });

  it('trimClip should adjust startTime and trimStart', () => {
    const clip = makeClip({
      id: 'clip_trim',
      startTime: 1000,
      endTime: 5000,
      trimStart: 0,
    });
    getState().addClip('track_video_default', clip);

    getState().trimClip('track_video_default', 'clip_trim', 'start', 2000);

    const track = getState().tracks.find((t) => t.id === 'track_video_default');
    const trimmed = track?.clips.find((c) => c.id === 'clip_trim');
    expect(trimmed?.startTime).toBe(2000);
    expect(trimmed?.trimStart).toBe(1000);
  });

  it('splitClip should produce two clips', () => {
    const clip = makeClip({
      id: 'clip_split',
      startTime: 0,
      endTime: 6000,
      trimStart: 0,
    });
    getState().addClip('track_video_default', clip);

    getState().splitClip('track_video_default', 'clip_split', 3000);

    const track = getState().tracks.find((t) => t.id === 'track_video_default');
    expect(track?.clips).toHaveLength(2);
    expect(track?.clips[0].endTime).toBe(3000);
    expect(track?.clips[1].startTime).toBe(3000);
  });

  it('updateClip should merge partial updates', () => {
    const clip = makeClip({ id: 'clip_update', name: 'Original' });
    getState().addClip('track_video_default', clip);

    getState().updateClip('track_video_default', 'clip_update', {
      name: 'Updated',
    });

    const track = getState().tracks.find((t) => t.id === 'track_video_default');
    const updated = track?.clips.find((c) => c.id === 'clip_update');
    expect(updated?.name).toBe('Updated');
    expect(updated?.startTime).toBe(0); // unchanged
  });

  it('play/pause should toggle isPlaying', () => {
    getState().play();
    expect(getState().isPlaying).toBe(true);
    getState().pause();
    expect(getState().isPlaying).toBe(false);
  });

  it('setZoom should clamp between 0.1 and 10', () => {
    getState().setZoom(20);
    expect(getState().zoom).toBe(10);
    getState().setZoom(0.01);
    expect(getState().zoom).toBe(0.1);
    getState().setZoom(5);
    expect(getState().zoom).toBe(5);
  });

  it('getTimelineDuration should return max endTime', () => {
    getState().addClip('track_video_default', makeClip({ endTime: 8000 }));
    getState().addClip('track_audio_default', makeClip({ endTime: 12000, type: 'audio' }));
    expect(getState().getTimelineDuration()).toBe(12000);
  });

  it('serializeForSave should produce correct ProjectData shape', () => {
    getState().addClip('track_video_default', makeClip({ id: 'ser1' }));
    const state = getState();
    const data = serializeForSave({
      tracks: state.tracks,
      markers: state.markers,
      zoom: state.zoom,
      scrollX: state.scrollX,
      snapEnabled: state.snapEnabled,
    });

    expect(data.version).toBe(1);
    expect(data.timeline.tracks).toHaveLength(2);
    expect(data.timeline.zoom).toBe(1);
    expect(data.timeline.tracks[0].clips).toHaveLength(1);
    expect(data.timeline.tracks[0].clips[0].id).toBe('ser1');
  });

  it('toggleSnap should toggle snapEnabled', () => {
    expect(getState().snapEnabled).toBe(true);
    getState().toggleSnap();
    expect(getState().snapEnabled).toBe(false);
    getState().toggleSnap();
    expect(getState().snapEnabled).toBe(true);
  });

  it('loadFromProjectData should hydrate store and reset playback', () => {
    getState().play();
    getState().setCurrentTime(5000);

    getState().loadFromProjectData({
      version: 1,
      timeline: {
        tracks: [
          {
            id: 'loaded_track',
            name: 'Loaded',
            type: 'video',
            muted: false,
            locked: false,
            height: 60,
            visible: true,
            clips: [
              {
                id: 'loaded_clip',
                assetId: 'a1',
                startTime: 0,
                endTime: 3000,
                trimStart: 0,
                trimEnd: 0,
                duration: 5000,
                name: 'Loaded Clip',
                type: 'video',
                volume: 1,
                filters: DEFAULT_CLIP_FILTERS,
                fadeInMs: 0,
                fadeOutMs: 0,
              },
            ],
          },
        ],
        zoom: 2,
        scrollX: 100,
        snapEnabled: false,
      },
    });

    const state = getState();
    expect(state.tracks).toHaveLength(1);
    expect(state.tracks[0].id).toBe('loaded_track');
    expect(state.tracks[0].clips[0].id).toBe('loaded_clip');
    expect(state.zoom).toBe(2);
    expect(state.currentTime).toBe(0);
    expect(state.isPlaying).toBe(false);
    expect(state.selectedClipIds).toEqual([]);
  });
});
