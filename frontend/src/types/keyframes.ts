/**
 * Keyframe Animation Types
 */

// Properties that can be animated with keyframes
export type AnimatableProperty =
  | 'positionX'
  | 'positionY'
  | 'scaleX'
  | 'scaleY'
  | 'rotation'
  | 'opacity'
  | 'textRevealProgress';

export type EasingType = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

// Single keyframe with time relative to clip start
export interface Keyframe {
  time: number;  // ms from clip start
  value: number;
  easing?: EasingType;  // interpolation curve to next keyframe, default 'linear'
}

// Keyframes for a single property
export interface KeyframeTrack {
  property: AnimatableProperty;
  keyframes: Keyframe[];
}

// All keyframe tracks for a clip
export interface KeyframeTracks {
  [property: string]: Keyframe[];
}

// Default values for animatable properties
export const ANIMATABLE_PROPERTY_DEFAULTS: Record<AnimatableProperty, number> = {
  positionX: 0.5,
  positionY: 0.5,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
  textRevealProgress: 1,
};

// Property display info for UI
export const ANIMATABLE_PROPERTY_INFO: Record<AnimatableProperty, {
  labelKey: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}> = {
  positionX: {
    labelKey: 'properties.positionX',
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  positionY: {
    labelKey: 'properties.positionY',
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  scaleX: {
    labelKey: 'properties.scaleX',
    min: 0.1,
    max: 3,
    step: 0.05,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  scaleY: {
    labelKey: 'properties.scaleY',
    min: 0.1,
    max: 3,
    step: 0.05,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  rotation: {
    labelKey: 'properties.rotation',
    min: 0,
    max: 360,
    step: 1,
    format: (v) => `${v}°`,
  },
  opacity: {
    labelKey: 'properties.opacity',
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  textRevealProgress: {
    labelKey: 'textAnimation.reveal',
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => `${Math.round(v * 100)}%`,
  },
};
