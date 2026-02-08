import type { DuckingSettings, DuckingEnvelope, DuckingEnvelopePoint } from '@/effects/types';
import type { AudioMixerEngine } from './AudioMixerEngine';
import type { RenderableTrack } from './types';

interface DuckingState {
  currentGain: number;
}

const AUDIO_TRACK_TYPES = new Set(['video', 'audio', 'music', 'sfx']);
const FRAME_MS = 16.67; // ~60fps

export class DuckingProcessor {
  private engine: AudioMixerEngine;
  private states = new Map<string, DuckingState>();
  private rafId: number | null = null;
  private tracks: RenderableTrack[] = [];
  private isRunning = false;

  constructor(engine: AudioMixerEngine) {
    this.engine = engine;
  }

  setTracks(tracks: RenderableTrack[]): void {
    this.tracks = tracks;
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.states.clear();
    this.loop();
  }

  stop(): void {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    // Reset all ducking gains to 1
    for (const [trackId] of this.states) {
      this.engine.setTrackDuckingGain(trackId, 1);
    }
    this.states.clear();
  }

  private loop = (): void => {
    if (!this.isRunning) return;
    this.processFrame();
    this.rafId = requestAnimationFrame(this.loop);
  };

  private processFrame(): void {
    for (const track of this.tracks) {
      if (track.muted) continue;
      if (!AUDIO_TRACK_TYPES.has(track.type)) continue;

      const ducking = track.audioSettings?.ducking;
      if (!ducking?.enabled || ducking.sourceTrackIds.length === 0) continue;

      // If this track has a baked envelope, skip real-time processing
      if (track.audioSettings?.duckingEnvelope?.length) continue;

      // Get max RMS level across all source tracks
      let maxSourceLevel = 0;
      for (const sourceId of ducking.sourceTrackIds) {
        const level = this.engine.getTrackLevel(sourceId);
        maxSourceLevel = Math.max(maxSourceLevel, level);
      }

      // Get or initialize state
      let state = this.states.get(track.id);
      if (!state) {
        state = { currentGain: 1 };
        this.states.set(track.id, state);
      }

      // Compute new gain with smoothing
      state.currentGain = this.computeGain(state.currentGain, maxSourceLevel, ducking);

      // Apply
      this.engine.setTrackDuckingGain(track.id, state.currentGain);
    }
  }

  private computeGain(current: number, sourceLevel: number, settings: DuckingSettings): number {
    const isAbove = sourceLevel > settings.threshold;
    const target = isAbove ? settings.reduction : 1;
    const timeConstant = isAbove ? settings.attackMs : settings.releaseMs;
    const coeff = 1 - Math.exp(-FRAME_MS / Math.max(timeConstant, 1));
    return current + (target - current) * coeff;
  }

  /**
   * Generate a baked ducking envelope by analyzing source track activity.
   * Walks timeline at STEP_MS resolution, computes smoothed gain curve.
   */
  generateEnvelope(
    sourceTrackIds: string[],
    tracks: RenderableTrack[],
    settings: DuckingSettings,
    durationMs: number,
  ): DuckingEnvelope {
    const STEP_MS = 10;
    const envelope: DuckingEnvelope = [];
    let currentGain = 1;

    // Build quick lookup: for each step, which source clips are active?
    const sourceTracks = tracks.filter(
      (t) => sourceTrackIds.includes(t.id) && !t.muted && AUDIO_TRACK_TYPES.has(t.type),
    );

    for (let timeMs = 0; timeMs <= durationMs; timeMs += STEP_MS) {
      // Check if any source clip is active at this time
      let hasActivity = false;
      for (const track of sourceTracks) {
        for (const clip of track.clips) {
          if (timeMs >= clip.startTime && timeMs < clip.endTime) {
            hasActivity = true;
            break;
          }
        }
        if (hasActivity) break;
      }

      // Simulate level: active source = above threshold, inactive = below
      const simulatedLevel = hasActivity ? settings.threshold + 0.1 : 0;
      currentGain = this.computeGain(currentGain, simulatedLevel, {
        ...settings,
        // Use STEP_MS as the frame time for baked mode
        attackMs: settings.attackMs * (STEP_MS / FRAME_MS),
        releaseMs: settings.releaseMs * (STEP_MS / FRAME_MS),
      });

      // Round gain to reduce envelope size
      const roundedGain = Math.round(currentGain * 1000) / 1000;

      // Only add point if gain changed from last point
      const lastPoint = envelope[envelope.length - 1];
      if (!lastPoint || lastPoint.gain !== roundedGain) {
        envelope.push({ timeMs, gain: roundedGain });
      }
    }

    return envelope;
  }
}
