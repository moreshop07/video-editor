import React, { useCallback, useEffect, useRef, useState } from 'react';
import { WaveformCache, type WaveformPeaks } from '@/engine/WaveformCache';
import { ThumbnailCache, computeThumbnailTimes } from '@/engine/ThumbnailCache';

interface ClipCanvasProps {
  clipId: string;
  assetId: string;
  clipType: string;
  width: number;
  height: number;
  trimStartMs: number;
  visibleDurationMs: number;
  sourceDurationMs: number;
  speed: number;
  color: string;
}

const STREAM_URL_BASE = '/api/v1/assets';

function getStreamUrl(assetId: string): string {
  return `${STREAM_URL_BASE}/${assetId}/stream`;
}

// ---- Waveform drawing ----

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  peaks: WaveformPeaks,
  width: number,
  height: number,
  trimStartMs: number,
  visibleDurationMs: number,
  speed: number,
  color: string,
): void {
  const dpr = window.devicePixelRatio || 1;
  const w = width * dpr;
  const h = height * dpr;

  ctx.clearRect(0, 0, w, h);

  // Compute source time range
  const effectiveDurationMs = visibleDurationMs * speed;
  const sourceStartMs = trimStartMs;
  const sourceEndMs = trimStartMs + effectiveDurationMs;

  // Convert to peak indices
  const msPerPeak = peaks.durationMs / (peaks.peaks.length / 2);
  if (msPerPeak <= 0) return;

  const startIdx = Math.max(0, Math.floor(sourceStartMs / msPerPeak));
  const endIdx = Math.min(peaks.peaks.length / 2, Math.ceil(sourceEndMs / msPerPeak));
  const visibleCount = endIdx - startIdx;

  if (visibleCount <= 0) return;

  const centerY = h / 2;
  const maxAmplitude = h / 2 * 0.85;

  ctx.fillStyle = color;
  ctx.globalAlpha = 0.5;

  const pxPerPeak = w / visibleCount;

  if (pxPerPeak >= 2) {
    // Bar mode
    const barWidth = Math.max(1, pxPerPeak - 1);
    for (let i = 0; i < visibleCount; i++) {
      const peakIdx = startIdx + i;
      const min = peaks.peaks[peakIdx * 2];
      const max = peaks.peaks[peakIdx * 2 + 1];

      const x = i * pxPerPeak;
      const yTop = centerY - max * maxAmplitude;
      const yBottom = centerY - min * maxAmplitude;

      ctx.fillRect(x, yTop, barWidth, Math.max(1, yBottom - yTop));
    }
  } else {
    // Filled path mode for very zoomed-out views
    ctx.beginPath();
    // Top half (max values)
    for (let i = 0; i < visibleCount; i++) {
      const peakIdx = startIdx + i;
      const max = peaks.peaks[peakIdx * 2 + 1];
      const x = (i / visibleCount) * w;
      const y = centerY - max * maxAmplitude;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    // Bottom half (min values, reversed)
    for (let i = visibleCount - 1; i >= 0; i--) {
      const peakIdx = startIdx + i;
      const min = peaks.peaks[peakIdx * 2];
      const x = (i / visibleCount) * w;
      const y = centerY - min * maxAmplitude;
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

// ---- Thumbnail drawing ----

function drawThumbnails(
  ctx: CanvasRenderingContext2D,
  cache: ThumbnailCache,
  assetId: string,
  width: number,
  height: number,
  times: number[],
): void {
  const dpr = window.devicePixelRatio || 1;
  const w = width * dpr;
  const h = height * dpr;

  ctx.clearRect(0, 0, w, h);

  const thumbCount = times.length;
  if (thumbCount === 0) return;

  const thumbWidth = w / thumbCount;

  ctx.globalAlpha = 0.6;

  for (let i = 0; i < thumbCount; i++) {
    const bitmap = cache.get(assetId, times[i]);
    if (!bitmap) continue;

    const x = i * thumbWidth;

    // Cover-crop: scale bitmap to fill thumbWidth x h
    const srcAspect = bitmap.width / bitmap.height;
    const dstAspect = thumbWidth / h;

    let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height;
    if (srcAspect > dstAspect) {
      sw = bitmap.height * dstAspect;
      sx = (bitmap.width - sw) / 2;
    } else {
      sh = bitmap.width / dstAspect;
      sy = (bitmap.height - sh) / 2;
    }

    ctx.drawImage(bitmap, sx, sy, sw, sh, x, 0, thumbWidth, h);
  }

  ctx.globalAlpha = 1;
}

// ---- Component ----

function ClipCanvasComponent({
  clipId: _clipId,
  assetId,
  clipType,
  width,
  height,
  trimStartMs,
  visibleDurationMs,
  sourceDurationMs,
  speed,
  color,
}: ClipCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [, setRedrawCounter] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAudioType = clipType === 'audio' || clipType === 'music' || clipType === 'sfx';
  const isVideoType = clipType === 'video';

  const triggerRedraw = useCallback(() => {
    setRedrawCounter((c) => c + 1);
  }, []);

  // Load waveform data for audio clips
  useEffect(() => {
    if (!isAudioType) return;
    const cache = WaveformCache.getInstance();
    if (cache.has(assetId)) return;

    cache.load(assetId, getStreamUrl(assetId)).then(() => {
      triggerRedraw();
    }).catch(() => {
      // Audio load failed — no waveform
    });
  }, [assetId, isAudioType, triggerRedraw]);

  // Request thumbnails for video clips (with debounce on size changes)
  useEffect(() => {
    if (!isVideoType || width < 4) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      const cache = ThumbnailCache.getInstance();
      const times = computeThumbnailTimes(
        width, height, trimStartMs, visibleDurationMs, sourceDurationMs, speed,
      );
      cache.requestRange(assetId, getStreamUrl(assetId), times, triggerRedraw);
    }, 150);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [assetId, isVideoType, width, height, trimStartMs, visibleDurationMs, sourceDurationMs, speed, triggerRedraw]);

  // Draw to canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width < 4) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (isAudioType) {
      const peaks = WaveformCache.getInstance().get(assetId);
      if (peaks) {
        drawWaveform(ctx, peaks, width, height, trimStartMs, visibleDurationMs, speed, color);
      }
    } else if (isVideoType) {
      const cache = ThumbnailCache.getInstance();
      const times = computeThumbnailTimes(
        width, height, trimStartMs, visibleDurationMs, sourceDurationMs, speed,
      );
      drawThumbnails(ctx, cache, assetId, width, height, times);
    }
  });

  if (width < 4) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width, height: '100%' }}
    />
  );
}

export const ClipCanvas = React.memo(ClipCanvasComponent);
