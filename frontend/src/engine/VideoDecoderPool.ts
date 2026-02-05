import type { IVideoDecoderPool } from './types';

interface ScrubCacheEntry {
  bitmap: ImageBitmap;
  timestamp: number;
  createdAt: number;
}

interface ManagedDecoder {
  decoder: VideoDecoder;
  pendingFrames: Map<number, VideoFrame>; // timestamp -> frame
  scrubCache: Map<number, ScrubCacheEntry>; // bucket key -> entry
  lastAccessed: number;
  ready: boolean;
  sampleTable: EncodedVideoChunkInfo[];
  config: VideoDecoderConfig;
}

interface EncodedVideoChunkInfo {
  timestamp: number; // microseconds
  duration: number;
  data: Uint8Array;
  isKey: boolean;
}

/**
 * WebCodecs-based video decoder pool.
 * Uses mp4box.js for demuxing MP4 files into encoded chunks,
 * then feeds them to VideoDecoder for hardware-accelerated decoding.
 *
 * Falls back gracefully if WebCodecs or mp4box is not available.
 */
export class VideoDecoderPool implements IVideoDecoderPool {
  private decoders = new Map<string, ManagedDecoder>();
  private maxDecoders: number;
  private mp4boxModule: typeof import('mp4box') | null = null;

  // Scrub cache constants
  private readonly SCRUB_CACHE_BUCKET_SIZE = 100_000; // 100ms buckets in µs
  private readonly SCRUB_CACHE_MAX_SIZE = 30;
  private readonly SCRUB_CACHE_TTL = 5000; // ms

  constructor(maxDecoders = 3) {
    this.maxDecoders = maxDecoders;
  }

  static isSupported(): boolean {
    return typeof VideoDecoder !== 'undefined'
      && typeof VideoDecoder.isConfigSupported === 'function';
  }

  private async loadMp4box(): Promise<typeof import('mp4box')> {
    if (this.mp4boxModule) return this.mp4boxModule;
    try {
      this.mp4boxModule = await import('mp4box');
      return this.mp4boxModule;
    } catch {
      throw new Error('mp4box.js is required for WebCodecs video decoding. Install with: npm install mp4box');
    }
  }

  async preload(assetId: string, url: string): Promise<void> {
    if (this.decoders.has(assetId)) return;

    this.evictIfNeeded();

    const MP4Box = await this.loadMp4box();
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();

    // Demux with mp4box.js
    const { config, samples } = await this.demux(MP4Box, buffer);

    // Create decoder
    const managed: ManagedDecoder = {
      decoder: null!,
      pendingFrames: new Map(),
      scrubCache: new Map(),
      lastAccessed: Date.now(),
      ready: false,
      sampleTable: samples,
      config,
    };

    const decoder = new VideoDecoder({
      output: (frame: VideoFrame) => {
        managed.pendingFrames.set(frame.timestamp, frame);
        // Keep max 10 frames in buffer
        if (managed.pendingFrames.size > 10) {
          const oldest = Math.min(...managed.pendingFrames.keys());
          managed.pendingFrames.get(oldest)?.close();
          managed.pendingFrames.delete(oldest);
        }
      },
      error: (err: DOMException) => {
        console.error(`VideoDecoder error for ${assetId}:`, err);
      },
    });

    decoder.configure(config);
    managed.decoder = decoder;
    managed.ready = true;
    this.decoders.set(assetId, managed);
  }

