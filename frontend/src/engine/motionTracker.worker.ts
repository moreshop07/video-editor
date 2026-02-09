/**
 * Motion tracking Web Worker — Pyramidal Lucas-Kanade optical flow.
 *
 * Protocol:
 *   main → worker: 'init' (mode, roi, dimensions)
 *   main → worker: 'frame' (timeMs, imageData) — one per sampled frame
 *   main → worker: 'finish'
 *   main → worker: 'cancel'
 *
 *   worker → main: 'progress' (percent, currentPoint)
 *   worker → main: 'complete' (result)
 *   worker → main: 'error' (message)
 *   worker → main: 'cancelled'
 */

import type {
  TrackingMode,
  TrackingROI,
  TrackingPoint,
  TrackingResult,
  TrackerWorkerMessage,
  TrackerWorkerResponse,
} from './motionTrackerTypes';

// ---- Config ----
const PYRAMID_LEVELS = 3;
const WINDOW_HALF = 10; // 21x21 window
const GRID_SIZE = 5;    // 5x5 feature grid for region mode
const MIN_EIGENVALUE = 1e-4; // confidence threshold

// ---- State ----
let mode: TrackingMode = 'point';
let roi: TrackingROI = { x: 0, y: 0, width: 0, height: 0 };
let videoWidth = 0;
let videoHeight = 0;
let frameCount = 0;
let totalFramesExpected = 0;
let cancelled = false;

// Feature points (pixel coordinates)
let featurePoints: Array<{ x: number; y: number }> = [];
let initialFeaturePoints: Array<{ x: number; y: number }> = [];
let initialBBoxWidth = 0;
let initialBBoxHeight = 0;

// Previous frame pyramid
let prevPyramid: PyramidLevel[] | null = null;

// Collected results
const results: TrackingPoint[] = [];

interface PyramidLevel {
  data: Float32Array;
  w: number;
  h: number;
}

// ---- Utility: Grayscale conversion ----
function toGrayscale(imageData: ImageData): Float32Array {
  const { width, height, data } = imageData;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const j = i * 4;
    gray[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
  }
  return gray;
}

// ---- Utility: Gaussian blur (3x3 kernel, separable) ----
function gaussianBlur(src: Float32Array, w: number, h: number): Float32Array {
  const kernel = [0.25, 0.5, 0.25];
  const tmp = new Float32Array(w * h);
  const dst = new Float32Array(w * h);

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -1; k <= 1; k++) {
        const sx = Math.min(Math.max(x + k, 0), w - 1);
        sum += src[y * w + sx] * kernel[k + 1];
      }
      tmp[y * w + x] = sum;
    }
  }

  // Vertical pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -1; k <= 1; k++) {
        const sy = Math.min(Math.max(y + k, 0), h - 1);
        sum += tmp[sy * w + x] * kernel[k + 1];
      }
      dst[y * w + x] = sum;
    }
  }

  return dst;
}

// ---- Utility: Downsample 2x ----
function downsample(src: Float32Array, w: number, h: number): { data: Float32Array; w: number; h: number } {
  const nw = Math.floor(w / 2);
  const nh = Math.floor(h / 2);
  const dst = new Float32Array(nw * nh);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      dst[y * nw + x] = src[(y * 2) * w + (x * 2)];
    }
  }
  return { data: dst, w: nw, h: nh };
}

// ---- Build Gaussian pyramid ----
function buildPyramid(gray: Float32Array, w: number, h: number): PyramidLevel[] {
  const levels: PyramidLevel[] = [{ data: gray, w, h }];
  let current = gray;
  let cw = w;
  let ch = h;

  for (let i = 1; i < PYRAMID_LEVELS; i++) {
    const blurred = gaussianBlur(current, cw, ch);
    const down = downsample(blurred, cw, ch);
    levels.push({ data: down.data, w: down.w, h: down.h });
    current = down.data;
    cw = down.w;
    ch = down.h;
  }

  return levels;
}

// ---- Bilinear interpolation ----
function bilinear(img: Float32Array, w: number, h: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, w - 1);
  const y1 = Math.min(y0 + 1, h - 1);
  const fx = x - x0;
  const fy = y - y0;

  const cx0 = Math.max(x0, 0);
  const cy0 = Math.max(y0, 0);

  const v00 = img[cy0 * w + cx0];
  const v10 = img[cy0 * w + x1];
  const v01 = img[y1 * w + cx0];
  const v11 = img[y1 * w + x1];

  return (1 - fx) * (1 - fy) * v00 + fx * (1 - fy) * v10 +
         (1 - fx) * fy * v01 + fx * fy * v11;
}

