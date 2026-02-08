import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnalyzerStore } from '@/store/analyzerStore';
import { useSubtitleStore } from '@/store/subtitleStore';
import { useProjectStore } from '@/store/projectStore';

export default function SegmentVoiceSelector() {
  const { t } = useTranslation();
  const {
    voiceProfiles,
    fetchVoiceProfiles,
    ttsJobId,
    pollJob,
    startVoiceoverMultiVoice,
  } = useAnalyzerStore();
  const { tracks, activeTrackId } = useSubtitleStore();
  const projectId = useProjectStore((s) => s.currentProject?.id);

  const [defaultProfileId, setDefaultProfileId] = useState<number | undefined>();
  const [segmentVoices, setSegmentVoices] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');

  useEffect(() => {
    fetchVoiceProfiles();
  }, [fetchVoiceProfiles]);

  // Set default profile
  useEffect(() => {
    if (voiceProfiles.length > 0 && !defaultProfileId) {
      const def = voiceProfiles.find((p) => p.is_default);
      setDefaultProfileId(def?.id || voiceProfiles[0].id);
    }
  }, [voiceProfiles, defaultProfileId]);

  // Find active track segments
  const activeTrack = tracks.find((tr) => tr.id === activeTrackId);
  const segments = activeTrack?.segments || [];

  // Poll for job completion
  useEffect(() => {
    if (!ttsJobId || !loading) return;
    const interval = setInterval(async () => {
      try {
        const job = await pollJob(ttsJobId);
        setProgress(job.progress as number);
        if (job.status === 'completed') {
          setLoading(false);
          setProgress(100);
          const result = job.result as Record<string, string> | null;
          if (result?.download_url) setDownloadUrl(result.download_url);
          clearInterval(interval);
        } else if (job.status === 'failed') {
          setLoading(false);
          setError(job.error_message as string || t('tts.failed'));
          clearInterval(interval);
        }
      } catch {
        clearInterval(interval);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [ttsJobId, loading, pollJob, t]);

  const handleGenerate = useCallback(async () => {
    if (!activeTrackId || !projectId) return;
    setLoading(true);
    setError('');
    setDownloadUrl('');
    setProgress(0);
    try {
      // Filter out segments that use default (no override)
      const overrides: Record<number, number> = {};
      for (const [idx, profId] of Object.entries(segmentVoices)) {
        if (profId) overrides[Number(idx)] = profId;
      }
      await startVoiceoverMultiVoice(
        activeTrackId,
        projectId,
        defaultProfileId,
        Object.keys(overrides).length > 0 ? overrides : undefined,
      );
    } catch {
      setLoading(false);
      setError(t('tts.failed'));
    }
  }, [activeTrackId, projectId, defaultProfileId, segmentVoices, startVoiceoverMultiVoice, t]);

  if (!activeTrack) {
    return (
      <p className="text-xs text-[var(--text-secondary)]">
        {t('tts.segmentVoices')} — {t('subtitles')} track required
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Default voice */}
      <div>
        <label className="mb-1 block text-xs text-[var(--text-secondary)]">
          {t('tts.defaultVoice')}
        </label>
        <select
          value={defaultProfileId || ''}
          onChange={(e) => setDefaultProfileId(Number(e.target.value) || undefined)}
          className="w-full rounded bg-white/5 px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none"
          disabled={loading}
        >
          {voiceProfiles.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.provider === 'edge_tts' ? 'Edge' : 'Fish'})</option>
          ))}
        </select>
      </div>

      {/* Per-segment voices */}
      <div className="max-h-[300px] overflow-y-auto">
        <label className="mb-1 block text-xs text-[var(--text-secondary)]">
          {t('tts.segmentVoices')}
        </label>
        <div className="flex flex-col gap-1">
          {segments.map((seg, idx) => (
            <div key={seg.id || idx} className="flex items-center gap-2 rounded bg-white/5 px-2 py-1.5">
              <span className="w-5 text-right text-[10px] text-[var(--text-secondary)]">#{idx + 1}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-primary)]">
                {seg.text}
              </span>
              <select
                value={segmentVoices[idx] || ''}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setSegmentVoices((prev) => {
                    const next = { ...prev };
                    if (val) next[idx] = val;
                    else delete next[idx];
                    return next;
                  });
                }}
                className="w-28 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-[var(--text-primary)] outline-none"
                disabled={loading}
              >
                <option value="">{t('tts.inheritDefault')}</option>
                {voiceProfiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={loading || !defaultProfileId || segments.length === 0}
        className="rounded bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent)]/80 disabled:opacity-50"
      >
        {loading ? t('tts.generating') : t('tts.generateMultiVoice')}
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

      {/* Download */}
      {downloadUrl && (
        <a
          href={downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded bg-green-600 px-3 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-green-500"
        >
          {t('tts.download')}
        </a>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
