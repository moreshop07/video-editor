import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { externalApi } from '@/api/client';
import { useAssetStore } from '@/store/assetStore';
import { parseExternalResponse } from './externalParsers';
import type { ExternalAssetItem, ExternalSource, ExternalMediaType } from '@/types/external';

const SOURCES: { key: ExternalSource; label: string }[] = [
  { key: 'pexels', label: 'external.pexels' },
  { key: 'pixabay', label: 'external.pixabay' },
  { key: 'freesound', label: 'external.freesound' },
];

const MEDIA_TYPES: { key: ExternalMediaType; label: string }[] = [
  { key: 'image', label: 'external.image' },
  { key: 'video', label: 'external.video' },
];

function formatDuration(sec: number | undefined): string {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ExternalBrowser() {
  const { t } = useTranslation();
  const [source, setSource] = useState<ExternalSource>('pexels');
  const [query, setQuery] = useState('');
  const [mediaType, setMediaType] = useState<ExternalMediaType>('image');
  const [results, setResults] = useState<ExternalAssetItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [importingIds, setImportingIds] = useState<Set<string>>(new Set());
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const fetchAssets = useAssetStore((s) => s.fetchAssets);

  const effectiveMediaType = source === 'freesound' ? 'audio' : mediaType;

  const fetchResults = useCallback(
    async (resetPage = false) => {
      if (!query.trim()) {
        if (resetPage) setResults([]);
        return;
      }
      setLoading(true);
      const p = resetPage ? 1 : page;
      try {
        const res = await externalApi.search(source, {
          query: query.trim(),
          media_type: effectiveMediaType,
          page: p,
          per_page: 20,
        });
        const items = parseExternalResponse(source, res.data, effectiveMediaType);
        if (resetPage) {
          setResults(items);
          setPage(1);
        } else {
          setResults((prev) => [...prev, ...items]);
        }
        setHasMore(items.length === 20);
      } catch {
        if (resetPage) setResults([]);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    },
    [query, source, effectiveMediaType, page],
  );

  // Debounced search on query/source/mediaType change
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchResults(true);
    }, 500);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, source, effectiveMediaType]);

  // Pagination
  useEffect(() => {
    if (page > 1) fetchResults(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const handleSourceChange = (s: ExternalSource) => {
    setSource(s);
    setResults([]);
    setHasMore(false);
    if (s === 'freesound') {
      setMediaType('audio');
    } else if (mediaType === 'audio') {
      setMediaType('image');
    }
  };

  const handleImport = useCallback(
    async (item: ExternalAssetItem) => {
      setImportingIds((prev) => new Set(prev).add(item.id));
      try {
        await externalApi.import({
          url: item.downloadUrl,
          source: item.source,
          original_filename: item.title || `${item.source}_${item.id}`,
          content_type: item.contentType,
        });
        setImportedIds((prev) => new Set(prev).add(item.id));
        fetchAssets();
      } catch {
        // Import failed silently
      } finally {
        setImportingIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }
    },
    [fetchAssets],
  );

  const toggleAudioPreview = useCallback((item: ExternalAssetItem) => {
    if (previewingId === item.id) {
      audioRef.current?.pause();
      setPreviewingId(null);
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(item.previewUrl);
    audio.play().catch(() => {});
    audio.onended = () => setPreviewingId(null);
    audioRef.current = audio;
    setPreviewingId(item.id);
  }, [previewingId]);

  return (
    <div className="flex h-full flex-col">
      {/* Source tabs */}
      <div className="flex border-b border-[var(--color-border)]">
        {SOURCES.map((s) => (
          <button
            key={s.key}
            onClick={() => handleSourceChange(s.key)}
            className={`flex-1 px-2 py-1.5 text-[10px] transition-colors ${
              source === s.key
                ? 'border-b-2 border-[var(--accent)] text-[var(--accent)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
            }`}
          >
            {t(s.label)}
          </button>
        ))}
      </div>

      {/* Search + media type */}
      <div className="space-y-2 border-b border-[var(--color-border)] p-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('external.search')}
          className="w-full rounded border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-[var(--color-text)] placeholder-[var(--color-text-secondary)] outline-none focus:border-[var(--accent)]"
        />
        {source !== 'freesound' && (
          <div className="flex gap-1">
            {MEDIA_TYPES.map((mt) => (
              <button
                key={mt.key}
                onClick={() => setMediaType(mt.key)}
                className={`rounded px-2 py-0.5 text-[10px] ${
                  mediaType === mt.key
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-white/5 text-[var(--color-text-secondary)] hover:bg-white/10'
                }`}
              >
                {t(mt.label)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading && results.length === 0 && (
          <div className="flex h-32 items-center justify-center text-xs text-[var(--color-text-secondary)]">
            {t('common.loading')}
          </div>
        )}

        {!loading && results.length === 0 && query.trim() && (
          <div className="flex h-32 items-center justify-center text-xs text-[var(--color-text-secondary)]">
            {t('external.noResults')}
          </div>
        )}

        {!query.trim() && results.length === 0 && (
          <div className="flex h-32 items-center justify-center text-xs text-[var(--color-text-secondary)]">
            {t('external.search')}
          </div>
        )}

        {effectiveMediaType === 'audio' ? (
          // Audio list layout
          <div className="flex flex-col gap-1">
            {results.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 rounded border border-white/5 bg-white/5 p-2 hover:bg-white/10"
              >
                <button
                  onClick={() => toggleAudioPreview(item)}
                  className="flex-shrink-0 text-[var(--color-text-secondary)] hover:text-[var(--accent)]"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    {previewingId === item.id ? (
                      <><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></>
                    ) : (
                      <polygon points="5,3 19,12 5,21" />
                    )}
                  </svg>
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[10px] text-[var(--color-text)]">{item.title}</div>
                  <div className="truncate text-[9px] text-[var(--color-text-secondary)]">
                    {t('external.attribution')} {item.attribution}
                    {item.duration ? ` · ${formatDuration(item.duration)}` : ''}
                  </div>
                </div>
                {importedIds.has(item.id) ? (
                  <span className="text-[9px] text-green-400">{t('external.imported')}</span>
                ) : (
                  <button
                    onClick={() => handleImport(item)}
                    disabled={importingIds.has(item.id)}
                    className="flex-shrink-0 rounded bg-[var(--accent)]/20 px-1.5 py-0.5 text-[9px] text-[var(--accent)] hover:bg-[var(--accent)]/30 disabled:opacity-50"
                  >
                    {importingIds.has(item.id) ? t('external.importing') : t('external.import')}
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          // Image/Video grid layout
          <div className="grid grid-cols-2 gap-2">
            {results.map((item) => (
              <div
                key={item.id}
                className="group relative overflow-hidden rounded border border-white/5 bg-white/5"
              >
                {/* Thumbnail */}
                <div className="relative aspect-video bg-black/50">
                  <img
                    src={item.thumbnailUrl}
                    alt={item.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                  {item.duration != null && (
                    <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 text-[9px] text-white">
                      {formatDuration(item.duration)}
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="p-1.5">
                  <p className="truncate text-[10px] text-[var(--color-text)]">{item.title}</p>
                  <p className="truncate text-[9px] text-[var(--color-text-secondary)]">
                    {t('external.attribution')} {item.attribution}
                  </p>
                </div>

                {/* Import button overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                  {importedIds.has(item.id) ? (
                    <span className="rounded bg-green-500/80 px-2 py-1 text-[10px] text-white">
                      {t('external.imported')}
                    </span>
                  ) : (
                    <button
                      onClick={() => handleImport(item)}
                      disabled={importingIds.has(item.id)}
                      className="rounded bg-[var(--accent)] px-3 py-1 text-[10px] font-medium text-white hover:bg-[var(--accent)]/80 disabled:opacity-50"
                    >
                      {importingIds.has(item.id) ? t('external.importing') : t('external.import')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Load more */}
        {hasMore && results.length > 0 && (
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={loading}
            className="mt-3 w-full rounded bg-white/5 py-1.5 text-[10px] text-[var(--color-text-secondary)] hover:bg-white/10 disabled:opacity-50"
          >
            {loading ? t('common.loading') : t('external.loadMore')}
          </button>
        )}
      </div>
    </div>
  );
}