// ---- Pyramidal Lucas-Kanade for a single point ----
function trackPointLK(
  prevPyr: PyramidLevel[],
  currPyr: PyramidLevel[],
  px: number,
  py: number,
): { x: number; y: number; confidence: number } {
  let guessX = 0;
  let guessY = 0;
  let minEigen = 0;

  for (let level = prevPyr.length - 1; level >= 0; level--) {
    const scale = 1 << level;
    const prev = prevPyr[level];
    const curr = currPyr[level];
    const lpx = px / scale;
    const lpy = py / scale;

    // Compute structure tensor and solve
    let sumIxIx = 0, sumIxIy = 0, sumIyIy = 0;
    let sumIxIt = 0, sumIyIt = 0;

    const hw = WINDOW_HALF;

    for (let wy = -hw; wy <= hw; wy++) {
      for (let wx = -hw; wx <= hw; wx++) {
        const sx = lpx + wx;
        const sy = lpy + wy;

        if (sx < 1 || sx >= prev.w - 1 || sy < 1 || sy >= prev.h - 1) continue;

        // Spatial gradients from previous image
        const Ix = (bilinear(prev.data, prev.w, prev.h, sx + 1, sy) -
                    bilinear(prev.data, prev.w, prev.h, sx - 1, sy)) * 0.5;
        const Iy = (bilinear(prev.data, prev.w, prev.h, sx, sy + 1) -
                    bilinear(prev.data, prev.w, prev.h, sx, sy - 1)) * 0.5;

        // Temporal gradient
        const currX = sx + guessX / scale;
        const currY = sy + guessY / scale;
        if (currX < 0 || currX >= curr.w || currY < 0 || currY >= curr.h) continue;

        const It = bilinear(curr.data, curr.w, curr.h, currX, currY) -
                   bilinear(prev.data, prev.w, prev.h, sx, sy);

        sumIxIx += Ix * Ix;
        sumIxIy += Ix * Iy;
        sumIyIy += Iy * Iy;
        sumIxIt += Ix * It;
        sumIyIt += Iy * It;
      }
    }

    // Solve 2x2 system via Cramer's rule
    const det = sumIxIx * sumIyIy - sumIxIy * sumIxIy;
    if (Math.abs(det) < 1e-10) continue;

    const dx = -(sumIyIy * sumIxIt - sumIxIy * sumIyIt) / det;
    const dy = -(sumIxIx * sumIyIt - sumIxIy * sumIxIt) / det;

    guessX += dx * scale;
    guessY += dy * scale;

    // Eigenvalues of G for confidence (at finest level only)
    if (level === 0) {
      const trace = sumIxIx + sumIyIy;
      const disc = Math.sqrt(Math.max(0, trace * trace - 4 * det));
      const lambda1 = (trace + disc) / 2;
      const lambda2 = (trace - disc) / 2;
      minEigen = Math.min(lambda1, lambda2);
    }
  }

  // Normalize confidence to 0-1 range
  const confidence = Math.min(1, Math.max(0, minEigen / 100));

  return {
    x: px + guessX,
    y: py + guessY,
    confidence,
  };
}

// ---- Initialize feature points ----
function initFeaturePoints(): void {
  featurePoints = [];
  if (mode === 'point') {
    // Single point at ROI center
    featurePoints.push({
      x: roi.x + roi.width / 2,
      y: roi.y + roi.height / 2,
    });
  } else {
    // 5x5 grid inside ROI
    for (let gy = 0; gy < GRID_SIZE; gy++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        featurePoints.push({
          x: roi.x + (gx + 0.5) * roi.width / GRID_SIZE,
          y: roi.y + (gy + 0.5) * roi.height / GRID_SIZE,
        });
      }
    }
  }
  initialFeaturePoints = featurePoints.map((p) => ({ ...p }));
  initialBBoxWidth = roi.width;
  initialBBoxHeight = roi.height;
}

// ---- Compute centroid ----
function centroid(points: Array<{ x: number; y: number }>): { x: number; y: number } {
  let sx = 0, sy = 0;
  for (const p of points) { sx += p.x; sy += p.y; }
  return { x: sx / points.length, y: sy / points.length };
}

// ---- Compute median ----
function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ---- Compute bounding box of points ----
function bbox(points: Array<{ x: number; y: number }>): { w: number; h: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { w: maxX - minX, h: maxY - minY };
}

// ---- Compute rotation from point cloud ----
function computeRotation(
  initial: Array<{ x: number; y: number }>,
  current: Array<{ x: number; y: number }>,
): number {
  const c0 = centroid(initial);
  const c1 = centroid(current);
  let sinSum = 0, cosSum = 0;

  for (let i = 0; i < initial.length; i++) {
    const dx0 = initial[i].x - c0.x;
    const dy0 = initial[i].y - c0.y;
    const dx1 = current[i].x - c1.x;
    const dy1 = current[i].y - c1.y;

    const len0 = Math.sqrt(dx0 * dx0 + dy0 * dy0);
    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    if (len0 < 1e-6 || len1 < 1e-6) continue;

    // Cross product and dot product for angle
    sinSum += (dx0 * dy1 - dy0 * dx1) / (len0 * len1);
    cosSum += (dx0 * dx1 + dy0 * dy1) / (len0 * len1);
  }

  return Math.atan2(sinSum, cosSum) * (180 / Math.PI);
}

