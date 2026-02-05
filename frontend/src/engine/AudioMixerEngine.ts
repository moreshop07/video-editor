import type { RenderableTrack, RenderableClip } from './types';
import { AssetCache } from './AssetCache';

interface ActiveSource {
  source: AudioBufferSourceNode;
  clipGain: GainNode;
}

export class AudioMixerEngine {
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private trackGains = new Map<string, GainNode>();
  private activeSources: ActiveSource[] = [];
  private assetCache: AssetCache;
  private urlResolver: ((assetId: string) => string) | null = null;
  private preloadedAudio = new Set<string>();

  constructor(assetCache: AssetCache) {
    this.assetCache = assetCache;
  }

  async init(): Promise<void> {
    this.audioCtx = new AudioContext();
    this.masterGain = this.audioCtx.createGain();
    this.masterGain.connect(this.audioCtx.destination);
  }

  setUrlResolver(resolver: (assetId: string) => string): void {
    this.urlResolver = resolver;
  }

  getAudioContext(): AudioContext | null {
    return this.audioCtx;
  }

  setMasterVolume(volume: number): void {
    if (this.masterGain) {
      this.masterGain.gain.value = volume;
    }
  }

  private getOrCreateTrackGain(trackId: string, volume: number): GainNode {
    if (!this.audioCtx || !this.masterGain) {
      throw new Error('AudioMixerEngine not initialized');
    }

    let gain = this.trackGains.get(trackId);
    if (!gain) {
      gain = this.audioCtx.createGain();
      gain.connect(this.masterGain);
      this.trackGains.set(trackId, gain);
    }
    gain.gain.value = volume;
    return gain;
  }

  private async getAudioBuffer(assetId: string): Promise<AudioBuffer | null> {
    if (!this.audioCtx || !this.urlResolver) return null;

    try {
      const url = this.urlResolver(assetId);
      return await this.assetCache.fetchAudio(assetId, url, this.audioCtx);
    } catch {
      return null;
    }
  }

  stopAll(): void {
    for (const { source } of this.activeSources) {
      try {
        source.stop();
      } catch {
        // May already be stopped
      }
    }
    this.activeSources = [];
  }

  /**
   * Preload audio buffers for all clips to avoid jitter during playback.
   */
  async preloadAudioForClips(tracks: RenderableTrack[]): Promise<void> {
    if (!this.audioCtx || !this.urlResolver) return;

    const promises: Promise<void>[] = [];

    for (const track of tracks) {
      const hasAudio = ['video', 'audio', 'music', 'sfx'].includes(track.type);
      if (!hasAudio) continue;

      for (const clip of track.clips) {
        if (this.preloadedAudio.has(clip.assetId)) continue;

        promises.push(
          this.getAudioBuffer(clip.assetId)
            .then(() => {
              this.preloadedAudio.add(clip.assetId);
            })
            .catch(() => {
              // Log but don't fail preload
              console.warn(`Failed to preload audio: ${clip.assetId}`);
            })
        );
      }
    }

    await Promise.all(promises);
  }

  /**
   * Schedule audio playback from the given time position.
   * All active clips' audio sources are scheduled using Web Audio API's
   * precise timing system.
   */
  async schedulePlayback(
    timeMs: number,
    tracks: RenderableTrack[],
  ): Promise<void> {
    if (!this.audioCtx || !this.masterGain) return;

    // Resume AudioContext if suspended (browser autoplay policy)
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    this.stopAll();

    for (const track of tracks) {
      if (track.muted) continue;

      const hasAudio = ['video', 'audio', 'music', 'sfx'].includes(track.type);
      if (!hasAudio) continue;

      const trackGain = this.getOrCreateTrackGain(track.id, track.volume);

      for (const clip of track.clips) {
        // Skip clips that have already ended
        if (clip.endTime <= timeMs) continue;

        const buffer = await this.getAudioBuffer(clip.assetId);
        if (!buffer) continue;

        this.scheduleClip(clip, timeMs, buffer, trackGain);
      }
    }
  }

  private scheduleClip(
    clip: RenderableClip,
    currentTimeMs: number,
    buffer: AudioBuffer,
    trackGain: GainNode,
  ): void {
    if (!this.audioCtx) return;

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;

    const clipGain = this.audioCtx.createGain();
    source.connect(clipGain);
    clipGain.connect(trackGain);

    // Calculate scheduling parameters
    const clipStartDelay = Math.max(0, clip.startTime - currentTimeMs) / 1000;
    const sourceOffset = (clip.trimStart + Math.max(0, currentTimeMs - clip.startTime)) / 1000;
    const remainingDuration = (clip.endTime - Math.max(clip.startTime, currentTimeMs)) / 1000;
    const effectiveStart = Math.max(clip.startTime, currentTimeMs);

    const audioStartTime = this.audioCtx.currentTime + clipStartDelay;
    const audioEndTime = audioStartTime + remainingDuration;
    const targetVolume = clip.volume;

    const fadeInMs = clip.fadeInMs ?? 0;
    const fadeOutMs = clip.fadeOutMs ?? 0;

    // Calculate how much of the fade-in has already elapsed (if seeking mid-fade)
    const elapsedInClipMs = effectiveStart - clip.startTime;

    if (fadeInMs > 0 && elapsedInClipMs < fadeInMs) {
      // Fade in: start from partial progress
      const fadeInRemaining = (fadeInMs - elapsedInClipMs) / 1000;
      const startVolume = (elapsedInClipMs / fadeInMs) * targetVolume;
      clipGain.gain.setValueAtTime(startVolume, audioStartTime);
      clipGain.gain.linearRampToValueAtTime(targetVolume, audioStartTime + fadeInRemaining);
    } else {
      clipGain.gain.setValueAtTime(targetVolume, audioStartTime);
    }

    if (fadeOutMs > 0) {
      const clipDurationMs = clip.endTime - clip.startTime;
      const fadeOutStartInClipMs = clipDurationMs - fadeOutMs;
      const fadeOutStartTime = audioStartTime + Math.max(0, (fadeOutStartInClipMs - elapsedInClipMs) / 1000);
      if (fadeOutStartTime < audioEndTime) {
        clipGain.gain.setValueAtTime(targetVolume, Math.max(fadeOutStartTime, audioStartTime));
        clipGain.gain.linearRampToValueAtTime(0, audioEndTime);
      }
    }

    source.start(
      audioStartTime,
      sourceOffset,
      remainingDuration,
    );

    this.activeSources.push({ source, clipGain });

    source.onended = () => {
      this.activeSources = this.activeSources.filter((s) => s.source !== source);
    };
  }

  pause(): void {
    this.audioCtx?.suspend();
  }

  async resume(): Promise<void> {
    await this.audioCtx?.resume();
  }

  dispose(): void {
    this.stopAll();
    this.trackGains.clear();
    this.preloadedAudio.clear();
    if (this.audioCtx?.state !== 'closed') {
      this.audioCtx?.close();
    }
    this.audioCtx = null;
    this.masterGain = null;
  }
}
