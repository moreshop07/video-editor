/**
 * Ken Burns Motion Presets
 *
 * Keyframe-based motion presets using positionX/Y and scaleX/Y.
 * Each preset generates keyframes for a given clip duration.
 */

import type { Keyframe } from '@/types/keyframes';

export interface KenBurnsPreset {
  id: string;
  labelKey: string;
  generate: (clipDurationMs: number) => Record<string, Keyframe[]>;
}

export const KEN_BURNS_PRESETS: KenBurnsPreset[] = [
  {
    id: 'slowZoomIn',
    labelKey: 'kenBurns.slowZoomIn',
    generate: (dur) => ({
      scaleX: [
        { time: 0, value: 1, easing: 'easeInOut' },
        { time: dur, value: 1.3 },
      ],
      scaleY: [
        { time: 0, value: 1, easing: 'easeInOut' },
        { time: dur, value: 1.3 },
      ],
    }),
  },
  {
    id: 'slowZoomOut',
    labelKey: 'kenBurns.slowZoomOut',
    generate: (dur) => ({
      scaleX: [
        { time: 0, value: 1.3, easing: 'easeInOut' },
        { time: dur, value: 1 },
      ],
      scaleY: [
        { time: 0, value: 1.3, easing: 'easeInOut' },
        { time: dur, value: 1 },
      ],
    }),
  },
  {
    id: 'panLeftToRight',
    labelKey: 'kenBurns.panLeftToRight',
    generate: (dur) => ({
      positionX: [
        { time: 0, value: 0.35, easing: 'easeInOut' },
        { time: dur, value: 0.65 },
      ],
      scaleX: [
        { time: 0, value: 1.2 },
        { time: dur, value: 1.2 },
      ],
      scaleY: [
        { time: 0, value: 1.2 },
        { time: dur, value: 1.2 },
      ],
    }),
  },
  {
    id: 'panRightToLeft',
    labelKey: 'kenBurns.panRightToLeft',
    generate: (dur) => ({
      positionX: [
        { time: 0, value: 0.65, easing: 'easeInOut' },
        { time: dur, value: 0.35 },
      ],
      scaleX: [
        { time: 0, value: 1.2 },
        { time: dur, value: 1.2 },
      ],
      scaleY: [
        { time: 0, value: 1.2 },
        { time: dur, value: 1.2 },
      ],
    }),
  },
  {
    id: 'zoomInWithPan',
    labelKey: 'kenBurns.zoomInWithPan',
    generate: (dur) => ({
      positionX: [
        { time: 0, value: 0.4, easing: 'easeInOut' },
        { time: dur, value: 0.6 },
      ],
      positionY: [
        { time: 0, value: 0.4, easing: 'easeInOut' },
        { time: dur, value: 0.6 },
      ],
      scaleX: [
        { time: 0, value: 1, easing: 'easeInOut' },
        { time: dur, value: 1.4 },
      ],
      scaleY: [
        { time: 0, value: 1, easing: 'easeInOut' },
        { time: dur, value: 1.4 },
      ],
    }),
  },
];

/**
 * Apply a Ken Burns preset to a clip by setting keyframes via the store.
 */
export function applyKenBurns(
  clipId: string,
  trackId: string,
  presetId: string,
  clipDurationMs: number,
  store: {
    setClipKeyframe: (clipId: string, property: string, time: number, value: number) => void;
    removeClipKeyframeTrack: (trackId: string, clipId: string, property: string) => void;
  },
): void {
  const preset = KEN_BURNS_PRESETS.find((p) => p.id === presetId);
  if (!preset) return;

  const keyframes = preset.generate(clipDurationMs);

  // First remove existing position/scale keyframes
  for (const prop of ['positionX', 'positionY', 'scaleX', 'scaleY']) {
    store.removeClipKeyframeTrack(trackId, clipId, prop);
  }

  // Set new keyframes
  for (const [prop, kfs] of Object.entries(keyframes)) {
    for (const kf of kfs) {
      store.setClipKeyframe(clipId, prop, kf.time, kf.value);
    }
  }
}

/**
 * Remove Ken Burns keyframes from a clip.
 */
export function removeKenBurns(
  clipId: string,
  trackId: string,
  store: {
    removeClipKeyframeTrack: (trackId: string, clipId: string, property: string) => void;
  },
): void {
  for (const prop of ['positionX', 'positionY', 'scaleX', 'scaleY']) {
    store.removeClipKeyframeTrack(trackId, clipId, prop);
  }
}
