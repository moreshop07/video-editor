/**
 * Keyframe Animation Utilities
 */

import type { Keyframe, KeyframeTracks, AnimatableProperty } from '@/types/keyframes';
import { ANIMATABLE_PROPERTY_DEFAULTS } from '@/types/keyframes';

/**
 * Get interpolated value at a given time
 * Uses linear interpolation between keyframes
 */
export function getInterpolatedValue(
  keyframes: Keyframe[] | undefined,
  timeMs: number,
  defaultValue: number
): number {
  if (!keyframes || keyframes.length === 0) {
    return defaultValue;
  }

  // Sort keyframes by time
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);

  // Before first keyframe
  if (timeMs <= sorted[0].time) {
    return sorted[0].value;
  }

  // After last keyframe
  if (timeMs >= sorted[sorted.length - 1].time) {
    return sorted[sorted.length - 1].value;
  }

  // Find surrounding keyframes
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    if (timeMs >= current.time && timeMs <= next.time) {
      // Linear interpolation
      const progress = (timeMs - current.time) / (next.time - current.time);
      return current.value + (next.value - current.value) * progress;
    }
  }

  return defaultValue;
}

/**
 * Get all interpolated property values at a given time
 */
export function getInterpolatedProperties(
  keyframeTracks: KeyframeTracks | undefined,
  timeMs: number
): Partial<Record<AnimatableProperty, number>> {
  const result: Partial<Record<AnimatableProperty, number>> = {};

  if (!keyframeTracks) {
    return result;
  }

  for (const property of Object.keys(keyframeTracks) as AnimatableProperty[]) {
    const keyframes = keyframeTracks[property];
    if (keyframes && keyframes.length > 0) {
      const defaultValue = ANIMATABLE_PROPERTY_DEFAULTS[property] ?? 0;
      result[property] = getInterpolatedValue(keyframes, timeMs, defaultValue);
    }
  }

  return result;
}

/**
 * Add or update a keyframe at the specified time
 */
export function setKeyframe(
  keyframeTracks: KeyframeTracks | undefined,
  property: AnimatableProperty,
  timeMs: number,
  value: number
): KeyframeTracks {
  const tracks = keyframeTracks ? { ...keyframeTracks } : {};
  const keyframes = tracks[property] ? [...tracks[property]] : [];

  // Check if keyframe exists at this time (within 10ms tolerance)
  const existingIndex = keyframes.findIndex(
    (kf) => Math.abs(kf.time - timeMs) < 10
  );

  if (existingIndex >= 0) {
    // Update existing keyframe
    keyframes[existingIndex] = { time: timeMs, value };
  } else {
    // Add new keyframe
    keyframes.push({ time: timeMs, value });
  }

  // Sort by time
  keyframes.sort((a, b) => a.time - b.time);

  tracks[property] = keyframes;
  return tracks;
}

/**
 * Remove a keyframe at the specified time
 */
export function removeKeyframe(
  keyframeTracks: KeyframeTracks | undefined,
  property: AnimatableProperty,
  timeMs: number
): KeyframeTracks {
  if (!keyframeTracks) return {};

  const tracks = { ...keyframeTracks };
  const keyframes = tracks[property];

  if (!keyframes) return tracks;

  // Remove keyframe at this time (within 10ms tolerance)
  tracks[property] = keyframes.filter(
    (kf) => Math.abs(kf.time - timeMs) >= 10
  );

  // Remove property if no keyframes left
  if (tracks[property].length === 0) {
    delete tracks[property];
  }

  return tracks;
}

/**
 * Check if a keyframe exists at the specified time
 */
export function hasKeyframeAt(
  keyframeTracks: KeyframeTracks | undefined,
  property: AnimatableProperty,
  timeMs: number
): boolean {
  if (!keyframeTracks) return false;
  const keyframes = keyframeTracks[property];
  if (!keyframes) return false;
  return keyframes.some((kf) => Math.abs(kf.time - timeMs) < 10);
}

/**
 * Get keyframe at specified time (or undefined)
 */
export function getKeyframeAt(
  keyframeTracks: KeyframeTracks | undefined,
  property: AnimatableProperty,
  timeMs: number
): Keyframe | undefined {
  if (!keyframeTracks) return undefined;
  const keyframes = keyframeTracks[property];
  if (!keyframes) return undefined;
  return keyframes.find((kf) => Math.abs(kf.time - timeMs) < 10);
}

/**
 * Get all keyframe times across all properties
 */
export function getAllKeyframeTimes(
  keyframeTracks: KeyframeTracks | undefined
): number[] {
  if (!keyframeTracks) return [];

  const times = new Set<number>();
  for (const keyframes of Object.values(keyframeTracks)) {
    for (const kf of keyframes) {
      times.add(kf.time);
    }
  }

  return Array.from(times).sort((a, b) => a - b);
}

/**
 * Check if clip has any keyframes
 */
export function hasKeyframes(keyframeTracks: KeyframeTracks | undefined): boolean {
  if (!keyframeTracks) return false;
  return Object.values(keyframeTracks).some(
    (keyframes) => keyframes && keyframes.length > 0
  );
}
