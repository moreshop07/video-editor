import type { IVideoDecoderPool } from './types';
import { VideoDecoderPool } from './VideoDecoderPool';
import { HTMLVideoPool } from './fallback/HTMLVideoPool';

const TIME_BUCKET_MS = 500; // Round to nearest 500ms

function bucketTime(timeMs: number): number {
  return Math.round(timeMs / TIME_BUCKET_MS) * TIME_BUCKET_MS;
}

export function computeThumbnailTimes(
  clipWidthPx: number,
  trackHeightPx: number,
  trimStartMs: number,
  visibleDurationMs: number,
  sourceDurationMs: number,
  speed: number,
): number[] {
  // Each thumbnail fills a region proportional to 16:9 aspect of the track height
  const thumbDisplayWidth = Math.max(20, trackHeightPx * (16 / 9));
  const thumbCount = Math.max(1, Math.ceil(clipWidthPx / thumbDisplayWidth));

  const times: number[] = [];
  for (let i = 0; i < thumbCount; i++) {
    const fraction = (i + 0.5) / thumbCount;
    const sourceTimeMs = trimStartMs + fraction * visibleDurationMs * speed;
    const clamped = Math.min(Math.max(0, sourceTimeMs), sourceDurationMs);
    times.push(bucketTime(clamped));
  }
  return times;
}

interface AssetThumbnails {
  entries: Map<number, ImageBitmap>; // bucketedTimeMs -> bitmap
}

export class ThumbnailCache {
  private cache = new Map<string, AssetThumbnails>();
  private inflight = new Map<string, Set<number>>(); // assetId -> set of times being decoded
  private decoderPool: IVideoDecoderPool;
  private preloaded = new Set<string>();

  private static instance: ThumbnailCache;

  static getInstance(): ThumbnailCache {
    if (!ThumbnailCache.instance) {
      ThumbnailCache.instance = new ThumbnailCache();
    }
    return ThumbnailCache.instance;
  }

  constructor() {
    // Use WebCodecs if supported, otherwise fallback
    this.decoderPool = VideoDecoderPool.isSupported()
      ? new VideoDecoderPool(4)
      : new HTMLVideoPool();
  }

  get(assetId: string, timeMs: number): ImageBitmap | null {
    const asset = this.cache.get(assetId);
    if (!asset) return null;
    return asset.entries.get(bucketTime(timeMs)) ?? null;
  }

  requestRange(
    assetId: string,
    streamUrl: string,
    times: number[],
    onUpdate: () => void,
  ): void {
    // Ensure asset cache structure exists
    if (!this.cache.has(assetId)) {
      this.cache.set(assetId, { entries: new Map() });
    }
    if (!this.inflight.has(assetId)) {
      this.inflight.set(assetId, new Set());
    }

    const asset = this.cache.get(assetId)!;
    const inflightSet = this.inflight.get(assetId)!;

    // Filter to times that need fetching
    const toFetch: number[] = [];
    for (const t of times) {
      const bucketed = bucketTime(t);
      if (!asset.entries.has(bucketed) && !inflightSet.has(bucketed)) {
        toFetch.push(bucketed);
        inflightSet.add(bucketed);
      }
    }

    if (toFetch.length === 0) return;

    // Preload asset into decoder pool if not yet done
    const preloadPromise = this.preloaded.has(assetId)
      ? Promise.resolve()
      : this.decoderPool.preload(assetId, streamUrl).then(() => {
          this.preloaded.add(assetId);
        }).catch(() => {
          // Preload failed — thumbnails won't be available
        });

    // Process in batches of 2 concurrent decodes
    this.processBatch(assetId, streamUrl, toFetch, onUpdate, preloadPromise);
  }

  private async processBatch(
    assetId: string,
    _streamUrl: string,
    times: number[],
    onUpdate: () => void,
    preloadPromise: Promise<void>,
  ): Promise<void> {
    await preloadPromise;

    const CONCURRENCY = 2;
    let idx = 0;

    const processNext = async (): Promise<void> => {
      while (idx < times.length) {
        const timeMs = times[idx++];
        try {
          const bitmap = await this.decoderPool.getFrame(assetId, timeMs);
          if (bitmap) {
            const asset = this.cache.get(assetId);
            if (asset) {
              asset.entries.set(timeMs, bitmap);
              onUpdate();
            }
          }
        } catch {
          // Frame decode failed — skip
        } finally {
          const inflightSet = this.inflight.get(assetId);
          inflightSet?.delete(timeMs);
        }
      }
    };

    // Launch CONCURRENCY workers
    const workers: Promise<void>[] = [];
    for (let i = 0; i < CONCURRENCY; i++) {
      workers.push(processNext());
    }
    await Promise.all(workers);
  }

  release(assetId: string): void {
    const asset = this.cache.get(assetId);
    if (asset) {
      for (const bitmap of asset.entries.values()) {
        bitmap.close();
      }
      this.cache.delete(assetId);
    }
    this.inflight.delete(assetId);
    this.decoderPool.release(assetId);
    this.preloaded.delete(assetId);
  }

  clear(): void {
    for (const [id] of this.cache) {
      this.release(id);
    }
    this.decoderPool.releaseAll();
    this.preloaded.clear();
  }
}
