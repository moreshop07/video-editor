import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTimelineStore, Track as TrackType } from '@/store/timelineStore';
import { TrackRegistryProvider } from './TrackRegistry';
import Track from './Track';

const TRACK_TYPE_COLORS: Record<string, string> = {
  video: '#3b82f6',
  audio: '#22c55e',
  music: '#a855f7',
  sfx: '#f59e0b',
  subtitle: '#ec4899',
  sticker: '#06b6d4',
};

function formatTimeRuler(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export default function Timeline() {
  const { t } = useTranslation();
  const timelineRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const [isSeeking, setIsSeeking] = useState(false);

  const {
    tracks,
    currentTime,
    zoom,
    scrollX,
    isPlaying,
    addTrack,
    zoomIn,
    zoomOut,
    setCurrentTime,
    setScrollX,
    togglePlay,
    selectClip,
    snapLine,
  } = useTimelineStore();

  // pixels per millisecond
  const pxPerMs = useMemo(() => 0.1 * zoom, [zoom]);

  // Total visible width of the timeline content
  const totalDuration = useTimelineStore((s) => s.getTimelineDuration());
  const contentWidth = useMemo(() => Math.max(2000, (totalDuration + 5000) * pxPerMs), [totalDuration, pxPerMs]);

  // Viewport width for clip virtualization
  const [viewportWidth, setViewportWidth] = useState(2000);
  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setViewportWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Time ruler markers
  const rulerMarkers = useMemo(() => {
    const markers: { time: number; label: string; major: boolean }[] = [];
    const interval = zoom > 2 ? 1000 : zoom > 0.5 ? 5000 : 10000;
    const subInterval = interval / 5;
    const visibleStart = scrollX / pxPerMs;
    const visibleEnd = visibleStart + 3000 / pxPerMs;

    for (let t = 0; t <= visibleEnd + interval; t += subInterval) {
      if (t < visibleStart - interval) continue;
      const major = t % interval === 0;
      markers.push({ time: t, label: major ? formatTimeRuler(t) : '', major });
    }
    return markers;
  }, [zoom, scrollX, pxPerMs]);

  // Playhead position in px
  const playheadX = currentTime * pxPerMs - scrollX;

  // Handle ruler click to seek
  const handleRulerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left + scrollX;
      const time = x / pxPerMs;
      setCurrentTime(Math.max(0, time));
    },
    [pxPerMs, scrollX, setCurrentTime]
  );

  // Handle ruler drag to seek
  const handleRulerMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      handleRulerClick(e);
      setIsSeeking(true);
    },
    [handleRulerClick]
  );

  useEffect(() => {
    if (!isSeeking) return;
    const handleMouseMove = (e: MouseEvent) => {
      const ruler = rulerRef.current;
      if (!ruler) return;
      const rect = ruler.getBoundingClientRect();
      const x = e.clientX - rect.left + scrollX;
      setCurrentTime(Math.max(0, x / pxPerMs));
    };
    const handleMouseUp = () => setIsSeeking(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isSeeking, pxPerMs, scrollX, setCurrentTime]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          setCurrentTime(currentTime + (e.shiftKey ? 5000 : 1000));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setCurrentTime(Math.max(0, currentTime - (e.shiftKey ? 5000 : 1000)));
          break;
        case 'Delete':
        case 'Backspace': {
          const selectedId = useTimelineStore.getState().selectedClipId;
          if (selectedId) {
            const state = useTimelineStore.getState();
            for (const track of state.tracks) {
              const clip = track.clips.find((c) => c.id === selectedId);
              if (clip) {
                useTimelineStore.getState().removeClip(track.id, selectedId);
                break;
              }
            }
          }
          break;
        }
        case 'z':
        case 'Z':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            if (e.shiftKey) {
              useTimelineStore.temporal.getState().redo();
            } else {
              useTimelineStore.temporal.getState().undo();
            }
          }
          break;
        case 'y':
        case 'Y':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            useTimelineStore.temporal.getState().redo();
          }
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTime, togglePlay, setCurrentTime]);

  // Auto-scroll to follow playhead
  useEffect(() => {
    if (!isPlaying) return;
    const timeline = timelineRef.current;
    if (!timeline) return;
    const viewWidth = timeline.clientWidth - 120; // minus header width
    if (playheadX > viewWidth * 0.8) {
      setScrollX(scrollX + viewWidth * 0.5);
    }
  }, [playheadX, isPlaying, scrollX, setScrollX]);

  // Handle scroll
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      setScrollX(e.currentTarget.scrollLeft);
    },
    [setScrollX]
  );

  // Click empty area to deselect
  const handleTimelineClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        selectClip(null);
      }
    },
    [selectClip]
  );

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface)] border-t border-[var(--color-border)]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--color-border)]">
        {/* Add track dropdown */}
        <div className="relative group">
          <button className="px-2 py-1 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-[var(--color-text)] hover:border-[var(--color-primary)]">
            + {t('timeline.addTrack')}
          </button>
          <div className="absolute left-0 top-full mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded shadow-lg hidden group-hover:block z-20">
            {(['video', 'audio', 'music', 'sfx', 'subtitle', 'sticker'] as const).map((type) => (
              <button
                key={type}
                onClick={() => addTrack(type)}
                className="block w-full px-3 py-1.5 text-xs text-left text-[var(--color-text)] hover:bg-[var(--color-bg)] whitespace-nowrap"
              >
                <span
                  className="inline-block w-2 h-2 rounded-full mr-2"
                  style={{ backgroundColor: TRACK_TYPE_COLORS[type] }}
                />
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1" />

        {/* Zoom controls */}
        <button
          onClick={zoomOut}
          className="w-6 h-6 flex items-center justify-center text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)] bg-[var(--color-bg)] rounded"
        >
          −
        </button>
        <span className="text-xs text-[var(--color-text-secondary)] w-10 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={zoomIn}
          className="w-6 h-6 flex items-center justify-center text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)] bg-[var(--color-bg)] rounded"
        >
          +
        </button>
      </div>

      {/* Timeline area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Track headers */}
        <div className="w-[120px] flex-shrink-0 border-r border-[var(--color-border)] overflow-y-auto">
          {/* Ruler header spacer */}
          <div className="h-7 border-b border-[var(--color-border)]" />
          {tracks.map((track) => (
            <div
              key={track.id}
              className="flex items-center gap-1 px-2 border-b border-[var(--color-border)]"
              style={{ height: track.height }}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: TRACK_TYPE_COLORS[track.type] }}
              />
              <span className="text-[10px] text-[var(--color-text)] truncate flex-1">
                {track.name}
              </span>
              <button
                onClick={() => useTimelineStore.getState().toggleTrackMute(track.id)}
                className={`text-[10px] ${track.muted ? 'text-red-400' : 'text-[var(--color-text-secondary)]'}`}
                title={track.muted ? 'Unmute' : 'Mute'}
              >
                {track.muted ? 'M' : 'm'}
              </button>
              <button
                onClick={() => useTimelineStore.getState().toggleTrackLock(track.id)}
                className={`text-[10px] ${track.locked ? 'text-yellow-400' : 'text-[var(--color-text-secondary)]'}`}
                title={track.locked ? 'Unlock' : 'Lock'}
              >
                {track.locked ? 'L' : 'l'}
              </button>
            </div>
          ))}
        </div>

        {/* Scrollable timeline content */}
        <div
          ref={timelineRef}
          className="flex-1 overflow-auto"
          onScroll={handleScroll}
        >
          {/* Time ruler */}
          <div
            ref={rulerRef}
            className="h-7 border-b border-[var(--color-border)] relative cursor-pointer select-none"
            style={{ width: contentWidth }}
            onMouseDown={handleRulerMouseDown}
          >
            {rulerMarkers.map((marker, i) => {
              const x = marker.time * pxPerMs;
              return (
                <div key={i} className="absolute top-0" style={{ left: x }}>
                  <div
                    className={`border-l ${marker.major ? 'border-[var(--color-text-secondary)] h-4' : 'border-[var(--color-border)] h-2'}`}
                    style={{ marginTop: marker.major ? 0 : 8 }}
                  />
                  {marker.label && (
                    <span className="absolute top-0 left-1 text-[9px] text-[var(--color-text-secondary)] whitespace-nowrap">
                      {marker.label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Track lanes */}
          <TrackRegistryProvider>
            <div className="relative" style={{ width: contentWidth }} onClick={handleTimelineClick}>
              {tracks.map((track) => (
                <Track key={track.id} track={track} pxPerMs={pxPerMs} viewportWidth={viewportWidth} />
              ))}

              {/* Snap indicator line */}
              {snapLine !== null && (
                <div
                  className="absolute top-0 bottom-0 w-[1px] bg-yellow-400 pointer-events-none z-10"
                  style={{ left: snapLine * pxPerMs }}
                />
              )}

              {/* Playhead */}
              <div
                className="absolute top-0 bottom-0 w-[2px] bg-red-500 pointer-events-none z-10"
                style={{ left: currentTime * pxPerMs }}
              >
                <div className="w-3 h-3 bg-red-500 -translate-x-[5px] -translate-y-1 rotate-45" />
              </div>
            </div>
          </TrackRegistryProvider>
        </div>
      </div>
    </div>
  );
}
