import type { RenderableTrack, RenderableClip } from './types';
import type { TrackAudioSettings } from '@/effects/types';
import { AssetCache } from './AssetCache';
import { computeSourceTime, getSpeedAtTime } from '@/utils/speedRampUtils';
import { generateImpulseResponse, clearIRCache } from './impulseResponse';

interface ActiveSource {
  source: AudioBufferSourceNode;
  clipGain: GainNode;
}

interface TrackNodes {
  gain: GainNode;
  duckingGain: GainNode;
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
  panner: StereoPannerNode;
  analyser: AnalyserNode;
  // Reverb
  reverbDry: GainNode;
  reverbWet: GainNode;
  reverbConvolver: ConvolverNode;
  reverbPreDelay: DelayNode;
  reverbOutput: GainNode;
  // Delay
  delayDry: GainNode;
  delayWet: GainNode;
  delayNode: DelayNode;
  delayFeedback: GainNode;
  delayOutput: GainNode;
  // Chorus
  chorusDry: GainNode;
  chorusWet: GainNode;
  chorusDelay1: DelayNode;
  chorusDelay2: DelayNode;
  chorusLfo1: OscillatorNode;
  chorusLfo2: OscillatorNode;
  chorusLfoGain1: GainNode;
  chorusLfoGain2: GainNode;
  chorusOutput: GainNode;
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

    // ── Reverb (wet/dry parallel routing) ──
    const reverbDry = this.audioCtx.createGain();
    const reverbWet = this.audioCtx.createGain();
    const reverbConvolver = this.audioCtx.createConvolver();
    const reverbPreDelay = this.audioCtx.createDelay(0.1); // max 100ms
    const reverbOutput = this.audioCtx.createGain();

    const rev = audioSettings?.reverb;
    if (rev?.enabled) {
      reverbDry.gain.value = 1 - rev.mix;
      reverbWet.gain.value = rev.mix;
      reverbPreDelay.delayTime.value = rev.preDelay / 1000;
      reverbConvolver.buffer = generateImpulseResponse(this.audioCtx, rev.decay, rev.preDelay);
    } else {
      reverbDry.gain.value = 1;
      reverbWet.gain.value = 0;
      reverbPreDelay.delayTime.value = 0.01;
      reverbConvolver.buffer = generateImpulseResponse(this.audioCtx, 2.0, 10);
    }

    // compressor → reverbDry → reverbOutput
    // compressor → reverbWet → reverbPreDelay → reverbConvolver → reverbOutput
    compressor.connect(reverbDry);
    compressor.connect(reverbWet);
    reverbDry.connect(reverbOutput);
    reverbWet.connect(reverbPreDelay);
    reverbPreDelay.connect(reverbConvolver);
    reverbConvolver.connect(reverbOutput);

    // ── Delay (wet/dry with feedback) ──
    const delayDry = this.audioCtx.createGain();
    const delayWet = this.audioCtx.createGain();
    const delayNode = this.audioCtx.createDelay(2.0); // max 2s
    const delayFeedback = this.audioCtx.createGain();
    const delayOutput = this.audioCtx.createGain();

    const dly = audioSettings?.delay;
    if (dly?.enabled) {
      delayDry.gain.value = 1 - dly.mix;
      delayWet.gain.value = dly.mix;
      delayNode.delayTime.value = dly.time;
      delayFeedback.gain.value = dly.feedback;
    } else {
      delayDry.gain.value = 1;
      delayWet.gain.value = 0;
      delayNode.delayTime.value = 0.3;
      delayFeedback.gain.value = 0;
    }

    // reverbOutput → delayDry → delayOutput
    // reverbOutput → delayWet → delayNode → delayOutput
    //                             ↑    ↓
    //                             └── delayFeedback ←┘
    reverbOutput.connect(delayDry);
    reverbOutput.connect(delayWet);
    delayDry.connect(delayOutput);
    delayWet.connect(delayNode);
    delayNode.connect(delayOutput);
    delayNode.connect(delayFeedback);
    delayFeedback.connect(delayNode);

    // ── Chorus (2-voice modulated delay) ──
    const chorusDry = this.audioCtx.createGain();
    const chorusWet = this.audioCtx.createGain();
    const chorusDelay1 = this.audioCtx.createDelay(0.05); // max 50ms
    const chorusDelay2 = this.audioCtx.createDelay(0.05);
    const chorusLfo1 = this.audioCtx.createOscillator();
    const chorusLfo2 = this.audioCtx.createOscillator();
    const chorusLfoGain1 = this.audioCtx.createGain();
    const chorusLfoGain2 = this.audioCtx.createGain();
    const chorusOutput = this.audioCtx.createGain();

    const cho = audioSettings?.chorus;
    const choRate = cho?.rate ?? 1.5;
    const choDepth = cho?.depth ?? 0.005;
    if (cho?.enabled) {
      chorusDry.gain.value = 1 - cho.mix;
      chorusWet.gain.value = cho.mix;
    } else {
      chorusDry.gain.value = 1;
      chorusWet.gain.value = 0;
    }

