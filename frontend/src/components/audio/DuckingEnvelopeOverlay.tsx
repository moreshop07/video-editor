import React, { useMemo } from 'react';
import type { DuckingEnvelope } from '@/effects/types';

interface DuckingEnvelopeOverlayProps {
  envelope: DuckingEnvelope;
  pxPerMs: number;
  trackHeight: number;
  scrollX: number;
  viewportWidth: number;
}

function DuckingEnvelopeOverlayComponent({
  envelope,
  pxPerMs,
  trackHeight,
  scrollX,
  viewportWidth,
}: DuckingEnvelopeOverlayProps) {
  const pathD = useMemo(() => {
    if (envelope.length === 0) return '';

    // Visible time range with buffer
    const bufferPx = 50;
    const viewStartMs = Math.max(0, (scrollX - bufferPx) / pxPerMs);
    const viewEndMs = (scrollX + viewportWidth + bufferPx) / pxPerMs;

    // Filter to visible points, keeping one before and one after for continuity
    let startIdx = 0;
    let endIdx = envelope.length - 1;
    for (let i = 0; i < envelope.length; i++) {
      if (envelope[i].timeMs >= viewStartMs) {
        startIdx = Math.max(0, i - 1);
        break;
      }
    }
    for (let i = envelope.length - 1; i >= 0; i--) {
      if (envelope[i].timeMs <= viewEndMs) {
        endIdx = Math.min(envelope.length - 1, i + 1);
        break;
      }
    }

    const visible = envelope.slice(startIdx, endIdx + 1);
    if (visible.length === 0) return '';

    // Build SVG path: gain=1 means no ducking (y=trackHeight), gain=0 means full duck (y=0)
    // We draw a filled area from bottom up showing the ducking amount
    const h = trackHeight;
    const points = visible.map((p) => {
      const x = p.timeMs * pxPerMs;
      // Invert: low gain = tall fill (more ducking visible)
      const y = p.gain * h;
      return `${x},${y}`;
    });

    const firstX = visible[0].timeMs * pxPerMs;
    const lastX = visible[visible.length - 1].timeMs * pxPerMs;

    // Path: move to bottom-left, line up to first point, trace envelope, line down to bottom-right, close
    return `M${firstX},${h} L${points.join(' L')} L${lastX},${h} Z`;
  }, [envelope, pxPerMs, trackHeight, scrollX, viewportWidth]);

  if (!pathD) return null;

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ width: '100%', height: '100%', overflow: 'visible' }}
    >
      <path
        d={pathD}
        fill="rgba(239, 68, 68, 0.15)"
        stroke="rgba(239, 68, 68, 0.4)"
        strokeWidth={1}
        strokeDasharray="4 2"
      />
    </svg>
  );
}

export const DuckingEnvelopeOverlay = React.memo(DuckingEnvelopeOverlayComponent);
