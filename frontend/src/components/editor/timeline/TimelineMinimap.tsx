import { useRef, useEffect, useCallback, useState } from 'react';
import { useTimelineStore } from '@/store/timelineStore';

const TRACK_TYPE_COLORS: Record<string, string> = {
  video: '#3b82f6',
  audio: '#22c55e',
  music: '#a855f7',
  sfx: '#f59e0b',
  subtitle: '#ec4899',
  sticker: '#06b6d4',
};

const MINIMAP_HEIGHT = 32;
const TRACK_ROW_HEIGHT = 4;
const TRACK_GAP = 1;

interface TimelineMinimapProps {
  viewportWidth: number;
}

export default function TimelineMinimap({ viewportWidth }: TimelineMinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startScrollX: number; startMouseX: number } | null>(null);

  const tracks = useTimelineStore((s) => s.tracks);
  const zoom = useTimelineStore((s) => s.zoom);
  const scrollX = useTimelineStore((s) => s.scrollX);
  const currentTime = useTimelineStore((s) => s.currentTime);
  const markers = useTimelineStore((s) => s.markers);
  const setScrollX = useTimelineStore((s) => s.setScrollX);
  const getTimelineDuration = useTimelineStore((s) => s.getTimelineDuration);

  const totalDuration = getTimelineDuration();
  const pxPerMs = 0.1 * zoom;

  // Draw the minimap
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const width = container.clientWidth;
    const height = MINIMAP_HEIGHT;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, width, height);

    // Calculate scale: entire timeline duration maps to minimap width
    const duration = Math.max(totalDuration, 1000); // at least 1 second
    const msPerPx = duration / width;

    // Draw track clips
    const trackCount = tracks.length;
    const totalTrackHeight = trackCount * (TRACK_ROW_HEIGHT + TRACK_GAP);
    const trackOffsetY = Math.max(0, (height - totalTrackHeight) / 2);

    for (let t = 0; t < tracks.length; t++) {
      const track = tracks[t];
      const y = trackOffsetY + t * (TRACK_ROW_HEIGHT + TRACK_GAP);
      const color = TRACK_TYPE_COLORS[track.type] || '#666';

      for (const clip of track.clips) {
        const x1 = clip.startTime / msPerPx;
        const x2 = clip.endTime / msPerPx;
        const clipWidth = Math.max(1, x2 - x1);

        ctx.fillStyle = track.muted ? 'rgba(100, 100, 100, 0.4)' : color;
        ctx.globalAlpha = track.muted ? 0.4 : 0.7;
        ctx.fillRect(x1, y, clipWidth, TRACK_ROW_HEIGHT);
      }
    }

    ctx.globalAlpha = 1;

    // Draw markers
    for (const marker of markers) {
      const x = marker.time / msPerPx;
      ctx.fillStyle = marker.color;
      ctx.fillRect(x - 1, 0, 2, height);
      ctx.globalAlpha = 0.4;
      ctx.fillRect(x - 1, 0, 2, height);
      ctx.globalAlpha = 1;
    }

    // Draw viewport rectangle
    const contentWidth = Math.max(2000, (totalDuration + 5000) * pxPerMs);
    const viewStartMs = scrollX / pxPerMs;
    const viewEndMs = viewStartMs + viewportWidth / pxPerMs;

    const vpX1 = Math.max(0, viewStartMs / msPerPx);
    const vpX2 = Math.min(width, viewEndMs / msPerPx);
    const vpWidth = vpX2 - vpX1;

    // Darken areas outside viewport
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, 0, vpX1, height);
    ctx.fillRect(vpX2, 0, width - vpX2, height);

    // Viewport border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(vpX1 + 0.5, 0.5, vpWidth - 1, height - 1);

    // Draw playhead
    const playheadX = currentTime / msPerPx;
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(playheadX - 0.5, 0, 1, height);
  }, [tracks, zoom, scrollX, currentTime, markers, totalDuration, pxPerMs, viewportWidth]);

  // Redraw on state changes
  useEffect(() => {
    draw();
  }, [draw]);

  // Redraw on resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(container);
    return () => ro.disconnect();
  }, [draw]);

  // Click to navigate
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isDragging) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;
      const duration = Math.max(totalDuration, 1000);
      const msPerPx = duration / width;

      // Center the viewport on the clicked position
      const clickedTimeMs = x * msPerPx;
      const viewWidthMs = viewportWidth / pxPerMs;
      const newScrollX = Math.max(0, (clickedTimeMs - viewWidthMs / 2) * pxPerMs);
      setScrollX(newScrollX);
    },
    [totalDuration, viewportWidth, pxPerMs, setScrollX, isDragging],
  );

  // Drag viewport rectangle
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;
      const duration = Math.max(totalDuration, 1000);
      const msPerPx = duration / width;

      const viewStartMs = scrollX / pxPerMs;
      const viewEndMs = viewStartMs + viewportWidth / pxPerMs;
      const vpX1 = viewStartMs / msPerPx;
      const vpX2 = viewEndMs / msPerPx;

      // Check if click is within viewport rectangle
      if (x >= vpX1 && x <= vpX2) {
        setIsDragging(true);
        dragStartRef.current = { startScrollX: scrollX, startMouseX: e.clientX };
        e.preventDefault();
      }
    },
    [totalDuration, scrollX, pxPerMs, viewportWidth],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current || !containerRef.current) return;
      const containerWidth = containerRef.current.clientWidth;
      const duration = Math.max(totalDuration, 1000);
      const msPerPx = duration / containerWidth;

      const deltaX = e.clientX - dragStartRef.current.startMouseX;
      const deltaMsInMinimap = deltaX * msPerPx;
      const newScrollX = Math.max(0, dragStartRef.current.startScrollX + deltaMsInMinimap * pxPerMs);
      setScrollX(newScrollX);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, totalDuration, pxPerMs, setScrollX]);

  return (
    <div
      ref={containerRef}
      className="flex-shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)]"
      style={{ height: MINIMAP_HEIGHT }}
    >
      <canvas
        ref={canvasRef}
        className="w-full cursor-pointer"
        style={{ height: MINIMAP_HEIGHT }}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
      />
    </div>
  );
}