    // Base delay for chorus voices (center of modulation)
    chorusDelay1.delayTime.value = 0.015; // 15ms base
    chorusDelay2.delayTime.value = 0.017; // 17ms base (slight offset for richness)

    // LFO → modulates delayTime
    chorusLfo1.type = 'sine';
    chorusLfo1.frequency.value = choRate;
    chorusLfo2.type = 'sine';
    chorusLfo2.frequency.value = choRate * 1.1; // Slight detune for stereo width
    chorusLfoGain1.gain.value = choDepth;
    chorusLfoGain2.gain.value = choDepth;

    chorusLfo1.connect(chorusLfoGain1);
    chorusLfoGain1.connect(chorusDelay1.delayTime);
    chorusLfo2.connect(chorusLfoGain2);
    chorusLfoGain2.connect(chorusDelay2.delayTime);
    chorusLfo1.start();
    chorusLfo2.start();

    // delayOutput → chorusDry → chorusOutput
    // delayOutput → chorusWet → chorusDelay1 → chorusOutput
    // delayOutput → chorusWet → chorusDelay2 → chorusOutput
    delayOutput.connect(chorusDry);
    delayOutput.connect(chorusWet);
    chorusDry.connect(chorusOutput);
    chorusWet.connect(chorusDelay1);
    chorusWet.connect(chorusDelay2);
    chorusDelay1.connect(chorusOutput);
    chorusDelay2.connect(chorusOutput);

    // Stereo panner
    const panner = this.audioCtx.createStereoPanner();
    panner.pan.value = audioSettings?.pan ?? 0;

    // Ducking gain node (controlled by DuckingProcessor)
    const duckingGain = this.audioCtx.createGain();
    duckingGain.gain.value = 1; // No ducking by default

    // Analyser for level metering
    const analyser = this.audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;

