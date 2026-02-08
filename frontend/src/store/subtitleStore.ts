import { create } from 'zustand';
import { subtitleApi, processingApi } from '@/api/client';

export interface CaptionStyle {
  fontSize?: number;
  fontFamily?: string;
  fontColor?: string;
  fontWeight?: string;
  bgColor?: string;
  bgOpacity?: number;
  position?: 'top' | 'center' | 'bottom';
  outline?: boolean;
}

export interface SubtitleSegment {
  id: number;
  index: number;
  start_ms: number;
  end_ms: number;
  text: string;
  translated_text: string | null;
  speaker: string | null;
  confidence: number;
}

export interface SubtitleTrack {
  id: number;
  project_id: number;
  language: string;
  label: string;
  is_auto_generated: boolean;
  style: CaptionStyle | null;
  segments: SubtitleSegment[];
  created_at: string;
}

interface SubtitleState {
  tracks: SubtitleTrack[];
  activeTrackId: number | null;
  isGenerating: boolean;
  isTranslating: boolean;
  generateJobId: number | null;
  translateJobId: number | null;
  generateProgress: number;
  translateProgress: number;
  isSpeakerDetecting: boolean;
  isSoundDescribing: boolean;
  speakerDetectJobId: number | null;
  soundDescribeJobId: number | null;
  speakerDetectProgress: number;
  soundDescribeProgress: number;
}

interface SubtitleActions {
  loadTracks: (projectId: number) => Promise<void>;
  generateSubtitles: (projectId: number, assetId: number, provider?: string, language?: string) => Promise<void>;
  translateTrack: (trackId: number, targetLanguage?: string, provider?: string) => Promise<void>;
  updateSegmentText: (segmentId: number, updates: { text?: string; translated_text?: string; start_ms?: number; end_ms?: number }) => Promise<void>;
  deleteTrack: (trackId: number) => Promise<void>;
  setActiveTrack: (trackId: number | null) => void;
  getActiveSegmentAt: (timeMs: number) => SubtitleSegment | null;
  updateTrackStyle: (trackId: number, style: CaptionStyle) => Promise<void>;
  detectSpeakers: (trackId: number) => Promise<void>;
  describeSounds: (trackId: number, assetId: number) => Promise<void>;
  reset: () => void;
}

type SubtitleStore = SubtitleState & SubtitleActions;

const initialState: SubtitleState = {
  tracks: [],
  activeTrackId: null,
  isGenerating: false,
  isTranslating: false,
  generateJobId: null,
  translateJobId: null,
  generateProgress: 0,
  translateProgress: 0,
  isSpeakerDetecting: false,
  isSoundDescribing: false,
  speakerDetectJobId: null,
  soundDescribeJobId: null,
  speakerDetectProgress: 0,
  soundDescribeProgress: 0,
};