// ---- Process a single frame ----
function processFrame(timeMs: number, imageData: ImageData): TrackingPoint {
  const gray = toGrayscale(imageData);
  const currPyramid = buildPyramid(gray, videoWidth, videoHeight);

  if (!prevPyramid) {
    // First frame — just store pyramid and return initial position
    prevPyramid = currPyramid;
    const c = centroid(featurePoints);
    const result: TrackingPoint = {
      timeMs,
      centerX: c.x,
      centerY: c.y,
      confidence: 1.0,
    };
    if (mode === 'region') {
      result.width = roi.width;
      result.height = roi.height;
      result.rotation = 0;
    }
    return result;
  }

  // Track each feature point
  const trackedPoints: Array<{ x: number; y: number; confidence: number }> = [];
  const validIndices: number[] = [];

  for (let i = 0; i < featurePoints.length; i++) {
    const pt = featurePoints[i];
    const tracked = trackPointLK(prevPyramid, currPyramid, pt.x, pt.y);

    // Validate: point should remain within frame bounds
    if (tracked.x >= 0 && tracked.x < videoWidth &&
        tracked.y >= 0 && tracked.y < videoHeight &&
        tracked.confidence > MIN_EIGENVALUE) {
      trackedPoints.push(tracked);
      validIndices.push(i);
    } else {
      // Keep old position for invalid tracks
      trackedPoints.push({ x: pt.x, y: pt.y, confidence: 0 });
      validIndices.push(i);
    }
  }

  // Update feature positions for next frame
  for (let i = 0; i < featurePoints.length; i++) {
    featurePoints[i] = { x: trackedPoints[i].x, y: trackedPoints[i].y };
  }

  // Compute result based on mode
  const avgConfidence = trackedPoints.reduce((s, p) => s + p.confidence, 0) / trackedPoints.length;

  let result: TrackingPoint;

  if (mode === 'point') {
    result = {
      timeMs,
      centerX: trackedPoints[0].x,
      centerY: trackedPoints[0].y,
      confidence: trackedPoints[0].confidence,
    };
  } else {
    // Region mode: use median displacement for robustness
    const displacements = trackedPoints.map((p, i) => ({
      dx: p.x - initialFeaturePoints[i].x,
      dy: p.y - initialFeaturePoints[i].y,
    }));

    const medDx = median(displacements.map((d) => d.dx));
    const medDy = median(displacements.map((d) => d.dy));

    const initCenter = centroid(initialFeaturePoints);
    const currentBBox = bbox(featurePoints);

    const scaleW = initialBBoxWidth > 0 ? currentBBox.w / (initialBBoxWidth * (GRID_SIZE - 1) / GRID_SIZE) : 1;
    const scaleH = initialBBoxHeight > 0 ? currentBBox.h / (initialBBoxHeight * (GRID_SIZE - 1) / GRID_SIZE) : 1;

    const rot = computeRotation(initialFeaturePoints, featurePoints);

    result = {
      timeMs,
      centerX: initCenter.x + medDx,
      centerY: initCenter.y + medDy,
      width: roi.width * scaleW,
      height: roi.height * scaleH,
      rotation: rot,
      confidence: avgConfidence,
    };
  }

  prevPyramid = currPyramid;
  return result;
}

// ---- Post helper ----
function post(msg: TrackerWorkerResponse): void {
  (self as unknown as Worker).postMessage(msg);
}

// ---- Message handler ----
self.onmessage = (e: MessageEvent<TrackerWorkerMessage>) => {
  const msg = e.data;

  switch (msg.type) {
    case 'init': {
      mode = msg.mode;
      roi = msg.roi;
      videoWidth = msg.videoWidth;
      videoHeight = msg.videoHeight;
      frameCount = 0;
      totalFramesExpected = 0;
      cancelled = false;
      prevPyramid = null;
      results.length = 0;
      initFeaturePoints();
      break;
    }

    case 'frame': {
      if (cancelled) return;
      frameCount++;
      try {
        const point = processFrame(msg.timeMs, msg.imageData);
        results.push(point);
        post({
          type: 'progress',
          percent: totalFramesExpected > 0 ? (frameCount / totalFramesExpected) * 100 : 0,
          currentPoint: point,
        });
      } catch (err) {
        post({ type: 'error', message: String(err) });
      }
      break;
    }

    case 'finish': {
      if (cancelled) return;
      post({
        type: 'complete',
        result: {
          mode,
          sourceVideoWidth: videoWidth,
          sourceVideoHeight: videoHeight,
          points: results,
          roi,
        },
      });
      break;
    }

    case 'cancel': {
      cancelled = true;
      prevPyramid = null;
      results.length = 0;
      featurePoints = [];
      post({ type: 'cancelled' });
      break;
    }
  }
};
