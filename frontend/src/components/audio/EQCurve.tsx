import { useEffect, useRef } from 'react';
import type { EQSettings } from '@/effects/types';

interface EQCurveProps {
  eq: EQSettings;
  width?: number;
  height?: number;
}

/**
 * Approximate the combined magnitude response of a 3-band EQ
 * (lowshelf + peaking + highshelf) at a given frequency.
 */
function evalEQResponse(freq: number, eq: EQSettings): number {
  if (!eq.enabled) return 0;

  let totalGainDb = 0;

  // Lowshelf: gain rolls off above frequency
  const lowRatio = freq / eq.low.frequency;
  if (lowRatio <= 1) {
    totalGainDb += eq.low.gain;
  } else {
    totalGainDb += eq.low.gain / (1 + (lowRatio - 1) * 2);
  }

  // Peaking: bell curve around center frequency
  const midLogDist = Math.log2(freq / eq.mid.frequency);
  const Q = eq.mid.Q || 1;
  const bellWidth = 1 / Q;
  totalGainDb += eq.mid.gain * Math.exp(-0.5 * (midLogDist / bellWidth) ** 2);

  // Highshelf: gain rolls off below frequency
  const highRatio = eq.high.frequency / freq;
  if (highRatio <= 1) {
    totalGainDb += eq.high.gain;
  } else {
    totalGainDb += eq.high.gain / (1 + (highRatio - 1) * 2);
  }

  return totalGainDb;
}

export function EQCurve({ eq, width = 120, height = 40 }: EQCurveProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = width * dpr;
    const h = height * dpr;
    canvas.width = w;
    canvas.height = h;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 3 * dpr);
    ctx.fill();

    // Center line (0 dB)
    const centerY = h / 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = dpr;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(w, centerY);
    ctx.stroke();

    // Draw EQ curve
    const minFreq = 20;
    const maxFreq = 20000;
    const maxGainDb = 14; // ±14dB range

    ctx.strokeStyle = eq.enabled ? 'var(--accent, #3b82f6)' : 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();

    for (let x = 0; x <= w; x++) {
      const logFreq = minFreq * Math.pow(maxFreq / minFreq, x / w);
      const gainDb = evalEQResponse(logFreq, eq);
      const y = centerY - (gainDb / maxGainDb) * (h / 2);

      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Draw control point dots if enabled
    if (eq.enabled) {
      const drawDot = (freq: number, gain: number) => {
        const x = w * Math.log(freq / minFreq) / Math.log(maxFreq / minFreq);
        const y = centerY - (gain / maxGainDb) * (h / 2);
        ctx.fillStyle = 'var(--accent, #3b82f6)';
        ctx.beginPath();
        ctx.arc(x, y, 3 * dpr, 0, Math.PI * 2);
        ctx.fill();
      };

      drawDot(eq.low.frequency, eq.low.gain);
      drawDot(eq.mid.frequency, eq.mid.gain);
      drawDot(eq.high.frequency, eq.high.gain);
    }
  }, [eq, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="flex-shrink-0 rounded"
    />
  );
}
