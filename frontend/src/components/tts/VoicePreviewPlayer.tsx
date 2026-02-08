import { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnalyzerStore } from '@/store/analyzerStore';

export default function VoicePreviewPlayer() {
  const { t } = useTranslation();
  const { previewAudioUrl, clearPreviewAudio } = useAnalyzerStore();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (previewAudioUrl && audioRef.current) {
      audioRef.current.play();
      setPlaying(true);
    }
  }, [previewAudioUrl]);

  useEffect(() => {
    return () => clearPreviewAudio();
  }, [clearPreviewAudio]);

  if (!previewAudioUrl) return null;

  return (
    <div className="flex items-center gap-2 rounded bg-white/5 px-3 py-2">
      <audio
        ref={audioRef}
        src={previewAudioUrl}
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />
      <button
        onClick={() => {
          if (!audioRef.current) return;
          if (playing) {
            audioRef.current.pause();
          } else {
            audioRef.current.currentTime = 0;
            audioRef.current.play();
          }
        }}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-white"
      >
        {playing ? (
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5,3 19,12 5,21" />
          </svg>
        )}
      </button>
      <div className="flex-1">
        <div className="h-1 rounded bg-white/10">
          <div className={`h-full rounded bg-[var(--accent)] transition-all ${playing ? 'animate-pulse' : ''}`} style={{ width: playing ? '100%' : '0%' }} />
        </div>
      </div>
      <button onClick={clearPreviewAudio} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
        ✕
      </button>
    </div>
  );
}
