import { AssetCache } from './AssetCache';

export interface WaveformPeaks {
  peaks: Float32Array;      // alternating [min0, max0, min1, max1, ...]
  samplesPerPeak: number;
  sampleRate: number;
  durationMs: number;
}

const TARGET_PEAKS = 2000;

function extractPeaks(audioBuffer: AudioBuffer): WaveformPeaks {
  const numChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;

  // Mix down to mono by averaging all channels
  const mono = new Float32Array(length);
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mono[i] += channelData[i] / numChannels;
    }
  }

  // Downsample into min/max peak pairs
  const samplesPerPeak = Math.max(1, Math.floor(length / TARGET_PEAKS));
  const actualPeakCount = Math.ceil(length / samplesPerPeak);
  const peaks = new Float32Array(actualPeakCount * 2);

  for (let i = 0; i < actualPeakCount; i++) {
    const start = i * samplesPerPeak;
    const end = Math.min(start + samplesPerPeak, length);
    let min = Infinity;
    let max = -Infinity;

    for (let j = start; j < end; j++) {
      const v = mono[j];
      if (v < min) min = v;
      if (v > max) max = v;
    }

    peaks[i * 2] = min;
    peaks[i * 2 + 1] = max;
  }

  return {
    peaks,
    samplesPerPeak,
    sampleRate: audioBuffer.sampleRate,
    durationMs: (audioBuffer.length / audioBuffer.sampleRate) * 1000,
  };
}

export class WaveformCache {
  private cache = new Map<string, WaveformPeaks>();
  private pending = new Map<string, Promise<WaveformPeaks>>();
  private assetCache = new AssetCache(20);
  private audioCtx: AudioContext | null = null;

  private static instance: WaveformCache;

  static getInstance(): WaveformCache {
    if (!WaveformCache.instance) {
      WaveformCache.instance = new WaveformCache();
    }
    return WaveformCache.instance;
  }

  private getAudioContext(): AudioContext {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
    }
    return this.audioCtx;
  }

  get(assetId: string): WaveformPeaks | null {
    return this.cache.get(assetId) ?? null;
  }

  has(assetId: string): boolean {
    return this.cache.has(assetId);
  }

  async load(assetId: string, url: string): Promise<WaveformPeaks> {
    // Return from cache
    const cached = this.cache.get(assetId);
    if (cached) return cached;

    // Deduplicate concurrent requests
    const existing = this.pending.get(assetId);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const audioCtx = this.getAudioContext();
        // Resume if suspended (Safari autoplay policy)
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }
        const audioBuffer = await this.assetCache.fetchAudio(assetId, url, audioCtx);
        const peaks = extractPeaks(audioBuffer);
        this.cache.set(assetId, peaks);
        return peaks;
      } finally {
        this.pending.delete(assetId);
      }
    })();

    this.pending.set(assetId, promise);
    return promise;
  }

  clear(): void {
    this.cache.clear();
    this.pending.clear();
  }
}