    // Connect final chain: chorusOutput → panner → gain → duckingGain → analyser → masterGain
    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);
    eqHigh.connect(compressor);
    // compressor → [reverb] → [delay] → [chorus] already wired above
    chorusOutput.connect(panner);
    panner.connect(gain);
    gain.connect(duckingGain);
    duckingGain.connect(analyser);
    analyser.connect(this.masterGain);

    const nodes: TrackNodes = {
      gain, duckingGain, eqLow, eqMid, eqHigh, compressor, panner, analyser,
      reverbDry, reverbWet, reverbConvolver, reverbPreDelay, reverbOutput,
      delayDry, delayWet, delayNode, delayFeedback, delayOutput,
      chorusDry, chorusWet, chorusDelay1, chorusDelay2,
      chorusLfo1, chorusLfo2, chorusLfoGain1, chorusLfoGain2, chorusOutput,
    };
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

    // Reverb
    const rev = settings.reverb;
    if (rev?.enabled) {
      nodes.reverbDry.gain.value = 1 - rev.mix;
      nodes.reverbWet.gain.value = rev.mix;
      nodes.reverbPreDelay.delayTime.value = rev.preDelay / 1000;
      if (this.audioCtx) {
        nodes.reverbConvolver.buffer = generateImpulseResponse(this.audioCtx, rev.decay, rev.preDelay);
      }
    } else {
      nodes.reverbDry.gain.value = 1;
      nodes.reverbWet.gain.value = 0;
    }

    // Delay
    const dly = settings.delay;
    if (dly?.enabled) {
      nodes.delayDry.gain.value = 1 - dly.mix;
      nodes.delayWet.gain.value = dly.mix;
      nodes.delayNode.delayTime.value = dly.time;
      nodes.delayFeedback.gain.value = dly.feedback;
    } else {
      nodes.delayDry.gain.value = 1;
      nodes.delayWet.gain.value = 0;
      nodes.delayFeedback.gain.value = 0;
    }

    // Chorus
    const cho = settings.chorus;
    if (cho?.enabled) {
      nodes.chorusDry.gain.value = 1 - cho.mix;
      nodes.chorusWet.gain.value = cho.mix;
      nodes.chorusLfo1.frequency.value = cho.rate;
      nodes.chorusLfo2.frequency.value = cho.rate * 1.1;
      nodes.chorusLfoGain1.gain.value = cho.depth;
      nodes.chorusLfoGain2.gain.value = cho.depth;
    } else {
      nodes.chorusDry.gain.value = 1;
      nodes.chorusWet.gain.value = 0;
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
   * Set the ducking gain for a track (called by DuckingProcessor).
   */
  setTrackDuckingGain(trackId: string, gain: number): void {
    const nodes = this.trackNodes.get(trackId);
    if (!nodes || !this.audioCtx) return;
    nodes.duckingGain.gain.setTargetAtTime(gain, this.audioCtx.currentTime, 0.01);
  }

  /**
   * Schedule baked ducking envelope on a track's duckingGain node.
   */
  scheduleDuckingEnvelope(trackId: string, envelope: Array<{ timeMs: number; gain: number }>, startTimeMs: number): void {
    const nodes = this.trackNodes.get(trackId);
    if (!nodes || !this.audioCtx) return;

    const audioNow = this.audioCtx.currentTime;
    const duckGain = nodes.duckingGain.gain;

    // Find the initial gain at startTime
    let initialGain = 1;
    for (let i = envelope.length - 1; i >= 0; i--) {
      if (envelope[i].timeMs <= startTimeMs) {
        initialGain = envelope[i].gain;
        break;
      }
    }
    duckGain.setValueAtTime(initialGain, audioNow);

    // Schedule future envelope points
    for (const point of envelope) {
      if (point.timeMs <= startTimeMs) continue;
      const offsetSec = (point.timeMs - startTimeMs) / 1000;
      duckGain.linearRampToValueAtTime(point.gain, audioNow + offsetSec);
    }
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

      // Apply baked ducking envelope if present
      if (track.audioSettings?.duckingEnvelope?.length) {
        this.scheduleDuckingEnvelope(track.id, track.audioSettings.duckingEnvelope, timeMs);
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

    // Speed-aware scheduling parameters
    const staticSpeed = clip.filters?.speed ?? 1;
    const hasSpeedKeyframes = (clip.keyframes?.speed?.length ?? 0) > 0;
    const clipStartDelay = Math.max(0, clip.startTime - currentTimeMs) / 1000;
    const elapsedClipTimeMs = Math.max(0, currentTimeMs - clip.startTime);
    const sourceOffset = computeSourceTime(clip.trimStart, elapsedClipTimeMs, clip.keyframes, staticSpeed) / 1000;
    const remainingDuration = (clip.endTime - Math.max(clip.startTime, currentTimeMs)) / 1000;
    const effectiveStart = Math.max(clip.startTime, currentTimeMs);

    const audioStartTime = this.audioCtx.currentTime + clipStartDelay;
    const audioEndTime = audioStartTime + remainingDuration;
    const targetVolume = clip.volume;

    // Set playback rate for speed
    if (hasSpeedKeyframes) {
      this.scheduleSpeedCurve(source, clip, currentTimeMs, audioStartTime, remainingDuration);
    } else {
      source.playbackRate.value = staticSpeed;
    }

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

  /**
   * Schedule playbackRate automation for speed keyframes on an audio source.
   */
  private scheduleSpeedCurve(
    source: AudioBufferSourceNode,
    clip: RenderableClip,
    currentTimeMs: number,
    audioStartTime: number,
    timelineDurationSec: number,
  ): void {
    const speedKfs = clip.keyframes?.speed;
    if (!speedKfs || speedKfs.length === 0) return;

    const clipStartMs = Math.max(clip.startTime, currentTimeMs);
    const initialClipTime = clipStartMs - clip.startTime;
    const staticSpeed = clip.filters?.speed ?? 1;

    // Set initial speed
    const initialSpeed = getSpeedAtTime(clip.keyframes, staticSpeed, initialClipTime);
    source.playbackRate.setValueAtTime(initialSpeed, audioStartTime);

    // Schedule ramps at each keyframe that falls within playback range
    const sorted = [...speedKfs].sort((a, b) => a.time - b.time);
    for (const kf of sorted) {
      const kfOffsetSec = (kf.time - initialClipTime) / 1000;
      if (kfOffsetSec <= 0) continue;
      if (kfOffsetSec > timelineDurationSec) break;
      source.playbackRate.linearRampToValueAtTime(kf.value, audioStartTime + kfOffsetSec);
    }
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
      // Reverb
      nodes.reverbDry.disconnect();
      nodes.reverbWet.disconnect();
      nodes.reverbPreDelay.disconnect();
      nodes.reverbConvolver.disconnect();
      nodes.reverbOutput.disconnect();
      // Delay
      nodes.delayDry.disconnect();
      nodes.delayWet.disconnect();
      nodes.delayNode.disconnect();
      nodes.delayFeedback.disconnect();
      nodes.delayOutput.disconnect();
      // Chorus
      nodes.chorusDry.disconnect();
      nodes.chorusWet.disconnect();
      nodes.chorusDelay1.disconnect();
      nodes.chorusDelay2.disconnect();
      try { nodes.chorusLfo1.stop(); } catch { /* already stopped */ }
      try { nodes.chorusLfo2.stop(); } catch { /* already stopped */ }
      nodes.chorusLfo1.disconnect();
      nodes.chorusLfo2.disconnect();
      nodes.chorusLfoGain1.disconnect();
      nodes.chorusLfoGain2.disconnect();
      nodes.chorusOutput.disconnect();
      // Original tail
      nodes.panner.disconnect();
      nodes.gain.disconnect();
      nodes.duckingGain.disconnect();
      nodes.analyser.disconnect();
    }
    this.trackNodes.clear();
    this.preloadedAudio.clear();
    clearIRCache();
    if (this.audioCtx?.state !== 'closed') {
      this.audioCtx?.close();
    }
    this.audioCtx = null;
    this.masterGain = null;
  }
}
