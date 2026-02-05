export type AssetType = "video" | "audio" | "image" | "sticker";

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  url: string;
  thumbnailUrl?: string;
  durationMs?: number;
  width?: number;
  height?: number;
  fileSize: number;
  mimeType: string;
  createdAt: string;
  projectId: string;
}

export interface EffectParams {
  [key: string]: number | string | boolean;
}

export interface EffectPreset {
  id: string;
  name: string;
  type: string;
  params: EffectParams;
  thumbnailUrl?: string;
}

export interface Clip {
  id: string;
  assetId: string;
  trackId: string;
  startMs: number;
  endMs: number;
  sourceStartMs: number;
  sourceEndMs: number;
  effects: EffectPreset[];
  volume: number;
  opacity: number;
  speed: number;
  position: { x: number; y: number };
  scale: { x: number; y: number };
  rotation: number;
  fadeInMs: number;
  fadeOutMs: number;
}

export type TrackType =
  | "video"
  | "audio"
  | "music"
  | "sfx"
  | "subtitle"
  | "sticker";

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  clips: Clip[];
  muted: boolean;
  locked: boolean;
  volume: number;
  order: number;
}

export interface TimelineState {
  tracks: Track[];
  currentTimeMs: number;
  isPlaying: boolean;
  durationMs: number;
  zoom: number;
  scrollX: number;
  selectedClipId: string | null;
}

export interface SubtitleSegment {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  translatedText?: string;
  speaker?: string;
}

export interface SubtitleTrack {
  id: string;
  language: string;
  segments: SubtitleSegment[];
}

export interface MusicTrack {
  id: string;
  name: string;
  assetId: string;
  url: string;
  durationMs: number;
  category: string;
  tags: string[];
}

export interface SoundEffect {
  id: string;
  name: string;
  assetId: string;
  url: string;
  durationMs: number;
  category: string;
  tags: string[];
}

export type JobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface ProcessingJob {
  id: string;
  projectId: string;
  type: string;
  status: JobStatus;
  progress: number;
  result?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export type ExportQuality = "low" | "medium" | "high" | "custom";

export interface ExportSettings {
  format: string;
  quality: ExportQuality;
  resolution: { width: number; height: number };
  fps: number;
  videoBitrate?: number;
  audioBitrate?: number;
  includeSubtitles: boolean;
  subtitleTrackId?: string;
}

export interface Project {
  id: string;
  name: string;
  thumbnailUrl?: string;
  timeline: TimelineState;
  subtitleTracks: SubtitleTrack[];
  exportSettings: ExportSettings;
  createdAt: string;
  updatedAt: string;
}
