import { create } from 'zustand';
import { downloadApi, analysisApi, autoEditApi, ttsApi, processingApi } from '@/api/client';

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
}

export const useAnalyzerStore = create<AnalyzerState>((set, get) => ({
  analyses: {},
  analysisLoading: {},
  downloads: [],
  downloadJobId: null,
  voices: [],
  ttsJobId: null,
  autoEditJobId: null,

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
}));
