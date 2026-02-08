import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnalyzerStore } from '@/store/analyzerStore';
import { useAssetStore } from '@/store';

export default function VideoAnalyzerPanel() {
  const { t } = useTranslation();
  const { analyses, analysisLoading, startAnalysis, fetchAnalysis, pollJob } =
    useAnalyzerStore();
  const assets = useAssetStore((s) => s.assets);

  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [jobId, setJobId] = useState<number | null>(null);

  const videoAssets = assets.filter((a) => a.asset_type === 'video');
  const analysis = selectedAssetId ? analyses[selectedAssetId] : null;
  const isLoading = selectedAssetId ? analysisLoading[selectedAssetId] : false;

  // Poll for analysis progress
  useEffect(() => {
    if (!jobId) return;
    const interval = setInterval(async () => {
      try {
        const job = await pollJob(jobId);
        if (job.status === 'completed' && selectedAssetId) {
          fetchAnalysis(selectedAssetId);
          setJobId(null);
          clearInterval(interval);
        } else if (job.status === 'failed') {
          setJobId(null);
          clearInterval(interval);
        }
      } catch {
        clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [jobId, selectedAssetId, pollJob, fetchAnalysis]);

  const handleAnalyze = useCallback(async () => {
    if (!selectedAssetId) return;
    try {
      const id = await startAnalysis(selectedAssetId);
      setJobId(id);
    } catch {
      // error handled by store
    }
  }, [selectedAssetId, startAnalysis]);

  // Load existing analysis when asset selected
  useEffect(() => {
    if (selectedAssetId && !analyses[selectedAssetId]) {
      fetchAnalysis(selectedAssetId).catch(() => {});
    }
  }, [selectedAssetId, analyses, fetchAnalysis]);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <h3 className="text-sm font-medium text-[var(--text-primary)]">
        {t('analyzer.title')}
      </h3>

      {/* Asset selector */}
      <select
        value={selectedAssetId ?? ''}
        onChange={(e) => setSelectedAssetId(e.target.value ? Number(e.target.value) : null)}
        className="w-full rounded bg-white/5 px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
      >
        <option value="">{t('analyzer.selectAsset')}</option>
        {videoAssets.map((a) => (
          <option key={a.id} value={a.id}>
            {a.original_filename}
          </option>
        ))}
      </select>

      {/* Analyze button */}
      <button
        onClick={handleAnalyze}
        disabled={!selectedAssetId || isLoading || !!jobId}
        className="rounded bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent)]/80 disabled:opacity-50"
      >
        {isLoading || jobId ? t('analyzer.analyzing') : t('analyzer.analyze')}
      </button>

      {/* Results */}
      {analysis && (
        <div className="flex flex-col gap-3">
          {/* Scenes */}
          {analysis.scenes && (
            <section>
              <h4 className="mb-1 text-xs font-medium text-[var(--text-secondary)]">
                {t('analyzer.scenes')} ({analysis.scenes.length})
              </h4>
              <div className="max-h-32 overflow-y-auto rounded bg-white/5 p-2">
                {analysis.scenes.map((s, i) => (
                  <div key={i} className="flex justify-between text-xs text-[var(--text-primary)]">
                    <span>#{i + 1}</span>
                    <span>{s.start.toFixed(1)}s - {s.end.toFixed(1)}s</span>
                    <span>{s.duration.toFixed(1)}s</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Audio */}
          {analysis.audio_analysis && (
            <section>
              <h4 className="mb-1 text-xs font-medium text-[var(--text-secondary)]">
                {t('analyzer.audio')}
              </h4>
              <div className="grid grid-cols-2 gap-1 rounded bg-white/5 p-2 text-xs text-[var(--text-primary)]">
                <span>BPM: {analysis.audio_analysis.bpm.toFixed(0)}</span>
                <span>RMS: {analysis.audio_analysis.rms.toFixed(3)}</span>
                <span>{t('analyzer.duration')}: {analysis.audio_analysis.duration.toFixed(1)}s</span>
                <span>{t('analyzer.spectral')}: {analysis.audio_analysis.spectral_centroid.toFixed(0)}</span>
              </div>
            </section>
          )}

          {/* Hooks */}
          {analysis.hook_analysis && (
            <section>
              <h4 className="mb-1 text-xs font-medium text-[var(--text-secondary)]">
                {t('analyzer.hooks')}
              </h4>
              <div className="rounded bg-white/5 p-2 text-xs text-[var(--text-primary)]">
                <div className="flex justify-between">
                  <span>{t('analyzer.hookScore')}</span>
                  <span className={analysis.hook_analysis.hook_score > 60 ? 'text-green-400' : 'text-yellow-400'}>
                    {analysis.hook_analysis.hook_score}/100
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{t('analyzer.hasHook')}</span>
                  <span>{analysis.hook_analysis.has_hook ? '✓' : '✗'}</span>
                </div>
              </div>
            </section>
          )}

          {/* Rhythm */}
          {analysis.rhythm_analysis && (
            <section>
              <h4 className="mb-1 text-xs font-medium text-[var(--text-secondary)]">
                {t('analyzer.rhythm')}
              </h4>
              <div className="rounded bg-white/5 p-2 text-xs text-[var(--text-primary)]">
                <div className="flex justify-between">
                  <span>{t('analyzer.pace')}</span>
                  <span>{analysis.rhythm_analysis.pace}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('analyzer.avgScene')}</span>
                  <span>{analysis.rhythm_analysis.avg_scene_duration}s</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('analyzer.sceneCount')}</span>
                  <span>{analysis.rhythm_analysis.scene_count}</span>
                </div>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
