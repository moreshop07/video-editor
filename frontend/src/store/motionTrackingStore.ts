import { create } from 'zustand';
import type {
  TrackingMode,
  TrackingROI,
  TrackingPoint,
  TrackingResult,
  TrackerWorkerResponse,
} from '@/engine/motionTrackerTypes';
import { trackingToKeyframes } from '@/utils/trackingSmoother';
import { useTimelineStore } from './timelineStore';
import { VideoDecoderPool } from '@/engine/VideoDecoderPool';
import { HTMLVideoPool } from '@/engine/fallback/HTMLVideoPool';
import type { IVideoDecoderPool } from '@/engine/types';
import type { KeyframeTracks } from '@/types/keyframes';

export type TrackingStatus = 'idle' | 'selectingROI' | 'tracking' | 'completed' | 'error';

interface MotionTrackingState {
  status: TrackingStatus;
  progress: number;
  error: string | null;

  // Source
  sourceClipId: string | null;
  sourceTrackId: string | null;
  sourceAssetId: string | null;
  mode: TrackingMode;
  roi: TrackingROI | null;
  sampleInterval: number;
  sourceVideoWidth: number;
  sourceVideoHeight: number;

  // Results
  rawResult: TrackingResult | null;
  smoothingAmount: number;
  previewPoints: TrackingPoint[];

  // Target
  targetClipId: string | null;
  targetTrackId: string | null;
  positionOffsetX: number;
  positionOffsetY: number;
  scaleMultiplier: number;

  // Internal
  _worker: Worker | null;
  _decoderPool: IVideoDecoderPool | null;
  _cancelled: boolean;

  // Actions
  startROISelection: (clipId: string, trackId: string, assetId: string, videoWidth: number, videoHeight: number) => void;
  setROI: (roi: TrackingROI) => void;
  setMode: (mode: TrackingMode) => void;
  setSampleInterval: (n: number) => void;
  startTracking: () => Promise<void>;
  cancelTracking: () => void;
  setSmoothing: (amount: number) => void;
  setTargetClip: (clipId: string, trackId: string) => void;
  setPositionOffset: (x: number, y: number) => void;
  setScaleMultiplier: (v: number) => void;
  applyToTargetClip: () => void;
  reset: () => void;
}

