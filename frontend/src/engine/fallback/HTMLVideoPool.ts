import type { IVideoDecoderPool } from '../types';

interface ManagedVideo {
  element: HTMLVideoElement;
  lastAccessed: number;
  ready: boolean;
}

/**
 * Fallback video decoder using HTMLVideoElement.
 * Works in all browsers but is less performant than WebCodecs.
 * Uses video.currentTime seeking + createImageBitmap() to extract frames.
 */
export class HTMLVideoPool implements IVideoDecoderPool {
  private videos = new Map<string, ManagedVideo>();
  private maxVideos: number;

  constructor(maxVideos = 3) {
    this.maxVideos = maxVideos;
  }

  async preload(assetId: string, url: string): Promise<void> {
    if (this.videos.has(assetId)) return;

    this.evictIfNeeded();

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = true; // Muted for autoplay policy
    video.playsInline = true;
    video.src = url;

    const managed: ManagedVideo = {
      element: video,
      lastAccessed: Date.now(),
      ready: false,
    };

    this.videos.set(assetId, managed);

    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => {
        managed.ready = true;
        resolve();
      };
      video.onerror = () => reject(new Error(`Failed to load video: ${assetId}`));
      video.load();
    });
  }

  async getFrame(assetId: string, timeMs: number): Promise<ImageBitmap | null> {
    const managed = this.videos.get(assetId);
    if (!managed?.ready) return null;

    managed.lastAccessed = Date.now();
    const video = managed.element;
    const targetTime = timeMs / 1000;

    // Only seek if the delta is significant (>50ms)
    if (Math.abs(video.currentTime - targetTime) > 0.05) {
      video.currentTime = targetTime;
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        };
        video.addEventListener('seeked', onSeeked);
      });
    }

    try {
      return await createImageBitmap(video);
    } catch {
      return null;
    }
  }

  release(assetId: string): void {
    const managed = this.videos.get(assetId);
    if (managed) {
      managed.element.src = '';
      managed.element.load();
      this.videos.delete(assetId);
    }
  }

  releaseAll(): void {
    for (const [id] of this.videos) {
      this.release(id);
    }
  }

  private evictIfNeeded(): void {
    if (this.videos.size < this.maxVideos) return;

    let oldestId: string | null = null;
    let oldestTime = Infinity;
    for (const [id, managed] of this.videos) {
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
