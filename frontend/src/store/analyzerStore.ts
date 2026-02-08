import { create } from 'zustand';
import { downloadApi, analysisApi, autoEditApi, ttsApi, processingApi, smartEditApi } from '@/api/client';

export interface VideoAnalysis {
  id: number;
  asset_id: number;
  scenes: { start: number; end: number; duration: number }[] | null;
  audio_analysis: {
    duration: number;
    rms: number;
    bpm: number;
    spectral_centroid: number;
    energy_profile: number[];
  } | null;
  hook_analysis: {
    has_hook: boolean;
    hook_score: number;
    energy_first_5s: number;
    onset_density: number;
    scene_changes_first_5s: number;
  } | null;
  rhythm_analysis: {
    avg_scene_duration: number;
    pace: string;
    scene_count: number;
    variability: number;
  } | null;
}

export interface DownloadedVideo {
  id: number;
  source_url: string;
  platform: string;
  title: string | null;
  asset_id: number | null;
  created_at: string;
}

export interface TTSVoice {
  voice_id: string;
  label: string;
}

interface AnalyzerState {
  // Analysis
  analyses: Record<number, VideoAnalysis>;
  analysisLoading: Record<number, boolean>;

  // Downloads
  downloads: DownloadedVideo[];
  downloadJobId: number | null;

  // TTS
  voices: TTSVoice[];
  ttsJobId: number | null;

  // Auto-edit
  autoEditJobId: number | null;

  // Smart edit
  smartEditJobId: number | null;
  smartEditResult: Record<string, unknown> | null;

  // Actions
  startAnalysis: (assetId: number, projectId?: number) => Promise<number>;
  fetchAnalysis: (assetId: number) => Promise<void>;
  startDownload: (url: string) => Promise<number>;
  fetchDownloads: () => Promise<void>;
  fetchVoices: () => Promise<void>;
  startTTS: (text: string, voice?: string, projectId?: number) => Promise<number>;
  startVoiceover: (trackId: number, projectId: number, voice?: string) => Promise<number>;
  startSilenceRemoval: (assetId: number, margin?: number, projectId?: number) => Promise<number>;
  startJumpCut: (assetId: number, projectId?: number) => Promise<number>;
  pollJob: (jobId: number) => Promise<Record<string, unknown>>;

  // Smart edit actions
  startBeatSync: (
    assetId: number,
    options?: {
      musicTrackId?: number;
      musicAssetId?: number;
      sensitivity?: number;
      minClipDurationMs?: number;
      includeTransitions?: boolean;
      transitionType?: string;
      projectId?: number;
    },
  ) => Promise<number>;
  startMontage: (
    assetIds: number[],
    style?: 'fast_paced' | 'cinematic' | 'slideshow',
    options?: {
      targetDurationMs?: number;
      musicTrackId?: number;
      includeTransitions?: boolean;
      projectId?: number;
    },
  ) => Promise<number>;
  startPlatformOptimize: (
    projectId: number,
    platform: 'tiktok' | 'youtube_shorts' | 'instagram_reels' | 'youtube',
  ) => Promise<number>;
  startHighlightDetect: (
    assetId: number,
    options?: {
      maxHighlights?: number;
      minHighlightDurationMs?: number;
      maxHighlightDurationMs?: number;
      projectId?: number;
    },
  ) => Promise<number>;
  clearSmartEditResult: () => void;
}

export const useAnalyzerStore = create<AnalyzerState>((set, get) => ({
  analyses: {},
  analysisLoading: {},
  downloads: [],
  downloadJobId: null,
  voices: [],
  ttsJobId: null,
  autoEditJobId: null,
  smartEditJobId: null,
  smartEditResult: null,

  startAnalysis: async (assetId, projectId) => {
    set((s) => ({ analysisLoading: { ...s.analysisLoading, [assetId]: true } }));
    const { data } = await analysisApi.analyze(assetId, projectId);
    return data.id;
  },

  fetchAnalysis: async (assetId) => {
    try {
      const { data } = await analysisApi.get(assetId);
      set((s) => ({
        analyses: { ...s.analyses, [assetId]: data },
        analysisLoading: { ...s.analysisLoading, [assetId]: false },
      }));
    } catch {
      set((s) => ({ analysisLoading: { ...s.analysisLoading, [assetId]: false } }));
    }
  },

  startDownload: async (url) => {
    const { data } = await downloadApi.start(url);
    set({ downloadJobId: data.id });
    return data.id;
  },

  fetchDownloads: async () => {
    const { data } = await downloadApi.list();
    set({ downloads: data });
  },

  fetchVoices: async () => {
    const { data } = await ttsApi.voices();
    set({ voices: data.voices });
  },

  startTTS: async (text, voice, projectId) => {
    const { data } = await ttsApi.generate(text, voice, projectId);
    set({ ttsJobId: data.id });
    return data.id;
  },

  startVoiceover: async (trackId, projectId, voice) => {
    const { data } = await ttsApi.voiceover(trackId, projectId, voice);
    set({ ttsJobId: data.id });
    return data.id;
  },

  startSilenceRemoval: async (assetId, margin, projectId) => {
    const { data } = await autoEditApi.silenceRemoval(assetId, margin, projectId);
    set({ autoEditJobId: data.id });
    return data.id;
  },

  startJumpCut: async (assetId, projectId) => {
    const { data } = await autoEditApi.jumpCut(assetId, projectId);
    set({ autoEditJobId: data.id });
    return data.id;
  },

  pollJob: async (jobId) => {
    const { data } = await processingApi.getJob(jobId);
    return data;
  },

  startBeatSync: async (assetId, options) => {
    const { data } = await smartEditApi.beatSync({
      asset_id: assetId,
      music_track_id: options?.musicTrackId,
      music_asset_id: options?.musicAssetId,
      sensitivity: options?.sensitivity,
      min_clip_duration_ms: options?.minClipDurationMs,
      include_transitions: options?.includeTransitions,
      transition_type: options?.transitionType,
      project_id: options?.projectId,
    });
    set({ smartEditJobId: data.id, smartEditResult: null });
    return data.id;
  },

  startMontage: async (assetIds, style, options) => {
    const { data } = await smartEditApi.montage({
      asset_ids: assetIds,
      style,
      target_duration_ms: options?.targetDurationMs,
      music_track_id: options?.musicTrackId,
      include_transitions: options?.includeTransitions,
      project_id: options?.projectId,
    });
    set({ smartEditJobId: data.id, smartEditResult: null });
    return data.id;
  },

  startPlatformOptimize: async (projectId, platform) => {
    const { data } = await smartEditApi.platformOptimize({
      project_id: projectId,
      platform,
    });
    set({ smartEditJobId: data.id, smartEditResult: null });
    return data.id;
  },

  startHighlightDetect: async (assetId, options) => {
    const { data } = await smartEditApi.highlightDetect({
      asset_id: assetId,
      max_highlights: options?.maxHighlights,
      min_highlight_duration_ms: options?.minHighlightDurationMs,
      max_highlight_duration_ms: options?.maxHighlightDurationMs,
      project_id: options?.projectId,
    });
    set({ smartEditJobId: data.id, smartEditResult: null });
    return data.id;
  },

  clearSmartEditResult: () => set({ smartEditJobId: null, smartEditResult: null }),
}));
