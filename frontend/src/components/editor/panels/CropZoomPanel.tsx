import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useTimelineStore, type Clip, type Track } from '@/store/timelineStore';
import { CROP_PRESETS } from '@/effects/cropPresets';
import { LETTERBOX_PRESETS } from '@/effects/letterboxPresets';
import { KEN_BURNS_PRESETS, applyKenBurns, removeKenBurns } from '@/effects/kenBurnsPresets';

export default function CropZoomPanel() {
  const { t } = useTranslation();
  const { tracks, selectedClipIds, updateClip, setClipKeyframe, removeClipKeyframeTrack } = useTimelineStore();

  const selectedClipId = selectedClipIds[0] ?? null;

  const selectedData = useMemo<{ clip: Clip; track: Track } | null>(() => {
    if (!selectedClipId) return null;
    for (const track of tracks) {
      const clip = track.clips.find((c) => c.id === selectedClipId);
      if (clip) return { clip, track };
    }
    return null;
  }, [tracks, selectedClipId]);

  if (!selectedData) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-center text-xs text-[var(--color-text-secondary)]">
          {t('properties.selectClip')}
        </p>
      </div>
    );
  }

  const { clip, track } = selectedData;
  const isVideoType = track.type === 'video' || track.type === 'sticker';

  if (!isVideoType) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-center text-xs text-[var(--color-text-secondary)]">
          {t('crop.videoOnly')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto">
      {/* Crop section */}
      <CropSection clip={clip} track={track} updateClip={updateClip} />

      {/* Letterbox section */}
      <LetterboxSection />

      {/* Ken Burns section */}
      <KenBurnsSection
        clip={clip}
        track={track}
        setClipKeyframe={setClipKeyframe}
        removeClipKeyframeTrack={removeClipKeyframeTrack}
      />
    </div>
  );
}

function CropSection({
  clip,
  track,
  updateClip,
}: {
  clip: Clip;
  track: Track;
  updateClip: (trackId: string, clipId: string, updates: Partial<Clip>) => void;
}) {
  const { t } = useTranslation();

  const handlePreset = useCallback(
    (presetId: string) => {
      const preset = CROP_PRESETS.find((p) => p.id === presetId);
      if (preset) {
        updateClip(track.id, clip.id, {
          cropTop: preset.cropTop,
          cropBottom: preset.cropBottom,
          cropLeft: preset.cropLeft,
          cropRight: preset.cropRight,
        });
      }
    },
    [track.id, clip.id, updateClip],
  );

  const handleUpdate = useCallback(
    (field: string, value: number) => {
      updateClip(track.id, clip.id, { [field]: value });
    },
    [track.id, clip.id, updateClip],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
        {t('crop.title')}
      </div>

      {/* Preset selector */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-[var(--color-text-secondary)]">
          {t('crop.preset')}
        </label>
        <select
          onChange={(e) => handlePreset(e.target.value)}
          defaultValue=""
          className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[10px] text-[var(--color-text)] outline-none"
        >
          <option value="" disabled>{t('crop.preset')}</option>
          {CROP_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{t(p.labelKey)}</option>
          ))}
        </select>
      </div>

      {/* Crop sliders */}
      <SliderControl
        label={t('properties.cropTop')}
        value={clip.cropTop ?? 0}
        min={0} max={0.5} step={0.01}
        onChange={(v) => handleUpdate('cropTop', v)}
      />
      <SliderControl
        label={t('properties.cropBottom')}
        value={clip.cropBottom ?? 0}
        min={0} max={0.5} step={0.01}
        onChange={(v) => handleUpdate('cropBottom', v)}
      />
      <SliderControl
        label={t('properties.cropLeft')}
        value={clip.cropLeft ?? 0}
        min={0} max={0.5} step={0.01}
        onChange={(v) => handleUpdate('cropLeft', v)}
      />
      <SliderControl
        label={t('properties.cropRight')}
        value={clip.cropRight ?? 0}
        min={0} max={0.5} step={0.01}
        onChange={(v) => handleUpdate('cropRight', v)}
      />

      {/* Reset */}
      {(clip.cropTop || clip.cropBottom || clip.cropLeft || clip.cropRight) ? (
        <button
          onClick={() => handlePreset('none')}
          className="text-[10px] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] underline self-start"
        >
          {t('crop.reset')}
        </button>
      ) : null}
    </div>
  );
}

function LetterboxSection() {
  const { t } = useTranslation();
  const [activePreset, setActivePreset] = useState('none');

  // Letterbox is preview-level — we store it in VideoPreview via a global event
  const handlePreset = useCallback(
    (presetId: string) => {
      setActivePreset(presetId);
      const preset = LETTERBOX_PRESETS.find((p) => p.id === presetId);
      window.dispatchEvent(
        new CustomEvent('letterbox-change', { detail: { barFraction: preset?.barFraction ?? 0 } }),
      );
    },
    [],
  );

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
        {t('letterbox.title')}
      </div>
      <div className="flex flex-wrap gap-1">
        {LETTERBOX_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => handlePreset(p.id)}
            className={`rounded px-2 py-1 text-[10px] transition-colors ${
              activePreset === p.id
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:border-[var(--color-primary)]'
            }`}
          >
            {t(p.labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}

function KenBurnsSection({
  clip,
  track,
  setClipKeyframe,
  removeClipKeyframeTrack,
}: {
  clip: Clip;
  track: Track;
  setClipKeyframe: (clipId: string, property: string, time: number, value: number) => void;
  removeClipKeyframeTrack: (trackId: string, clipId: string, property: string) => void;
}) {
  const { t } = useTranslation();
  const clipDuration = clip.endTime - clip.startTime;

  const handleApply = useCallback(
    (presetId: string) => {
      applyKenBurns(clip.id, track.id, presetId, clipDuration, {
        setClipKeyframe,
        removeClipKeyframeTrack,
      });
    },
    [clip.id, track.id, clipDuration, setClipKeyframe, removeClipKeyframeTrack],
  );

  const handleRemove = useCallback(() => {
    removeKenBurns(clip.id, track.id, { removeClipKeyframeTrack });
  }, [clip.id, track.id, removeClipKeyframeTrack]);

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
        {t('kenBurns.title')}
      </div>
      <div className="flex flex-wrap gap-1">
        {KEN_BURNS_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => handleApply(p.id)}
            className="rounded px-2 py-1 text-[10px] bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-colors"
          >
            {t(p.labelKey)}
          </button>
        ))}
      </div>
      <button
        onClick={handleRemove}
        className="text-[10px] text-red-400 hover:text-red-300 underline self-start"
      >
        {t('kenBurns.remove')}
      </button>
    </div>
  );
}

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-[10px] text-[var(--text-secondary)]">{label}</label>
        <span className="text-[10px] text-[var(--text-secondary)]">
          {`${Math.round(value * 100)}%`}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded bg-white/10 accent-[var(--accent)]"
      />
    </div>
  );
}
