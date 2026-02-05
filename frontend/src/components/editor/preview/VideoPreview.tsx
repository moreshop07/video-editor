import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useTimelineStore } from '@/store/timelineStore';
import { useSubtitleStore } from '@/store/subtitleStore';
import { CompositorEngine } from '@/engine';
import type { RenderableTrack } from '@/engine';

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const frame = Math.floor((ms % 1000) / (1000 / 30));
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}:${frame.toString().padStart(2, '0')}`;
}

export default function VideoPreview() {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<CompositorEngine | null>(null);

  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 640, height: 360 });
  const [hasContent, setHasContent] = useState(false);

  const isPlaying = useTimelineStore((s) => s.isPlaying);
  const currentTime = useTimelineStore((s) => s.currentTime);
  const tracks = useTimelineStore((s) => s.tracks);
  const setCurrentTime = useTimelineStore((s) => s.setCurrentTime);
  const play = useTimelineStore((s) => s.play);
  const pause = useTimelineStore((s) => s.pause);

  // Resize canvas to fit container maintaining 16:9
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        const newW = Math.floor(width);
        const newH = Math.floor(width * 9 / 16);
        setCanvasSize({ width: newW, height: newH });
        engineRef.current?.resize(newW, newH);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Initialize engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new CompositorEngine({
      canvas,
      width: canvasSize.width,
      height: canvasSize.height,
      fps: 30,
    });

    engine.setAssetUrlResolver((assetId) => `/api/v1/assets/${assetId}/stream`);

    engine.onTimeUpdate = (timeMs) => {
      setCurrentTime(timeMs);
    };

    engine.onError = (err) => {
      console.error('Engine error:', err);
    };

    engine.init().then(() => {
      engineRef.current = engine;
    });

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe to subtitle segments for canvas overlay
  const subtitleTracks = useSubtitleStore((s) => s.tracks);
  const activeTrackId = useSubtitleStore((s) => s.activeTrackId);

  // Convert store tracks to engine's renderable format and sync
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const renderableTracks: RenderableTrack[] = tracks.map((t) => ({
      id: t.id,
      type: t.type,
      clips: t.clips.map((c) => ({
        id: c.id,
        assetId: c.assetId,
        startTime: c.startTime,
        endTime: c.endTime,
        trimStart: c.trimStart,
        duration: c.duration,
        volume: c.volume ?? 1,
        opacity: 1,
        type: c.type,
        filters: c.filters,
        fadeInMs: c.fadeInMs,
        fadeOutMs: c.fadeOutMs,
        positionX: c.positionX,
        positionY: c.positionY,
        scaleX: c.scaleX,
        scaleY: c.scaleY,
        rotation: c.rotation,
      })),
      muted: t.muted,
      visible: t.visible,
      volume: 1,
    }));

    engine.setTracks(renderableTracks);

    // Check if any clips exist
    const clipCount = tracks.reduce((sum, t) => sum + t.clips.length, 0);
    setHasContent(clipCount > 0);
  }, [tracks]);

  // Sync subtitle segments to engine when active track changes
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const activeSubTrack = subtitleTracks.find((t) => t.id === activeTrackId);
    const segments = activeSubTrack?.segments ?? [];
    engine.setSubtitleSegments(
      segments.map((seg) => ({
        start_ms: seg.start_ms,
        end_ms: seg.end_ms,
        text: seg.text,
        translated_text: seg.translated_text,
      })),
    );
  }, [subtitleTracks, activeTrackId]);

  // Handle play/pause from store
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    if (isPlaying) {
      engine.play();
    } else {
      engine.pause();
    }
  }, [isPlaying]);

  // Handle seek from timeline (when not playing)
  const lastSeekTime = useRef(currentTime);
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || isPlaying) {
      lastSeekTime.current = currentTime;
      return;
    }

    // Only seek if time changed externally (user dragging playhead)
    if (currentTime !== lastSeekTime.current) {
      engine.seekTo(currentTime);
      engine.renderFrame(currentTime);
      lastSeekTime.current = currentTime;
    }
  }, [currentTime, isPlaying]);

  // Volume control
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setMasterVolume(isMuted ? 0 : volume);
  }, [volume, isMuted]);

  // Calculate total duration for seekbar
  const totalDuration = useTimelineStore((s) => s.getTimelineDuration());

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const time = Number(e.target.value);
      setCurrentTime(time);
    },
    [setCurrentTime],
  );

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface)]">
      {/* Video display area */}
      <div ref={containerRef} className="flex-1 flex items-center justify-center bg-black p-2 min-h-0">
        <div className="relative" style={{ width: canvasSize.width, height: canvasSize.height }}>
          <canvas
            ref={canvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
            className="bg-black rounded"
          />
          {/* No content overlay */}
          {!hasContent && (
            <div className="absolute inset-0 flex items-center justify-center text-[var(--color-text-secondary)] text-sm">
              {t('preview.noContent')}
            </div>
          )}
        </div>
      </div>

      {/* Transport controls */}
      <div className="px-4 py-2 border-t border-[var(--color-border)]">
        {/* Seek bar */}
        <input
          type="range"
          min={0}
          max={Math.max(totalDuration, 1)}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-1 mb-2 accent-[var(--color-primary)]"
        />

        <div className="flex items-center gap-3">
          {/* Play/Pause */}
          <button
            onClick={() => (isPlaying ? pause() : play())}
            className="w-8 h-8 flex items-center justify-center rounded bg-[var(--color-primary)] text-white hover:opacity-90"
          >
            {isPlaying ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            )}
          </button>

          {/* Time display */}
          <span className="text-xs font-mono text-[var(--color-text)]">
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </span>

          <div className="flex-1" />

          {/* Volume */}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isMuted ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              )}
            </svg>
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              setVolume(Number(e.target.value));
              setIsMuted(false);
            }}
            className="w-16 h-1 accent-[var(--color-primary)]"
          />
        </div>
      </div>
    </div>
  );
}
