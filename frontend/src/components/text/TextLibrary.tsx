import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useTimelineStore } from '@/store/timelineStore';
import { DEFAULT_CLIP_FILTERS } from '@/effects/types';

const FONT_FAMILIES = [
  'Arial',
  'Georgia',
  'Times New Roman',
  'Verdana',
  'Courier New',
  'Impact',
  'Comic Sans MS',
];

export function TextLibrary() {
  const { t } = useTranslation();
  const { tracks, addTrack, addClip } = useTimelineStore();
  const [textContent, setTextContent] = useState('');

  const handleAddToTimeline = useCallback(() => {
    if (!textContent.trim()) return;

    // Find or create text track
    let textTrack = tracks.find((t) => t.type === 'text');
    if (!textTrack) {
      addTrack('text');
      textTrack = useTimelineStore.getState().tracks.find((t) => t.type === 'text');
    }
    if (!textTrack) return;

    // Calculate start time (at end of existing clips)
    const lastEnd = textTrack.clips.reduce(
      (max, c) => Math.max(max, c.endTime),
      0,
    );
    const duration = 3000; // Default 3 seconds

    addClip(textTrack.id, {
      id: `text_${Date.now()}`,
      assetId: 'text',
      startTime: lastEnd,
      endTime: lastEnd + duration,
      trimStart: 0,
      trimEnd: 0,
      duration,
      name: textContent.slice(0, 20) || 'Text',
      type: 'text',
      filters: DEFAULT_CLIP_FILTERS,
      volume: 1,
      fadeInMs: 0,
      fadeOutMs: 0,
      // Text properties
      textContent: textContent.trim(),
      fontSize: 48,
      fontFamily: 'Arial',
      fontColor: '#FFFFFF',
      fontWeight: 'bold',
      textAlign: 'center',
      backgroundColor: '#000000',
      backgroundOpacity: 0,
      // Transform
      positionX: 0.5,
      positionY: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    });

    // Clear input after adding
    setTextContent('');
  }, [textContent, tracks, addTrack, addClip]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <h3 className="text-sm font-medium text-[var(--color-text)]">
        {t('text.title')}
      </h3>

      {/* Text input */}
      <div className="flex flex-col gap-2">
        <label className="text-xs text-[var(--color-text-secondary)]">
          {t('text.content')}
        </label>
        <textarea
          value={textContent}
          onChange={(e) => setTextContent(e.target.value)}
          placeholder={t('text.placeholder')}
          className="h-24 resize-none rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-secondary)] outline-none focus:border-[var(--color-primary)]"
        />
      </div>

      {/* Preview */}
      {textContent.trim() && (
        <div className="flex items-center justify-center rounded border border-[var(--color-border)] bg-black/30 p-4">
          <span className="text-center text-lg font-bold text-white">
            {textContent}
          </span>
        </div>
      )}

      {/* Add button */}
      <button
        onClick={handleAddToTimeline}
        disabled={!textContent.trim()}
        className="rounded bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t('text.addText')}
      </button>

      {/* Font preview samples */}
      <div className="mt-4">
        <h4 className="mb-2 text-xs text-[var(--color-text-secondary)]">
          {t('text.fontFamily')}
        </h4>
        <div className="flex flex-col gap-2">
          {FONT_FAMILIES.slice(0, 4).map((font) => (
            <div
              key={font}
              className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
            >
              <span
                className="text-sm text-[var(--color-text)]"
                style={{ fontFamily: font }}
              >
                {font}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
