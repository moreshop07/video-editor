import React, { useCallback, useRef, useState } from 'react';
import { useTimelineStore, Clip as ClipType } from '@/store/timelineStore';
import { collectSnapPoints, findMoveSnapTarget, findSnapTarget } from './snapUtils';
import { useTrackRegistry } from './TrackRegistry';
import { findTrackAtY } from './clipDragUtils';

interface ClipProps {
  clip: ClipType;
  trackId: string;
  pxPerMs: number;
  trackLocked: boolean;
}

function formatTrimTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const frames = Math.floor((ms % 1000) / (1000 / 30));
  return `${min}:${sec.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

const CLIP_COLORS: Record<string, string> = {
  video: '#3b82f6',
  audio: '#22c55e',
  music: '#a855f7',
  sfx: '#f59e0b',
  image: '#06b6d4',
  subtitle: '#ec4899',
  sticker: '#06b6d4',
  text: '#f97316',
};

function ClipComponent({ clip, trackId, pxPerMs, trackLocked }: ClipProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isTrimming, setIsTrimming] = useState<'start' | 'end' | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });

  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds);
  const selectClip = useTimelineStore((s) => s.selectClip);
  const toggleClipSelection = useTimelineStore((s) => s.toggleClipSelection);
  const addClipRangeSelection = useTimelineStore((s) => s.addClipRangeSelection);
  const moveClip = useTimelineStore((s) => s.moveClip);
  const trimClip = useTimelineStore((s) => s.trimClip);
  const removeClip = useTimelineStore((s) => s.removeClip);
  const removeSelectedClips = useTimelineStore((s) => s.removeSelectedClips);
  const splitClip = useTimelineStore((s) => s.splitClip);
  const currentTime = useTimelineStore((s) => s.currentTime);
  const tracks = useTimelineStore((s) => s.tracks);
  const snapEnabled = useTimelineStore((s) => s.snapEnabled);
  const setSnapLine = useTimelineStore((s) => s.setSnapLine);
  const { elements: trackElements, trackTypes: trackTypesRef } = useTrackRegistry();

  const isSelected = selectedClipIds.includes(clip.id);
  const multiSelected = selectedClipIds.length > 1;
  const clipWidth = (clip.endTime - clip.startTime) * pxPerMs;
  const clipLeft = clip.startTime * pxPerMs;
  const color = CLIP_COLORS[clip.type] || CLIP_COLORS.video;

  // Drag to move (with snap + cross-track)
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (trackLocked || isTrimming) return;
      e.stopPropagation();

      // Multi-select handling
      if (e.ctrlKey || e.metaKey) {
        toggleClipSelection(clip.id);
        return;
      }
      if (e.shiftKey) {
        addClipRangeSelection(clip.id);
        return;
      }
      selectClip(clip.id);

      const startX = e.clientX;
      const originalStart = clip.startTime;
      const clipDuration = clip.endTime - clip.startTime;
      let currentFromTrack = trackId;

      const handleMove = (e: MouseEvent) => {
        const deltaX = e.clientX - startX;
        const deltaMs = deltaX / pxPerMs;
        const rawStart = Math.max(0, originalStart + deltaMs);

        // Determine target track via Y hit testing
        const targetTrack = findTrackAtY(
          e.clientY, trackElements.current, trackTypesRef.current, clip.type,
        );
        const toTrackId = targetTrack || currentFromTrack;

        let finalStart: number;
        if (snapEnabled) {
          const snapPoints = collectSnapPoints(tracks, clip.id, currentTime);
          const { snappedStart, snapTime } = findMoveSnapTarget(
            rawStart, clipDuration, snapPoints, pxPerMs,
          );
          finalStart = snappedStart;
          setSnapLine(snapTime);
        } else {
          finalStart = Math.round(rawStart);
        }

        moveClip(currentFromTrack, toTrackId, clip.id, finalStart);
        currentFromTrack = toTrackId;
        setIsDragging(true);
      };

      const handleUp = () => {
        setIsDragging(false);
        setSnapLine(null);
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);
      };

      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
    },
    [clip.id, clip.type, clip.startTime, clip.endTime, trackId, trackLocked, pxPerMs, selectClip, toggleClipSelection, addClipRangeSelection, moveClip, isTrimming, snapEnabled, tracks, currentTime, setSnapLine, trackElements, trackTypesRef]
  );

  const [trimTooltip, setTrimTooltip] = useState<{ x: number; time: number } | null>(null);

  // Trim handles (with snap + tooltip)
  const handleTrimStart = useCallback(
    (e: React.MouseEvent, side: 'start' | 'end') => {
      if (trackLocked) return;
      e.stopPropagation();
      setIsTrimming(side);

      const handleMove = (e: MouseEvent) => {
        const container = containerRef.current?.parentElement;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        let time = Math.max(0, Math.round(x / pxPerMs));

        if (snapEnabled) {
          const snapPoints = collectSnapPoints(tracks, clip.id, currentTime);
          const { snappedTime, snapPoint } = findSnapTarget(time, snapPoints, pxPerMs);
          if (snapPoint) {
            time = snappedTime;
            setSnapLine(snappedTime);
          } else {
            setSnapLine(null);
          }
        }

        trimClip(trackId, clip.id, side, time);
        setTrimTooltip({ x: e.clientX, time });
      };

      const handleUp = () => {
        setIsTrimming(null);
        setSnapLine(null);
        setTrimTooltip(null);
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);
      };

      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
    },
    [trackId, clip.id, trackLocked, pxPerMs, trimClip, snapEnabled, tracks, currentTime, setSnapLine]
  );

  // Context menu
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      selectClip(clip.id);
      setContextMenuPos({ x: e.clientX, y: e.clientY });
      setShowContextMenu(true);

      const closeMenu = () => {
        setShowContextMenu(false);
        window.removeEventListener('click', closeMenu);
      };
      setTimeout(() => window.addEventListener('click', closeMenu), 0);
    },
    [clip.id, selectClip]
  );

  const handleSplit = useCallback(() => {
    if (currentTime > clip.startTime && currentTime < clip.endTime) {
      splitClip(trackId, clip.id, currentTime);
    }
    setShowContextMenu(false);
  }, [trackId, clip.id, clip.startTime, clip.endTime, currentTime, splitClip]);

  const handleDelete = useCallback(() => {
    if (multiSelected && isSelected) {
      removeSelectedClips();
    } else {
      removeClip(trackId, clip.id);
    }
    setShowContextMenu(false);
  }, [trackId, clip.id, removeClip, removeSelectedClips, multiSelected, isSelected]);

  return (
    <>
      <div
        ref={containerRef}
        className={`absolute top-1 bottom-1 rounded-sm cursor-grab active:cursor-grabbing select-none overflow-hidden ${
          isSelected ? (multiSelected ? 'ring-2 ring-blue-400' : 'ring-2 ring-white') : ''
        } ${isDragging ? 'opacity-70' : ''}`}
        style={{
          left: clipLeft,
          width: Math.max(clipWidth, 4),
          backgroundColor: color,
        }}
        onMouseDown={handleMouseDown}
        onContextMenu={handleContextMenu}
      >
        {/* Left trim handle */}
        <div
          className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/30 z-10"
          onMouseDown={(e) => handleTrimStart(e, 'start')}
        />

        {/* Clip content */}
        <div className="px-2 py-0.5 h-full flex items-center overflow-hidden">
          <span className="text-[10px] text-white truncate font-medium drop-shadow">
            {clip.name}
          </span>
        </div>

        {/* Right trim handle */}
        <div
          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/30 z-10"
          onMouseDown={(e) => handleTrimStart(e, 'end')}
        />
      </div>

      {/* Trim tooltip */}
      {trimTooltip && (
        <div
          className="fixed z-50 bg-black/80 text-white text-[10px] px-2 py-0.5 rounded pointer-events-none -translate-x-1/2"
          style={{ left: trimTooltip.x, top: (containerRef.current?.getBoundingClientRect().top ?? 0) - 22 }}
        >
          {formatTrimTime(trimTooltip.time)}
        </div>
      )}

      {/* Context menu */}
      {showContextMenu && (
        <div
          className="fixed bg-[var(--color-surface)] border border-[var(--color-border)] rounded shadow-lg z-50 py-1"
          style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
        >
          <button
            onClick={handleSplit}
            disabled={currentTime <= clip.startTime || currentTime >= clip.endTime}
            className="block w-full px-4 py-1.5 text-xs text-left text-[var(--color-text)] hover:bg-[var(--color-bg)] disabled:opacity-30"
          >
            Split at Playhead
          </button>
          <button
            onClick={handleDelete}
            className="block w-full px-4 py-1.5 text-xs text-left text-red-400 hover:bg-[var(--color-bg)]"
          >
            {multiSelected && isSelected ? `Delete ${selectedClipIds.length} clips` : 'Delete'}
          </button>
        </div>
      )}
    </>
  );
}

export default React.memo(ClipComponent, (prev, next) => {
  return (
    prev.clip.id === next.clip.id &&
    prev.clip.startTime === next.clip.startTime &&
    prev.clip.endTime === next.clip.endTime &&
    prev.clip.name === next.clip.name &&
    prev.clip.trimStart === next.clip.trimStart &&
    prev.clip.trimEnd === next.clip.trimEnd &&
    prev.trackId === next.trackId &&
    prev.pxPerMs === next.pxPerMs &&
    prev.trackLocked === next.trackLocked
  );
});
