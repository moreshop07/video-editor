import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import apiClient from "@/api/client";
import { useProjectStore } from "@/store";
import type { ProjectWebSocket } from "@/api/websocket";

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
  ws?: ProjectWebSocket | null;
}

export default function ExportDialog({
  open,
  onClose,
  onProgress,
  ws,
}: ExportDialogProps) {
  const { t } = useTranslation();
  const { currentProject } = useProjectStore();

  const [settings, setSettings] = useState<ExportSettings>({
    format: "mp4",
    quality: "high",
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    includeSubtitles: true,
  });

  const [status, setStatus] = useState<ExportStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const jobIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (onProgress) {
      onProgress(progress);
    }
  }, [progress, onProgress]);

  // Subscribe to WebSocket job progress
  useEffect(() => {
    if (!ws) return;

    const unsub = ws.onJobProgress((data: unknown) => {
      const payload = data as {
        job_id?: number;
        progress?: number;
        status?: string;
        download_url?: string;
        error_message?: string;
      };

      // Filter by our job ID
      if (jobIdRef.current !== null && payload.job_id === jobIdRef.current) {
        if (typeof payload.progress === "number") {
          setProgress(Math.round(payload.progress));
        }
        if (payload.status === "completed") {
          setStatus("completed");
          setProgress(100);
          if (payload.download_url) {
            setDownloadUrl(payload.download_url);
          }
        } else if (payload.status === "failed") {
          setStatus("failed");
          setErrorMessage(payload.error_message || t("export.failed"));
        }
      }
    });

    return unsub;
  }, [ws, t]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setStatus("idle");
      setProgress(0);
      setDownloadUrl(null);
      setErrorMessage(null);
      jobIdRef.current = null;
    }
  }, [open]);

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

  const handleExport = useCallback(async () => {
    if (!currentProject) return;
    setStatus("exporting");
    setProgress(0);
    setDownloadUrl(null);
    setErrorMessage(null);

    try {
      const response = await apiClient.post(
        `/projects/${currentProject.id}/export`,
        settings,
      );

      // Store job ID to filter WebSocket progress updates
      const jobId = response.data?.job_id;
      if (jobId) {
        jobIdRef.current = jobId;
      }
    } catch (error) {
      console.error("Failed to start export:", error);
      setStatus("failed");
      setErrorMessage(t("export.failed"));
    }
  }, [currentProject, settings, t]);

  if (!open) return null;

  const isExporting = status === "exporting";
  const isCompleted = status === "completed";
  const isFailed = status === "failed";

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
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
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
          {/* Format */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--text-secondary)]">
              {t("format")}
            </label>
            <div className="rounded border border-white/10 bg-[var(--bg-primary)] px-3 py-1.5 text-xs text-[var(--text-primary)]">
              MP4
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
                  { key: "custom", labelKey: "qualityCustom" },
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
                  {isCompleted ? t("export.completed") : t("exportProgress")}
                </span>
                <span>{progress}%</span>
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

          {/* Download link */}
          {isCompleted && downloadUrl && (
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded bg-green-600 px-4 py-2 text-xs font-medium text-white hover:bg-green-700"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {t("export.download")}
            </a>
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
            onClick={onClose}
            className="rounded bg-white/10 px-4 py-1.5 text-xs text-[var(--text-primary)] hover:bg-white/20"
          >
            {t("cancel")}
          </button>
          {!isCompleted && (
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="rounded bg-[var(--accent)] px-4 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent)]/80 disabled:opacity-50"
            >
              {isExporting ? `${progress}%` : t("startExport")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
