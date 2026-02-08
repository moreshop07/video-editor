import type { CurvePoint, CurvesSettings } from './types';

/**
 * Check if a curve is identity (linear from 0,0 to 1,1).
 */
export function isIdentityCurve(points: CurvePoint[]): boolean {
  if (points.length !== 2) return false;
  const sorted = [...points].sort((a, b) => a.x - b.x);
  return (
    Math.abs(sorted[0].x) < 0.001 &&
    Math.abs(sorted[0].y) < 0.001 &&
    Math.abs(sorted[1].x - 1) < 0.001 &&
    Math.abs(sorted[1].y - 1) < 0.001
  );
}

/**
 * Check if all channels in a CurvesSettings are identity.
 */
export function isAllIdentity(curves: CurvesSettings): boolean {
  return (
    isIdentityCurve(curves.master) &&
    isIdentityCurve(curves.red) &&
    isIdentityCurve(curves.green) &&
    isIdentityCurve(curves.blue)
  );
}

/**
 * Build a 256-entry lookup table from curve control points.
 * Uses monotone cubic Hermite interpolation (Fritsch-Carlson)
 * to prevent oscillation/overshooting.
 */
export function buildCurveLUT(points: CurvePoint[]): Uint8Array {
  const lut = new Uint8Array(256);
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const n = sorted.length;

  if (n === 0) {
    // Identity
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }

  if (n === 1) {
    // Constant
    const val = clamp255(sorted[0].y);
    for (let i = 0; i < 256; i++) lut[i] = val;
    return lut;
  }

  if (n === 2) {
    // Linear interpolation
    const [p0, p1] = sorted;
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      let y: number;
      if (t <= p0.x) {
        y = p0.y;
      } else if (t >= p1.x) {
        y = p1.y;
      } else {
        const frac = (t - p0.x) / (p1.x - p0.x);
        y = p0.y + frac * (p1.y - p0.y);
      }
      lut[i] = clamp255(y);
    }
    return lut;
  }

  // Monotone cubic Hermite (Fritsch-Carlson) for 3+ points
  const xs = sorted.map((p) => p.x);
  const ys = sorted.map((p) => p.y);

  // Step 1: Compute slopes between successive points
  const deltas: number[] = [];
  const h: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i]);
    deltas.push(h[i] === 0 ? 0 : (ys[i + 1] - ys[i]) / h[i]);
  }

  // Step 2: Initialize tangents
  const m: number[] = new Array(n);
  m[0] = deltas[0];
  m[n - 1] = deltas[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (deltas[i - 1] * deltas[i] <= 0) {
      m[i] = 0;
    } else {
      m[i] = (deltas[i - 1] + deltas[i]) / 2;
    }
  }

  // Step 3: Fritsch-Carlson monotonicity constraint
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(deltas[i]) < 1e-12) {
      m[i] = 0;
      m[i + 1] = 0;
    } else {
      const alpha = m[i] / deltas[i];
      const beta = m[i + 1] / deltas[i];
      // Ensure monotonicity
      const mag = Math.sqrt(alpha * alpha + beta * beta);
      if (mag > 3) {
        const tau = 3 / mag;
        m[i] = tau * alpha * deltas[i];
        m[i + 1] = tau * beta * deltas[i];
      }
    }
  }

  // Step 4: Evaluate at 256 evenly spaced points
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let y: number;

    if (t <= xs[0]) {
      y = ys[0];
    } else if (t >= xs[n - 1]) {
      y = ys[n - 1];
    } else {
      // Find segment
      let seg = 0;
      for (let j = 0; j < n - 1; j++) {
        if (t >= xs[j] && t < xs[j + 1]) {
          seg = j;
          break;
        }
      }

      const dx = xs[seg + 1] - xs[seg];
      if (dx < 1e-12) {
        y = ys[seg];
      } else {
        const s = (t - xs[seg]) / dx;
        const s2 = s * s;
        const s3 = s2 * s;

        // Hermite basis functions
        const h00 = 2 * s3 - 3 * s2 + 1;
        const h10 = s3 - 2 * s2 + s;
        const h01 = -2 * s3 + 3 * s2;
        const h11 = s3 - s2;

        y = h00 * ys[seg] + h10 * dx * m[seg] + h01 * ys[seg + 1] + h11 * dx * m[seg + 1];
      }
    }

    lut[i] = clamp255(y);
  }

  return lut;
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}