export const useMotionTrackingStore = create<MotionTrackingState>((set, get) => ({
  status: 'idle',
  progress: 0,
  error: null,

  sourceClipId: null,
  sourceTrackId: null,
  sourceAssetId: null,
  mode: 'region',
  roi: null,
  sampleInterval: 3,
  sourceVideoWidth: 0,
  sourceVideoHeight: 0,

  rawResult: null,
  smoothingAmount: 0.3,
  previewPoints: [],

  targetClipId: null,
  targetTrackId: null,
  positionOffsetX: 0,
  positionOffsetY: 0,
  scaleMultiplier: 1.0,

  _worker: null,
  _decoderPool: null,
  _cancelled: false,

  startROISelection: (clipId, trackId, assetId, videoWidth, videoHeight) => {
    set({
      status: 'selectingROI',
      sourceClipId: clipId,
      sourceTrackId: trackId,
      sourceAssetId: assetId,
      sourceVideoWidth: videoWidth,
      sourceVideoHeight: videoHeight,
      roi: null,
      rawResult: null,
      previewPoints: [],
      error: null,
    });
  },

  setROI: (roi) => set({ roi }),

  setMode: (mode) => set({ mode }),

  setSampleInterval: (n) => set({ sampleInterval: Math.max(1, Math.min(10, n)) }),

  startTracking: async () => {
    const state = get();
    if (!state.sourceAssetId || !state.roi) return;

    set({ status: 'tracking', progress: 0, previewPoints: [], error: null, _cancelled: false });

    // Create decoder pool
    const decoderPool: IVideoDecoderPool = VideoDecoderPool.isSupported()
      ? new VideoDecoderPool()
      : new HTMLVideoPool();

    set({ _decoderPool: decoderPool });

    const assetUrl = `/api/v1/assets/${state.sourceAssetId}/stream`;

    try {
      await decoderPool.preload(state.sourceAssetId, assetUrl);
    } catch (err) {
      set({ status: 'error', error: `Failed to load video: ${err}` });
      return;
    }

    // Find clip duration from timeline store
    const timelineState = useTimelineStore.getState();
    let clipDurationMs = 0;
    let trimStart = 0;
    for (const track of timelineState.tracks) {
      const clip = track.clips.find((c) => c.id === state.sourceClipId);
      if (clip) {
        clipDurationMs = clip.endTime - clip.startTime;
        trimStart = clip.trimStart;
        break;
      }
    }

    if (clipDurationMs <= 0) {
      set({ status: 'error', error: 'Clip has no duration' });
      return;
    }

    // Create worker
    const worker = new Worker(
      new URL('../engine/motionTracker.worker.ts', import.meta.url),
      { type: 'module' },
    );

    set({ _worker: worker });

    // Frame interval based on 30fps * sampleInterval
    const frameIntervalMs = (1000 / 30) * state.sampleInterval;
    const totalFrames = Math.ceil(clipDurationMs / frameIntervalMs);

    // Listen to worker messages
    return new Promise<void>((resolve) => {
      worker.onmessage = (e: MessageEvent<TrackerWorkerResponse>) => {
        const msg = e.data;
        switch (msg.type) {
          case 'progress':
            set((s) => ({
              progress: msg.percent,
              previewPoints: [...s.previewPoints, msg.currentPoint],
            }));
            break;

          case 'complete':
            set({
              status: 'completed',
              progress: 100,
              rawResult: msg.result,
            });
            worker.terminate();
            decoderPool.releaseAll();
            set({ _worker: null, _decoderPool: null });
            resolve();
            break;

          case 'error':
            set({ status: 'error', error: msg.message });
            worker.terminate();
            decoderPool.releaseAll();
            set({ _worker: null, _decoderPool: null });
            resolve();
            break;

          case 'cancelled':
            worker.terminate();
            decoderPool.releaseAll();
            set({ _worker: null, _decoderPool: null });
            resolve();
            break;
        }
      };

      // Init worker
      worker.postMessage({
        type: 'init',
        mode: state.mode,
        roi: state.roi,
        videoWidth: state.sourceVideoWidth,
        videoHeight: state.sourceVideoHeight,
      });

      // Extract frames and send to worker
      const offscreen = new OffscreenCanvas(state.sourceVideoWidth, state.sourceVideoHeight);
      const ctx = offscreen.getContext('2d')!;

      (async () => {
        let framesSent = 0;
        for (let t = 0; t < clipDurationMs; t += frameIntervalMs) {
          if (get()._cancelled) break;

          const sourceTime = trimStart + t;
          try {
            const frame = await decoderPool.getFrame(state.sourceAssetId!, sourceTime);
            if (!frame) continue;

            ctx.clearRect(0, 0, state.sourceVideoWidth, state.sourceVideoHeight);
            ctx.drawImage(frame, 0, 0, state.sourceVideoWidth, state.sourceVideoHeight);
            frame.close();

            const imageData = ctx.getImageData(0, 0, state.sourceVideoWidth, state.sourceVideoHeight);

            worker.postMessage(
              { type: 'frame', timeMs: t, imageData },
              [imageData.data.buffer],
            );

            framesSent++;

            // Update progress based on frames sent
            set({ progress: (framesSent / totalFrames) * 100 });
          } catch {
            // Skip failed frames
          }
        }

        if (!get()._cancelled) {
          worker.postMessage({ type: 'finish' });
        }
      })();
    });
  },

  cancelTracking: () => {
    const { _worker, _decoderPool } = get();
    set({ _cancelled: true, status: 'idle', progress: 0, previewPoints: [] });
    if (_worker) {
      _worker.postMessage({ type: 'cancel' });
      _worker.terminate();
    }
    if (_decoderPool) {
      _decoderPool.releaseAll();
    }
    set({ _worker: null, _decoderPool: null });
  },

  setSmoothing: (amount) => set({ smoothingAmount: Math.max(0, Math.min(1, amount)) }),

  setTargetClip: (clipId, trackId) => set({ targetClipId: clipId, targetTrackId: trackId }),

  setPositionOffset: (x, y) => set({ positionOffsetX: x, positionOffsetY: y }),

  setScaleMultiplier: (v) => set({ scaleMultiplier: Math.max(0.1, Math.min(3, v)) }),

  applyToTargetClip: () => {
    const state = get();
    if (!state.rawResult || !state.targetClipId || !state.targetTrackId) return;

    const keyframeData = trackingToKeyframes(
      state.rawResult,
      state.smoothingAmount,
      state.positionOffsetX,
      state.positionOffsetY,
      state.scaleMultiplier,
    );

    // Build KeyframeTracks object
    const keyframes: KeyframeTracks = {};

    keyframes.positionX = keyframeData.positionX.map((kf) => ({
      time: kf.time,
      value: kf.value,
      easing: 'linear' as const,
    }));

    keyframes.positionY = keyframeData.positionY.map((kf) => ({
      time: kf.time,
      value: kf.value,
      easing: 'linear' as const,
    }));

    if (keyframeData.scaleX) {
      keyframes.scaleX = keyframeData.scaleX.map((kf) => ({
        time: kf.time,
        value: kf.value,
        easing: 'linear' as const,
      }));
    }

    if (keyframeData.scaleY) {
      keyframes.scaleY = keyframeData.scaleY.map((kf) => ({
        time: kf.time,
        value: kf.value,
        easing: 'linear' as const,
      }));
    }

    if (keyframeData.rotation) {
      keyframes.rotation = keyframeData.rotation.map((kf) => ({
        time: kf.time,
        value: kf.value,
        easing: 'linear' as const,
      }));
    }

    // Batch update: merge with existing keyframes
    const timelineState = useTimelineStore.getState();
    const track = timelineState.tracks.find((t) => t.id === state.targetTrackId);
    if (!track) return;
    const clip = track.clips.find((c) => c.id === state.targetClipId);
    if (!clip) return;

    const mergedKeyframes: KeyframeTracks = { ...clip.keyframes };
    for (const [prop, kfs] of Object.entries(keyframes)) {
      mergedKeyframes[prop] = kfs;
    }

    timelineState.updateClip(state.targetTrackId!, state.targetClipId!, {
      keyframes: mergedKeyframes,
    });
  },

  reset: () => {
    const { _worker, _decoderPool } = get();
    if (_worker) _worker.terminate();
    if (_decoderPool) _decoderPool.releaseAll();

    set({
      status: 'idle',
      progress: 0,
      error: null,
      sourceClipId: null,
      sourceTrackId: null,
      sourceAssetId: null,
      mode: 'region',
      roi: null,
      sampleInterval: 3,
      sourceVideoWidth: 0,
      sourceVideoHeight: 0,
      rawResult: null,
      smoothingAmount: 0.3,
      previewPoints: [],
      targetClipId: null,
      targetTrackId: null,
      positionOffsetX: 0,
      positionOffsetY: 0,
      scaleMultiplier: 1.0,
      _worker: null,
      _decoderPool: null,
      _cancelled: false,
    });
  },
}));
