import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAssetStore, Asset } from '@/store/assetStore';
import ExternalBrowser from './ExternalBrowser';

const TYPE_FILTERS = [
  { key: 'all', label: 'asset.all' },
  { key: 'video', label: 'asset.video' },
  { key: 'audio', label: 'asset.audio' },
  { key: 'image', label: 'asset.image' },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDuration(ms: number | null): string {
  if (!ms) return '';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export default function AssetLibrary() {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [view, setView] = useState<'library' | 'external'>('library');

  const {
    assets,
    loading,
    uploads,
    searchQuery,
    filterType,
    fetchAssets,
    uploadAsset,
    uploadMultiple,
    deleteAsset,
    setSearchQuery,
    setFilterType,
    getFilteredAssets,
  } = useAssetStore();

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const handleFileSelect = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      uploadMultiple(Array.from(files));
    },
    [uploadMultiple]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFileSelect(files);
      }
    },
    [handleFileSelect]
  );

  const handleAssetDragStart = useCallback((e: React.DragEvent, asset: Asset) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      id: asset.id,
      type: asset.asset_type,
      filename: asset.original_filename,
      duration_ms: asset.duration_ms,
      mime_type: asset.mime_type,
    }));
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  const filteredAssets = getFilteredAssets();

  // Pagination
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  const paginatedAssets = useMemo(
    () => filteredAssets.slice(0, page * PAGE_SIZE),
    [filteredAssets, page]
  );
  const hasMore = filteredAssets.length > page * PAGE_SIZE;

  // Reset page on filter/search change
  useEffect(() => { setPage(1); }, [searchQuery, filterType]);

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface)]">
      {/* View toggle */}
      <div className="flex gap-1 px-3 py-2 border-b border-[var(--color-border)]">
        <button
          onClick={() => setView('library')}
          className={`px-2 py-0.5 text-xs rounded ${
            view === 'library'
              ? 'bg-[var(--color-primary)] text-white'
              : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]'
          }`}
        >
          {t('asset.myAssets')}
        </button>
        <button
          onClick={() => setView('external')}
          className={`px-2 py-0.5 text-xs rounded ${
            view === 'external'
              ? 'bg-[var(--color-primary)] text-white'
              : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]'
          }`}
        >
          {t('asset.external')}
        </button>
      </div>

      {view === 'external' ? (
        <ExternalBrowser />
      ) : (
        <>
          {/* Search */}
          <div className="p-3 border-b border-[var(--color-border)]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('asset.search')}
              className="w-full px-3 py-1.5 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-[var(--color-text)] placeholder:text-[var(--color-text-secondary)]"
            />
          </div>

          {/* Type filters */}
          <div className="flex gap-1 px-3 py-2 border-b border-[var(--color-border)]">
            {TYPE_FILTERS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilterType(key === 'all' ? null : key)}
                className={`px-2 py-0.5 text-xs rounded ${
                  (filterType === key || (!filterType && key === 'all'))
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]'
                }`}
              >
                {t(label)}
              </button>
            ))}
          </div>

          {/* Upload zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`mx-3 mt-3 p-4 border-2 border-dashed rounded cursor-pointer text-center text-sm transition-colors ${
              isDragOver
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]'
            }`}
          >
            <svg className="w-6 h-6 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            {t('asset.upload')}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="video/*,audio/*,image/*"
              onChange={(e) => handleFileSelect(e.target.files)}
              className="hidden"
            />
          </div>

          {/* Upload progress */}
          {uploads.size > 0 && (
            <div className="px-3 py-2 space-y-1">
              {Array.from(uploads.entries()).map(([id, upload]) => (
                <div key={id} className="flex items-center gap-2 text-xs">
                  <span className="truncate flex-1 text-[var(--color-text-secondary)]">
                    {upload.file.name}
                  </span>
                  {upload.status === 'uploading' && (
                    <div className="w-16 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--color-primary)] transition-all"
                        style={{ width: `${upload.progress}%` }}
                      />
                    </div>
                  )}
                  {upload.status === 'done' && (
                    <span className="text-green-500">✓</span>
                  )}
                  {upload.status === 'error' && (
                    <span className="text-red-500" title={upload.error}>✗</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Asset grid */}
          <div className="flex-1 overflow-y-auto p-3">
            {loading && assets.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-sm text-[var(--color-text-secondary)]">
                {t('common.loading')}
              </div>
            ) : filteredAssets.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-sm text-[var(--color-text-secondary)]">
                {t('asset.empty')}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {paginatedAssets.map((asset) => (
                  <div
                    key={asset.id}
                    draggable
                    onDragStart={(e) => handleAssetDragStart(e, asset)}
                    className="group relative bg-[var(--color-bg)] rounded overflow-hidden border border-[var(--color-border)] hover:border-[var(--color-primary)] cursor-grab active:cursor-grabbing"
                  >
                    {/* Thumbnail */}
                    <div className="aspect-video bg-black/50 flex items-center justify-center overflow-hidden">
                      {asset.thumbnail_url ? (
                        <img
                          src={asset.thumbnail_url}
                          alt={asset.original_filename}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-2xl">
                          {asset.asset_type === 'video' ? '🎬' : asset.asset_type === 'audio' ? '🎵' : '🖼'}
                        </span>
                      )}
                      {/* Duration badge */}
                      {asset.duration_ms && (
                        <span className="absolute bottom-1 right-1 px-1 py-0.5 text-[10px] bg-black/70 text-white rounded">
                          {formatDuration(asset.duration_ms)}
                        </span>
                      )}
                    </div>
                    {/* Info */}
                    <div className="p-1.5">
                      <p className="text-xs truncate text-[var(--color-text)]">
                        {asset.original_filename}
                      </p>
                      <p className="text-[10px] text-[var(--color-text-secondary)]">
                        {formatFileSize(asset.file_size)}
                      </p>
                    </div>
                    {/* Delete button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteAsset(asset.id);
                      }}
                      className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            {hasMore && (
              <button
                onClick={() => setPage(p => p + 1)}
                className="w-full py-2 mt-2 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
              >
                {t('asset.loadMore')} ({filteredAssets.length - page * PAGE_SIZE})
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
