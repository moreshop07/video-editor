import React, { useCallback, useRef, useState } from 'react';
import type { CurvePoint } from '@/effects/types';

interface CurveEditorProps {
  points: CurvePoint[];
  onChange: (points: CurvePoint[]) => void;
  color: string;
  width?: number;
  height?: number;
}

const MAX_POINTS = 10;
const POINT_RADIUS = 5;
const HIT_RADIUS = 10;

/**
 * Generate a smooth SVG path through sorted control points
 * using Catmull-Rom to cubic Bezier conversion.
 */
function buildSmoothPath(points: CurvePoint[], w: number, h: number): string {
  if (points.length < 2) return '';

  const pts = points.map((p) => ({ x: p.x * w, y: (1 - p.y) * h }));

  if (pts.length === 2) {
    return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;
  }

  let d = `M${pts[0].x},${pts[0].y}`;

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];

    // Catmull-Rom to cubic Bezier control points
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }

  return d;
}

export function CurveEditor({
  points,
  onChange,
  color,
  width = 200,
  height = 200,
}: CurveEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  const sorted = [...points].sort((a, b) => a.x - b.x);

  const toSvgCoord = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
      return { x, y };
    },
    [],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, idx: number) => {
      e.preventDefault();
      e.stopPropagation();
      setDraggingIdx(idx);

      const handleMouseMove = (me: MouseEvent) => {
        const { x, y } = toSvgCoord(me);
        const updated = [...sorted];
        // First and last points: lock x
        if (idx === 0) {
          updated[idx] = { x: 0, y };
        } else if (idx === sorted.length - 1) {
          updated[idx] = { x: 1, y };
        } else {
          // Clamp x between neighbors
          const minX = sorted[idx - 1].x + 0.01;
          const maxX = sorted[idx + 1].x - 0.01;
          updated[idx] = { x: Math.max(minX, Math.min(maxX, x)), y };
        }
        onChange(updated);
      };

      const handleMouseUp = () => {
        setDraggingIdx(null);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [sorted, onChange, toSvgCoord],
  );

  const handleSvgClick = useCallback(
    (e: React.MouseEvent) => {
      if (draggingIdx !== null) return;
      if (sorted.length >= MAX_POINTS) return;

      const { x, y } = toSvgCoord(e);

      // Don't add if too close to an existing point
      const tooClose = sorted.some(
        (p) => Math.abs(p.x - x) < 0.03 && Math.abs(p.y - y) < 0.03,
      );
      if (tooClose) return;

      const updated = [...sorted, { x, y }].sort((a, b) => a.x - b.x);
      onChange(updated);
    },
    [sorted, onChange, toSvgCoord, draggingIdx],
  );

  const handlePointDoubleClick = useCallback(
    (e: React.MouseEvent, idx: number) => {
      e.preventDefault();
      e.stopPropagation();
      // Don't remove endpoints
      if (idx === 0 || idx === sorted.length - 1) return;
      if (sorted.length <= 2) return;
      const updated = sorted.filter((_, i) => i !== idx);
      onChange(updated);
    },
    [sorted, onChange],
  );

  const pathD = buildSmoothPath(sorted, width, height);

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="rounded border border-[var(--color-border)] bg-black/30 cursor-crosshair select-none"
      onClick={handleSvgClick}
    >
      {/* Grid lines at 25% intervals */}
      {[0.25, 0.5, 0.75].map((v) => (
        <React.Fragment key={v}>
          <line
            x1={v * width} y1={0} x2={v * width} y2={height}
            stroke="rgba(255,255,255,0.08)" strokeWidth={1}
          />
          <line
            x1={0} y1={v * height} x2={width} y2={v * height}
            stroke="rgba(255,255,255,0.08)" strokeWidth={1}
          />
        </React.Fragment>
      ))}

      {/* Identity diagonal */}
      <line
        x1={0} y1={height} x2={width} y2={0}
        stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="4,4"
      />

      {/* Curve path */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />

      {/* Control points */}
      {sorted.map((p, i) => (
        <circle
          key={i}
          cx={p.x * width}
          cy={(1 - p.y) * height}
          r={draggingIdx === i ? POINT_RADIUS + 2 : POINT_RADIUS}
          fill={color}
          stroke="white"
          strokeWidth={1.5}
          className="cursor-grab active:cursor-grabbing"
          onMouseDown={(e) => handleMouseDown(e, i)}
          onDoubleClick={(e) => handlePointDoubleClick(e, i)}
        />
      ))}

      {/* Invisible larger hit targets */}
      {sorted.map((p, i) => (
        <circle
          key={`hit-${i}`}
          cx={p.x * width}
          cy={(1 - p.y) * height}
          r={HIT_RADIUS}
          fill="transparent"
          onMouseDown={(e) => handleMouseDown(e, i)}
          onDoubleClick={(e) => handlePointDoubleClick(e, i)}
          className="cursor-grab"
        />
      ))}
    </svg>
  );
}
