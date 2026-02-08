import React, { useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useTimelineStore, type Clip, type Track } from '@/store/timelineStore';
import { getEffectDefinition } from '@/effects/effectDefinitions';
import type { ClipFilters, ChromaKeySettings, ColorGradingSettings, TrackAudioSettings, EQSettings, CompressorSettings } from '@/effects/types';
import { DEFAULT_CLIP_FILTERS, DEFAULT_CHROMA_KEY, DEFAULT_COLOR_GRADING, DEFAULT_EQ_SETTINGS, DEFAULT_COMPRESSOR_SETTINGS } from '@/effects/types';
import { colorGradingPresets } from '@/effects/colorGradingPresets';
import { parseCubeFile } from '@/effects/lutParser';
import type { Transition } from '@/types/transitions';
import type { AnimatableProperty } from '@/types/keyframes';
import { ANIMATABLE_PROPERTY_DEFAULTS } from '@/types/keyframes';
import { pipPresets } from '@/effects/pipPresets';
import type { PipBorder } from '@/engine/types';
import {
  TEXT_ANIMATION_PRESET_NAMES,
  TEXT_ANIMATION_PRESETS,
  applyTextAnimation,
  removeTextAnimation,
  type TextAnimationPresetName,
} from '@/engine/textAnimationPresets';
import AudioProcessingPanel from '@/components/audio/AudioProcessingPanel';
import { TransitionPicker } from '@/components/editor/timeline/TransitionPicker';
import { KeyframeEditor } from './KeyframeEditor';
import { SpeedRampEditor } from './SpeedRampEditor';

