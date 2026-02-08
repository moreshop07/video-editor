import type { RenderableTrack, RenderableClip } from './types';
import type { TrackAudioSettings } from '@/effects/types';
import { AssetCache } from './AssetCache';

interface ActiveSource {
  source: AudioBufferSourceNode;
  clipGain: GainNode;
}

interface TrackNodes {
  gain: GainNode;
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
  panner: StereoPannerNode;
  analyser: AnalyserNode;
}

export class AudioMixerEngine {
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private trackNodes = new Map<string, TrackNodes>();
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

  private createTrackNodes(trackId: string, audioSettings?: TrackAudioSettings): TrackNodes {
    if (!this.audioCtx || !this.masterGain) {
      throw new Error('AudioMixerEngine not initialized');
    }

    const gain = this.audioCtx.createGain();
    gain.gain.value = audioSettings?.volume ?? 1;

    // 3-band EQ: lowshelf → peaking → highshelf
    const eqLow = this.audioCtx.createBiquadFilter();
    eqLow.type = 'lowshelf';
    eqLow.frequency.value = audioSettings?.eq?.low.frequency ?? 200;
    eqLow.gain.value = audioSettings?.eq?.enabled ? (audioSettings.eq.low.gain ?? 0) : 0;

    const eqMid = this.audioCtx.createBiquadFilter();
    eqMid.type = 'peaking';
    eqMid.frequency.value = audioSettings?.eq?.mid.frequency ?? 1000;
    eqMid.Q.value = audioSettings?.eq?.mid.Q ?? 1;
    eqMid.gain.value = audioSettings?.eq?.enabled ? (audioSettings.eq.mid.gain ?? 0) : 0;

    const eqHigh = this.audioCtx.createBiquadFilter();
    eqHigh.type = 'highshelf';
    eqHigh.frequency.value = audioSettings?.eq?.high.frequency ?? 5000;
    eqHigh.gain.value = audioSettings?.eq?.enabled ? (audioSettings.eq.high.gain ?? 0) : 0;

    // Dynamics compressor
    const compressor = this.audioCtx.createDynamicsCompressor();
    if (audioSettings?.compressor?.enabled) {
      compressor.threshold.value = audioSettings.compressor.threshold;
      compressor.ratio.value = audioSettings.compressor.ratio;
      compressor.attack.value = audioSettings.compressor.attack;
      compressor.release.value = audioSettings.compressor.release;
      compressor.knee.value = audioSettings.compressor.knee;
    } else {
      // Passthrough: threshold 0 means no compression
      compressor.threshold.value = 0;
      compressor.ratio.value = 1;
    }

    // Stereo panner
    const panner = this.audioCtx.createStereoPanner();
    panner.pan.value = audioSettings?.pan ?? 0;

    // Analyser for level metering
    const analyser = this.audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;

    // Connect chain: eqLow → eqMid → eqHigh → compressor → panner → gain → analyser → masterGain
    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);
    eqHigh.connect(compressor);
    compressor.connect(panner);
    panner.connect(gain);
    gain.connect(analyser);
    analyser.connect(this.masterGain);

