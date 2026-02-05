import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { stickerApi } from '@/api/client';
import { useTimelineStore } from '@/store/timelineStore';
import { DEFAULT_CLIP_FILTERS } from '@/effects/types';

interface StickerPack {
  id: number;
  name: string;
  thumbnail_url: string | null;
  sticker_count: number;
}

interface Sticker {
  id: number;
  name: string;
  file_url: string;
  thumbnail_url: string | null;
  width: number;
  height: number;
  duration_ms: number | null;
}

export default function StickerLibrary() {
  const { t } = useTranslation();
  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [selectedPack, setSelectedPack] = useState<StickerPack | null>(null);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStickers, setLoadingStickers] = useState(false);

  const { tracks, addTrack, addClip } = useTimelineStore();

  // Fetch packs on mount
  useEffect(() => {
    setLoading(true);
    stickerApi
      .packs()
      .then((res) => setPacks(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Fetch stickers when pack selected
  useEffect(() => {
    if (!selectedPack) {
      setStickers([]);
      return;
    }
    setLoadingStickers(true);
    stickerApi
      .pack(selectedPack.id)
      .then((res) => {
        const data = res.data;
        setStickers(data.stickers ?? data.items ?? []);
      })
      .catch(() => setStickers([]))
      .finally(() => setLoadingStickers(false));
  }, [selectedPack]);

  const handleAddToTimeline = useCallback(
    (sticker: Sticker) => {
      // Find or create sticker track
      let stickerTrack = tracks.find((t) => t.type === 'sticker');
      if (!stickerTrack) {
        addTrack('sticker');
        stickerTrack = useTimelineStore
          .getState()
          .tracks.find((t) => t.type === 'sticker');
      }
      if (!stickerTrack) return;

      const lastEnd = stickerTrack.clips.reduce(
        (max, c) => Math.max(max, c.endTime),
        0,
      );
      const duration = sticker.duration_ms || 3000; // default 3s for static stickers

      addClip(stickerTrack.id, {
        id: `sticker_${sticker.id}_${Date.now()}`,
        assetId: String(sticker.id),
        startTime: lastEnd,
        endTime: lastEnd + duration,
        trimStart: 0,
        trimEnd: 0,
        duration,
        name: sticker.name,
        type: 'sticker',
        filters: DEFAULT_CLIP_FILTERS,
        volume: 1,
        fadeInMs: 0,
        fadeOutMs: 0,
        positionX: 0.5,
        positionY: 0.5,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
      });
    },
    [tracks, addTrack, addClip],
  );

  // Pack list view
  if (!selectedPack) {
    return (
      <div className="flex flex-col gap-3 overflow-y-auto p-3">
        <h4 className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
          {t('sticker.packs')}
        </h4>

        {loading && (
          <div className="flex h-32 items-center justify-center text-xs text-[var(--color-text-secondary)]">
            {t('common.loading')}
          </div>
        )}

        {!loading && packs.length === 0 && (
          <div className="flex h-32 items-center justify-center text-xs text-[var(--color-text-secondary)]">
            {t('sticker.noPacks')}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {packs.map((pack) => (
            <button
              key={pack.id}
              onClick={() => setSelectedPack(pack)}
              className="group overflow-hidden rounded border border-white/5 bg-white/5 text-left hover:bg-white/10"
            >
              <div className="aspect-square bg-black/30 flex items-center justify-center">
                {pack.thumbnail_url ? (
                  <img
                    src={pack.thumbnail_url}
                    alt={pack.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="text-2xl">😊</span>
                )}
              </div>
              <div className="p-1.5">
                <p className="truncate text-[10px] text-[var(--color-text)]">
                  {pack.name}
                </p>
                <p className="text-[9px] text-[var(--color-text-secondary)]">
                  {pack.sticker_count}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Sticker grid view
  return (
    <div className="flex flex-col gap-3 overflow-y-auto p-3">
      {/* Back button */}
      <button
        onClick={() => setSelectedPack(null)}
        className="flex items-center gap-1 text-[10px] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
      >
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('sticker.back')}
      </button>

      <h4 className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
        {selectedPack.name}
      </h4>

      {loadingStickers && (
        <div className="flex h-32 items-center justify-center text-xs text-[var(--color-text-secondary)]">
          {t('common.loading')}
        </div>
      )}

      {!loadingStickers && stickers.length === 0 && (
        <div className="flex h-32 items-center justify-center text-xs text-[var(--color-text-secondary)]">
          {t('sticker.noStickers')}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {stickers.map((sticker) => (
          <button
            key={sticker.id}
            onClick={() => handleAddToTimeline(sticker)}
            className="group relative overflow-hidden rounded border border-white/5 bg-white/5 hover:bg-white/10"
            title={t('sticker.addToTimeline')}
          >
            <div className="aspect-square flex items-center justify-center p-1">
              <img
                src={sticker.thumbnail_url || stickerApi.stickerUrl(sticker.id)}
                alt={sticker.name}
                className="max-h-full max-w-full object-contain"
                loading="lazy"
              />
            </div>
            <p className="truncate px-1 pb-1 text-center text-[8px] text-[var(--color-text-secondary)]">
              {sticker.name}
            </p>
            {/* Add overlay on hover */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
              <span className="rounded bg-[var(--accent)] px-2 py-0.5 text-[9px] text-white">+</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