function PropertiesPanelComponent() {
  const { t } = useTranslation();
  const { tracks, selectedClipIds, updateClip, setClipTransition, updateTrackAudio, setClipKeyframe, removeClipKeyframe, removeSelectedClips, updateSelectedClips } = useTimelineStore();

  const selectedClipId = selectedClipIds[0] ?? null;

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

  const handleChromaKeyUpdate = useCallback(
    (chromaKey: ChromaKeySettings) => {
      if (!selectedData) return;
      const filters: ClipFilters = selectedData.clip.filters ?? DEFAULT_CLIP_FILTERS;
      updateClip(selectedData.track.id, selectedData.clip.id, {
        filters: { ...filters, chromaKey },
      });
    },
    [selectedData, updateClip],
  );

  const handleColorGradingUpdate = useCallback(
    (colorGrading: ColorGradingSettings) => {
      if (!selectedData) return;
      const filters: ClipFilters = selectedData.clip.filters ?? DEFAULT_CLIP_FILTERS;
      updateClip(selectedData.track.id, selectedData.clip.id, {
        filters: { ...filters, colorGrading },
      });
    },
    [selectedData, updateClip],
  );

  const handleLutUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !selectedData) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const lut = parseCubeFile(reader.result as string);
          const current = selectedData.clip.filters?.colorGrading ?? { ...DEFAULT_COLOR_GRADING, enabled: true };
          handleColorGradingUpdate({ ...current, enabled: true, lut });
        } catch {
          // Invalid LUT file
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    [selectedData, handleColorGradingUpdate],
  );

  // Multi-select view
  if (selectedClipIds.length > 1) {
    return (
      <div className="flex flex-col gap-3 overflow-y-auto p-3">
        <div className="text-xs font-medium text-[var(--color-text)]">
          {t('multiSelect.nClipsSelected', { count: selectedClipIds.length })}
        </div>

        {/* Batch Volume */}
        <PropertySlider
          label={t('multiSelect.batchVolume')}
          value={1}
          min={0}
          max={2}
          step={0.01}
          onChange={(v) => updateSelectedClips({ volume: v })}
          format={(v) => `${Math.round(v * 100)}%`}
        />

        {/* Batch Opacity (as filter) */}
        <PropertySlider
          label={t('multiSelect.batchOpacity')}
          value={1}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => updateSelectedClips({ opacity: v } as Partial<Clip>)}
          format={(v) => `${Math.round(v * 100)}%`}
        />

        {/* Delete all */}
        <button
          onClick={removeSelectedClips}
          className="rounded bg-red-500/20 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/30 transition-colors"
        >
          {t('multiSelect.deleteAll')} ({selectedClipIds.length})
        </button>
      </div>
    );
  }

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
  const isTextType = track.type === 'text';
  const supportsKeyframes = isVideoType || isTextType;
  const clipFilters = clip.filters ?? DEFAULT_CLIP_FILTERS;
  const activeEffects = clipFilters.effects.filter((e) => e.enabled);

  // Current property values for keyframe editor
  const currentPropertyValues = useMemo<Record<AnimatableProperty, number>>(() => ({
    positionX: clip.positionX ?? ANIMATABLE_PROPERTY_DEFAULTS.positionX,
    positionY: clip.positionY ?? ANIMATABLE_PROPERTY_DEFAULTS.positionY,
    scaleX: clip.scaleX ?? ANIMATABLE_PROPERTY_DEFAULTS.scaleX,
    scaleY: clip.scaleY ?? ANIMATABLE_PROPERTY_DEFAULTS.scaleY,
    rotation: clip.rotation ?? ANIMATABLE_PROPERTY_DEFAULTS.rotation,
    opacity: 1,
    cropTop: clip.cropTop ?? 0,
    cropBottom: clip.cropBottom ?? 0,
    cropLeft: clip.cropLeft ?? 0,
    cropRight: clip.cropRight ?? 0,
    textRevealProgress: 1,
  }), [clip.positionX, clip.positionY, clip.scaleX, clip.scaleY, clip.rotation, clip.cropTop, clip.cropBottom, clip.cropLeft, clip.cropRight]);

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

      {/* Speed Ramp control */}
      <SpeedRampEditor
        clipId={clip.id}
        trackId={track.id}
        clipStartTime={clip.startTime}
        clipDuration={clip.endTime - clip.startTime}
        staticSpeed={clipFilters.speed}
        keyframeTracks={clip.keyframes}
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

          {/* PiP & Transform */}
          <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)] mt-2">
            {t('pip.title')}
          </div>

          {/* PiP preset selector */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[var(--color-text-secondary)]">
              {t('pip.preset')}
            </label>
            <select
              value={
                pipPresets.find(
                  (p) =>
                    p.positionX === clip.positionX &&
                    p.positionY === clip.positionY &&
                    p.scaleX === clip.scaleX &&
                    p.scaleY === clip.scaleY,
                )?.id ?? ''
              }
              onChange={(e) => {
                if (!e.target.value) {
                  // Reset to fullscreen
                  updateClip(track.id, clip.id, {
                    positionX: undefined,
                    positionY: undefined,
                    scaleX: undefined,
                    scaleY: undefined,
                  });
                  return;
                }
                const preset = pipPresets.find((p) => p.id === e.target.value);
                if (preset) {
                  updateClip(track.id, clip.id, {
                    positionX: preset.positionX,
                    positionY: preset.positionY,
                    scaleX: preset.scaleX,
                    scaleY: preset.scaleY,
                  });
                }
              }}
              className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[10px] text-[var(--color-text)] outline-none"
            >
              <option value="">{t('pip.none')}</option>
              {pipPresets.map((p) => (
                <option key={p.id} value={p.id}>{t(p.labelKey)}</option>
              ))}
            </select>
          </div>

          {/* Transform controls */}
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
          {/* PiP Border */}
          <PipBorderSection clip={clip} trackId={track.id} />

          {/* Crop */}
          <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)] mt-2">
            {t('crop.title')}
          </div>
          <PropertySlider
            label={t('properties.cropTop')}
            value={clip.cropTop ?? 0}
            min={0}
            max={0.5}
            step={0.01}
            onChange={(v) => handleUpdate('cropTop', v)}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <PropertySlider
            label={t('properties.cropBottom')}
            value={clip.cropBottom ?? 0}
            min={0}
            max={0.5}
            step={0.01}
            onChange={(v) => handleUpdate('cropBottom', v)}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <PropertySlider
            label={t('properties.cropLeft')}
            value={clip.cropLeft ?? 0}
            min={0}
            max={0.5}
            step={0.01}
            onChange={(v) => handleUpdate('cropLeft', v)}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <PropertySlider
            label={t('properties.cropRight')}
            value={clip.cropRight ?? 0}
            min={0}
            max={0.5}
            step={0.01}
            onChange={(v) => handleUpdate('cropRight', v)}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          {(clip.cropTop || clip.cropBottom || clip.cropLeft || clip.cropRight) ? (
            <button
              onClick={() => {
                updateClip(track.id, clip.id, {
                  cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0,
                });
              }}
              className="text-[10px] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] underline"
            >
              {t('crop.reset')}
            </button>
          ) : null}
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

      {/* Text controls */}
      {isTextType && (
        <div className="flex flex-col gap-3">
          {/* Text content */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[var(--color-text-secondary)]">
              {t('text.content')}
            </label>
            <textarea
              value={clip.textContent ?? ''}
              onChange={(e) => handleUpdate('textContent', e.target.value)}
              className="h-20 resize-none rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          {/* Font size */}
          <PropertySlider
            label={t('text.fontSize')}
            value={clip.fontSize ?? 48}
            min={12}
            max={200}
            step={1}
            onChange={(v) => handleUpdate('fontSize', v)}
            format={(v) => `${v}px`}
          />

          {/* Font family */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[var(--color-text-secondary)]">
              {t('text.fontFamily')}
            </label>
            <select
              value={clip.fontFamily ?? 'Arial'}
              onChange={(e) => handleUpdate('fontFamily', e.target.value)}
              className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
            >
              <option value="Arial">Arial</option>
              <option value="Georgia">Georgia</option>
              <option value="Times New Roman">Times New Roman</option>
              <option value="Verdana">Verdana</option>
              <option value="Courier New">Courier New</option>
              <option value="Impact">Impact</option>
            </select>
          </div>

          {/* Font color */}
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-[var(--color-text-secondary)]">
              {t('text.fontColor')}
            </label>
            <input
              type="color"
              value={clip.fontColor ?? '#FFFFFF'}
              onChange={(e) => handleUpdate('fontColor', e.target.value)}
              className="h-6 w-10 cursor-pointer rounded border border-[var(--color-border)]"
            />
          </div>

          {/* Font weight */}
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-[var(--color-text-secondary)]">
              {t('text.fontWeight')}
            </label>
            <div className="flex gap-1">
              <button
                onClick={() => handleUpdate('fontWeight', 'normal')}
                className={`rounded px-2 py-1 text-xs ${
                  clip.fontWeight === 'normal'
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)]'
                }`}
              >
                {t('text.normal')}
              </button>
              <button
                onClick={() => handleUpdate('fontWeight', 'bold')}
                className={`rounded px-2 py-1 text-xs font-bold ${
                  clip.fontWeight === 'bold' || !clip.fontWeight
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)]'
                }`}
              >
                {t('text.bold')}
              </button>
            </div>
          </div>

          {/* Text align */}
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-[var(--color-text-secondary)]">
              {t('text.textAlign')}
            </label>
            <div className="flex gap-1">
              {(['left', 'center', 'right'] as const).map((align) => (
                <button
                  key={align}
                  onClick={() => handleUpdate('textAlign', align)}
                  className={`rounded px-2 py-1 text-xs ${
                    clip.textAlign === align || (!clip.textAlign && align === 'center')
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)]'
                  }`}
                >
                  {t(`text.${align}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Background opacity */}
          <PropertySlider
            label={t('text.backgroundOpacity')}
            value={clip.backgroundOpacity ?? 0}
            min={0}
            max={1}
            step={0.1}
            onChange={(v) => handleUpdate('backgroundOpacity', v)}
            format={(v) => `${Math.round(v * 100)}%`}
          />

          {/* Text Animation Presets */}
          <TextAnimationSection clip={clip} trackId={track.id} />

          {/* Transform section */}
          <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)] mt-2">
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

      {/* Chroma Key / Green Screen */}
      {isVideoType && (
        <div className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
              {t('chromaKey.title')}
            </div>
            <button
              onClick={() => {
                const current = clipFilters.chromaKey ?? DEFAULT_CHROMA_KEY;
                handleChromaKeyUpdate({ ...current, enabled: !current.enabled });
              }}
              className={`relative h-4 w-8 rounded-full transition-colors ${
                clipFilters.chromaKey?.enabled
                  ? 'bg-[var(--color-primary)]'
                  : 'bg-white/20'
              }`}
            >
              <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
                clipFilters.chromaKey?.enabled ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </button>
          </div>

          {clipFilters.chromaKey?.enabled && (
            <>
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-[var(--color-text-secondary)]">
                  {t('chromaKey.keyColor')}
                </label>
                <input
                  type="color"
                  value={clipFilters.chromaKey.keyColor}
                  onChange={(e) => handleChromaKeyUpdate({
                    ...clipFilters.chromaKey!,
                    keyColor: e.target.value,
                  })}
                  className="h-6 w-10 cursor-pointer rounded border border-[var(--color-border)]"
                />
              </div>
              <PropertySlider
                label={t('chromaKey.similarity')}
                value={clipFilters.chromaKey.similarity}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => handleChromaKeyUpdate({ ...clipFilters.chromaKey!, similarity: v })}
                format={(v) => `${Math.round(v * 100)}%`}
              />
              <PropertySlider
                label={t('chromaKey.smoothness')}
                value={clipFilters.chromaKey.smoothness}
                min={0}
                max={0.5}
                step={0.01}
                onChange={(v) => handleChromaKeyUpdate({ ...clipFilters.chromaKey!, smoothness: v })}
                format={(v) => `${Math.round(v * 100)}%`}
              />
              <PropertySlider
                label={t('chromaKey.despill')}
                value={clipFilters.chromaKey.despill}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => handleChromaKeyUpdate({ ...clipFilters.chromaKey!, despill: v })}
                format={(v) => `${Math.round(v * 100)}%`}
              />
            </>
          )}
        </div>
      )}

      {/* Color Grading */}
      {isVideoType && (
        <div className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
              {t('colorGrading.title')}
            </div>
            <button
              onClick={() => {
                const current = clipFilters.colorGrading ?? DEFAULT_COLOR_GRADING;
                handleColorGradingUpdate({ ...current, enabled: !current.enabled });
              }}
              className={`relative h-4 w-8 rounded-full transition-colors ${
                clipFilters.colorGrading?.enabled
                  ? 'bg-[var(--color-primary)]'
                  : 'bg-white/20'
              }`}
            >
              <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
                clipFilters.colorGrading?.enabled ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </button>
          </div>

          {clipFilters.colorGrading?.enabled && (
            <>
              {/* Preset selector */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[var(--color-text-secondary)]">
                  {t('colorGrading.preset')}
                </label>
                <select
                  onChange={(e) => {
                    const preset = colorGradingPresets.find((p) => p.id === e.target.value);
                    if (preset) {
                      handleColorGradingUpdate({
                        ...clipFilters.colorGrading!,
                        ...preset.settings,
                      });
                    }
                  }}
                  defaultValue=""
                  className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[10px] text-[var(--color-text)] outline-none"
                >
                  <option value="" disabled>{t('colorGrading.none')}</option>
                  {colorGradingPresets.map((p) => (
                    <option key={p.id} value={p.id}>{t(p.labelKey)}</option>
                  ))}
                </select>
              </div>

              <PropertySlider
                label={t('colorGrading.temperature')}
                value={clipFilters.colorGrading.temperature}
                min={-1}
                max={1}
                step={0.01}
                onChange={(v) => handleColorGradingUpdate({ ...clipFilters.colorGrading!, temperature: v })}
                format={(v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`}
              />
              <PropertySlider
                label={t('colorGrading.tint')}
                value={clipFilters.colorGrading.tint}
                min={-1}
                max={1}
                step={0.01}
                onChange={(v) => handleColorGradingUpdate({ ...clipFilters.colorGrading!, tint: v })}
                format={(v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`}
              />
              <PropertySlider
                label={t('colorGrading.shadows')}
                value={clipFilters.colorGrading.shadows}
                min={-1}
                max={1}
                step={0.01}
                onChange={(v) => handleColorGradingUpdate({ ...clipFilters.colorGrading!, shadows: v })}
                format={(v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`}
              />
              <PropertySlider
                label={t('colorGrading.highlights')}
                value={clipFilters.colorGrading.highlights}
                min={-1}
                max={1}
                step={0.01}
                onChange={(v) => handleColorGradingUpdate({ ...clipFilters.colorGrading!, highlights: v })}
                format={(v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`}
              />
              <PropertySlider
                label={t('colorGrading.gamma')}
                value={clipFilters.colorGrading.gamma}
                min={0.2}
                max={3.0}
                step={0.05}
                onChange={(v) => handleColorGradingUpdate({ ...clipFilters.colorGrading!, gamma: v })}
                format={(v) => v.toFixed(2)}
              />

              {/* LUT upload */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[var(--color-text-secondary)]">
                  {t('colorGrading.lut')}
                </label>
                <div className="flex items-center gap-1">
                  <label className="cursor-pointer rounded bg-white/10 px-2 py-1 text-[10px] text-[var(--color-text)] hover:bg-white/20">
                    {t('colorGrading.uploadLut')}
                    <input
                      type="file"
                      accept=".cube"
                      onChange={handleLutUpload}
                      className="hidden"
                    />
                  </label>
                  {clipFilters.colorGrading.lut && (
                    <>
                      <span className="flex-1 truncate text-[9px] text-[var(--color-text-secondary)]">
                        {clipFilters.colorGrading.lut.name}
                      </span>
                      <button
                        onClick={() => handleColorGradingUpdate({ ...clipFilters.colorGrading!, lut: null })}
                        className="text-[9px] text-red-400 hover:text-red-300"
                      >
                        {t('colorGrading.clearLut')}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Keyframe animation editor */}
      {supportsKeyframes && (
        <div className="border-t border-[var(--color-border)] pt-3">
          <KeyframeEditor
            clipId={clip.id}
            trackId={track.id}
            clipStartTime={clip.startTime}
            clipDuration={clip.endTime - clip.startTime}
            keyframeTracks={clip.keyframes}
            currentPropertyValues={currentPropertyValues}
          />
        </div>
      )}

      {/* Audio Mixing (Track-level EQ / Compressor / Pan) */}
      {(isVideoType || isAudioType) && (
        <AudioMixingSection track={track} />
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

// Text Animation Preset controls
function TextAnimationSection({ clip, trackId }: { clip: Clip; trackId: string }) {
  const { t } = useTranslation();
  const { updateClip, setClipKeyframe, removeClipKeyframe } = useTimelineStore();

  const clipDuration = clip.endTime - clip.startTime;
  const animDuration = 500; // ms

  const handleSelect = useCallback(
    (preset: TextAnimationPresetName, direction: 'in' | 'out') => {
      const current = direction === 'in' ? clip.textAnimationIn : clip.textAnimationOut;

      if (preset === 'none' || preset === current) {
        // Remove animation
        removeTextAnimation(
          clip.id, trackId, direction, clipDuration, animDuration,
          clip.keyframes, { removeClipKeyframe, updateClip },
        );
      } else {
        // Remove old first, then apply new
        if (current) {
          removeTextAnimation(
            clip.id, trackId, direction, clipDuration, animDuration,
            clip.keyframes, { removeClipKeyframe, updateClip },
          );
        }
        applyTextAnimation(
          clip.id, trackId, preset, direction, clipDuration, animDuration,
          { setClipKeyframe, removeClipKeyframe, updateClip },
        );
      }
    },
    [clip, trackId, clipDuration, setClipKeyframe, removeClipKeyframe, updateClip],
  );

  return (
    <div className="flex flex-col gap-2 mt-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
        {t('textAnimation.title')}
      </div>

      {/* Entrance */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-[var(--color-text-secondary)]">
          {t('textAnimation.entrance')}
        </label>
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => handleSelect('none', 'in')}
            className={`rounded px-1.5 py-1 text-[9px] transition-colors ${
              !clip.textAnimationIn
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)]'
            }`}
          >
            {t('textAnimation.none')}
          </button>
          {TEXT_ANIMATION_PRESET_NAMES.map((name) => (
            <button
              key={name}
              onClick={() => handleSelect(name, 'in')}
              className={`rounded px-1.5 py-1 text-[9px] transition-colors ${
                clip.textAnimationIn === name
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:border-[var(--accent)]'
              }`}
            >
              {t(TEXT_ANIMATION_PRESETS[name].labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Exit */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-[var(--color-text-secondary)]">
          {t('textAnimation.exit')}
        </label>
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => handleSelect('none', 'out')}
            className={`rounded px-1.5 py-1 text-[9px] transition-colors ${
              !clip.textAnimationOut
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)]'
            }`}
          >
            {t('textAnimation.none')}
          </button>
          {TEXT_ANIMATION_PRESET_NAMES.map((name) => (
            <button
              key={name}
              onClick={() => handleSelect(name, 'out')}
              className={`rounded px-1.5 py-1 text-[9px] transition-colors ${
                clip.textAnimationOut === name
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:border-[var(--accent)]'
              }`}
            >
              {t(TEXT_ANIMATION_PRESETS[name].labelKey)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// PiP Border controls
function PipBorderSection({ clip, trackId }: { clip: Clip; trackId: string }) {
  const { t } = useTranslation();
  const { updateClip } = useTimelineStore();

  const border: PipBorder = clip.pipBorder ?? { width: 0, color: '#FFFFFF', shadow: 0 };
  const enabled = border.width > 0;

  const updateBorder = useCallback(
    (updates: Partial<PipBorder>) => {
      updateClip(trackId, clip.id, {
        pipBorder: { ...border, ...updates },
      });
    },
    [trackId, clip.id, border, updateClip],
  );

  return (
    <div className="flex flex-col gap-2 mt-1">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-medium text-[var(--color-text-secondary)]">
          {t('pip.border')}
        </div>
        <button
          onClick={() => updateBorder({ width: enabled ? 0 : 3 })}
          className={`relative h-4 w-8 rounded-full transition-colors ${
            enabled ? 'bg-[var(--color-primary)]' : 'bg-white/20'
          }`}
        >
          <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
            enabled ? 'translate-x-4' : 'translate-x-0.5'
          }`} />
        </button>
      </div>

      {enabled && (
        <>
          <PropertySlider
            label={t('pip.borderWidth')}
            value={border.width}
            min={1}
            max={10}
            step={1}
            onChange={(v) => updateBorder({ width: v })}
            format={(v) => `${v}px`}
          />
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-[var(--color-text-secondary)]">
              {t('pip.borderColor')}
            </label>
            <input
              type="color"
              value={border.color}
              onChange={(e) => updateBorder({ color: e.target.value })}
              className="h-6 w-10 cursor-pointer rounded border border-[var(--color-border)]"
            />
          </div>
          <PropertySlider
            label={t('pip.shadow')}
            value={border.shadow}
            min={0}
            max={20}
            step={1}
            onChange={(v) => updateBorder({ shadow: v })}
            format={(v) => `${v}px`}
          />
        </>
      )}
    </div>
  );
}

// Audio Mixing section for per-track EQ, compressor, pan
function AudioMixingSection({ track }: { track: Track }) {
  const { t } = useTranslation();
  const { updateTrackAudio } = useTimelineStore();

  const audio = track.audioSettings ?? { volume: 1, pan: 0 };
  const eq = audio.eq ?? DEFAULT_EQ_SETTINGS;
  const comp = audio.compressor ?? DEFAULT_COMPRESSOR_SETTINGS;

  const update = useCallback(
    (settings: Partial<TrackAudioSettings>) => updateTrackAudio(track.id, settings),
    [track.id, updateTrackAudio],
  );

  const updateEQ = useCallback(
    (eqUpdate: Partial<EQSettings>) => {
      update({ eq: { ...eq, ...eqUpdate } });
    },
    [eq, update],
  );

  const updateComp = useCallback(
    (compUpdate: Partial<CompressorSettings>) => {
      update({ compressor: { ...comp, ...compUpdate } });
    },
    [comp, update],
  );

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
        {t('audioMixing.title')}
      </div>

      {/* Track Volume */}
      <PropertySlider
        label={t('audioMixing.trackVolume')}
        value={audio.volume}
        min={0}
        max={2}
        step={0.01}
        onChange={(v) => update({ volume: v })}
        format={(v) => `${Math.round(v * 100)}%`}
      />

      {/* Pan */}
      <PropertySlider
        label={t('audioMixing.pan')}
        value={audio.pan}
        min={-1}
        max={1}
        step={0.01}
        onChange={(v) => update({ pan: v })}
        format={(v) => v === 0 ? 'C' : v < 0 ? `L${Math.round(Math.abs(v) * 100)}` : `R${Math.round(v * 100)}`}
      />

      {/* EQ */}
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-medium text-[var(--color-text-secondary)]">
          {t('audioMixing.eq')}
        </div>
        <button
          onClick={() => updateEQ({ enabled: !eq.enabled })}
          className={`relative h-4 w-8 rounded-full transition-colors ${
            eq.enabled ? 'bg-[var(--color-primary)]' : 'bg-white/20'
          }`}
        >
          <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
            eq.enabled ? 'translate-x-4' : 'translate-x-0.5'
          }`} />
        </button>
      </div>

      {eq.enabled && (
        <>
          <PropertySlider
            label={t('audioMixing.eqLow')}
            value={eq.low.gain}
            min={-12}
            max={12}
            step={0.5}
            onChange={(v) => updateEQ({ low: { ...eq.low, gain: v } })}
            format={(v) => `${v > 0 ? '+' : ''}${v}dB`}
          />
          <PropertySlider
            label={t('audioMixing.eqMid')}
            value={eq.mid.gain}
            min={-12}
            max={12}
            step={0.5}
            onChange={(v) => updateEQ({ mid: { ...eq.mid, gain: v } })}
            format={(v) => `${v > 0 ? '+' : ''}${v}dB`}
          />
          <PropertySlider
            label={t('audioMixing.eqHigh')}
            value={eq.high.gain}
            min={-12}
            max={12}
            step={0.5}
            onChange={(v) => updateEQ({ high: { ...eq.high, gain: v } })}
            format={(v) => `${v > 0 ? '+' : ''}${v}dB`}
          />
        </>
      )}

      {/* Compressor */}
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-medium text-[var(--color-text-secondary)]">
          {t('audioMixing.compressor')}
        </div>
        <button
          onClick={() => updateComp({ enabled: !comp.enabled })}
          className={`relative h-4 w-8 rounded-full transition-colors ${
            comp.enabled ? 'bg-[var(--color-primary)]' : 'bg-white/20'
          }`}
        >
          <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
            comp.enabled ? 'translate-x-4' : 'translate-x-0.5'
          }`} />
        </button>
      </div>

      {comp.enabled && (
        <>
          <PropertySlider
            label={t('audioMixing.threshold')}
            value={comp.threshold}
            min={-60}
            max={0}
            step={1}
            onChange={(v) => updateComp({ threshold: v })}
            format={(v) => `${v}dB`}
          />
          <PropertySlider
            label={t('audioMixing.ratio')}
            value={comp.ratio}
            min={1}
            max={20}
            step={0.5}
            onChange={(v) => updateComp({ ratio: v })}
            format={(v) => `${v}:1`}
          />
          <PropertySlider
            label={t('audioMixing.attack')}
            value={comp.attack}
            min={0}
            max={1}
            step={0.001}
            onChange={(v) => updateComp({ attack: v })}
            format={(v) => `${(v * 1000).toFixed(0)}ms`}
          />
          <PropertySlider
            label={t('audioMixing.release')}
            value={comp.release}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => updateComp({ release: v })}
            format={(v) => `${(v * 1000).toFixed(0)}ms`}
          />
        </>
      )}
    </div>
  );
}

export default React.memo(PropertiesPanelComponent);
