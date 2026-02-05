import type {
  EngineConfig,
  EngineState,
  RenderableTrack,
  RenderableClip,
  CompositeLayer,
  IVideoDecoderPool,
  SubtitleEntry,
} from './types';
import { AssetCache } from './AssetCache';
import { CanvasCompositor } from './CanvasCompositor';
import { AudioMixerEngine } from './AudioMixerEngine';
import { FrameScheduler } from './FrameScheduler';
import { VideoDecoderPool } from './VideoDecoderPool';
import { HTMLVideoPool } from './fallback/HTMLVideoPool';
import { buildCanvasFilterString } from '@/effects/buildCanvasFilter';

export class CompositorEngine {
  private config: EngineConfig;
  private compositor: CanvasCompositor;
  private audioMixer: AudioMixerEngine;
  private scheduler: FrameScheduler;
  private decoderPool: IVideoDecoderPool;
  private assetCache: AssetCache;

  private tracks: RenderableTrack[] = [];
  private subtitleSegments: SubtitleEntry[] = [];
  private urlResolver: ((assetId: string) => string) | null = null;
  private preloadedAssets = new Set<string>();
  private state: EngineState = 'idle';

  // Lookahead preloading
  private readonly LOOKAHEAD_MS = 2000;
  private lookaheadTimer: number | null = null;

  // Filter string cache
  private filterCache = new Map<string, string>();

  // ImageBitmap cleanup tracking
  private pendingBitmaps: ImageBitmap[] = [];

  // Callbacks
  onTimeUpdate: ((timeMs: number) => void) | null = null;
  onStateChange: ((state: EngineState) => void) | null = null;
  onError: ((error: Error) => void) | null = null;

  constructor(config: EngineConfig) {
    this.config = config;
    this.assetCache = new AssetCache();
    this.compositor = new CanvasCompositor(config.canvas, config.width, config.height);
    this.audioMixer = new AudioMixerEngine(this.assetCache);
    this.scheduler = new FrameScheduler();

    // Feature detect WebCodecs
    if (VideoDecoderPool.isSupported()) {
      this.decoderPool = new VideoDecoderPool();
    } else {
      this.decoderPool = new HTMLVideoPool();
    }
  }

  async init(): Promise<void> {
    this.setState('loading');
    await this.audioMixer.init();

    // Wire up audio context for sync
    this.scheduler.setAudioContext(this.audioMixer.getAudioContext());

    this.scheduler.onTick = (timeMs) => {
      // Skip render if we're behind schedule
      if (!this.scheduler.shouldSkipFrame()) {
        this.renderFrame(timeMs);
      }
      this.scheduler.reportRenderComplete();
      this.onTimeUpdate?.(timeMs);

      // Trigger lookahead every 500ms (not every frame)
      if (this.lookaheadTimer === null) {
        this.lookaheadTimer = window.setTimeout(() => {
          this.triggerLookahead(timeMs);
          this.lookaheadTimer = null;
        }, 500);
      }
    };

    this.scheduler.onEnd = () => {
      this.audioMixer.stopAll();
      this.setState('ready');
    };

    this.setState('ready');
  }

  private setState(state: EngineState): void {
    this.state = state;
    this.onStateChange?.(state);
  }

  getState(): EngineState {
    return this.state;
  }

  setAssetUrlResolver(resolver: (assetId: string) => string): void {
    this.urlResolver = resolver;
    this.audioMixer.setUrlResolver(resolver);
  }

  setSubtitleSegments(segments: SubtitleEntry[]): void {
    this.subtitleSegments = segments;
  }

  setTracks(tracks: RenderableTrack[]): void {
    this.tracks = tracks;
    this.filterCache.clear(); // Clear filter cache when tracks change
    this.updateDuration();
    this.preloadVisibleAssets();
  }

  private updateDuration(): void {
    let maxEnd = 0;
    for (const track of this.tracks) {
      for (const clip of track.clips) {
        maxEnd = Math.max(maxEnd, clip.endTime);
      }
    }
    this.scheduler.setDuration(maxEnd);
  }

