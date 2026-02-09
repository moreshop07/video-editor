/**
 * Motion tracking types shared between main thread and Web Worker.
 */

export type TrackingMode = 'point' | 'region';

/** Region of interest in source video pixel coordinates. */
export interface TrackingROI {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Single tracking result at one time point. */
export interface TrackingPoint {
  timeMs: number;
  centerX: number;
  centerY: number;
  width?: number;       // region mode only
  height?: number;      // region mode only
  rotation?: number;    // degrees, region mode only
  confidence: number;   // 0-1
}

/** Full tracking result after completion. */
export interface TrackingResult {
  mode: TrackingMode;
  sourceVideoWidth: number;
  sourceVideoHeight: number;
  points: TrackingPoint[];
  roi: TrackingROI;
}

/** Normalized keyframe output ready for timeline store. */
export interface TrackingKeyframes {
  positionX: Array<{ time: number; value: number }>;
  positionY: Array<{ time: number; value: number }>;
  scaleX?: Array<{ time: number; value: number }>;
  scaleY?: Array<{ time: number; value: number }>;
  rotation?: Array<{ time: number; value: number }>;
}

// ---- Worker message protocol ----

export type TrackerWorkerMessage =
  | { type: 'init'; mode: TrackingMode; roi: TrackingROI; videoWidth: number; videoHeight: number }
  | { type: 'frame'; timeMs: number; imageData: ImageData }
  | { type: 'finish' }
  | { type: 'cancel' };

export type TrackerWorkerResponse =
  | { type: 'progress'; percent: number; currentPoint: TrackingPoint }
  | { type: 'complete'; result: TrackingResult }
  | { type: 'error'; message: string }
  | { type: 'cancelled' };
