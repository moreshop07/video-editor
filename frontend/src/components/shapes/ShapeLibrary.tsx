import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useTimelineStore } from '@/store/timelineStore';
import { DEFAULT_CLIP_FILTERS } from '@/effects/types';
import { SHAPE_DEFINITIONS } from '@/effects/shapeDefinitions';

export function ShapeLibrary() {
  const { t } = useTranslation();
  const { tracks, addTrack, addClip } = useTimelineStore();

  const handleAddShape = useCallback(
    (shapeId: string) => {
      const shapeDef = SHAPE_DEFINITIONS.find((s) => s.id === shapeId);
      if (!shapeDef) return;

      // Find or create text track (shapes share text track)
      let textTrack = tracks.find((t) => t.type === 'text');
      if (!textTrack) {
        addTrack('text');
        textTrack = useTimelineStore.getState().tracks.find((t) => t.type === 'text');
      }
      if (!textTrack) return;

      // Position after last clip
      const lastEnd = textTrack.clips.reduce(
        (max, c) => Math.max(max, c.endTime),
        0,
      );
      const duration = 3000;

      addClip(textTrack.id, {
        id: `shape_${Date.now()}`,
        assetId: 'shape',
        startTime: lastEnd,
        endTime: lastEnd + duration,
        trimStart: 0,
        trimEnd: 0,
        duration,
        name: t(shapeDef.labelKey),
        type: 'text',
        filters: DEFAULT_CLIP_FILTERS,
        volume: 1,
        fadeInMs: 0,
        fadeOutMs: 0,
        // Shape properties
        shapeType: shapeId as 'rectangle' | 'circle' | 'triangle' | 'star' | 'arrow' | 'line',
        shapeFill: shapeDef.defaults.shapeFill,
        shapeStroke: shapeDef.defaults.shapeStroke,
        shapeStrokeWidth: shapeDef.defaults.shapeStrokeWidth,
        shapeCornerRadius: shapeDef.defaults.shapeCornerRadius ?? 0,
        shapeFillOpacity: 1,
        // Transform
        positionX: 0.5,
        positionY: 0.5,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
      });
    },
    [tracks, addTrack, addClip, t],
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <h3 className="text-sm font-medium text-[var(--color-text)]">
        {t('shape.title')}
      </h3>

      <div className="grid grid-cols-3 gap-2">
        {SHAPE_DEFINITIONS.map((shape) => (
          <button
            key={shape.id}
            onClick={() => handleAddShape(shape.id)}
            className="flex flex-col items-center gap-1.5 rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3 hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            <svg
              className="w-8 h-8"
              viewBox="0 0 24 24"
              fill={shape.strokeOnly ? 'none' : shape.defaults.shapeFill}
              stroke={shape.strokeOnly ? shape.defaults.shapeStroke : 'none'}
              strokeWidth={shape.strokeOnly ? 2 : 0}
            >
              <path
                d={shape.svgPath}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-[10px] text-[var(--color-text-secondary)]">
              {t(shape.labelKey)}
            </span>
          </button>
        ))}
      </div>

      <p className="text-[10px] text-[var(--color-text-secondary)]">
        {t('shape.addShape')}
      </p>
    </div>
  );
}