    const nodes: TrackNodes = { gain, eqLow, eqMid, eqHigh, compressor, panner, analyser };
    this.trackNodes.set(trackId, nodes);
    return nodes;
  }

  private getOrCreateTrackNodes(trackId: string, audioSettings?: TrackAudioSettings): TrackNodes {
    let nodes = this.trackNodes.get(trackId);
    if (!nodes) {
      nodes = this.createTrackNodes(trackId, audioSettings);
    }
    return nodes;
  }

  /**
   * Update audio settings for a track without recreating nodes.
   */
  updateTrackSettings(trackId: string, settings: TrackAudioSettings): void {
    const nodes = this.trackNodes.get(trackId);
    if (!nodes) return;

    nodes.gain.gain.value = settings.volume;
    nodes.panner.pan.value = settings.pan;

    // EQ
    if (settings.eq?.enabled) {
      nodes.eqLow.gain.value = settings.eq.low.gain;
      nodes.eqLow.frequency.value = settings.eq.low.frequency;
      nodes.eqMid.gain.value = settings.eq.mid.gain;
      nodes.eqMid.frequency.value = settings.eq.mid.frequency;
      nodes.eqMid.Q.value = settings.eq.mid.Q;
      nodes.eqHigh.gain.value = settings.eq.high.gain;
      nodes.eqHigh.frequency.value = settings.eq.high.frequency;
    } else {
      nodes.eqLow.gain.value = 0;
      nodes.eqMid.gain.value = 0;
      nodes.eqHigh.gain.value = 0;
    }

    // Compressor
    if (settings.compressor?.enabled) {
      nodes.compressor.threshold.value = settings.compressor.threshold;
      nodes.compressor.ratio.value = settings.compressor.ratio;
      nodes.compressor.attack.value = settings.compressor.attack;
      nodes.compressor.release.value = settings.compressor.release;
      nodes.compressor.knee.value = settings.compressor.knee;
    } else {
      nodes.compressor.threshold.value = 0;
      nodes.compressor.ratio.value = 1;
    }
  }

  /**
   * Get current RMS audio level for a track (0–1).
   */
  getTrackLevel(trackId: string): number {
    const nodes = this.trackNodes.get(trackId);
    if (!nodes) return 0;

    const dataArray = new Uint8Array(nodes.analyser.frequencyBinCount);
    nodes.analyser.getByteTimeDomainData(dataArray);

    let sumOfSquares = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = (dataArray[i] - 128) / 128;
      sumOfSquares += normalized * normalized;
    }
    return Math.sqrt(sumOfSquares / dataArray.length);
  }

  /**
   * Get frequency-domain data for a track (for EQ visualization).
   */
  getTrackFrequencyData(trackId: string): Uint8Array | null {
    const nodes = this.trackNodes.get(trackId);
    if (!nodes) return null;
    const data = new Uint8Array(nodes.analyser.frequencyBinCount);
    nodes.analyser.getByteFrequencyData(data);
    return data;
  }

  /**
   * Get IDs of all tracks that currently have audio nodes.
   */
  getTrackIds(): string[] {
    return Array.from(this.trackNodes.keys());
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

      const trackNodes = this.getOrCreateTrackNodes(track.id, track.audioSettings);
      // Sync settings each time playback is scheduled
      if (track.audioSettings) {
        this.updateTrackSettings(track.id, track.audioSettings);
      }

      for (const clip of track.clips) {
        // Skip clips that have already ended
        if (clip.endTime <= timeMs) continue;

        const buffer = await this.getAudioBuffer(clip.assetId);
        if (!buffer) continue;

        this.scheduleClip(clip, timeMs, buffer, trackNodes);
      }
    }
  }

  private scheduleClip(
    clip: RenderableClip,
    currentTimeMs: number,
    buffer: AudioBuffer,
    trackNodes: TrackNodes,
  ): void {
    if (!this.audioCtx) return;

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;

    const clipGain = this.audioCtx.createGain();
    source.connect(clipGain);
    // Connect clipGain to the first node in the track chain (eqLow)
    clipGain.connect(trackNodes.eqLow);

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
    // Disconnect all track node chains
    for (const nodes of this.trackNodes.values()) {
      nodes.eqLow.disconnect();
      nodes.eqMid.disconnect();
      nodes.eqHigh.disconnect();
      nodes.compressor.disconnect();
      nodes.panner.disconnect();
      nodes.gain.disconnect();
      nodes.analyser.disconnect();
    }
    this.trackNodes.clear();
    this.preloadedAudio.clear();
    if (this.audioCtx?.state !== 'closed') {
      this.audioCtx?.close();
    }
    this.audioCtx = null;
    this.masterGain = null;
  }
}
