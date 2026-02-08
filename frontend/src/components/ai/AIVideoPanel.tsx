import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { aiVideoApi, processingApi } from '@/api/client';
import { useAssetStore } from '@/store/assetStore';

type TaskType = 'wan26-txt2video' | 'wan26-img2video';

export default function AIVideoPanel() {
  const { t } = useTranslation();
  const fetchAssets = useAssetStore((s) => s.fetchAssets);
  const assets = useAssetStore((s) => s.assets);

  const [mode, setMode] = useState<TaskType>('wan26-txt2video');
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [resolution, setResolution] = useState('720P');
  const [duration, setDuration] = useState(5);
  const [aspectRatio, setAspectRatio] = useState('16:9');

  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(false);

  // Image assets for img2video source selection
  const imageAssets = assets.filter((a) => a.asset_type === 'image');

  // Poll job progress
  useEffect(() => {
    if (!jobId) return;
    const interval = setInterval(async () => {
      try {
        const { data: job } = await processingApi.getJob(jobId);
        setProgress(job.progress ?? 0);
        if (job.status === 'completed') {
          setLoading(false);
          setProgress(100);
          setCompleted(true);
          setStatusText('');
          fetchAssets();
          clearInterval(interval);
        } else if (job.status === 'failed') {
          setLoading(false);
          setError(job.error_message || t('aiVideo.failed'));
          setStatusText('');
          clearInterval(interval);
        }
      } catch {
        clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [jobId, fetchAssets, t]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError('');
    setProgress(0);
    setCompleted(false);
    setStatusText(t('aiVideo.generating'));
    try {
      const { data } = await aiVideoApi.generate({
        task_type: mode,
        prompt: prompt.trim(),
        image_url: mode === 'wan26-img2video' ? imageUrl : undefined,
        resolution,
        duration,
        aspect_ratio: aspectRatio,
      });
      setJobId(data.id);
    } catch (err: unknown) {
      setLoading(false);
      setStatusText('');
      const msg = err instanceof Error ? err.message : t('aiVideo.failed');
      setError(msg);
    }
  }, [prompt, mode, imageUrl, resolution, duration, aspectRatio, t]);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <h3 className="text-sm font-medium text-[var(--text-primary)]">
        {t('aiVideo.title')}
      </h3>

      {/* Mode toggle */}
      <div className="flex gap-1 rounded bg-white/5 p-0.5">
        <button
          onClick={() => setMode('wan26-txt2video')}
          className={`flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
            mode === 'wan26-txt2video'
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {t('aiVideo.textToVideo')}
        </button>
        <button
          onClick={() => setMode('wan26-img2video')}
          className={`flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
            mode === 'wan26-img2video'
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {t('aiVideo.imageToVideo')}
        </button>
      </div>

      {/* Prompt */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-[var(--text-secondary)]">
          {t('aiVideo.prompt')}
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t('aiVideo.promptPlaceholder')}
          rows={3}
          disabled={loading}
          className="w-full resize-none rounded bg-white/5 px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
      </div>

      {/* Image selector for img2video */}
      {mode === 'wan26-img2video' && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--text-secondary)]">
            {t('aiVideo.selectImage')}
          </label>
          {imageAssets.length > 0 ? (
            <select
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              disabled={loading}
              className="w-full rounded bg-white/5 px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
            >
              <option value="">{t('aiVideo.selectImage')}</option>
              {imageAssets.map((a) => (
                <option key={a.id} value={a.url || a.file_path}>
                  {a.original_filename || a.filename}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
              disabled={loading}
              className="w-full rounded bg-white/5 px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
          )}
        </div>
      )}

      {/* Settings */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-[var(--text-secondary)]">
            {t('aiVideo.resolution')}
          </label>
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            disabled={loading}
            className="rounded bg-white/5 px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none"
          >
            <option value="720P">720P</option>
            <option value="1080P">1080P</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-[var(--text-secondary)]">
            {t('aiVideo.duration')}
          </label>
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            disabled={loading}
            className="rounded bg-white/5 px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none"
          >
            <option value={5}>5 {t('aiVideo.seconds')}</option>
            <option value={10}>10 {t('aiVideo.seconds')}</option>
            <option value={15}>15 {t('aiVideo.seconds')}</option>
          </select>
        </div>

        <div className="col-span-2 flex flex-col gap-1">
          <label className="text-[10px] text-[var(--text-secondary)]">
            {t('aiVideo.aspectRatio')}
          </label>
          <div className="flex gap-1">
            {['16:9', '9:16', '1:1', '4:3', '3:4'].map((ar) => (
              <button
                key={ar}
                onClick={() => setAspectRatio(ar)}
                disabled={loading}
                className={`flex-1 rounded px-1 py-1 text-[10px] transition-colors ${
                  aspectRatio === ar
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-white/5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {ar}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={loading || !prompt.trim() || (mode === 'wan26-img2video' && !imageUrl)}
        className="rounded bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent)]/80 disabled:opacity-50"
      >
        {loading ? t('aiVideo.generating') : t('aiVideo.generate')}
      </button>

      {/* Progress */}
      {loading && (
        <div className="flex flex-col gap-1">
          <div className="h-2 w-full rounded bg-white/10">
            <div
              className="h-full rounded bg-[var(--accent)] transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          {statusText && (
            <p className="text-[10px] text-[var(--text-secondary)]">{statusText}</p>
          )}
        </div>
      )}

      {/* Completed */}
      {completed && (
        <p className="text-xs text-green-400">{t('aiVideo.completed')}</p>
      )}

      {/* Error */}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