  private async preloadVisibleAssets(): Promise<void> {
    if (!this.urlResolver) return;

    for (const track of this.tracks) {
      for (const clip of track.clips) {
        if (this.preloadedAssets.has(clip.assetId)) continue;

        const url = this.urlResolver(clip.assetId);
        const isVideo = ['video'].includes(clip.type);
        const isImage = ['image', 'sticker'].includes(clip.type);

        try {
          if (isVideo) {
            await this.decoderPool.preload(clip.assetId, url);
          } else if (isImage) {
            await this.assetCache.fetchImage(clip.assetId, url);
          }
          // Audio is loaded on-demand by AudioMixerEngine
          this.preloadedAssets.add(clip.assetId);
        } catch (err) {
          this.onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }
  }

  /**
   * Preload assets 2 seconds ahead of the playhead.
   * Called periodically (every 500ms) during playback.
   */
  private triggerLookahead(currentTimeMs: number): void {
    if (!this.urlResolver) return;

    const lookaheadEnd = currentTimeMs + this.LOOKAHEAD_MS;

    for (const track of this.tracks) {
      for (const clip of track.clips) {
        // Skip clips that have already ended or start after lookahead window
        if (clip.endTime <= currentTimeMs || clip.startTime > lookaheadEnd) continue;
        if (this.preloadedAssets.has(clip.assetId)) continue;

        const url = this.urlResolver(clip.assetId);

        // Fire-and-forget preloads
        if (clip.type === 'video') {
          this.decoderPool.preload(clip.assetId, url).catch(() => {});
        } else if (clip.type === 'image' || clip.type === 'sticker') {
          this.assetCache.fetchImage(clip.assetId, url).catch(() => {});
        }

        this.preloadedAssets.add(clip.assetId);
      }
    }
  }

  /**
   * Get cached filter string for a clip.
   * Memoizes buildCanvasFilterString results to avoid rebuilding every frame.
   */
  private getCachedFilterString(clip: RenderableClip): string | undefined {
    if (!clip.filters?.effects?.length) return undefined;

    const enabledEffects = clip.filters.effects.filter((e) => e.enabled);
    if (enabledEffects.length === 0) return undefined;

    const key = `${clip.id}:${enabledEffects.map((e) => `${e.id}:${e.value}`).join('|')}`;

    let cached = this.filterCache.get(key);
    if (!cached) {
      cached = buildCanvasFilterString(clip.filters.effects);
      this.filterCache.set(key, cached);

      // Limit cache size to prevent memory growth
      if (this.filterCache.size > 100) {
        const firstKey = this.filterCache.keys().next().value;
        if (firstKey) this.filterCache.delete(firstKey);
      }
    }

    return cached === 'none' ? undefined : cached;
  }

  resize(width: number, height: number): void {
    this.config.width = width;
    this.config.height = height;
    this.config.canvas.width = width;
    this.config.canvas.height = height;
    this.compositor.resize(width, height);
  }

  async play(): Promise<void> {
    if (this.state !== 'ready' && this.state !== 'idle') return;

    // Preload all audio before starting playback
    this.setState('loading');
    await this.audioMixer.preloadAudioForClips(this.tracks);

    this.setState('playing');
    const currentTime = this.scheduler.getCurrentTime();
    this.scheduler.play(currentTime);
    await this.audioMixer.schedulePlayback(currentTime, this.tracks);
  }

  pause(): void {
    this.scheduler.pause();
    this.audioMixer.stopAll();
    this.audioMixer.pause();
    if (this.state === 'playing') {
      this.setState('ready');
    }
  }

  async seekTo(timeMs: number): Promise<void> {
    const wasPlaying = this.scheduler.isPlaying();

    if (wasPlaying) {
      this.scheduler.pause();
      this.audioMixer.stopAll();
    }

    this.setState('seeking');
    await this.renderFrame(timeMs);
    this.setState('ready');

    if (wasPlaying) {
      this.scheduler.play(timeMs);
      await this.audioMixer.schedulePlayback(timeMs, this.tracks);
      this.setState('playing');
    }
  }

  async renderFrame(timeMs: number): Promise<void> {
    // Clean up bitmaps from previous frame
    for (const bitmap of this.pendingBitmaps) {
      bitmap.close();
    }
    this.pendingBitmaps = [];

    const layers: CompositeLayer[] = [];

    // Process tracks in order (first track = bottom layer)
    for (const track of this.tracks) {
      if (!track.visible) continue;

      const activeClip = this.findActiveClip(track.clips, timeMs);
      if (!activeClip) continue;

      const layer = await this.renderClip(activeClip, track, timeMs);
      if (layer) {
        layers.push(layer);
        // Track video frame bitmaps for cleanup
        if (layer.type === 'video' && layer.frame) {
          this.pendingBitmaps.push(layer.frame);
        }
      }
    }

    this.compositor.composite(layers);

    // Render subtitle overlay if active segment found
    const activeSub = this.subtitleSegments.find(
      (seg) => timeMs >= seg.start_ms && timeMs < seg.end_ms,
    );
    if (activeSub) {
      this.compositor.renderSubtitle({
        text: activeSub.text,
        translatedText: activeSub.translated_text,
      });
    }
  }

  private findActiveClip(
    clips: RenderableClip[],
    timeMs: number,
  ): RenderableClip | null {
    for (const clip of clips) {
      if (timeMs >= clip.startTime && timeMs < clip.endTime) {
        return clip;
      }
    }
    return null;
  }

  private async renderClip(
    clip: RenderableClip,
    track: RenderableTrack,
    timeMs: number,
  ): Promise<CompositeLayer | null> {
    const isVideo = clip.type === 'video';
    const isImage = clip.type === 'image' || clip.type === 'sticker';

    if (!isVideo && !isImage) return null;

    // Calculate source time within the clip
    const sourceTimeMs = clip.trimStart + (timeMs - clip.startTime);

    try {
      let frame: ImageBitmap | null = null;

      if (isVideo) {
        frame = await this.decoderPool.getFrame(clip.assetId, sourceTimeMs);
      } else if (isImage && this.urlResolver) {
        frame = await this.assetCache.fetchImage(
          clip.assetId,
          this.urlResolver(clip.assetId),
        );
      }

      if (!frame) return null;

      // Get cached filter string (memoized for performance)
      const filter = this.getCachedFilterString(clip);

      // Compute pixel transform from normalized clip values
      const hasTransform =
        clip.positionX != null || clip.scaleX != null || clip.rotation;
      let transform: CompositeLayer['transform'] | undefined;
      if (hasTransform && frame) {
        const sx = clip.scaleX ?? 1;
        const sy = clip.scaleY ?? 1;
        const w = frame.width * sx;
        const h = frame.height * sy;
        const px = (clip.positionX ?? 0.5) * this.config.width - w / 2;
        const py = (clip.positionY ?? 0.5) * this.config.height - h / 2;
        transform = {
          x: px,
          y: py,
          width: w,
          height: h,
          rotation: clip.rotation,
        };
      }

      return {
        type: isVideo ? 'video' : 'image',
        frame,
        opacity: clip.opacity,
        filter,
        transform,
      };
    } catch {
      return null;
    }
  }

  setMasterVolume(volume: number): void {
    this.audioMixer.setMasterVolume(volume);
  }

  dispose(): void {
    // Clear lookahead timer
    if (this.lookaheadTimer !== null) {
      window.clearTimeout(this.lookaheadTimer);
      this.lookaheadTimer = null;
    }

    // Clean up pending bitmaps
    for (const bitmap of this.pendingBitmaps) {
      bitmap.close();
    }
    this.pendingBitmaps = [];

    // Clear caches
    this.filterCache.clear();

    this.scheduler.dispose();
    this.audioMixer.dispose();
    this.decoderPool.releaseAll();
    this.assetCache.clear();
    this.tracks = [];
    this.preloadedAssets.clear();
    this.onTimeUpdate = null;
    this.onStateChange = null;
    this.onError = null;
    this.setState('idle');
  }
}
