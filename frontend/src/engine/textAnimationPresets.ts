/**
 * Text Animation Presets
 *
 * Each preset is a function that generates keyframe entries for a given
 * animation duration.  Entrance presets animate from time 0 → animDuration.
 * The caller mirrors timing for exit animations.
 */

import type { Keyframe, EasingType } from '@/types/keyframes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TextAnimationPresetName =
  | 'none'
  | 'fadeIn'
  | 'slideLeft'
  | 'slideRight'
  | 'slideUp'
  | 'slideDown'
  | 'zoomIn'
  | 'zoomOut'
  | 'bounce'
  | 'typewriter'
  | 'spin'
  | 'expand';

export interface TextAnimationKeyframes {
  /** Property name → array of keyframes (time is 0‑based within anim duration) */
  [property: string]: Keyframe[];
}

export interface TextAnimationDef {
  labelKey: string;
  /** Generate entrance keyframes.  `animDur` is in ms. */
  generate: (animDur: number) => TextAnimationKeyframes;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function kf(time: number, value: number, easing?: EasingType): Keyframe {
  return easing ? { time, value, easing } : { time, value };
}

// ---------------------------------------------------------------------------
// Preset Definitions (entrance direction – time goes 0 → animDur)
// ---------------------------------------------------------------------------

export const TEXT_ANIMATION_PRESETS: Record<string, TextAnimationDef> = {
  fadeIn: {
    labelKey: 'textAnimation.fadeIn',
    generate: (d) => ({
      opacity: [kf(0, 0, 'easeOut'), kf(d, 1)],
    }),
  },

  slideLeft: {
    labelKey: 'textAnimation.slideLeft',
    generate: (d) => ({
      positionX: [kf(0, -0.3, 'easeOut'), kf(d, 0.5)],
      opacity: [kf(0, 0), kf(d * 0.4, 1)],
    }),
  },

  slideRight: {
    labelKey: 'textAnimation.slideRight',
    generate: (d) => ({
      positionX: [kf(0, 1.3, 'easeOut'), kf(d, 0.5)],
      opacity: [kf(0, 0), kf(d * 0.4, 1)],
    }),
  },

  slideUp: {
    labelKey: 'textAnimation.slideUp',
    generate: (d) => ({
      positionY: [kf(0, 1.3, 'easeOut'), kf(d, 0.5)],
      opacity: [kf(0, 0), kf(d * 0.4, 1)],
    }),
  },

  slideDown: {
    labelKey: 'textAnimation.slideDown',
    generate: (d) => ({
      positionY: [kf(0, -0.3, 'easeOut'), kf(d, 0.5)],
      opacity: [kf(0, 0), kf(d * 0.4, 1)],
    }),
  },

  zoomIn: {
    labelKey: 'textAnimation.zoomIn',
    generate: (d) => ({
      scaleX: [kf(0, 0.1, 'easeOut'), kf(d, 1)],
      scaleY: [kf(0, 0.1, 'easeOut'), kf(d, 1)],
      opacity: [kf(0, 0), kf(d * 0.3, 1)],
    }),
  },

  zoomOut: {
    labelKey: 'textAnimation.zoomOut',
    generate: (d) => ({
      scaleX: [kf(0, 2, 'easeOut'), kf(d, 1)],
      scaleY: [kf(0, 2, 'easeOut'), kf(d, 1)],
      opacity: [kf(0, 0), kf(d * 0.3, 1)],
    }),
  },

  bounce: {
    labelKey: 'textAnimation.bounce',
    generate: (d) => ({
      scaleX: [
        kf(0, 0, 'easeOut'),
        kf(d * 0.5, 1.2, 'easeInOut'),
        kf(d * 0.75, 0.9, 'easeInOut'),
        kf(d, 1),
      ],
      scaleY: [
        kf(0, 0, 'easeOut'),
        kf(d * 0.5, 1.2, 'easeInOut'),
        kf(d * 0.75, 0.9, 'easeInOut'),
        kf(d, 1),
      ],
      opacity: [kf(0, 0), kf(d * 0.2, 1)],
    }),
  },

  typewriter: {
    labelKey: 'textAnimation.typewriter',
    generate: (d) => ({
      textRevealProgress: [kf(0, 0, 'linear'), kf(d, 1)],
    }),
  },

  spin: {
    labelKey: 'textAnimation.spin',
    generate: (d) => ({
      rotation: [kf(0, 0, 'easeOut'), kf(d, 360)],
      opacity: [kf(0, 0), kf(d * 0.3, 1)],
    }),
  },

  expand: {
    labelKey: 'textAnimation.expand',
    generate: (d) => ({
      scaleX: [kf(0, 0, 'easeOut'), kf(d, 1)],
      opacity: [kf(0, 0), kf(d * 0.3, 1)],
    }),
  },
};

/** All preset names excluding 'none' */
export const TEXT_ANIMATION_PRESET_NAMES: TextAnimationPresetName[] = [
  'fadeIn',
  'slideLeft',
  'slideRight',
  'slideUp',
  'slideDown',
  'zoomIn',
  'zoomOut',
  'bounce',
  'typewriter',
  'spin',
  'expand',
];

// ---------------------------------------------------------------------------
// Apply / Remove
// ---------------------------------------------------------------------------

/** Properties that text animation presets may touch */
const ANIM_PROPERTIES = [
  'opacity',
  'positionX',
  'positionY',
  'scaleX',
  'scaleY',
  'rotation',
  'textRevealProgress',
];

import type { AnimatableProperty } from '@/types/keyframes';
import { ANIMATABLE_PROPERTY_DEFAULTS } from '@/types/keyframes';

/**
 * Apply a text animation preset to a clip.
 *
 * @param clipId      Target clip ID
 * @param presetName  Preset name (e.g. 'fadeIn')
 * @param direction   'in' for entrance, 'out' for exit
 * @param clipDuration Clip duration in ms
 * @param animDuration Animation duration in ms (default 500)
 * @param store       Store actions: setClipKeyframe, removeClipKeyframe, updateClip, and track/clip lookup
 */
export function applyTextAnimation(
  clipId: string,
  trackId: string,
  presetName: string,
  direction: 'in' | 'out',
  clipDuration: number,
  animDuration: number,
  store: {
    setClipKeyframe: (clipId: string, property: AnimatableProperty, timeMs: number, value: number) => void;
    removeClipKeyframe: (clipId: string, property: AnimatableProperty, timeMs: number) => void;
    updateClip: (trackId: string, clipId: string, updates: Record<string, unknown>) => void;
  },
) {
  const def = TEXT_ANIMATION_PRESETS[presetName];
  if (!def) return;

  // Generate entrance keyframes (time 0 → animDuration)
  const entranceKfs = def.generate(animDuration);

  // For exit: mirror keyframes so they play at the end of the clip
  // and reverse the values (e.g. opacity goes 1→0 instead of 0→1)
  for (const prop of Object.keys(entranceKfs)) {
    const frames = entranceKfs[prop];
    if (!frames?.length) continue;

    const animProp = prop as AnimatableProperty;

    if (direction === 'in') {
      // Entrance: apply frames directly at clip start
      for (const frame of frames) {
        store.setClipKeyframe(clipId, animProp, Math.round(frame.time), frame.value);
      }
      // Ensure the property reaches its default at the end of anim
      const lastFrame = frames[frames.length - 1];
      const defaultVal = ANIMATABLE_PROPERTY_DEFAULTS[animProp] ?? lastFrame.value;
      if (Math.abs(lastFrame.value - defaultVal) > 0.001) {
        store.setClipKeyframe(clipId, animProp, animDuration, defaultVal);
      }
    } else {
      // Exit: reverse values and place at end of clip
      const offset = clipDuration - animDuration;
      const reversed = [...frames].reverse();
      for (let i = 0; i < reversed.length; i++) {
        const origFrame = frames[i];
        const revFrame = reversed[i];
        store.setClipKeyframe(
          clipId,
          animProp,
          Math.round(offset + origFrame.time),
          revFrame.value,
        );
      }
      // Ensure property starts at default before exit begins
      const defaultVal = ANIMATABLE_PROPERTY_DEFAULTS[animProp] ?? frames[frames.length - 1].value;
      store.setClipKeyframe(clipId, animProp, Math.max(0, offset - 1), defaultVal);
    }
  }

  // Store the preset name on the clip
  const updateKey = direction === 'in' ? 'textAnimationIn' : 'textAnimationOut';
  store.updateClip(trackId, clipId, { [updateKey]: presetName });
}

/**
 * Remove a text animation from a clip by clearing its keyframes for all
 * animation properties within the entrance/exit range.
 */
export function removeTextAnimation(
  clipId: string,
  trackId: string,
  direction: 'in' | 'out',
  clipDuration: number,
  animDuration: number,
  currentKeyframes: Record<string, Keyframe[]> | undefined,
  store: {
    removeClipKeyframe: (clipId: string, property: AnimatableProperty, timeMs: number) => void;
    updateClip: (trackId: string, clipId: string, updates: Record<string, unknown>) => void;
  },
) {
  if (!currentKeyframes) {
    const updateKey = direction === 'in' ? 'textAnimationIn' : 'textAnimationOut';
    store.updateClip(trackId, clipId, { [updateKey]: undefined });
    return;
  }

  const rangeStart = direction === 'in' ? 0 : clipDuration - animDuration - 1;
  const rangeEnd = direction === 'in' ? animDuration + 1 : clipDuration + 1;

  for (const prop of ANIM_PROPERTIES) {
    const frames = currentKeyframes[prop];
    if (!frames) continue;
    for (const frame of frames) {
      if (frame.time >= rangeStart && frame.time <= rangeEnd) {
        store.removeClipKeyframe(clipId, prop as AnimatableProperty, frame.time);
      }
    }
  }

  const updateKey = direction === 'in' ? 'textAnimationIn' : 'textAnimationOut';
  store.updateClip(trackId, clipId, { [updateKey]: undefined });
}
