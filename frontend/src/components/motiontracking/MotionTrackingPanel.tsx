import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTimelineStore } from '@/store/timelineStore';
import { useAssetStore } from '@/store/assetStore';
import { useMotionTrackingStore } from '@/store/motionTrackingStore';
import type { TrackingMode } from '@/engine/motionTrackerTypes';

export default function MotionTrackingPanel() {
  const { t } = useTranslation();

  const tracks = useTimelineStore((s) => s.tracks);
  const status = useMotionTrackingStore((s) => s.status);
  const progress = useMotionTrackingStore((s) => s.progress);
  const error = useMotionTrackingStore((s) => s.error);
  const mode = useMotionTrackingStore((s) => s.mode);
  const roi = useMotionTrackingStore((s) => s.roi);
  const sampleInterval = useMotionTrackingStore((s) => s.sampleInterval);
  const smoothingAmount = useMotionTrackingStore((s) => s.smoothingAmount);
  const rawResult = useMotionTrackingStore((s) => s.rawResult);
  const sourceClipId = useMotionTrackingStore((s) => s.sourceClipId);
  const targetClipId = useMotionTrackingStore((s) => s.targetClipId);
  const positionOffsetX = useMotionTrackingStore((s) => s.positionOffsetX);
  const positionOffsetY = useMotionTrackingStore((s) => s.positionOffsetY);
  const scaleMultiplier = useMotionTrackingStore((s) => s.scaleMultiplier);

  const setMode = useMotionTrackingStore((s) => s.setMode);
  const setSampleInterval = useMotionTrackingStore((s) => s.setSampleInterval);
  const setSmoothing = useMotionTrackingStore((s) => s.setSmoothing);
  const setTargetClip = useMotionTrackingStore((s) => s.setTargetClip);
  const setPositionOffset = useMotionTrackingStore((s) => s.setPositionOffset);
  const setScaleMultiplier = useMotionTrackingStore((s) => s.setScaleMultiplier);
  const startROISelection = useMotionTrackingStore((s) => s.startROISelection);
  const startTracking = useMotionTrackingStore((s) => s.startTracking);
  const cancelTracking = useMotionTrackingStore((s) => s.cancelTracking);
  const applyToTargetClip = useMotionTrackingStore((s) => s.applyToTargetClip);
  const reset = useMotionTrackingStore((s) => s.reset);

  const assets = useAssetStore((s) => s.assets);

  // Get all video clips from timeline
  const videoClips = useMemo(() => {
    const clips: Array<{ clipId: string; trackId: string; assetId: string; name: string; width: number; height: number }> = [];
    for (const track of tracks) {
      for (const clip of track.clips) {
        if (clip.type === 'video') {
          const asset = assets.find((a) => String(a.id) === clip.assetId);
          clips.push({
            clipId: clip.id,
            trackId: track.id,
            assetId: clip.assetId,
            name: clip.name,
            width: asset?.width ?? 1920,
            height: asset?.height ?? 1080,
          });
        }
      }
    }
    return clips;
  }, [tracks, assets]);

  // Get all clips for target selection
  const allClips = useMemo(() => {
    const clips: Array<{ clipId: string; trackId: string; name: string; type: string }> = [];
    for (const track of tracks) {
      for (const clip of track.clips) {
        clips.push({
          clipId: clip.id,
          trackId: track.id,
          name: clip.name,
          type: clip.type,
        });
      }
    }
    return clips;
  }, [tracks]);

  const handleSourceChange = (clipId: string) => {
    const info = videoClips.find((c) => c.clipId === clipId);
    if (info) {
      startROISelection(info.clipId, info.trackId, info.assetId, info.width, info.height);
    }
  };

  const handleTargetChange = (clipId: string) => {
    const info = allClips.find((c) => c.clipId === clipId);
    if (info) {
      setTargetClip(info.clipId, info.trackId);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 text-sm">
      <h3 className="font-semibold text-[var(--text-primary)]">
        {t('motionTracking.title')}
      </h3>

      {/* Source Clip */}
      <div className="flex flex-col gap-1">
        <label className="text-[var(--text-secondary)] text-xs">
          {t('motionTracking.sourceClip')}
        </label>
        {videoClips.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)] italic">
            {t('motionTracking.noVideoClips')}
          </p>
        ) : (
          <select
            value={sourceClipId ?? ''}
            onChange={(e) => handleSourceChange(e.target.value)}
            className="w-full rounded bg-[var(--color-surface-elevated)] border border-[var(--color-border)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
            disabled={status === 'tracking'}
          >
            <option value="">{t('motionTracking.selectSourceClip')}</option>
            {videoClips.map((c) => (
              <option key={c.clipId} value={c.clipId}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Mode Toggle */}
      {sourceClipId && (
        <div className="flex flex-col gap-1">
          <label className="text-[var(--text-secondary)] text-xs">
            {t('motionTracking.mode')}
          </label>
          <div className="flex gap-2">
            {(['point', 'region'] as TrackingMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                disabled={status === 'tracking'}
                className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === m
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--color-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {t(`motionTracking.${m}`)}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-[var(--text-tertiary)]">
            {t(`motionTracking.${mode}Desc`)}
          </p>
        </div>
      )}

      {/* Sample Interval */}
      {sourceClipId && (
        <div className="flex flex-col gap-1">
          <label className="text-[var(--text-secondary)] text-xs">
            {t('motionTracking.sampleInterval')}: {sampleInterval}
          </label>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={sampleInterval}
            onChange={(e) => setSampleInterval(Number(e.target.value))}
            disabled={status === 'tracking'}
            className="w-full accent-[var(--accent)]"
          />
        </div>
      )}

      {/* Select Region / Start Tracking */}
      {sourceClipId && status !== 'tracking' && status !== 'completed' && (
        <div className="flex flex-col gap-2">
          {status !== 'selectingROI' && (
            <button
              onClick={() => {
                const info = videoClips.find((c) => c.clipId === sourceClipId);
                if (info) startROISelection(info.clipId, info.trackId, info.assetId, info.width, info.height);
              }}
              className="w-full rounded bg-[var(--color-surface-elevated)] border border-[var(--color-border)] px-3 py-2 text-xs hover:bg-[var(--color-surface-hover)] transition-colors"
            >
              {t('motionTracking.selectRegion')}
            </button>
          )}

          {status === 'selectingROI' && !roi && (
            <p className="text-xs text-[var(--text-tertiary)] italic">
              {t('motionTracking.selectRegionHint')}
            </p>
          )}

          {roi && (
            <button
              onClick={() => startTracking()}
              className="w-full rounded bg-[var(--accent)] text-white px-3 py-2 text-xs font-medium hover:opacity-90 transition-opacity"
            >
              {t('motionTracking.startTracking')}
            </button>
          )}
        </div>
      )}

      {/* Tracking Progress */}
      {status === 'tracking' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--text-secondary)]">{t('motionTracking.tracking')}</span>
            <span className="text-[var(--text-primary)] font-mono">{Math.round(progress)}%</span>
          </div>
          <div className="w-full h-2 bg-[var(--color-surface-elevated)] rounded overflow-hidden">
            <div
              className="h-full bg-[var(--accent)] transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <button
            onClick={cancelTracking}
            className="w-full rounded border border-red-500/30 text-red-400 px-3 py-1.5 text-xs hover:bg-red-500/10 transition-colors"
          >
            {t('motionTracking.cancelTracking')}
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Results — Smoothing + Apply */}
      {status === 'completed' && rawResult && (
        <>
          <div className="rounded bg-green-500/10 border border-green-500/30 px-3 py-2 text-xs text-green-400">
            {t('motionTracking.completed')} — {rawResult.points.length} frames
          </div>

          {/* Smoothing */}
          <div className="flex flex-col gap-1">
            <label className="text-[var(--text-secondary)] text-xs">
              {t('motionTracking.smoothing')}: {smoothingAmount.toFixed(2)}
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={smoothingAmount}
              onChange={(e) => setSmoothing(Number(e.target.value))}
              className="w-full accent-[var(--accent)]"
            />
          </div>

          {/* Target Clip */}
          <div className="flex flex-col gap-1">
            <label className="text-[var(--text-secondary)] text-xs">
              {t('motionTracking.targetClip')}
            </label>
            <select
              value={targetClipId ?? ''}
              onChange={(e) => handleTargetChange(e.target.value)}
              className="w-full rounded bg-[var(--color-surface-elevated)] border border-[var(--color-border)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
            >
              <option value="">{t('motionTracking.selectTargetClip')}</option>
              {allClips.map((c) => (
                <option key={c.clipId} value={c.clipId}>
                  {c.name} ({c.type})
                </option>
              ))}
            </select>
          </div>

          {/* Offset X/Y */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[var(--text-secondary)] text-[10px]">
                {t('motionTracking.offsetX')}: {positionOffsetX.toFixed(3)}
              </label>
              <input
                type="range"
                min={-0.5}
                max={0.5}
                step={0.01}
                value={positionOffsetX}
                onChange={(e) => setPositionOffset(Number(e.target.value), positionOffsetY)}
                className="w-full accent-[var(--accent)]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[var(--text-secondary)] text-[10px]">
                {t('motionTracking.offsetY')}: {positionOffsetY.toFixed(3)}
              </label>
              <input
                type="range"
                min={-0.5}
                max={0.5}
                step={0.01}
                value={positionOffsetY}
                onChange={(e) => setPositionOffset(positionOffsetX, Number(e.target.value))}
                className="w-full accent-[var(--accent)]"
              />
            </div>
          </div>

          {/* Scale Multiplier (region mode only) */}
          {rawResult.mode === 'region' && (
            <div className="flex flex-col gap-1">
              <label className="text-[var(--text-secondary)] text-xs">
                {t('motionTracking.scaleMultiplier')}: {scaleMultiplier.toFixed(2)}
              </label>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.05}
                value={scaleMultiplier}
                onChange={(e) => setScaleMultiplier(Number(e.target.value))}
                className="w-full accent-[var(--accent)]"
              />
            </div>
          )}

          {/* Apply */}
          <button
            onClick={applyToTargetClip}
            disabled={!targetClipId}
            className="w-full rounded bg-[var(--accent)] text-white px-3 py-2 text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('motionTracking.applyKeyframes')}
          </button>
        </>
      )}

      {/* Reset */}
      {status !== 'idle' && status !== 'tracking' && (
        <button
          onClick={reset}
          className="w-full rounded border border-[var(--color-border)] text-[var(--text-secondary)] px-3 py-1.5 text-xs hover:bg-[var(--color-surface-hover)] transition-colors"
        >
          {t('motionTracking.reset')}
        </button>
      )}
    </div>
  );
}
