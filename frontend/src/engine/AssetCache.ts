interface CachedAsset {
  type: 'video' | 'audio' | 'image';
  data: ArrayBuffer | AudioBuffer | ImageBitmap;
  lastAccessed: number;
}

export class AssetCache {
  private cache = new Map<string, CachedAsset>();
  private maxEntries: number;

  constructor(maxEntries = 50) {
    this.maxEntries = maxEntries;
  }

  private evictIfNeeded(): void {
    if (this.cache.size < this.maxEntries) return;

    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      const entry = this.cache.get(oldestKey);
      if (entry?.type === 'image' && entry.data instanceof ImageBitmap) {
        entry.data.close();
      }
      this.cache.delete(oldestKey);
    }
  }

  async fetchVideo(assetId: string, url: string): Promise<ArrayBuffer> {
    const cacheKey = `video:${assetId}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      cached.lastAccessed = Date.now();
      return cached.data as ArrayBuffer;
    }

    const response = await fetch(url);
    const buffer = await response.arrayBuffer();

    this.evictIfNeeded();
    this.cache.set(cacheKey, {
      type: 'video',
      data: buffer,
      lastAccessed: Date.now(),
    });

    return buffer;
  }

  async fetchAudio(
    assetId: string,
    url: string,
    audioCtx: AudioContext,
  ): Promise<AudioBuffer> {
    const cacheKey = `audio:${assetId}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      cached.lastAccessed = Date.now();
      return cached.data as AudioBuffer;
    }

    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(buffer);

    this.evictIfNeeded();
    this.cache.set(cacheKey, {
      type: 'audio',
      data: audioBuffer,
      lastAccessed: Date.now(),
    });

    return audioBuffer;
  }

  async fetchImage(assetId: string, url: string): Promise<ImageBitmap> {
    const cacheKey = `image:${assetId}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      cached.lastAccessed = Date.now();
      return cached.data as ImageBitmap;
    }

    const response = await fetch(url);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    this.evictIfNeeded();
    this.cache.set(cacheKey, {
      type: 'image',
      data: bitmap,
      lastAccessed: Date.now(),
    });

    return bitmap;
  }

  has(assetId: string, type: string): boolean {
    return this.cache.has(`${type}:${assetId}`);
  }

  clear(): void {
    for (const entry of this.cache.values()) {
      if (entry.type === 'image' && entry.data instanceof ImageBitmap) {
        entry.data.close();
      }
    }
    this.cache.clear();
  }
}
