/**
 * Smoothing and coordinate conversion for motion tracking results.
 */

import type { TrackingPoint, TrackingResult, TrackingKeyframes } from '@/engine/motionTrackerTypes';

/**
 * Apply moving-average smoothing to tracking points.
 * @param points  Raw tracking points
 * @param amount  0 = no smoothing, 1 = maximum smoothing (window size ~20)
 */
export function smoothTrackingPoints(points: TrackingPoint[], amount: number): TrackingPoint[] {
  if (amount <= 0 || points.length <= 1) return points;

  const windowSize = Math.max(1, Math.round(amount * 20));
  const halfWin = Math.floor(windowSize / 2);

  return points.map((pt, i) => {
    const start = Math.max(0, i - halfWin);
    const end = Math.min(points.length - 1, i + halfWin);
    const count = end - start + 1;

    let sumX = 0, sumY = 0, sumW = 0, sumH = 0, sumR = 0;

    for (let j = start; j <= end; j++) {
      sumX += points[j].centerX;
      sumY += points[j].centerY;
      if (points[j].width != null) sumW += points[j].width!;
      if (points[j].height != null) sumH += points[j].height!;
      if (points[j].rotation != null) sumR += points[j].rotation!;
    }

    const smoothed: TrackingPoint = {
      ...pt,
      centerX: sumX / count,
      centerY: sumY / count,
    };

    if (pt.width != null) smoothed.width = sumW / count;
    if (pt.height != null) smoothed.height = sumH / count;
    if (pt.rotation != null) smoothed.rotation = sumR / count;

    return smoothed;
  });
}

/**
 * Convert pixel-space tracking results to normalized keyframes (0-1 coordinates).
 */
export function trackingToKeyframes(
  result: TrackingResult,
  smoothAmount: number,
  offsetX: number,
  offsetY: number,
  scaleMultiplier: number,
): TrackingKeyframes {
  const smoothed = smoothTrackingPoints(result.points, smoothAmount);
  const { sourceVideoWidth, sourceVideoHeight, roi } = result;

  const positionX: Array<{ time: number; value: number }> = [];
  const positionY: Array<{ time: number; value: number }> = [];
  const scaleX: Array<{ time: number; value: number }> = [];
  const scaleY: Array<{ time: number; value: number }> = [];
  const rotation: Array<{ time: number; value: number }> = [];

  for (const pt of smoothed) {
    // Convert pixel center to 0-1 normalized + offset
    positionX.push({
      time: pt.timeMs,
      value: (pt.centerX / sourceVideoWidth) + offsetX,
    });
    positionY.push({
      time: pt.timeMs,
      value: (pt.centerY / sourceVideoHeight) + offsetY,
    });

    if (result.mode === 'region') {
      // Scale relative to initial ROI, multiplied by user scaleMultiplier
      if (pt.width != null && roi.width > 0) {
        scaleX.push({
          time: pt.timeMs,
          value: (pt.width / roi.width) * scaleMultiplier,
        });
      }
      if (pt.height != null && roi.height > 0) {
        scaleY.push({
          time: pt.timeMs,
          value: (pt.height / roi.height) * scaleMultiplier,
        });
      }
      if (pt.rotation != null) {
        rotation.push({
          time: pt.timeMs,
          value: pt.rotation,
        });
      }
    }
  }

  const keyframes: TrackingKeyframes = { positionX, positionY };
  if (result.mode === 'region') {
    keyframes.scaleX = scaleX;
    keyframes.scaleY = scaleY;
    keyframes.rotation = rotation;
  }

  return keyframes;
}