export const useSubtitleStore = create<SubtitleStore>()((set, get) => ({
  ...initialState,

  loadTracks: async (projectId: number) => {
    try {
      const res = await subtitleApi.listTracks(projectId);
      const tracks = res.data as SubtitleTrack[];
      set({
        tracks,
        activeTrackId: tracks.length > 0 ? (get().activeTrackId ?? tracks[0].id) : null,
      });
    } catch {
      // API may not be available
    }
  },

  generateSubtitles: async (projectId: number, assetId: number, provider?: string, language = 'zh-TW') => {
    set({ isGenerating: true, generateProgress: 0 });
    try {
      const res = await subtitleApi.generate({ project_id: projectId, asset_id: assetId, language, provider });
      const jobId = res.data.id as number;
      set({ generateJobId: jobId });

      // Poll for completion
      const poll = async () => {
        try {
          const jobRes = await processingApi.getJob(jobId);
          const job = jobRes.data;
          set({ generateProgress: job.progress ?? 0 });

          if (job.status === 'completed') {
            set({ isGenerating: false, generateJobId: null });
            // Reload tracks to get the new subtitle track
            await get().loadTracks(projectId);
            return;
          }
          if (job.status === 'failed') {
            set({ isGenerating: false, generateJobId: null });
            return;
          }
          setTimeout(poll, 2000);
        } catch {
          set({ isGenerating: false, generateJobId: null });
        }
      };
      poll();
    } catch {
      set({ isGenerating: false, generateJobId: null });
    }
  },

  translateTrack: async (trackId: number, targetLanguage = 'en', provider?: string) => {
    set({ isTranslating: true, translateProgress: 0 });
    try {
      const res = await subtitleApi.translate({ track_id: trackId, target_language: targetLanguage, provider });
      const jobId = res.data.id as number;
      set({ translateJobId: jobId });

      const poll = async () => {
        try {
          const jobRes = await processingApi.getJob(jobId);
          const job = jobRes.data;
          set({ translateProgress: job.progress ?? 0 });

          if (job.status === 'completed') {
            set({ isTranslating: false, translateJobId: null });
            // Reload the track to get translated text
            const trackRes = await subtitleApi.getTrack(trackId);
            const updatedTrack = trackRes.data as SubtitleTrack;
            set((state) => ({
              tracks: state.tracks.map((t) => (t.id === trackId ? updatedTrack : t)),
            }));
            return;
          }
          if (job.status === 'failed') {
            set({ isTranslating: false, translateJobId: null });
            return;
          }
          setTimeout(poll, 2000);
        } catch {
          set({ isTranslating: false, translateJobId: null });
        }
      };
      poll();
    } catch {
      set({ isTranslating: false, translateJobId: null });
    }
  },

  updateSegmentText: async (segmentId: number, updates) => {
    try {
      await subtitleApi.updateSegment(segmentId, updates);
      // Update local state
      set((state) => ({
        tracks: state.tracks.map((track) => ({
          ...track,
          segments: track.segments.map((seg) =>
            seg.id === segmentId ? { ...seg, ...updates } : seg,
          ),
        })),
      }));
    } catch {
      // Handle error silently
    }
  },

  deleteTrack: async (trackId: number) => {
    try {
      await subtitleApi.deleteTrack(trackId);
      set((state) => ({
        tracks: state.tracks.filter((t) => t.id !== trackId),
        activeTrackId: state.activeTrackId === trackId
          ? (state.tracks.find((t) => t.id !== trackId)?.id ?? null)
          : state.activeTrackId,
      }));
    } catch {
      // Handle error silently
    }
  },

  setActiveTrack: (trackId: number | null) => {
    set({ activeTrackId: trackId });
  },

  getActiveSegmentAt: (timeMs: number) => {
    const { tracks, activeTrackId } = get();
    if (!activeTrackId) return null;
    const track = tracks.find((t) => t.id === activeTrackId);
    if (!track) return null;
    return track.segments.find(
      (seg) => timeMs >= seg.start_ms && timeMs < seg.end_ms,
    ) ?? null;
  },

  updateTrackStyle: async (trackId: number, style: CaptionStyle) => {
    try {
      await subtitleApi.updateTrackStyle(trackId, { style });
      set((state) => ({
        tracks: state.tracks.map((t) =>
          t.id === trackId ? { ...t, style } : t,
        ),
      }));
    } catch {
      // Handle error silently
    }
  },

  detectSpeakers: async (trackId: number) => {
    set({ isSpeakerDetecting: true, speakerDetectProgress: 0 });
    try {
      const res = await subtitleApi.speakerDetect({ track_id: trackId });
      const jobId = res.data.id as number;
      set({ speakerDetectJobId: jobId });

      const poll = async () => {
        try {
          const jobRes = await processingApi.getJob(jobId);
          const job = jobRes.data;
          set({ speakerDetectProgress: job.progress ?? 0 });
          if (job.status === 'completed') {
            set({ isSpeakerDetecting: false, speakerDetectJobId: null });
            const trackRes = await subtitleApi.getTrack(trackId);
            const updatedTrack = trackRes.data as SubtitleTrack;
            set((state) => ({
              tracks: state.tracks.map((t) => (t.id === trackId ? updatedTrack : t)),
            }));
            return;
          }
          if (job.status === 'failed') {
            set({ isSpeakerDetecting: false, speakerDetectJobId: null });
            return;
          }
          setTimeout(poll, 2000);
        } catch {
          set({ isSpeakerDetecting: false, speakerDetectJobId: null });
        }
      };
      poll();
    } catch {
      set({ isSpeakerDetecting: false, speakerDetectJobId: null });
    }
  },

  describeSounds: async (trackId: number, assetId: number) => {
    set({ isSoundDescribing: true, soundDescribeProgress: 0 });
    try {
      const res = await subtitleApi.soundDescribe({ track_id: trackId, asset_id: assetId });
      const jobId = res.data.id as number;
      set({ soundDescribeJobId: jobId });

      const poll = async () => {
        try {
          const jobRes = await processingApi.getJob(jobId);
          const job = jobRes.data;
          set({ soundDescribeProgress: job.progress ?? 0 });
          if (job.status === 'completed') {
            set({ isSoundDescribing: false, soundDescribeJobId: null });
            const trackRes = await subtitleApi.getTrack(trackId);
            const updatedTrack = trackRes.data as SubtitleTrack;
            set((state) => ({
              tracks: state.tracks.map((t) => (t.id === trackId ? updatedTrack : t)),
            }));
            return;
          }
          if (job.status === 'failed') {
            set({ isSoundDescribing: false, soundDescribeJobId: null });
            return;
          }
          setTimeout(poll, 2000);
        } catch {
          set({ isSoundDescribing: false, soundDescribeJobId: null });
        }
      };
      poll();
    } catch {
      set({ isSoundDescribing: false, soundDescribeJobId: null });
    }
  },

  reset: () => set(initialState),
}));