  private async demux(
    MP4Box: typeof import('mp4box'),
    buffer: ArrayBuffer,
  ): Promise<{ config: VideoDecoderConfig; samples: EncodedVideoChunkInfo[] }> {
    return new Promise((resolve, reject) => {
      const file = MP4Box.createFile();
      const samples: EncodedVideoChunkInfo[] = [];
      let config: VideoDecoderConfig | null = null;

      file.onReady = (info: { videoTracks: Array<{ id: number; codec: string; track_width: number; track_height: number }> }) => {
        const videoTrack = info.videoTracks[0];
        if (!videoTrack) {
          reject(new Error('No video track found'));
          return;
        }

        // Extract codec-specific description
        const trak = file.getTrackById(videoTrack.id);
        const descriptionEntry = trak?.mdia?.minf?.stbl?.stsd?.entries?.[0];
        let description: Uint8Array | undefined;

        if (descriptionEntry?.avcC) {
          const stream = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN);
          descriptionEntry.avcC.write(stream);
          description = new Uint8Array(stream.buffer, 8);
        } else if (descriptionEntry?.hvcC) {
          const stream = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN);
          descriptionEntry.hvcC.write(stream);
          description = new Uint8Array(stream.buffer, 8);
        }

        config = {
          codec: videoTrack.codec,
          codedWidth: videoTrack.track_width,
          codedHeight: videoTrack.track_height,
          ...(description ? { description } : {}),
        };

        file.setExtractionOptions(videoTrack.id);
        file.start();
      };

      file.onSamples = (_trackId: number, _ref: unknown, sampleList: Array<{
        is_sync: boolean;
        cts: number;
        duration: number;
        timescale: number;
        data: ArrayBuffer;
      }>) => {
        for (const sample of sampleList) {
          samples.push({
            timestamp: (sample.cts * 1_000_000) / sample.timescale,
            duration: (sample.duration * 1_000_000) / sample.timescale,
            data: new Uint8Array(sample.data),
            isKey: sample.is_sync,
          });
        }
      };

      file.onError = (err: string) => reject(new Error(err));

      // Feed data to mp4box
      const ab = buffer.slice(0) as ArrayBuffer & { fileStart: number };
      ab.fileStart = 0;
      file.appendBuffer(ab);
      file.flush();

      // Resolve after parsing
      setTimeout(() => {
        if (config) {
          resolve({ config, samples });
        } else {
          reject(new Error('Failed to parse video'));
        }
      }, 0);
    });
  }

  async getFrame(assetId: string, timeMs: number): Promise<ImageBitmap | null> {
    const managed = this.decoders.get(assetId);
    if (!managed?.ready) return null;

    managed.lastAccessed = Date.now();
    const targetTimestamp = timeMs * 1000; // ms → µs
    const bucketKey = Math.floor(targetTimestamp / this.SCRUB_CACHE_BUCKET_SIZE);

    // Check scrub cache first
    const cached = managed.scrubCache.get(bucketKey);
    if (cached && Date.now() - cached.createdAt < this.SCRUB_CACHE_TTL) {
      return cached.bitmap;
    }

    // Check pending frames buffer
    const existing = this.findClosestFrame(managed.pendingFrames, targetTimestamp);
    if (existing && Math.abs(existing.timestamp - targetTimestamp) < 50_000) {
      try {
        const bitmap = await createImageBitmap(existing);
        this.addToScrubCache(managed, bucketKey, bitmap, targetTimestamp);
        return bitmap;
      } catch {
        return null;
      }
    }

    // Need to decode — find nearest keyframe and decode forward
    await this.decodeToTimestamp(managed, targetTimestamp);

    const frame = this.findClosestFrame(managed.pendingFrames, targetTimestamp);
    if (frame) {
      try {
        const bitmap = await createImageBitmap(frame);
        this.addToScrubCache(managed, bucketKey, bitmap, targetTimestamp);
        return bitmap;
      } catch {
        return null;
      }
    }

    return null;
  }

  private addToScrubCache(
    managed: ManagedDecoder,
    bucketKey: number,
    bitmap: ImageBitmap,
    timestamp: number
  ): void {
    // Evict old entries if over limit
    if (managed.scrubCache.size >= this.SCRUB_CACHE_MAX_SIZE) {
      let oldestKey: number | null = null;
      let oldestTime = Infinity;
      for (const [key, entry] of managed.scrubCache) {
        if (entry.createdAt < oldestTime) {
          oldestTime = entry.createdAt;
          oldestKey = key;
        }
      }
      if (oldestKey !== null) {
        managed.scrubCache.get(oldestKey)?.bitmap.close();
        managed.scrubCache.delete(oldestKey);
      }
    }

    managed.scrubCache.set(bucketKey, {
      bitmap,
      timestamp,
      createdAt: Date.now(),
    });
  }

  private findClosestFrame(
    frames: Map<number, VideoFrame>,
    targetTimestamp: number,
  ): VideoFrame | null {
    let closest: VideoFrame | null = null;
    let closestDist = Infinity;

    for (const [ts, frame] of frames) {
      const dist = Math.abs(ts - targetTimestamp);
      if (dist < closestDist) {
        closestDist = dist;
        closest = frame;
      }
    }

    return closest;
  }

  private async decodeToTimestamp(
    managed: ManagedDecoder,
    targetTimestamp: number,
  ): Promise<void> {
    // Clear old frames
    for (const frame of managed.pendingFrames.values()) {
      frame.close();
    }
    managed.pendingFrames.clear();

    // Find nearest keyframe before target
    let keyframeIdx = 0;
    for (let i = managed.sampleTable.length - 1; i >= 0; i--) {
      if (managed.sampleTable[i].isKey && managed.sampleTable[i].timestamp <= targetTimestamp) {
        keyframeIdx = i;
        break;
      }
    }

    // Reset decoder
    managed.decoder.reset();
    managed.decoder.configure(managed.config);

    // Decode from keyframe to target
    for (let i = keyframeIdx; i < managed.sampleTable.length; i++) {
      const sample = managed.sampleTable[i];
      if (sample.timestamp > targetTimestamp + 100_000) break; // Stop 100ms past target

      const chunk = new EncodedVideoChunk({
        type: sample.isKey ? 'key' : 'delta',
        timestamp: sample.timestamp,
        duration: sample.duration,
        data: sample.data,
      });

      managed.decoder.decode(chunk);
    }

    await managed.decoder.flush();
  }

  release(assetId: string): void {
    const managed = this.decoders.get(assetId);
    if (managed) {
      // Clean scrub cache
      for (const entry of managed.scrubCache.values()) {
        entry.bitmap.close();
      }
      managed.scrubCache.clear();

      // Clean pending frames
      for (const frame of managed.pendingFrames.values()) {
        frame.close();
      }
      managed.pendingFrames.clear();

      if (managed.decoder.state !== 'closed') {
        managed.decoder.close();
      }
      this.decoders.delete(assetId);
    }
  }

  releaseAll(): void {
    for (const [id] of this.decoders) {
      this.release(id);
    }
  }

  private evictIfNeeded(): void {
    if (this.decoders.size < this.maxDecoders) return;

    let oldestId: string | null = null;
    let oldestTime = Infinity;
    for (const [id, managed] of this.decoders) {
      if (managed.lastAccessed < oldestTime) {
        oldestTime = managed.lastAccessed;
        oldestId = id;
      }
    }
    if (oldestId) {
      this.release(oldestId);
    }
  }
}
