import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { audioProcessingApi, processingApi } from '@/api/client';

type JobState = 'idle' | 'processing' | 'completed' | 'failed';

interface AudioProcessingPanelProps {
  assetId: string;
}

export default function AudioProcessingPanel({ assetId }: AudioProcessingPanelProps) {
  const { t } = useTranslation();
  const [denoiseState, setDenoiseState] = useState<JobState>('idle');
  const [normalizeState, setNormalizeState] = useState<JobState>('idle');
  const [denoiseProgress, setDenoiseProgress] = useState(0);
  const [normalizeProgress, setNormalizeProgress] = useState(0);

  const pollJob = useCallback(async (jobId: number, onProgress: (p: number) => void, onDone: (state: JobState) => void) => {
    const poll = async () => {
      try {
        const res = await processingApi.getJob(jobId);
        const job = res.data;
        onProgress(job.progress ?? 0);

        if (job.status === 'completed') {
          onDone('completed');
          return;
        }
        if (job.status === 'failed') {
          onDone('failed');
          return;
        }
        setTimeout(poll, 2000);
      } catch {
        onDone('failed');
      }
    };
    poll();
  }, []);

  const handleDenoise = useCallback(async () => {
    if (denoiseState === 'processing') return;
    setDenoiseState('processing');
    setDenoiseProgress(0);
    try {
      const res = await audioProcessingApi.noiseReduction({
        asset_id: Number(assetId),
        operation: 'noise_reduction',
      });
      const jobId = res.data.id;
      pollJob(jobId, setDenoiseProgress, setDenoiseState);
    } catch {
      setDenoiseState('failed');
    }
  }, [assetId, denoiseState, pollJob]);

  const handleNormalize = useCallback(async () => {
    if (normalizeState === 'processing') return;
    setNormalizeState('processing');
    setNormalizeProgress(0);
    try {
      const res = await audioProcessingApi.normalize({
        asset_id: Number(assetId),
        operation: 'normalize',
      });
      const jobId = res.data.id;
      pollJob(jobId, setNormalizeProgress, setNormalizeState);
    } catch {
      setNormalizeState('failed');
    }
  }, [assetId, normalizeState, pollJob]);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
        {t('audioProcessing.title')}
      </div>

      {/* Denoise */}
      <div className="flex flex-col gap-1">
        <button
          onClick={handleDenoise}
          disabled={denoiseState === 'processing'}
          className="flex items-center gap-1.5 rounded border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] text-[var(--color-text)] hover:bg-white/10 disabled:opacity-50"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
          </svg>
          {t('audioProcessing.denoise')}
        </button>
        {denoiseState === 'processing' && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 rounded bg-white/10">
              <div className="h-full rounded bg-[var(--accent)]" style={{ width: `${denoiseProgress}%` }} />
            </div>
            <span className="text-[9px] text-[var(--color-text-secondary)]">{denoiseProgress}%</span>
          </div>
        )}
        {denoiseState === 'completed' && (
          <span className="text-[9px] text-green-400">{t('audioProcessing.completed')}</span>
        )}
        {denoiseState === 'failed' && (
          <span className="text-[9px] text-red-400">{t('audioProcessing.failed')}</span>
        )}
      </div>

      {/* Normalize */}
      <div className="flex flex-col gap-1">
        <button
          onClick={handleNormalize}
          disabled={normalizeState === 'processing'}
          className="flex items-center gap-1.5 rounded border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] text-[var(--color-text)] hover:bg-white/10 disabled:opacity-50"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4h18M3 8h18M3 12h12M3 16h6M3 20h3" />
          </svg>
          {t('audioProcessing.normalize')}
        </button>
        {normalizeState === 'processing' && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 rounded bg-white/10">
              <div className="h-full rounded bg-[var(--accent)]" style={{ width: `${normalizeProgress}%` }} />
            </div>
            <span className="text-[9px] text-[var(--color-text-secondary)]">{normalizeProgress}%</span>
          </div>
        )}
        {normalizeState === 'completed' && (
          <span className="text-[9px] text-green-400">{t('audioProcessing.completed')}</span>
        )}
        {normalizeState === 'failed' && (
          <span className="text-[9px] text-red-400">{t('audioProcessing.failed')}</span>
        )}
      </div>
    </div>
  );
}
