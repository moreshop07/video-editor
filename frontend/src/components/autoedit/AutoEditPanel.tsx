import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnalyzerStore } from '@/store/analyzerStore';
import { useAssetStore } from '@/store';

export default function AutoEditPanel() {
  const { t } = useTranslation();
  const { startSilenceRemoval, startJumpCut, pollJob } = useAnalyzerStore();
  const assets = useAssetStore((s) => s.assets);

  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [operation, setOperation] = useState<'silence_removal' | 'jump_cut'>('silence_removal');
  const [margin, setMargin] = useState(0.3);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState('');

  const videoAssets = assets.filter((a) => a.asset_type === 'video');

  const [jobId, setJobId] = useState<number | null>(null);

  // Poll for job progress
  useEffect(() => {
    if (!jobId) return;
    const interval = setInterval(async () => {
      try {
        const job = await pollJob(jobId);
        setProgress(job.progress as number);
        if (job.status === 'completed') {
          setLoading(false);
          setCompleted(true);
          setJobId(null);
          clearInterval(interval);
        } else if (job.status === 'failed') {
          setLoading(false);
          setError(job.error_message as string || t('autoEdit.failed'));
          setJobId(null);
          clearInterval(interval);
        }
      } catch {
        clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [jobId, pollJob, t]);

  const handleStart = useCallback(async () => {
    if (!selectedAssetId) return;
    setLoading(true);
    setError('');
    setCompleted(false);
    setProgress(0);
    try {
      let id: number;
      if (operation === 'jump_cut') {
        id = await startJumpCut(selectedAssetId);
      } else {
        id = await startSilenceRemoval(selectedAssetId, margin);
      }
      setJobId(id);
    } catch {
      setLoading(false);
      setError(t('autoEdit.failed'));
    }
  }, [selectedAssetId, operation, margin, startSilenceRemoval, startJumpCut, t]);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <h3 className="text-sm font-medium text-[var(--text-primary)]">
        {t('autoEdit.title')}
      </h3>

      {/* Asset selector */}
      <select
        value={selectedAssetId ?? ''}
        onChange={(e) => setSelectedAssetId(e.target.value ? Number(e.target.value) : null)}
        className="w-full rounded bg-white/5 px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
        disabled={loading}
      >
        <option value="">{t('autoEdit.selectAsset')}</option>
        {videoAssets.map((a) => (
          <option key={a.id} value={a.id}>
            {a.original_filename}
          </option>
        ))}
      </select>

      {/* Operation selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setOperation('silence_removal')}
          className={`flex-1 rounded px-2 py-1.5 text-xs transition-colors ${
            operation === 'silence_removal'
              ? 'bg-[var(--accent)] text-white'
              : 'bg-white/5 text-[var(--text-secondary)]'
          }`}
        >
          {t('autoEdit.silenceRemoval')}
        </button>
        <button
          onClick={() => setOperation('jump_cut')}
          className={`flex-1 rounded px-2 py-1.5 text-xs transition-colors ${
            operation === 'jump_cut'
              ? 'bg-[var(--accent)] text-white'
              : 'bg-white/5 text-[var(--text-secondary)]'
          }`}
        >
          {t('autoEdit.jumpCut')}
        </button>
      </div>

      {/* Margin slider (silence removal only) */}
      {operation === 'silence_removal' && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--text-secondary)]">
            {t('autoEdit.margin')}: {margin.toFixed(1)}s
          </label>
          <input
            type="range"
            min={0.05}
            max={1.0}
            step={0.05}
            value={margin}
            onChange={(e) => setMargin(Number(e.target.value))}
            className="w-full"
          />
        </div>
      )}

      {/* Start button */}
      <button
        onClick={handleStart}
        disabled={!selectedAssetId || loading}
        className="rounded bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent)]/80 disabled:opacity-50"
      >
        {loading ? t('autoEdit.processing') : t('autoEdit.start')}
      </button>

      {/* Progress */}
      {loading && (
        <div className="h-2 w-full rounded bg-white/10">
          <div
            className="h-full rounded bg-[var(--accent)] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Completed */}
      {completed && (
        <p className="text-xs text-green-400">{t('autoEdit.completed')}</p>
      )}

      {/* Error */}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
