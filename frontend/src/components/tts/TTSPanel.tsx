import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnalyzerStore } from '@/store/analyzerStore';
import VoiceProfileManager from './VoiceProfileManager';
import SegmentVoiceSelector from './SegmentVoiceSelector';
import VoicePreviewPlayer from './VoicePreviewPlayer';

type TTSTab = 'generate' | 'profiles' | 'multiVoice';

export default function TTSPanel() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TTSTab>('generate');

  const tabs: { key: TTSTab; label: string }[] = [
    { key: 'generate', label: t('tts.title') },
    { key: 'profiles', label: t('voiceProfile.title') },
    { key: 'multiVoice', label: t('tts.multiVoice') },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Internal tab bar */}
      <div className="flex border-b border-white/10">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-2 py-2 text-xs transition-colors ${
              activeTab === tab.key
                ? 'border-b-2 border-[var(--accent)] text-[var(--accent)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'generate' && <TTSGenerateTab />}
        {activeTab === 'profiles' && <VoiceProfileManager />}
        {activeTab === 'multiVoice' && <SegmentVoiceSelector />}
      </div>
    </div>
  );
}


function TTSGenerateTab() {
  const { t } = useTranslation();
  const {
    voices,
    voiceProfiles,
    ttsJobId,
    previewAudioUrl,
    fetchVoices,
    fetchVoiceProfiles,
    startTTS,
    previewVoice,
    pollJob,
  } = useAnalyzerStore();

  const [text, setText] = useState('');
  const [mode, setMode] = useState<'builtin' | 'profile'>('builtin');
  const [selectedVoice, setSelectedVoice] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [error, setError] = useState('');
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    fetchVoices();
    fetchVoiceProfiles();
  }, [fetchVoices, fetchVoiceProfiles]);

  useEffect(() => {
    if (voices.length > 0 && !selectedVoice) {
      setSelectedVoice(voices[0].voice_id);
    }
  }, [voices, selectedVoice]);

  useEffect(() => {
    if (voiceProfiles.length > 0 && !selectedProfileId) {
      const def = voiceProfiles.find((p) => p.is_default);
      setSelectedProfileId(def?.id || voiceProfiles[0]?.id || null);
    }
  }, [voiceProfiles, selectedProfileId]);

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
    if (!text.trim()) return;
    setLoading(true);
    setError('');
    setDownloadUrl('');
    setProgress(0);
    try {
      if (mode === 'profile' && selectedProfileId) {
        // Use voice profile — still dispatches via the same generate endpoint
        // but with voice_profile_id in input_params
        await startTTS(text.trim(), undefined);
      } else {
        await startTTS(text.trim(), selectedVoice || undefined);
      }
    } catch {
      setLoading(false);
      setError(t('tts.failed'));
    }
  }, [text, mode, selectedVoice, selectedProfileId, startTTS, t]);

  const handlePreview = useCallback(async () => {
    if (!text.trim()) return;
    setPreviewing(true);
    try {
      if (mode === 'profile' && selectedProfileId) {
        await previewVoice(text.trim().slice(0, 200), selectedProfileId);
      } else {
        await previewVoice(text.trim().slice(0, 200), undefined, selectedVoice);
      }
    } catch {
      // Ignore preview errors
    } finally {
      setPreviewing(false);
    }
  }, [text, mode, selectedVoice, selectedProfileId, previewVoice]);

  return (
    <div className="flex flex-col gap-3">
      {/* Text input */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('tts.placeholder')}
        className="min-h-[80px] w-full resize-none rounded bg-white/5 px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
        disabled={loading}
      />

      {/* Mode toggle */}
      <div className="flex gap-3">
        <label className="flex items-center gap-1.5 text-xs text-[var(--text-primary)]">
          <input
            type="radio"
            checked={mode === 'builtin'}
            onChange={() => setMode('builtin')}
          />
          {t('tts.useBuiltinVoice')}
        </label>
        <label className={`flex items-center gap-1.5 text-xs ${voiceProfiles.length > 0 ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] opacity-50'}`}>
          <input
            type="radio"
            checked={mode === 'profile'}
            onChange={() => setMode('profile')}
            disabled={voiceProfiles.length === 0}
          />
          {t('tts.useVoiceProfile')}
        </label>
      </div>

      {/* Voice selector */}
      {mode === 'builtin' ? (
        <select
          value={selectedVoice}
          onChange={(e) => setSelectedVoice(e.target.value)}
          className="w-full rounded bg-white/5 px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
          disabled={loading}
        >
          {voices.map((v) => (
            <option key={v.voice_id} value={v.voice_id}>{v.label}</option>
          ))}
        </select>
      ) : (
        <select
          value={selectedProfileId || ''}
          onChange={(e) => setSelectedProfileId(Number(e.target.value) || null)}
          className="w-full rounded bg-white/5 px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
          disabled={loading}
        >
          {voiceProfiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.provider === 'edge_tts' ? 'Edge' : 'Fish'})
            </option>
          ))}
        </select>
      )}

      {/* Preview + Generate buttons */}
      <div className="flex gap-2">
        <button
          onClick={handlePreview}
          disabled={previewing || loading || !text.trim()}
          className="rounded border border-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/10 disabled:opacity-50"
        >
          {previewing ? t('tts.previewing') : t('tts.preview')}
        </button>
        <button
          onClick={handleGenerate}
          disabled={loading || !text.trim()}
          className="flex-1 rounded bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent)]/80 disabled:opacity-50"
        >
          {loading ? t('tts.generating') : t('tts.generate')}
        </button>
      </div>

      {/* Preview player */}
      {previewAudioUrl && <VoicePreviewPlayer />}

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
