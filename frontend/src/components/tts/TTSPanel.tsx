import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnalyzerStore } from '@/store/analyzerStore';

export default function TTSPanel() {
  const { t } = useTranslation();
  const { voices, ttsJobId, fetchVoices, startTTS, pollJob } =
    useAnalyzerStore();

  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchVoices();
  }, [fetchVoices]);

  // Set default voice when voices load
  useEffect(() => {
    if (voices.length > 0 && !selectedVoice) {
      setSelectedVoice(voices[0].voice_id);
    }
  }, [voices, selectedVoice]);

  // Poll for TTS job
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
          if (result?.download_url) {
            setDownloadUrl(result.download_url);
          }
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
    if (!text.trim()) return;
    setLoading(true);
    setError('');
    setDownloadUrl('');
    setProgress(0);
    try {
      await startTTS(text.trim(), selectedVoice || undefined);
    } catch {
      setLoading(false);
      setError(t('tts.failed'));
    }
  }, [text, selectedVoice, startTTS, t]);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <h3 className="text-sm font-medium text-[var(--text-primary)]">
        {t('tts.title')}
      </h3>

      {/* Text input */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('tts.placeholder')}
        className="min-h-[80px] w-full resize-none rounded bg-white/5 px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
        disabled={loading}
      />

      {/* Voice selector */}
      <select
        value={selectedVoice}
        onChange={(e) => setSelectedVoice(e.target.value)}
        className="w-full rounded bg-white/5 px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
        disabled={loading}
      >
        {voices.map((v) => (
          <option key={v.voice_id} value={v.voice_id}>
            {v.label}
          </option>
        ))}
      </select>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={loading || !text.trim()}
        className="rounded bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent)]/80 disabled:opacity-50"
      >
        {loading ? t('tts.generating') : t('tts.generate')}
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

      {/* Download link */}
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

      {/* Error */}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
