import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTimelineStore, Track as TrackType } from '@/store/timelineStore';
import { useTrackRegistry } from './TrackRegistry';
import Clip from './Clip';

interface TrackProps {
  track: TrackType;
  pxPerMs: number;
  isDragTarget?: boolean;
  viewportWidth?: number;
}

const TRACK_COLORS: Record<string, string> = {
  video: 'rgba(59, 130, 246, 0.3)',
  audio: 'rgba(34, 197, 94, 0.3)',
  music: 'rgba(168, 85, 247, 0.3)',
  sfx: 'rgba(245, 158, 11, 0.3)',
  subtitle: 'rgba(236, 72, 153, 0.3)',
  sticker: 'rgba(6, 182, 212, 0.3)',
};

function TrackComponent({ track, pxPerMs, isDragTarget, viewportWidth }: TrackProps) {
  const addClip = useTimelineStore((s) => s.addClip);
  const scrollX = useTimelineStore((s) => s.scrollX);
  const trackRef = useRef<HTMLDivElement>(null);
  const { elements, trackTypes } = useTrackRegistry();

  // Register track element for cross-track drag hit testing
  useEffect(() => {
    const el = trackRef.current;
    if (el) {
      elements.current.set(track.id, el);
      trackTypes.current.set(track.id, track.type);
    }
    return () => {
      elements.current.delete(track.id);
      trackTypes.current.delete(track.id);
    };
  }, [track.id, track.type, elements, trackTypes]);

  // Virtualize clips: only render those visible in viewport
  const visibleClips = useMemo(() => {
    if (!viewportWidth) return track.clips;
    const viewStart = scrollX;
    const viewEnd = scrollX + viewportWidth;
    const buffer = 200; // px buffer for smooth scrolling
    return track.clips.filter((clip) => {
      const clipStart = clip.startTime * pxPerMs;
      const clipEnd = clip.endTime * pxPerMs;
      return clipEnd >= (viewStart - buffer) && clipStart <= (viewEnd + buffer);
    });
  }, [track.clips, scrollX, viewportWidth, pxPerMs]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (track.locked) return;

      try {
        const data = JSON.parse(e.dataTransfer.getData('application/json'));
        if (!data.id) return;

        // Calculate drop position in ms
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const startTime = Math.max(0, Math.round(x / pxPerMs));
        const duration = data.duration_ms || 5000; // default 5s for images

        addClip(track.id, {
          id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          assetId: String(data.id),
          startTime,
          endTime: startTime + duration,
          trimStart: 0,
          trimEnd: 0,
          duration,
          name: data.filename || `Asset ${data.id}`,
          type: data.type || track.type,
        });
      } catch {
        // Invalid drag data
      }
    },
    [track.id, track.locked, pxPerMs, addClip]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!track.locked) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    },
    [track.locked]
  );

  return (
    <div
      ref={trackRef}
      className={`relative border-b border-[var(--color-border)] ${track.locked ? 'opacity-60' : ''} ${isDragTarget ? 'ring-1 ring-inset ring-white/20 bg-white/5' : ''}`}
      style={{
        height: track.height,
        background: track.muted ? 'rgba(255,0,0,0.05)' : undefined,
      }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Drop zone indicator */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="w-full h-full" style={{ background: TRACK_COLORS[track.type] || TRACK_COLORS.video, opacity: 0.1 }} />
      </div>

      {/* Clips */}
      {visibleClips.map((clip) => (
        <Clip key={clip.id} clip={clip} trackId={track.id} pxPerMs={pxPerMs} trackLocked={track.locked} />
      ))}
    </div>
  );
}

export default React.memo(TrackComponent, (prev, next) => {
  return (
    prev.track.id === next.track.id &&
    prev.track.clips === next.track.clips &&
    prev.track.muted === next.track.muted &&
    prev.track.locked === next.track.locked &&
    prev.track.height === next.track.height &&
    prev.pxPerMs === next.pxPerMs &&
    prev.viewportWidth === next.viewportWidth
  );
});
