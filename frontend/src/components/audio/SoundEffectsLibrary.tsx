import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { sfxApi, assetApi } from '@/api/client';
import { useTimelineStore } from '@/store/timelineStore';
import { DEFAULT_CLIP_FILTERS } from '@/effects/types';

interface SoundEffectItem {
  id: number;
  title: string;
  category: string;
  file_path: string;
  duration_ms: number;
  tags: string[];
}

const CATEGORY_OPTIONS = ['Nature', 'UI', 'Impact', 'Ambient', 'Voice', 'Transition', 'Foley'];

export default function SoundEffectsLibrary() {
  const { t } = useTranslation();
  const [effects, setEffects] = useState<SoundEffectItem[]>([]);
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [previewingId, setPreviewingId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { tracks: timelineTracks, addTrack, addClip } = useTimelineStore();

  const fetchEffects = useCallback(async (resetPage = false) => {
    setLoading(true);
    const currentPage = resetPage ? 1 : page;
    try {
      const res = await sfxApi.list({
        query: query || undefined,
        category: selectedCategory || undefined,
        page: currentPage,
        per_page: 20,
      });
      const data = res.data as SoundEffectItem[];
      if (resetPage) {
        setEffects(data);
        setPage(1);
      } else {
        setEffects((prev) => [...prev, ...data]);
      }
      setHasMore(data.length === 20);
    } catch {
      // API may not be available
    } finally {
      setLoading(false);
    }
  }, [query, selectedCategory, page]);

  useEffect(() => {
    fetchEffects(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, selectedCategory]);

  const loadMore = () => {
    if (!loading && hasMore) {
      setPage((p) => p + 1);
    }
  };

  useEffect(() => {
    if (page > 1) fetchEffects(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const togglePreview = (sfx: SoundEffectItem) => {
    if (previewingId === sfx.id) {
      audioRef.current?.pause();
      setPreviewingId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(assetApi.getStreamUrl(sfx.id));
    audio.play().catch(() => {});
    audio.onended = () => setPreviewingId(null);
    audioRef.current = audio;
    setPreviewingId(sfx.id);
  };

  const addToTimeline = (sfx: SoundEffectItem) => {
    let sfxTrack = timelineTracks.find((t) => t.type === 'sfx');
    if (!sfxTrack) {
      addTrack('sfx');
      sfxTrack = useTimelineStore.getState().tracks.find((t) => t.type === 'sfx');
    }
    if (!sfxTrack) return;

    const lastEnd = sfxTrack.clips.reduce((max, c) => Math.max(max, c.endTime), 0);

    addClip(sfxTrack.id, {
      id: `sfx_${sfx.id}_${Date.now()}`,
      assetId: String(sfx.id),
      startTime: lastEnd,
      endTime: lastEnd + sfx.duration_ms,
      trimStart: 0,
      trimEnd: 0,
      duration: sfx.duration_ms,
      name: sfx.title,
      type: 'audio',
      filters: DEFAULT_CLIP_FILTERS,
      volume: 1,
      fadeInMs: 0,
      fadeOutMs: 0,
    });
  };

  const formatDuration = (ms: number) => {
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    const s = sec % 60;
    return `${min}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col gap-3 overflow-y-auto p-3">
      {/* Search */}
      <input
        type="text"
        placeholder={t('sfx.search')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-[var(--color-text)] placeholder-[var(--color-text-secondary)] outline-none focus:border-[var(--accent)]"
      />

      {/* Category filter */}
      <div className="flex flex-wrap gap-1">
        {CATEGORY_OPTIONS.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
            className={`rounded px-2 py-0.5 text-[9px] ${
              selectedCategory === cat
                ? 'bg-[var(--accent)] text-white'
                : 'bg-white/5 text-[var(--color-text-secondary)] hover:bg-white/10'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Results */}
      {effects.length === 0 && !loading && (
        <p className="text-center text-xs text-[var(--color-text-secondary)] py-4">
          {t('sfx.noResults')}
        </p>
      )}

      <div className="grid grid-cols-2 gap-1">
        {effects.map((sfx) => (
          <div
            key={sfx.id}
            className="flex flex-col gap-1 rounded border border-white/5 bg-white/5 p-2 hover:bg-white/10"
          >
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => togglePreview(sfx)}
                className="flex-shrink-0 text-[var(--color-text-secondary)] hover:text-[var(--accent)]"
              >
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                  {previewingId === sfx.id ? (
                    <><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></>
                  ) : (
                    <polygon points="5,3 19,12 5,21" />
                  )}
                </svg>
              </button>
              <span className="flex-1 truncate text-[10px] text-[var(--color-text)]">{sfx.title}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-[var(--color-text-secondary)]">
                {sfx.category} &middot; {formatDuration(sfx.duration_ms)}
              </span>
              <button
                onClick={() => addToTimeline(sfx)}
                className="rounded bg-[var(--accent)]/20 px-1.5 py-0.5 text-[9px] text-[var(--accent)] hover:bg-[var(--accent)]/30"
                title={t('sfx.addToTimeline')}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Load more */}
      {hasMore && effects.length > 0 && (
        <button
          onClick={loadMore}
          disabled={loading}
          className="rounded bg-white/5 py-1.5 text-[10px] text-[var(--color-text-secondary)] hover:bg-white/10 disabled:opacity-50"
        >
          {loading ? t('common.loading') : t('sfx.loadMore')}
        </button>
      )}

      {loading && effects.length === 0 && (
        <p className="text-center text-xs text-[var(--color-text-secondary)] py-4">
          {t('common.loading')}
        </p>
      )}
    </div>
  );
}
