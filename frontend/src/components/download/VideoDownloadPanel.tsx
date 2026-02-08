import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnalyzerStore } from '@/store/analyzerStore';

export default function VideoDownloadPanel() {
  const { t } = useTranslation();
  const {
    downloads,
    downloadJobId,
    startDownload,
    fetchDownloads,
    pollJob,
  } = useAnalyzerStore();

  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchDownloads();
  }, [fetchDownloads]);

  // Poll for download progress
  useEffect(() => {
    if (!downloadJobId) return;
    const interval = setInterval(async () => {
      try {
        const job = await pollJob(downloadJobId);
        setProgress(job.progress as number);
        if (job.status === 'completed') {
          setLoading(false);
          setProgress(100);
          fetchDownloads();
          clearInterval(interval);
        } else if (job.status === 'failed') {
          setLoading(false);
          setError(job.error_message as string || t('download.failed'));
          clearInterval(interval);
        }
      } catch {
        clearInterval(interval);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [downloadJobId, pollJob, fetchDownloads, t]);

  const handleDownload = useCallback(async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError('');
    setProgress(0);
    try {
      await startDownload(url.trim());
    } catch {
      setLoading(false);
      setError(t('download.failed'));
    }
  }, [url, startDownload, t]);

  const detectPlatform = (inputUrl: string): string => {
    if (/youtube\.com|youtu\.be/.test(inputUrl)) return 'YouTube';
    if (/instagram\.com/.test(inputUrl)) return 'Instagram';
    if (/tiktok\.com/.test(inputUrl)) return 'TikTok';
    if (/bilibili\.com/.test(inputUrl)) return 'Bilibili';
    if (/twitter\.com|x\.com/.test(inputUrl)) return 'Twitter/X';
    if (/facebook\.com|fb\.watch/.test(inputUrl)) return 'Facebook';
    return '';
  };

  const platform = detectPlatform(url);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <h3 className="text-sm font-medium text-[var(--text-primary)]">
        {t('download.title')}
      </h3>

      {/* URL Input */}
      <div className="flex flex-col gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t('download.urlPlaceholder')}
          className="w-full rounded bg-white/5 px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
          disabled={loading}
        />
        {platform && (
          <span className="text-xs text-[var(--accent)]">
            {t('download.platform')}: {platform}
          </span>
        )}
      </div>

      {/* Download button */}
      <button
        onClick={handleDownload}
        disabled={loading || !url.trim()}
        className="rounded bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent)]/80 disabled:opacity-50"
      >
        {loading ? t('download.downloading') : t('download.start')}
      </button>

      {/* Progress bar */}
      {loading && (
        <div className="h-2 w-full rounded bg-white/10">
          <div
            className="h-full rounded bg-[var(--accent)] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {/* Downloaded videos list */}
      {downloads.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          <h4 className="text-xs font-medium text-[var(--text-secondary)]">
            {t('download.history')}
          </h4>
          {downloads.map((dl) => (
            <div
              key={dl.id}
              className="flex items-center gap-2 rounded bg-white/5 p-2 text-xs"
            >
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase text-[var(--text-secondary)]">
                {dl.platform}
              </span>
              <span className="flex-1 truncate text-[var(--text-primary)]">
                {dl.title || dl.source_url}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
