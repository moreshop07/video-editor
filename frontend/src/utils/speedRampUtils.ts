/**
 * Speed Ramping Utilities
 *
 * Core math for variable-speed playback:
 * - Source time integration (maps timeline time → source time through speed curve)
 * - Speed-at-time interpolation
 * - Speed ramp presets
 */

import type { Keyframe, KeyframeTracks } from '@/types/keyframes';
import { getInterpolatedValue } from './keyframeUtils';

/**
 * Get the instantaneous speed at a clip-relative time.
 * Falls back to static speed if no speed keyframes exist.
 */
export function getSpeedAtTime(
  keyframeTracks: KeyframeTracks | undefined,
  staticSpeed: number,
  clipTimeMs: number,
): number {
  const speedKfs = keyframeTracks?.speed;
  if (!speedKfs || speedKfs.length === 0) {
    return staticSpeed;
  }
  return getInterpolatedValue(speedKfs, clipTimeMs, staticSpeed);
}

/**
 * Compute source time by integrating the speed curve from 0 to clipTimeMs.
 *
 * sourceTime = trimStart + ∫₀^clipTimeMs speed(t) dt
 *
 * For constant speed (no keyframes), this reduces to:
 *   trimStart + clipTimeMs * staticSpeed
 *
 * For keyframed speed, we use numerical integration with 5ms steps.
 */
export function computeSourceTime(
  trimStart: number,
  clipTimeMs: number,
  keyframeTracks: KeyframeTracks | undefined,
  staticSpeed: number,
): number {
  if (clipTimeMs <= 0) return trimStart;

  const speedKfs = keyframeTracks?.speed;
  if (!speedKfs || speedKfs.length === 0) {
    // Fast path: constant speed
    return trimStart + clipTimeMs * staticSpeed;
  }

  // Numerical integration using trapezoidal rule with 5ms steps
  const STEP = 5;
  let integral = 0;
  let prevSpeed = getInterpolatedValue(speedKfs, 0, staticSpeed);

  for (let t = STEP; t <= clipTimeMs; t += STEP) {
    const curSpeed = getInterpolatedValue(speedKfs, t, staticSpeed);
    integral += (prevSpeed + curSpeed) * 0.5 * STEP;
    prevSpeed = curSpeed;
  }

  // Handle remainder if clipTimeMs is not a multiple of STEP
  const lastStep = clipTimeMs % STEP;
  if (lastStep > 0) {
    const curSpeed = getInterpolatedValue(speedKfs, clipTimeMs, staticSpeed);
    const prevT = clipTimeMs - lastStep;
    const prevSpd = getInterpolatedValue(speedKfs, prevT, staticSpeed);
    integral += (prevSpd + curSpeed) * 0.5 * lastStep;
  }

  return trimStart + integral;
}

// --- Speed Ramp Presets ---

export type SpeedRampPreset = 'smoothSlowMo' | 'rampUp' | 'rampDown' | 'bounce';

export const SPEED_RAMP_PRESETS: { id: SpeedRampPreset; labelKey: string }[] = [
  { id: 'smoothSlowMo', labelKey: 'speedRamp.smoothSlowMo' },
  { id: 'rampUp', labelKey: 'speedRamp.rampUp' },
  { id: 'rampDown', labelKey: 'speedRamp.rampDown' },
  { id: 'bounce', labelKey: 'speedRamp.bounce' },
];

/**
 * Generate speed keyframes for a preset, scaled to the given clip duration.
 */
export function getSpeedRampPresetKeyframes(
  preset: SpeedRampPreset,
  clipDurationMs: number,
): Keyframe[] {
  switch (preset) {
    case 'smoothSlowMo':
      return [
        { time: 0, value: 1, easing: 'easeInOut' },
        { time: clipDurationMs * 0.25, value: 0.3, easing: 'easeInOut' },
        { time: clipDurationMs * 0.75, value: 0.3, easing: 'easeInOut' },
        { time: clipDurationMs, value: 1 },
      ];
    case 'rampUp':
      return [
        { time: 0, value: 0.5, easing: 'easeIn' },
        { time: clipDurationMs, value: 3 },
      ];
    case 'rampDown':
      return [
        { time: 0, value: 3, easing: 'easeOut' },
        { time: clipDurationMs, value: 0.5 },
      ];
    case 'bounce':
      return [
        { time: 0, value: 1, easing: 'easeInOut' },
        { time: clipDurationMs * 0.25, value: 2.5, easing: 'easeInOut' },
        { time: clipDurationMs * 0.5, value: 0.5, easing: 'easeInOut' },
        { time: clipDurationMs * 0.75, value: 2.5, easing: 'easeInOut' },
        { time: clipDurationMs, value: 1 },
      ];
  }
}
