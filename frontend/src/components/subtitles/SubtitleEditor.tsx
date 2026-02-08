import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSubtitleStore } from '@/store/subtitleStore';
import { useProjectStore, useTimelineStore } from '@/store';
import type { SubtitleSegment } from '@/store/subtitleStore';

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function formatSrtTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

function formatVttTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

export default function SubtitleEditor() {
  const { t } = useTranslation();
  const { currentProject } = useProjectStore();
  const tracks = useTimelineStore((s) => s.tracks);

  const {
    tracks: subtitleTracks,
    activeTrackId,
    isGenerating,
    isTranslating,
    generateProgress,
    translateProgress,
    loadTracks,
    generateSubtitles,
    translateTrack,
    updateSegmentText,
    deleteTrack,
    setActiveTrack,
  } = useSubtitleStore();

  // Load tracks when project changes
  useEffect(() => {
    if (currentProject?.id) {
      loadTracks(currentProject.id);
    }
  }, [currentProject?.id, loadTracks]);

  const [transcribeProvider, setTranscribeProvider] = useState<'openai' | 'whisper_local'>('openai');
  const [translateProvider, setTranslateProvider] = useState<'gpt4' | 'claude'>('gpt4');

  const activeTrack = subtitleTracks.find((t) => t.id === activeTrackId);

  // Find first video/audio asset for subtitle generation
  const getFirstAssetId = useCallback((): number | null => {
    for (const track of tracks) {
      if (track.type === 'video' || track.type === 'audio') {
        const clip = track.clips[0];
        if (clip) return Number(clip.assetId);
      }
    }
    return null;
  }, [tracks]);

  const handleGenerate = useCallback(() => {
    if (!currentProject) return;
    const assetId = getFirstAssetId();
    if (!assetId) return;
    generateSubtitles(currentProject.id, assetId, transcribeProvider);
  }, [currentProject, getFirstAssetId, generateSubtitles, transcribeProvider]);

  const handleTranslate = useCallback(() => {
    if (!activeTrackId) return;
    translateTrack(activeTrackId, undefined, translateProvider);
  }, [activeTrackId, translateTrack, translateProvider]);

  const handleDeleteTrack = useCallback(() => {
    if (!activeTrackId) return;
    deleteTrack(activeTrackId);
  }, [activeTrackId, deleteTrack]);

  const handleExportSRT = useCallback(() => {
    if (!activeTrack) return;
    let srt = '';
    activeTrack.segments.forEach((seg, idx) => {
      const start = formatSrtTime(seg.start_ms);
      const end = formatSrtTime(seg.end_ms);
      let text = seg.text;
      if (seg.translated_text) {
        text += `\n${seg.translated_text}`;
      }
      srt += `${idx + 1}\n${start} --> ${end}\n${text}\n\n`;
    });

    const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTrack.label || 'subtitles'}.srt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeTrack]);

  const handleExportVTT = useCallback(() => {
    if (!activeTrack) return;
    let vtt = 'WEBVTT\n\n';
    activeTrack.segments.forEach((seg) => {
      const start = formatVttTime(seg.start_ms);
      const end = formatVttTime(seg.end_ms);
      let text = seg.text;
      if (seg.translated_text) {
        text += `\n${seg.translated_text}`;
      }
      vtt += `${start} --> ${end}\n${text}\n\n`;
    });

    const blob = new Blob([vtt], { type: 'text/vtt;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTrack.label || 'subtitles'}.vtt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeTrack]);

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-hidden p-2">
      {/* Provider toggles */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-[var(--color-text-secondary)]">{t('subtitles.transcribeProvider')}:</span>
          <select
            value={transcribeProvider}
            onChange={(e) => setTranscribeProvider(e.target.value as 'openai' | 'whisper_local')}
            className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] text-[var(--color-text)] outline-none"
          >
            <option value="openai">OpenAI Whisper</option>
            <option value="whisper_local">{t('subtitles.localWhisper')}</option>
          </select>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-[var(--color-text-secondary)]">{t('subtitles.translateProvider')}:</span>
          <select
            value={translateProvider}
            onChange={(e) => setTranslateProvider(e.target.value as 'gpt4' | 'claude')}
            className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] text-[var(--color-text)] outline-none"
          >
            <option value="gpt4">GPT-4</option>
            <option value="claude">Claude</option>
          </select>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-1">
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !getFirstAssetId()}
          className="rounded bg-[var(--accent)] px-2 py-1 text-[10px] font-medium text-white hover:bg-[var(--accent)]/80 disabled:opacity-50"
        >
          {isGenerating ? t('subtitles.generating') : t('subtitles.generate')}
        </button>
        <button
          onClick={handleTranslate}
          disabled={isTranslating || !activeTrackId}
          className="rounded bg-white/10 px-2 py-1 text-[10px] text-[var(--color-text)] hover:bg-white/20 disabled:opacity-50"
        >
          {isTranslating ? t('subtitles.translating') : t('subtitles.translate')}
        </button>
        <button
          onClick={handleExportSRT}
          disabled={!activeTrack || activeTrack.segments.length === 0}
          className="rounded bg-white/10 px-2 py-1 text-[10px] text-[var(--color-text)] hover:bg-white/20 disabled:opacity-50"
        >
          {t('subtitles.exportSRT')}
        </button>
        <button
          onClick={handleExportVTT}
          disabled={!activeTrack || activeTrack.segments.length === 0}
          className="rounded bg-white/10 px-2 py-1 text-[10px] text-[var(--color-text)] hover:bg-white/20 disabled:opacity-50"
        >
          {t('subtitles.exportVTT')}
        </button>
      </div>

      {/* Progress bars */}
      {isGenerating && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 rounded bg-white/10">
            <div className="h-full rounded bg-[var(--accent)] transition-all" style={{ width: `${generateProgress}%` }} />
          </div>
          <span className="text-[9px] text-[var(--color-text-secondary)]">{generateProgress}%</span>
        </div>
      )}
      {isTranslating && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 rounded bg-white/10">
            <div className="h-full rounded bg-blue-400 transition-all" style={{ width: `${translateProgress}%` }} />
          </div>
          <span className="text-[9px] text-[var(--color-text-secondary)]">{translateProgress}%</span>
        </div>
      )}

      {/* Track selector */}
      {subtitleTracks.length > 1 && (
        <div className="flex items-center gap-1">
          <select
            value={activeTrackId ?? ''}
            onChange={(e) => setActiveTrack(Number(e.target.value))}
            className="flex-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-[var(--color-text)] outline-none"
          >
            {subtitleTracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.label} ({track.language})
              </option>
            ))}
          </select>
          <button
            onClick={handleDeleteTrack}
            className="rounded px-1.5 py-1 text-[10px] text-red-400 hover:bg-red-400/10"
            title={t('subtitles.deleteTrack')}
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Segments list */}
      <div className="flex-1 overflow-y-auto">
        {!activeTrack || activeTrack.segments.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-xs text-[var(--color-text-secondary)]">
            {t('subtitles.empty')}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {activeTrack.segments.map((segment) => (
              <SegmentRow
                key={segment.id}
                segment={segment}
                onUpdateText={updateSegmentText}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SegmentRow({
  segment,
  onUpdateText,
}: {
  segment: SubtitleSegment;
  onUpdateText: (segmentId: number, updates: { text?: string; translated_text?: string }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const translatedRef = useRef<HTMLTextAreaElement>(null);

  const handleTextBlur = useCallback(() => {
    const value = textRef.current?.value;
    if (value !== undefined && value !== segment.text) {
      onUpdateText(segment.id, { text: value });
    }
  }, [segment.id, segment.text, onUpdateText]);

  const handleTranslatedBlur = useCallback(() => {
    const value = translatedRef.current?.value;
    if (value !== undefined && value !== (segment.translated_text ?? '')) {
      onUpdateText(segment.id, { translated_text: value });
    }
  }, [segment.id, segment.translated_text, onUpdateText]);

  return (
    <div className="flex flex-col gap-1 rounded border border-white/5 bg-white/5 p-2">
      {/* Time range + confidence */}
      <div className="flex items-center justify-between text-[9px] text-[var(--color-text-secondary)]">
        <span>
          {formatTime(segment.start_ms)} - {formatTime(segment.end_ms)}
        </span>
        {segment.confidence > 0 && (
          <span className={segment.confidence > 0.8 ? 'text-green-400' : segment.confidence > 0.5 ? 'text-yellow-400' : 'text-red-400'}>
            {Math.round(segment.confidence * 100)}%
          </span>
        )}
      </div>

      {/* Original text */}
      <div className="flex flex-col gap-0.5">
        <label className="text-[9px] text-[var(--color-text-secondary)]">
          {t('original')}
        </label>
        <textarea
          ref={textRef}
          defaultValue={segment.text}
          onBlur={handleTextBlur}
          className="w-full resize-none rounded border border-white/10 bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--accent)]"
          rows={2}
        />
      </div>

      {/* Translated text */}
      {segment.translated_text !== null && (
        <div className="flex flex-col gap-0.5">
          <label className="text-[9px] text-[var(--color-text-secondary)]">
            {t('translated')}
          </label>
          <textarea
            ref={translatedRef}
            defaultValue={segment.translated_text ?? ''}
            onBlur={handleTranslatedBlur}
            className="w-full resize-none rounded border border-white/10 bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--accent)]"
            rows={2}
          />
        </div>
      )}
    </div>
  );
}
