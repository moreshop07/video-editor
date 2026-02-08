import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTimelineStore } from '@/store/timelineStore';
import type { AnimatableProperty, KeyframeTracks, EasingType } from '@/types/keyframes';
import {
  ANIMATABLE_PROPERTY_DEFAULTS,
  ANIMATABLE_PROPERTY_INFO,
} from '@/types/keyframes';
import {
  hasKeyframeAt,
  getKeyframeAt,
  getInterpolatedValue,
  getAllKeyframeTimes,
} from '@/utils/keyframeUtils';

interface KeyframeEditorProps {
  clipId: string;
  trackId: string;
  clipStartTime: number;
  clipDuration: number;
  keyframeTracks?: KeyframeTracks;
  currentPropertyValues: Record<AnimatableProperty, number>;
}

// Properties available for keyframe animation
const ANIMATABLE_PROPERTIES: AnimatableProperty[] = [
  'positionX',
  'positionY',
  'scaleX',
  'scaleY',
  'rotation',
  'opacity',
];

export function KeyframeEditor({
  clipId,
  trackId,
  clipStartTime,
  clipDuration,
  keyframeTracks,
  currentPropertyValues,
}: KeyframeEditorProps) {
  const { t } = useTranslation();
  const currentTime = useTimelineStore((s) => s.currentTime);
  const setClipKeyframe = useTimelineStore((s) => s.setClipKeyframe);
  const removeClipKeyframe = useTimelineStore((s) => s.removeClipKeyframe);

  // Calculate clip-relative time
  const clipRelativeTime = useMemo(() => {
    const relTime = currentTime - clipStartTime;
    return Math.max(0, Math.min(relTime, clipDuration));
  }, [currentTime, clipStartTime, clipDuration]);

  // Get all keyframe times for display
  const allKeyframeTimes = useMemo(
    () => getAllKeyframeTimes(keyframeTracks),
    [keyframeTracks]
  );

  const updateClip = useTimelineStore((s) => s.updateClip);

  // Toggle keyframe at current time for a property
  const handleToggleKeyframe = useCallback(
    (property: AnimatableProperty) => {
      if (hasKeyframeAt(keyframeTracks, property, clipRelativeTime)) {
        removeClipKeyframe(clipId, property, clipRelativeTime);
      } else {
        // Use current property value
        const value = currentPropertyValues[property];
        setClipKeyframe(clipId, property, clipRelativeTime, value);
      }
    },
    [clipId, keyframeTracks, clipRelativeTime, currentPropertyValues, setClipKeyframe, removeClipKeyframe]
  );

  // Update easing for a keyframe at current time
  const handleEasingChange = useCallback(
    (property: AnimatableProperty, easing: EasingType) => {
      if (!keyframeTracks?.[property]) return;
      const updated = keyframeTracks[property].map((kf) =>
        Math.abs(kf.time - clipRelativeTime) < 10 ? { ...kf, easing } : kf,
      );
      updateClip(trackId, clipId, {
        keyframes: { ...keyframeTracks, [property]: updated },
      });
    },
    [trackId, clipId, keyframeTracks, clipRelativeTime, updateClip],
  );

  // Check if playhead is within clip bounds
  const isPlayheadInClip =
    currentTime >= clipStartTime && currentTime <= clipStartTime + clipDuration;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
          {t('keyframes.title')}
        </div>
        <div className="text-[10px] text-[var(--color-text-secondary)]">
          {t('keyframes.clipTime')}: {(clipRelativeTime / 1000).toFixed(2)}s
        </div>
      </div>

      {/* Keyframe timeline visualization */}
      {allKeyframeTimes.length > 0 && (
        <div className="relative h-4 rounded bg-[var(--color-surface)] border border-[var(--color-border)]">
          {/* Keyframe markers */}
          {allKeyframeTimes.map((time) => {
            const percent = (time / clipDuration) * 100;
            return (
              <div
                key={time}
                className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-[var(--accent)] rounded-full cursor-pointer"
                style={{ left: `calc(${percent}% - 4px)` }}
                title={`${(time / 1000).toFixed(2)}s`}
              />
            );
          })}
          {/* Playhead position */}
          {isPlayheadInClip && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white"
              style={{ left: `${(clipRelativeTime / clipDuration) * 100}%` }}
            />
          )}
        </div>
      )}

      {/* Property keyframe controls */}
      <div className="flex flex-col gap-2">
        {ANIMATABLE_PROPERTIES.map((property) => {
          const info = ANIMATABLE_PROPERTY_INFO[property];
          const hasKeyframe = hasKeyframeAt(keyframeTracks, property, clipRelativeTime);
          const keyframes = keyframeTracks?.[property];
          const keyframeCount = keyframes?.length ?? 0;
          const currentKeyframe = getKeyframeAt(keyframeTracks, property, clipRelativeTime);

          // Get current interpolated value
          const interpolatedValue = keyframes?.length
            ? getInterpolatedValue(
                keyframes,
                clipRelativeTime,
                ANIMATABLE_PROPERTY_DEFAULTS[property]
              )
            : currentPropertyValues[property];

          return (
            <div
              key={property}
              className="flex flex-col gap-1"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1">
                  <button
                    onClick={() => handleToggleKeyframe(property)}
                    disabled={!isPlayheadInClip}
                    className={`w-4 h-4 flex items-center justify-center rounded-sm transition-colors ${
                      hasKeyframe
                        ? 'bg-[var(--accent)] text-white'
                        : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--accent)]'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    title={
                      hasKeyframe
                        ? t('keyframes.removeKeyframe')
                        : t('keyframes.addKeyframe')
                    }
                  >
                    <svg
                      className="w-2.5 h-2.5"
                      fill="currentColor"
                      viewBox="0 0 8 8"
                    >
                      <path d="M4 0L7.5 4L4 8L0.5 4L4 0Z" />
                    </svg>
                  </button>
                  <span className="text-[10px] text-[var(--color-text)]">
                    {t(info.labelKey)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--color-text-secondary)] min-w-[40px] text-right">
                    {info.format(interpolatedValue)}
                  </span>
                  {keyframeCount > 0 && (
                    <span className="text-[9px] px-1 rounded bg-[var(--accent)]/20 text-[var(--accent)]">
                      {keyframeCount}
                    </span>
                  )}
                </div>
              </div>
              {/* Easing selector — shown when a keyframe exists at current time */}
              {currentKeyframe && (
                <div className="ml-6">
                  <select
                    value={currentKeyframe.easing ?? 'linear'}
                    onChange={(e) => handleEasingChange(property, e.target.value as EasingType)}
                    className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-[9px] text-[var(--color-text)] outline-none"
                  >
                    <option value="linear">{t('pip.linear')}</option>
                    <option value="easeIn">{t('pip.easeIn')}</option>
                    <option value="easeOut">{t('pip.easeOut')}</option>
                    <option value="easeInOut">{t('pip.easeInOut')}</option>
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!isPlayheadInClip && (
        <p className="text-[10px] text-[var(--color-text-secondary)] italic">
          {t('keyframes.movePlayhead')}
        </p>
      )}
    </div>
  );
}
