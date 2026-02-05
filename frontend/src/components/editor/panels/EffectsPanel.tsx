import { useMemo, useCallback, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTimelineStore, type Clip, type Track } from '@/store/timelineStore';
import { effectDefinitions, getEffectDefinition } from '@/effects/effectDefinitions';
import type { ClipEffect, ClipFilters } from '@/effects/types';
import { DEFAULT_CLIP_FILTERS } from '@/effects/types';
import apiClient from '@/api/client';

interface EffectPresetData {
  id: number;
  name: string;
  category: string;
  params: { effects: Array<{ id: string; value: number; enabled: boolean }> };
  is_system: boolean;
}

export default function EffectsPanel() {
  const { t } = useTranslation();
  const { tracks, selectedClipId, updateClip } = useTimelineStore();
  const [presets, setPresets] = useState<EffectPresetData[]>([]);

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

  // Load presets from API
  useEffect(() => {
    apiClient
      .get('/effects/presets')
      .then((res) => setPresets(res.data))
      .catch(() => {});
  }, []);

  const clipFilters: ClipFilters = selectedData?.clip.filters ?? DEFAULT_CLIP_FILTERS;

  const updateFilters = useCallback(
    (newFilters: ClipFilters) => {
      if (!selectedData) return;
      updateClip(selectedData.track.id, selectedData.clip.id, {
        filters: newFilters,
      });
    },
    [selectedData, updateClip],
  );

  const addEffect = useCallback(
    (effectId: string) => {
      const def = getEffectDefinition(effectId);
      if (!def) return;

      // Don't add duplicates
      if (clipFilters.effects.some((e) => e.id === effectId)) return;

      const newEffect: ClipEffect = {
        id: effectId,
        value: def.default,
        enabled: true,
      };

      updateFilters({
        ...clipFilters,
        effects: [...clipFilters.effects, newEffect],
      });
    },
    [clipFilters, updateFilters],
  );

  const removeEffect = useCallback(
    (effectId: string) => {
      updateFilters({
        ...clipFilters,
        effects: clipFilters.effects.filter((e) => e.id !== effectId),
      });
    },
    [clipFilters, updateFilters],
  );

  const toggleEffect = useCallback(
    (effectId: string) => {
      updateFilters({
        ...clipFilters,
        effects: clipFilters.effects.map((e) =>
          e.id === effectId ? { ...e, enabled: !e.enabled } : e,
        ),
      });
    },
    [clipFilters, updateFilters],
  );

  const updateEffectValue = useCallback(
    (effectId: string, value: number) => {
      updateFilters({
        ...clipFilters,
        effects: clipFilters.effects.map((e) =>
          e.id === effectId ? { ...e, value } : e,
        ),
      });
    },
    [clipFilters, updateFilters],
  );

  const applyPreset = useCallback(
    (preset: EffectPresetData) => {
      if (!preset.params?.effects) return;
      updateFilters({
        ...clipFilters,
        effects: preset.params.effects.map((e) => ({
          id: e.id,
          value: e.value,
          enabled: e.enabled ?? true,
        })),
      });
    },
    [clipFilters, updateFilters],
  );

  if (!selectedData) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-center text-xs text-[var(--color-text-secondary)]">
          {t('effects.noClipSelected')}
        </p>
      </div>
    );
  }

  const appliedEffects = clipFilters.effects;
  const availableEffects = effectDefinitions.filter(
    (def) => !appliedEffects.some((e) => e.id === def.id),
  );

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-3">
      {/* Applied effects */}
      {appliedEffects.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
            {t('effects.title')}
          </h4>
          {appliedEffects.map((effect) => {
            const def = getEffectDefinition(effect.id);
            if (!def) return null;
            return (
              <div
                key={effect.id}
                className="flex flex-col gap-1 rounded border border-white/5 bg-white/5 p-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => toggleEffect(effect.id)}
                      className={`h-3 w-3 rounded-sm border ${
                        effect.enabled
                          ? 'border-[var(--accent)] bg-[var(--accent)]'
                          : 'border-white/30 bg-transparent'
                      }`}
                    />
                    <span className="text-[10px] text-[var(--color-text)]">
                      {t(def.labelKey)}
                    </span>
                  </div>
                  <button
                    onClick={() => removeEffect(effect.id)}
                    className="text-[var(--color-text-secondary)] hover:text-red-400"
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={def.min}
                    max={def.max}
                    step={def.step}
                    value={effect.value}
                    onChange={(e) => updateEffectValue(effect.id, Number(e.target.value))}
                    disabled={!effect.enabled}
                    className="h-1 flex-1 cursor-pointer appearance-none rounded bg-white/10 accent-[var(--accent)] disabled:opacity-50"
                  />
                  <span className="w-8 text-right text-[10px] text-[var(--color-text-secondary)]">
                    {effect.value.toFixed(def.step < 1 ? 2 : 0)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Available effects */}
      {availableEffects.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
            {t('effects.add')}
          </h4>
          <div className="grid grid-cols-3 gap-1">
            {availableEffects.map((def) => (
              <button
                key={def.id}
                onClick={() => addEffect(def.id)}
                className="flex flex-col items-center gap-1 rounded border border-white/5 bg-white/5 p-2 text-[var(--color-text-secondary)] hover:border-[var(--accent)]/30 hover:bg-white/10 hover:text-[var(--color-text)]"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={def.icon} />
                </svg>
                <span className="text-[9px] leading-tight">{t(def.labelKey)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Presets */}
      {presets.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
            {t('effects.presets')}
          </h4>
          <div className="flex flex-wrap gap-1">
            {presets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset)}
                className="rounded bg-white/5 px-2 py-1 text-[10px] text-[var(--color-text-secondary)] hover:bg-white/10 hover:text-[var(--color-text)]"
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
