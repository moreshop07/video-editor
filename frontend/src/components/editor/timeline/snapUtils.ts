import type { Track } from '@/store/timelineStore';

export interface SnapPoint {
  time: number;
  source: 'clip-start' | 'clip-end' | 'playhead' | 'origin';
  clipId?: string;
}

export const SNAP_THRESHOLD_PX = 8;

export function collectSnapPoints(
  tracks: Track[],
  excludeClipId: string,
  currentTime: number,
): SnapPoint[] {
  const points: SnapPoint[] = [
    { time: 0, source: 'origin' },
    { time: currentTime, source: 'playhead' },
  ];

  for (const track of tracks) {
    for (const clip of track.clips) {
      if (clip.id === excludeClipId) continue;
      points.push({ time: clip.startTime, source: 'clip-start', clipId: clip.id });
      points.push({ time: clip.endTime, source: 'clip-end', clipId: clip.id });
    }
  }

  return points;
}

export function findSnapTarget(
  candidateTime: number,
  snapPoints: SnapPoint[],
  pxPerMs: number,
  thresholdPx: number = SNAP_THRESHOLD_PX,
): { snappedTime: number; snapPoint: SnapPoint | null } {
  const thresholdMs = thresholdPx / pxPerMs;

  let closest: SnapPoint | null = null;
  let closestDist = Infinity;

  for (const point of snapPoints) {
    const dist = Math.abs(candidateTime - point.time);
    if (dist < thresholdMs && dist < closestDist) {
      closestDist = dist;
      closest = point;
    }
  }

  if (closest) {
    return { snappedTime: closest.time, snapPoint: closest };
  }
  return { snappedTime: candidateTime, snapPoint: null };
}

/**
 * For clip move: try snapping both the start edge and end edge,
 * return whichever produces a closer snap.
 */
export function findMoveSnapTarget(
  rawStart: number,
  clipDuration: number,
  snapPoints: SnapPoint[],
  pxPerMs: number,
  thresholdPx: number = SNAP_THRESHOLD_PX,
): { snappedStart: number; snapTime: number | null } {
  const startResult = findSnapTarget(rawStart, snapPoints, pxPerMs, thresholdPx);
  const endResult = findSnapTarget(rawStart + clipDuration, snapPoints, pxPerMs, thresholdPx);

  const startDist = startResult.snapPoint
    ? Math.abs(rawStart - startResult.snappedTime)
    : Infinity;
  const endDist = endResult.snapPoint
    ? Math.abs(rawStart + clipDuration - endResult.snappedTime)
    : Infinity;

  if (startResult.snapPoint && startDist <= endDist) {
    return { snappedStart: startResult.snappedTime, snapTime: startResult.snappedTime };
  }
  if (endResult.snapPoint) {
    return {
      snappedStart: endResult.snappedTime - clipDuration,
      snapTime: endResult.snappedTime,
    };
  }

  return { snappedStart: Math.round(rawStart), snapTime: null };
}
