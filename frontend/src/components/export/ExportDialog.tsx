import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useTimelineStore } from "@/store/timelineStore";
import { useSubtitleStore } from "@/store/subtitleStore";
import { ExportEngine, getVideoBitrate } from "@/engine/ExportEngine";
import type { ExportProgress } from "@/engine/ExportEngine";
import type { RenderableTrack } from "@/engine/types";

type ExportQuality = "low" | "medium" | "high" | "custom";
type ExportStatus = "idle" | "exporting" | "completed" | "failed";

interface ExportSettings {
  format: string;
  quality: ExportQuality;
  resolution: { width: number; height: number };
  fps: number;
  includeSubtitles: boolean;
}

const resolutionPresets = [
  { label: "1080p", width: 1920, height: 1080 },
  { label: "720p", width: 1280, height: 720 },
  { label: "480p", width: 854, height: 480 },
  { label: "4K", width: 3840, height: 2160 },
];

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  onProgress?: (progress: number) => void;
}

export default function ExportDialog({
  open,
  onClose,
  onProgress,
}: ExportDialogProps) {
  const { t } = useTranslation();

  const tracks = useTimelineStore((s) => s.tracks);
  const getTimelineDuration = useTimelineStore((s) => s.getTimelineDuration);
  const subtitleTracks = useSubtitleStore((s) => s.tracks);
  const activeTrackId = useSubtitleStore((s) => s.activeTrackId);

  const [settings, setSettings] = useState<ExportSettings>({
    format: "mp4",
    quality: "high",
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    includeSubtitles: true,
  });

  const [status, setStatus] = useState<ExportStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [frameInfo, setFrameInfo] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const exportEngineRef = useRef<ExportEngine | null>(null);

  useEffect(() => {
    if (onProgress) {
      onProgress(progress);
    }
  }, [progress, onProgress]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      // Cancel any in-progress export
      exportEngineRef.current?.cancel();
      exportEngineRef.current = null;

      setStatus("idle");
      setProgress(0);
      setFrameInfo("");
      setFileSize(null);
      setErrorMessage(null);

      // Revoke previous blob URL to free memory
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
        setDownloadUrl(null);
      }
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleQualityChange = useCallback((quality: ExportQuality) => {
    setSettings((prev) => ({ ...prev, quality }));
  }, []);

  const handleResolutionChange = useCallback(
    (width: number, height: number) => {
      setSettings((prev) => ({
        ...prev,
        resolution: { width, height },
      }));
    },
    [],
  );

  // Build renderable tracks from timeline store
  const buildRenderableTracks = useCallback((): RenderableTrack[] => {
    return tracks.map((t) => ({
      id: t.id,
      type: t.type,
      clips: t.clips.map((c) => ({
        id: c.id,
        assetId: c.assetId,
        startTime: c.startTime,
        endTime: c.endTime,
        trimStart: c.trimStart,
        duration: c.duration,
        volume: c.volume ?? 1,
        opacity: 1,
        type: c.type,
        filters: c.filters,
        fadeInMs: c.fadeInMs,
        fadeOutMs: c.fadeOutMs,
        positionX: c.positionX,
        positionY: c.positionY,
        scaleX: c.scaleX,
        scaleY: c.scaleY,
        rotation: c.rotation,
        transitionIn: c.transitionIn,
        keyframes: c.keyframes,
        // Text properties
        textContent: c.textContent,
        fontSize: c.fontSize,
        fontFamily: c.fontFamily,
        fontColor: c.fontColor,
        fontWeight: c.fontWeight,
        textAlign: c.textAlign,
        backgroundColor: c.backgroundColor,
        backgroundOpacity: c.backgroundOpacity,
      })),
      muted: t.muted,
      visible: t.visible,
      volume: t.audioSettings?.volume ?? 1,
      audioSettings: t.audioSettings,
    }));
  }, [tracks]);

  const handleExport = useCallback(async () => {
    if (!ExportEngine.isSupported()) {
      setStatus("failed");
      setErrorMessage(t("export.unsupported"));
      return;
    }

    const durationMs = getTimelineDuration();
    if (durationMs <= 0) {
      setStatus("failed");
      setErrorMessage(t("export.emptyTimeline"));
      return;
    }

    setStatus("exporting");
    setProgress(0);
    setFrameInfo("");
    setDownloadUrl(null);
    setErrorMessage(null);
    setFileSize(null);

    const engine = new ExportEngine();
    exportEngineRef.current = engine;

    engine.onProgress = (p: ExportProgress) => {
      setProgress(p.percent);
      setFrameInfo(`${p.currentFrame} / ${p.totalFrames}`);
    };

    try {
      const renderableTracks = buildRenderableTracks();

      // Get subtitle segments
      const activeSubTrack = subtitleTracks.find(
        (st) => st.id === activeTrackId,
      );
      const subtitleSegments = (activeSubTrack?.segments ?? []).map((seg) => ({
        start_ms: seg.start_ms,
        end_ms: seg.end_ms,
        text: seg.text,
        translated_text: seg.translated_text,
      }));

      const { width, height } = settings.resolution;
      const bitrate = getVideoBitrate(settings.quality, width, height);

      const blob = await engine.export(
        {
          width,
          height,
          fps: settings.fps,
          videoBitrate: bitrate,
          includeSubtitles: settings.includeSubtitles,
        },
        renderableTracks,
        subtitleSegments,
        (assetId) => `/api/v1/assets/${assetId}/stream`,
        durationMs,
      );

      // Create download URL
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setFileSize(formatFileSize(blob.size));
      setStatus("completed");
      setProgress(100);
    } catch (err) {
      if (exportEngineRef.current?.getStatus() === "cancelled") {
        setStatus("idle");
        setProgress(0);
      } else {
        console.error("Export failed:", err);
        setStatus("failed");
        setErrorMessage(
          err instanceof Error ? err.message : t("export.failed"),
        );
      }
    } finally {
      exportEngineRef.current = null;
    }
  }, [
    settings,
    getTimelineDuration,
    buildRenderableTracks,
    subtitleTracks,
    activeTrackId,
    t,
  ]);

  const handleCancel = useCallback(() => {
    if (status === "exporting") {
      exportEngineRef.current?.cancel();
      setStatus("idle");
      setProgress(0);
    } else {
      onClose();
    }
  }, [status, onClose]);

  const handleDownload = useCallback(() => {
    if (!downloadUrl) return;
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `export_${Date.now()}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [downloadUrl]);

  if (!open) return null;

  const isExporting = status === "exporting";
  const isCompleted = status === "completed";
  const isFailed = status === "failed";
  const webCodecsSupported = ExportEngine.isSupported();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-96 rounded-lg border border-white/10 bg-[var(--bg-secondary)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            {t("exportVideo")}
          </h2>
          <button
            onClick={onClose}
            disabled={isExporting}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 p-4">
          {/* WebCodecs not supported warning */}
          {!webCodecsSupported && (
            <div className="rounded bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400">
              {t("export.unsupported")}
            </div>
          )}

          {/* Format */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--text-secondary)]">
              {t("format")}
            </label>
            <div className="rounded border border-white/10 bg-[var(--bg-primary)] px-3 py-1.5 text-xs text-[var(--text-primary)]">
              MP4 (H.264)
            </div>
          </div>

          {/* Quality */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--text-secondary)]">
              {t("quality")}
            </label>
            <div className="flex gap-1">
              {(
                [
                  { key: "low", labelKey: "qualityLow" },
                  { key: "medium", labelKey: "qualityMedium" },
                  { key: "high", labelKey: "qualityHigh" },
                ] as const
              ).map(({ key, labelKey }) => (
                <button
                  key={key}
                  onClick={() => handleQualityChange(key)}
                  disabled={isExporting}
                  className={`flex-1 rounded px-2 py-1 text-[10px] ${
                    settings.quality === key
                      ? "bg-[var(--accent)] text-white"
                      : "bg-white/5 text-[var(--text-secondary)] hover:bg-white/10"
                  }`}
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
          </div>

          {/* Resolution */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--text-secondary)]">
              {t("resolution")}
            </label>
            <div className="flex flex-wrap gap-1">
              {resolutionPresets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() =>
                    handleResolutionChange(preset.width, preset.height)
                  }
                  disabled={isExporting}
                  className={`rounded px-2 py-1 text-[10px] ${
                    settings.resolution.width === preset.width &&
                    settings.resolution.height === preset.height
                      ? "bg-[var(--accent)] text-white"
                      : "bg-white/5 text-[var(--text-secondary)] hover:bg-white/10"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* FPS */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--text-secondary)]">
              {t("export.fps")}
            </label>
            <div className="flex gap-1">
              {[24, 30, 60].map((fps) => (
                <button
                  key={fps}
                  onClick={() =>
                    setSettings((prev) => ({ ...prev, fps }))
                  }
                  disabled={isExporting}
                  className={`flex-1 rounded px-2 py-1 text-[10px] ${
                    settings.fps === fps
                      ? "bg-[var(--accent)] text-white"
                      : "bg-white/5 text-[var(--text-secondary)] hover:bg-white/10"
                  }`}
                >
                  {fps} fps
                </button>
              ))}
            </div>
          </div>

          {/* Include subtitles */}
          <label className="flex items-center gap-2 text-xs text-[var(--text-primary)]">
            <input
              type="checkbox"
              checked={settings.includeSubtitles}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  includeSubtitles: e.target.checked,
                }))
              }
              disabled={isExporting}
              className="accent-[var(--accent)]"
            />
            {t("includeSubtitles")}
          </label>

          {/* Export progress */}
          {(isExporting || isCompleted) && (
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[10px] text-[var(--text-secondary)]">
                <span>
                  {isCompleted ? t("export.completed") : t("export.rendering")}
                </span>
                <span>
                  {frameInfo && !isCompleted
                    ? `${frameInfo} (${progress}%)`
                    : `${progress}%`}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded bg-white/10">
                <div
                  className={`h-full transition-all ${
                    isCompleted ? "bg-green-500" : "bg-[var(--accent)]"
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Download button */}
          {isCompleted && downloadUrl && (
            <button
              onClick={handleDownload}
              className="flex items-center justify-center gap-2 rounded bg-green-600 px-4 py-2 text-xs font-medium text-white hover:bg-green-700"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              {t("export.download")} {fileSize && `(${fileSize})`}
            </button>
          )}

          {/* Error message */}
          {isFailed && (
            <div className="rounded bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {errorMessage || t("export.failed")}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-white/10 px-4 py-3">
          <button
            onClick={handleCancel}
            className="rounded bg-white/10 px-4 py-1.5 text-xs text-[var(--text-primary)] hover:bg-white/20"
          >
            {isExporting ? t("cancel") : t("export.close")}
          </button>
          {!isCompleted && !isExporting && (
            <button
              onClick={handleExport}
              disabled={!webCodecsSupported}
              className="rounded bg-[var(--accent)] px-4 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent)]/80 disabled:opacity-50"
            >
              {t("startExport")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
