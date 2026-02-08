import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTimelineStore } from '@/store/timelineStore';
import type { KeyframeTracks, Keyframe } from '@/types/keyframes';
import { getInterpolatedValue } from '@/utils/keyframeUtils';
import {
  SPEED_RAMP_PRESETS,
  getSpeedRampPresetKeyframes,
  type SpeedRampPreset,
} from '@/utils/speedRampUtils';

interface SpeedRampEditorProps {
  clipId: string;
  trackId: string;
  clipStartTime: number;
  clipDuration: number;
  staticSpeed: number;
  keyframeTracks?: KeyframeTracks;
}

const GRAPH_W = 240;
const GRAPH_H = 80;
const MIN_SPEED = 0.25;
const MAX_SPEED = 4;

function speedToY(speed: number): number {
  const t = (speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED);
  return GRAPH_H - t * GRAPH_H;
}

function SpeedRampEditorComponent({
  clipId,
  trackId,
  clipStartTime,
  clipDuration,
  staticSpeed,
  keyframeTracks,
}: SpeedRampEditorProps) {
  const { t } = useTranslation();
  const updateClip = useTimelineStore((s) => s.updateClip);
  const setClipKeyframe = useTimelineStore((s) => s.setClipKeyframe);
  const removeClipKeyframe = useTimelineStore((s) => s.removeClipKeyframe);
  const removeClipKeyframeTrack = useTimelineStore((s) => s.removeClipKeyframeTrack);
  const currentTime = useTimelineStore((s) => s.currentTime);

  const speedKfs = keyframeTracks?.speed;
  const isVariable = speedKfs && speedKfs.length > 0;
  const [showVariable, setShowVariable] = useState(!!isVariable);

  const clipTimeMs = Math.max(0, Math.min(currentTime - clipStartTime, clipDuration));

  const currentSpeed = useMemo(() => {
    if (isVariable) {
      return getInterpolatedValue(speedKfs, clipTimeMs, staticSpeed);
    }
    return staticSpeed;
  }, [isVariable, speedKfs, clipTimeMs, staticSpeed]);

  const handleStaticSpeedChange = useCallback(
    (speed: number) => {
      updateClip(trackId, clipId, {
        filters: { speed, effects: [] },
      });
    },
    [trackId, clipId, updateClip],
  );

  const handleApplyPreset = useCallback(
    (preset: SpeedRampPreset) => {
      const kfs = getSpeedRampPresetKeyframes(preset, clipDuration);
      // Clear existing speed keyframes and set new ones
      if (isVariable) {
        removeClipKeyframeTrack(trackId, clipId, 'speed');
      }
      for (const kf of kfs) {
        setClipKeyframe(clipId, 'speed', kf.time, kf.value);
      }
    },
    [clipId, trackId, clipDuration, isVariable, setClipKeyframe, removeClipKeyframeTrack],
  );

  const handleAddKeyframe = useCallback(() => {
    setClipKeyframe(clipId, 'speed', clipTimeMs, currentSpeed);
  }, [clipId, clipTimeMs, currentSpeed, setClipKeyframe]);

  const handleRemoveKeyframe = useCallback(() => {
    removeClipKeyframe(clipId, 'speed', clipTimeMs);
  }, [clipId, clipTimeMs, removeClipKeyframe]);

  const handleReset = useCallback(() => {
    removeClipKeyframeTrack(trackId, clipId, 'speed');
    setShowVariable(false);
  }, [trackId, clipId, removeClipKeyframeTrack]);

  const handleToggleVariable = useCallback(() => {
    if (showVariable && isVariable) {
      // Switching back to constant — clear keyframes
      removeClipKeyframeTrack(trackId, clipId, 'speed');
    }
    setShowVariable((v) => !v);
  }, [showVariable, isVariable, trackId, clipId, removeClipKeyframeTrack]);

  // SVG curve path for speed keyframes
  const curvePath = useMemo(() => {
    if (!isVariable || !speedKfs) return '';

    const sorted = [...speedKfs].sort((a, b) => a.time - b.time);
    const steps = 100;
    const points: string[] = [];

    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * clipDuration;
      const speed = getInterpolatedValue(sorted, t, staticSpeed);
      const x = (t / clipDuration) * GRAPH_W;
      const y = speedToY(speed);
      points.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
    }

    return points.join(' ');
  }, [isVariable, speedKfs, clipDuration, staticSpeed]);

  // Keyframe diamond positions
  const kfPositions = useMemo(() => {
    if (!speedKfs) return [];
    return [...speedKfs]
      .sort((a, b) => a.time - b.time)
      .map((kf) => ({
        x: (kf.time / clipDuration) * GRAPH_W,
        y: speedToY(kf.value),
        time: kf.time,
        value: kf.value,
      }));
  }, [speedKfs, clipDuration]);

  // Playhead position on graph
  const playheadX = clipDuration > 0 ? (clipTimeMs / clipDuration) * GRAPH_W : 0;

  return (
    <div className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
          {t('speedRamp.title')}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-[var(--color-text-secondary)]">
            {showVariable ? t('speedRamp.variable') : t('speedRamp.constant')}
          </span>
          <button
            onClick={handleToggleVariable}
            className={`relative h-4 w-8 rounded-full transition-colors ${
              showVariable ? 'bg-[var(--color-primary)]' : 'bg-white/20'
            }`}
          >
            <span
              className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
                showVariable ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Constant mode: simple slider */}
      {!showVariable && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] text-[var(--color-text-secondary)]">
              {t('speedRamp.speed')}
            </label>
            <span className="text-[10px] text-[var(--color-text-secondary)]">
              {staticSpeed.toFixed(2)}x
            </span>
          </div>
          <input
            type="range"
            min={0.25}
            max={4}
            step={0.05}
            value={staticSpeed}
            onChange={(e) => handleStaticSpeedChange(Number(e.target.value))}
            className="h-1 w-full cursor-pointer appearance-none rounded bg-white/10 accent-[var(--accent)]"
          />
        </div>
      )}

      {/* Variable mode */}
      {showVariable && (
        <>
          {/* Presets */}
          <div className="flex flex-wrap gap-1">
            {SPEED_RAMP_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => handleApplyPreset(preset.id)}
                className="rounded bg-[var(--color-surface)] px-1.5 py-0.5 text-[9px] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:border-[var(--accent)] transition-colors"
              >
                {t(preset.labelKey)}
              </button>
            ))}
          </div>

          {/* Speed curve graph */}
          <div className="relative rounded border border-[var(--color-border)] bg-black/20 overflow-hidden">
            <svg width={GRAPH_W} height={GRAPH_H} className="block">
              {/* Grid lines for 1x, 2x, 3x */}
              {[1, 2, 3].map((s) => (
                <line
                  key={s}
                  x1={0}
                  y1={speedToY(s)}
                  x2={GRAPH_W}
                  y2={speedToY(s)}
                  stroke="rgba(255,255,255,0.08)"
                  strokeDasharray="2 4"
                />
              ))}

              {/* Speed curve */}
              {curvePath && (
                <path d={curvePath} fill="none" stroke="var(--accent, #3b82f6)" strokeWidth={1.5} />
              )}

              {/* 1x reference line */}
              <line
                x1={0}
                y1={speedToY(1)}
                x2={GRAPH_W}
                y2={speedToY(1)}
                stroke="rgba(255,255,255,0.15)"
                strokeWidth={0.5}
              />

              {/* Keyframe diamonds */}
              {kfPositions.map((kf, i) => (
                <g key={i} transform={`translate(${kf.x}, ${kf.y})`}>
                  <rect
                    x={-3}
                    y={-3}
                    width={6}
                    height={6}
                    transform="rotate(45)"
                    fill="var(--accent, #3b82f6)"
                    stroke="white"
                    strokeWidth={0.5}
                    className="cursor-pointer"
                  />
                </g>
              ))}

              {/* Playhead */}
              <line
                x1={playheadX}
                y1={0}
                x2={playheadX}
                y2={GRAPH_H}
                stroke="rgba(255,255,255,0.4)"
                strokeWidth={1}
              />
            </svg>

            {/* Y-axis labels */}
            <span className="absolute top-0 left-0.5 text-[7px] text-white/30">4x</span>
            <span className="absolute bottom-0 left-0.5 text-[7px] text-white/30">0.25x</span>
          </div>

          {/* Controls row */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              <button
                onClick={handleAddKeyframe}
                className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-[var(--color-text)] hover:bg-white/20 transition-colors"
              >
                + {t('speedRamp.addKeyframe')}
              </button>
              <button
                onClick={handleRemoveKeyframe}
                className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-[var(--color-text-secondary)] hover:bg-white/20 transition-colors"
              >
                - {t('speedRamp.removeKeyframe')}
              </button>
            </div>
            <button
              onClick={handleReset}
              className="text-[9px] text-red-400 hover:text-red-300"
            >
              {t('speedRamp.reset')}
            </button>
          </div>

          {/* Current speed readout */}
          <div className="text-[10px] text-[var(--color-text-secondary)]">
            {t('speedRamp.currentSpeed')}: <span className="text-[var(--color-text)]">{currentSpeed.toFixed(2)}x</span>
          </div>
        </>
      )}
    </div>
  );
}

export const SpeedRampEditor = React.memo(SpeedRampEditorComponent);
