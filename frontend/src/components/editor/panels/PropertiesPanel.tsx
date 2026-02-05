import React, { useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useTimelineStore, type Clip, type Track } from '@/store/timelineStore';
import { getEffectDefinition } from '@/effects/effectDefinitions';
import type { ClipFilters } from '@/effects/types';
import { DEFAULT_CLIP_FILTERS } from '@/effects/types';
import type { Transition } from '@/types/transitions';
import AudioProcessingPanel from '@/components/audio/AudioProcessingPanel';
import { TransitionPicker } from '@/components/editor/timeline/TransitionPicker';

function PropertiesPanelComponent() {
  const { t } = useTranslation();
  const { tracks, selectedClipId, updateClip, setClipTransition } = useTimelineStore();

  const selectedData = useMemo<{
    clip: Clip;
    track: Track;
  } | null>(() => {
    if (!selectedClipId) return null;
    for (const track of tracks) {
      const clip = track.clips.find((c) => c.id === selectedClipId);
      if (clip) return { clip, track };
    }
    return null;
  }, [tracks, selectedClipId]);

  const handleUpdate = useCallback(
    (field: string, value: number | string) => {
      if (!selectedData) return;
      updateClip(selectedData.track.id, selectedData.clip.id, {
        [field]: value,
      });
    },
    [selectedData, updateClip],
  );

  const handleSpeedChange = useCallback(
    (speed: number) => {
      if (!selectedData) return;
      const filters: ClipFilters = selectedData.clip.filters ?? DEFAULT_CLIP_FILTERS;
      updateClip(selectedData.track.id, selectedData.clip.id, {
        filters: { ...filters, speed },
      });
    },
    [selectedData, updateClip],
  );

  const handleEffectValueChange = useCallback(
    (effectId: string, value: number) => {
      if (!selectedData) return;
      const filters: ClipFilters = selectedData.clip.filters ?? DEFAULT_CLIP_FILTERS;
      updateClip(selectedData.track.id, selectedData.clip.id, {
        filters: {
          ...filters,
          effects: filters.effects.map((e) =>
            e.id === effectId ? { ...e, value } : e,
          ),
        },
      });
    },
    [selectedData, updateClip],
  );

  const handleTransitionChange = useCallback(
    (transition: Transition | undefined) => {
      if (!selectedData) return;
      setClipTransition(selectedData.clip.id, transition);
    },
    [selectedData, setClipTransition],
  );

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
  const isAudioType =
    track.type === 'audio' || track.type === 'music' || track.type === 'sfx';
  const clipFilters = clip.filters ?? DEFAULT_CLIP_FILTERS;
  const activeEffects = clipFilters.effects.filter((e) => e.enabled);

  return (
    <div className="flex flex-col gap-4 p-4">
      <h3 className="text-xs font-semibold text-[var(--color-text)]">
        {clip.name}
      </h3>

      {/* Clip info */}
      <div className="text-[10px] text-[var(--color-text-secondary)] space-y-1">
        <div>Type: {clip.type}</div>
        <div>Duration: {((clip.endTime - clip.startTime) / 1000).toFixed(1)}s</div>
      </div>

      {/* Volume control */}
      <PropertySlider
        label={t('properties.volume')}
        value={clip.volume ?? 1}
        min={0}
        max={2}
        step={0.01}
        onChange={(v) => handleUpdate('volume', v)}
      />

      {/* Speed control */}
      <PropertySlider
        label={t('effects.speedLabel')}
        value={clipFilters.speed}
        min={0.25}
        max={4}
        step={0.25}
        onChange={handleSpeedChange}
        format={(v) => `${v}x`}
      />

      {/* Video/Sticker specific */}
      {isVideoType && (
        <div className="flex flex-col gap-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
            {t('properties.video')}
          </div>
          <PropertySlider
            label={t('properties.trimStart')}
            value={clip.trimStart}
            min={0}
            max={clip.duration}
            step={100}
            onChange={(v) => handleUpdate('trimStart', v)}
            format={(v) => `${(v / 1000).toFixed(1)}s`}
          />
        </div>
      )}

      {/* Audio specific */}
      {isAudioType && (
        <div className="flex flex-col gap-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
            {t('properties.audio')}
          </div>
          <PropertySlider
            label={t('properties.trimStart')}
            value={clip.trimStart}
            min={0}
            max={clip.duration}
            step={100}
            onChange={(v) => handleUpdate('trimStart', v)}
            format={(v) => `${(v / 1000).toFixed(1)}s`}
          />
        </div>
      )}

      {/* Sticker transform controls */}
      {track.type === 'sticker' && (
        <div className="flex flex-col gap-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
            {t('properties.transform')}
          </div>
          <PropertySlider
            label={t('properties.positionX')}
            value={clip.positionX ?? 0.5}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => handleUpdate('positionX', v)}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <PropertySlider
            label={t('properties.positionY')}
            value={clip.positionY ?? 0.5}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => handleUpdate('positionY', v)}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <PropertySlider
            label={t('properties.scale')}
            value={clip.scaleX ?? 1}
            min={0.1}
            max={3}
            step={0.05}
            onChange={(v) => {
              handleUpdate('scaleX', v);
              handleUpdate('scaleY', v);
            }}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <PropertySlider
            label={t('properties.rotation')}
            value={clip.rotation ?? 0}
            min={0}
            max={360}
            step={1}
            onChange={(v) => handleUpdate('rotation', v)}
            format={(v) => `${v}°`}
          />
        </div>
      )}

      {/* Fade In/Out */}
      {(isVideoType || isAudioType) && (
        <div className="flex flex-col gap-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
            {t('properties.fade')}
          </div>
          <PropertySlider
            label={t('properties.fadeIn')}
            value={clip.fadeInMs ?? 0}
            min={0}
            max={5000}
            step={100}
            onChange={(v) => handleUpdate('fadeInMs', v)}
            format={(v) => `${(v / 1000).toFixed(1)}s`}
          />
          <PropertySlider
            label={t('properties.fadeOut')}
            value={clip.fadeOutMs ?? 0}
            min={0}
            max={5000}
            step={100}
            onChange={(v) => handleUpdate('fadeOutMs', v)}
            format={(v) => `${(v / 1000).toFixed(1)}s`}
          />
        </div>
      )}

      {/* Transition (video clips only) */}
      {isVideoType && (
        <div className="border-t border-[var(--color-border)] pt-3">
          <TransitionPicker
            value={clip.transitionIn}
            onChange={handleTransitionChange}
          />
        </div>
      )}

      {/* Audio processing */}
      {(isVideoType || isAudioType) && (
        <AudioProcessingPanel assetId={clip.assetId} />
      )}

      {/* Active effects summary */}
      {activeEffects.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
            {t('effects.title')}
          </div>
          {activeEffects.map((effect) => {
            const def = getEffectDefinition(effect.id);
            if (!def) return null;
            return (
              <PropertySlider
                key={effect.id}
                label={t(def.labelKey)}
                value={effect.value}
                min={def.min}
                max={def.max}
                step={def.step}
                onChange={(v) => handleEffectValueChange(effect.id, v)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// Reusable property slider
function PropertySlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}) {
  const displayValue = format ? format(value) : value.toFixed(step < 1 ? 2 : 0);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-[10px] text-[var(--text-secondary)]">
          {label}
        </label>
        <span className="text-[10px] text-[var(--text-secondary)]">
          {displayValue}
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

export default React.memo(PropertiesPanelComponent);
