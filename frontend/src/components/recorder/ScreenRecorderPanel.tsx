import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAssetStore, Asset } from '@/store/assetStore';
import { useTimelineStore } from '@/store/timelineStore';

type RecordStatus = 'idle' | 'requesting' | 'recording' | 'stopping' | 'uploading' | 'done';

function getSupportedMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return 'video/webm';
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function ScreenRecorderPanel() {
  const { t } = useTranslation();
  const uploadAsset = useAssetStore((s) => s.uploadAsset);
  const addClip = useTimelineStore((s) => s.addClip);
  const tracks = useTimelineStore((s) => s.tracks);
  const addTrack = useTimelineStore((s) => s.addTrack);

  const [status, setStatus] = useState<RecordStatus>('idle');
  const [includeAudio, setIncludeAudio] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recordedAsset, setRecordedAsset] = useState<Asset | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isSupported = typeof navigator !== 'undefined' &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === 'function';

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  const handleStop = useCallback(async () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }, []);

  const processRecording = useCallback(async (chunks: Blob[], mimeType: string) => {
    setStatus('uploading');
    cleanup();

    const blob = new Blob(chunks, { type: mimeType });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = new File([blob], `screen-recording-${timestamp}.webm`, { type: 'video/webm' });

    const asset = await uploadAsset(file);
    if (asset) {
      setRecordedAsset(asset);
      setStatus('done');
    } else {
      setError('Upload failed');
      setStatus('idle');
    }
  }, [cleanup, uploadAsset]);

  const handleStart = useCallback(async () => {
    setError(null);
    setRecordedAsset(null);
    setStatus('requesting');

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: includeAudio,
      });

      streamRef.current = stream;

      // Show live preview
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      // Setup MediaRecorder
      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const chunks = [...chunksRef.current];
        processRecording(chunks, mimeType);
      };

      // Handle user stopping via browser native "Stop sharing" button
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          if (recorderRef.current && recorderRef.current.state !== 'inactive') {
            recorderRef.current.stop();
          }
        };
      }

      // Start recording
      recorder.start(1000); // 1s timeslice
      setStatus('recording');
      setElapsed(0);

      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } catch (err: unknown) {
      cleanup();
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Permission') || msg.includes('denied') || msg.includes('NotAllowedError')) {
        setError(t('record.permissionDenied'));
      } else {
        setError(msg);
      }
      setStatus('idle');
    }
  }, [includeAudio, cleanup, processRecording, t]);

  const handleAddToTimeline = useCallback(() => {
    if (!recordedAsset) return;

    // Find or create a video track
    let videoTrack = tracks.find((t) => t.type === 'video');
    if (!videoTrack) {
      addTrack('video');
      videoTrack = useTimelineStore.getState().tracks.find((t) => t.type === 'video');
    }
    if (!videoTrack) return;

    // Find the end of existing clips on this track
    const endTime = videoTrack.clips.reduce((max, c) => Math.max(max, c.endTime), 0);
    const duration = recordedAsset.duration_ms || elapsed * 1000 || 10000;

    addClip(videoTrack.id, {
      id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      assetId: String(recordedAsset.id),
      startTime: endTime,
      endTime: endTime + duration,
      trimStart: 0,
      trimEnd: 0,
      duration,
      name: recordedAsset.original_filename || 'Screen Recording',
      type: 'video',
    });

    setRecordedAsset(null);
    setStatus('idle');
    setElapsed(0);
  }, [recordedAsset, tracks, addTrack, addClip, elapsed]);

  if (!isSupported) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
        <svg className="h-8 w-8 text-[var(--color-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
        <p className="text-xs text-[var(--color-text-secondary)]">{t('record.notSupported')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 overflow-y-auto p-3">
      <div className="text-xs font-medium text-[var(--color-text)]">
        {t('record.title')}
      </div>

      {/* Live preview */}
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-[var(--color-border)] bg-black">
        <video
          ref={videoRef}
          muted
          playsInline
          className="h-full w-full object-contain"
        />
        {status === 'idle' && !recordedAsset && (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="h-12 w-12 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        {/* Recording indicator */}
        {status === 'recording' && (
          <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded bg-black/60 px-2 py-1">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            <span className="text-[10px] font-medium text-white">
              {t('record.recording')} {formatElapsed(elapsed)}
            </span>
          </div>
        )}
      </div>

      {/* Controls */}
      {status === 'idle' && !recordedAsset && (
        <>
          <label className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] cursor-pointer">
            <input
              type="checkbox"
              checked={includeAudio}
              onChange={(e) => setIncludeAudio(e.target.checked)}
              className="h-3 w-3 accent-[var(--accent)]"
            />
            {t('record.includeAudio')}
          </label>

          <button
            onClick={handleStart}
            className="flex items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-600"
          >
            <span className="h-3 w-3 rounded-full bg-white" />
            {t('record.startRecording')}
          </button>
        </>
      )}

      {status === 'requesting' && (
        <div className="py-4 text-center text-xs text-[var(--color-text-secondary)]">
          {t('common.loading')}
        </div>
      )}

      {status === 'recording' && (
        <button
          onClick={handleStop}
          className="flex items-center justify-center gap-2 rounded-lg bg-[var(--color-surface)] px-4 py-2.5 text-sm font-medium text-red-400 border border-red-500/30 transition-colors hover:bg-red-500/10"
        >
          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="1" />
          </svg>
          {t('record.stopRecording')}
        </button>
      )}

      {status === 'stopping' && (
        <div className="py-4 text-center text-xs text-[var(--color-text-secondary)]">
          {t('record.stopRecording')}...
        </div>
      )}

      {status === 'uploading' && (
        <div className="py-4 text-center text-xs text-[var(--color-text-secondary)]">
          {t('record.uploading')}
        </div>
      )}

      {status === 'done' && recordedAsset && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 rounded bg-green-500/10 px-3 py-2 text-xs text-green-400">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {recordedAsset.original_filename}
          </div>

          <button
            onClick={handleAddToTimeline}
            className="flex items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90"
          >
            {t('record.addToTimeline')}
          </button>

          <button
            onClick={() => { setRecordedAsset(null); setStatus('idle'); setElapsed(0); }}
            className="text-[10px] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
          >
            {t('record.startRecording')}
          </button>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="rounded bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
