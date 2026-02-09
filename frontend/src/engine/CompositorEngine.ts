import type {
  EngineConfig,
  EngineState,
  RenderableTrack,
  RenderableClip,
  CompositeLayer,
  IVideoDecoderPool,
  SubtitleEntry,
} from './types';
import type { Transition } from '@/types/transitions';
import { AssetCache } from './AssetCache';
import { CanvasCompositor } from './CanvasCompositor';
import { AudioMixerEngine } from './AudioMixerEngine';
import { FrameScheduler } from './FrameScheduler';
import { VideoDecoderPool } from './VideoDecoderPool';
import { computeSourceTime } from '@/utils/speedRampUtils';
import { HTMLVideoPool } from './fallback/HTMLVideoPool';
import { buildCanvasFilterString } from '@/effects/buildCanvasFilter';
import { TransitionRenderer } from './TransitionRenderer';
import { TextRenderer } from './TextRenderer';
import { ShapeRenderer } from './ShapeRenderer';
import { ChromaKeyProcessor } from './ChromaKeyProcessor';
import { ColorGradingProcessor } from './ColorGradingProcessor';
import { getInterpolatedValue } from '@/utils/keyframeUtils';
import { ANIMATABLE_PROPERTY_DEFAULTS } from '@/types/keyframes';
import { DuckingProcessor } from './DuckingProcessor';

interface TransitionClipPair {
  outgoingClip: RenderableClip | null;
  incomingClip: RenderableClip | null;
  transition: Transition | null;
  progress: number;
}

export class CompositorEngine {
  private config: EngineConfig;
  private compositor: CanvasCompositor;
  private audioMixer: AudioMixerEngine;
  private scheduler: FrameScheduler;
  private decoderPool: IVideoDecoderPool;
  private assetCache: AssetCache;
  private duckingProcessor: DuckingProcessor;

  private tracks: RenderableTrack[] = [];
  private subtitleSegments: SubtitleEntry[] = [];
  private letterboxFraction = 0;
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

  // Nested sequences
  private sequences: Record<string, { tracks: RenderableTrack[] }> = {};
  private nestingDepth = 0;
  private static readonly MAX_NESTING = 8;

  // Chroma key processor
  private chromaKeyProcessor: ChromaKeyProcessor;

  // Color grading processor
  private colorGradingProcessor: ColorGradingProcessor;

  // Callbacks
  onTimeUpdate: ((timeMs: number) => void) | null = null;
  onStateChange: ((state: EngineState) => void) | null = null;
  onError: ((error: Error) => void) | null = null;

  constructor(config: EngineConfig) {
    this.config = config;
    this.assetCache = new AssetCache();
    this.compositor = new CanvasCompositor(config.canvas, config.width, config.height);
    this.audioMixer = new AudioMixerEngine(this.assetCache);
    this.duckingProcessor = new DuckingProcessor(this.audioMixer);
    this.scheduler = new FrameScheduler();

    // Feature detect WebCodecs
    if (VideoDecoderPool.isSupported()) {
      this.decoderPool = new VideoDecoderPool();
    } else {
      this.decoderPool = new HTMLVideoPool();
    }

    this.chromaKeyProcessor = new ChromaKeyProcessor(config.width, config.height);
    this.colorGradingProcessor = new ColorGradingProcessor(config.width, config.height);
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

  setLetterbox(fraction: number): void {
    this.letterboxFraction = fraction;
  }

  setTracks(tracks: RenderableTrack[]): void {
    this.tracks = tracks;
    this.filterCache.clear(); // Clear filter cache when tracks change
    this.duckingProcessor.setTracks(tracks);
    this.updateDuration();
    this.preloadVisibleAssets();
  }

  setSequences(sequences: Record<string, { tracks: RenderableTrack[] }>): void {
    this.sequences = sequences;
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
   * Get interpolated property value at a given time.
   * Uses keyframes if available, otherwise falls back to clip property or default.
   */
  private getInterpolatedClipProperty(
    clip: RenderableClip,
    property: 'positionX' | 'positionY' | 'scaleX' | 'scaleY' | 'rotation' | 'opacity' | 'cropTop' | 'cropBottom' | 'cropLeft' | 'cropRight',
    clipTimeMs: number,
  ): number {
    // Check for keyframes
    if (clip.keyframes && clip.keyframes[property]?.length > 0) {
      const defaultValue = ANIMATABLE_PROPERTY_DEFAULTS[property];
      return getInterpolatedValue(clip.keyframes[property], clipTimeMs, defaultValue);
    }

    // Fall back to static clip property or default
    switch (property) {
      case 'positionX':
        return clip.positionX ?? ANIMATABLE_PROPERTY_DEFAULTS.positionX;
      case 'positionY':
        return clip.positionY ?? ANIMATABLE_PROPERTY_DEFAULTS.positionY;
      case 'scaleX':
        return clip.scaleX ?? ANIMATABLE_PROPERTY_DEFAULTS.scaleX;
      case 'scaleY':
        return clip.scaleY ?? ANIMATABLE_PROPERTY_DEFAULTS.scaleY;
      case 'rotation':
        return clip.rotation ?? ANIMATABLE_PROPERTY_DEFAULTS.rotation;
      case 'opacity':
        return clip.opacity ?? ANIMATABLE_PROPERTY_DEFAULTS.opacity;
      case 'cropTop':
        return clip.cropTop ?? ANIMATABLE_PROPERTY_DEFAULTS.cropTop;
      case 'cropBottom':
        return clip.cropBottom ?? ANIMATABLE_PROPERTY_DEFAULTS.cropBottom;
      case 'cropLeft':
        return clip.cropLeft ?? ANIMATABLE_PROPERTY_DEFAULTS.cropLeft;
      case 'cropRight':
        return clip.cropRight ?? ANIMATABLE_PROPERTY_DEFAULTS.cropRight;
      default:
        return ANIMATABLE_PROPERTY_DEFAULTS[property];
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
    this.duckingProcessor.start();
  }

  pause(): void {
    this.scheduler.pause();
    this.duckingProcessor.stop();
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

    await this.renderTracksToLayers(this.tracks, timeMs);
  }

  /**
   * Core track rendering logic, used by both renderFrame() and renderNestedSequence().
   * When called from renderFrame(), composites to the main canvas.
   * When called from renderNestedSequence(), returns layers for intermediate compositing.
   */
  private async renderTracksToLayers(
    tracks: RenderableTrack[],
    timeMs: number,
    targetCtx?: OffscreenCanvasRenderingContext2D,
  ): Promise<void> {
    let layers: CompositeLayer[] = [];

    // Process tracks in order (first track = bottom layer)
    for (const track of tracks) {
      if (!track.visible) continue;

      // Adjustment layer: flatten everything below, apply effects
      if (track.type === 'adjustment') {
        const adjustmentClip = this.findActiveClip(track.clips, timeMs);
        if (adjustmentClip && layers.length > 0) {
          const intermediate = this.flattenLayersToIntermediate(layers);
          const clipTimeMs = timeMs - adjustmentClip.startTime;
          const filter = this.getCachedFilterString(adjustmentClip);
          const opacity = this.getInterpolatedClipProperty(adjustmentClip, 'opacity', clipTimeMs);

          // Apply chroma key and color grading from adjustment clip
          let frame: ImageBitmap = intermediate;
          const chromaKey = adjustmentClip.filters?.chromaKey;
          if (chromaKey?.enabled) {
            const processed = await this.chromaKeyProcessor.process(
              frame, frame.width, frame.height, chromaKey,
            );
            this.pendingBitmaps.push(processed);
            frame = processed;
          }
          const colorGrading = adjustmentClip.filters?.colorGrading;
          if (colorGrading?.enabled) {
            const processed = await this.colorGradingProcessor.process(
              frame, frame.width, frame.height, colorGrading,
            );
            this.pendingBitmaps.push(processed);
            frame = processed;
          }

          layers = [{
            type: 'video',
            frame,
            opacity,
            filter,
            blendMode: adjustmentClip.filters?.blendMode,
          }];
        }
        continue;
      }

      // Check for transitions on video/image/text tracks
      const isVisualTrack = track.type === 'video' || track.type === 'sticker' || track.type === 'text';

      if (isVisualTrack) {
        const clipPair = this.findActiveClipsWithTransition(track.clips, timeMs);

        if (clipPair.transition && clipPair.outgoingClip && clipPair.incomingClip) {
          // We're in a transition - render both clips with transition effect
          const transitionLayer = await this.renderTransition(
            clipPair.outgoingClip,
            clipPair.incomingClip,
            clipPair.transition,
            clipPair.progress,
            track,
            timeMs,
          );
          if (transitionLayer) {
            layers.push(transitionLayer);
            if (transitionLayer.type === 'video' && transitionLayer.frame instanceof ImageBitmap) {
              this.pendingBitmaps.push(transitionLayer.frame);
            }
          }
        } else if (clipPair.incomingClip) {
          // Normal single clip rendering
          const layer = await this.renderClip(clipPair.incomingClip, track, timeMs);
          if (layer) {
            layers.push(layer);
            if (layer.type === 'video' && layer.frame instanceof ImageBitmap) {
              this.pendingBitmaps.push(layer.frame);
            }
          }
        }
      } else {
        // Audio tracks - use simple findActiveClip
        const activeClip = this.findActiveClip(track.clips, timeMs);
        if (!activeClip) continue;

        const layer = await this.renderClip(activeClip, track, timeMs);
        if (layer) {
          layers.push(layer);
          if (layer.type === 'video' && layer.frame instanceof ImageBitmap) {
            this.pendingBitmaps.push(layer.frame);
          }
        }
      }
    }

    if (targetCtx) {
      // Render to provided offscreen context (for nested sequences)
      targetCtx.fillStyle = '#000';
      targetCtx.fillRect(0, 0, this.config.width, this.config.height);
      for (const layer of layers) {
        CanvasCompositor.drawLayer(targetCtx, layer, this.config.width, this.config.height);
      }
      targetCtx.globalAlpha = 1;
      targetCtx.filter = 'none';
      targetCtx.globalCompositeOperation = 'source-over';
    } else {
      // Render to main canvas
      this.compositor.composite(layers);

      // Render subtitle overlay if active segment found
      const activeSub = this.subtitleSegments.find(
        (seg) => timeMs >= seg.start_ms && timeMs < seg.end_ms,
      );
      if (activeSub) {
        this.compositor.renderSubtitle({
          text: activeSub.text,
          translatedText: activeSub.translated_text,
          style: activeSub.style ?? null,
        });
      }

      // Render letterbox bars on top of everything
      if (this.letterboxFraction > 0) {
        this.compositor.renderLetterbox(this.letterboxFraction);
      }
    }
  }

  /**
   * Flatten pending layers into a single ImageBitmap via an intermediate OffscreenCanvas.
   * Used by adjustment layers to apply effects to the composited result of all layers below.
   */
  private flattenLayersToIntermediate(layers: CompositeLayer[]): ImageBitmap {
    const offscreen = new OffscreenCanvas(this.config.width, this.config.height);
    const ctx = offscreen.getContext('2d')!;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.config.width, this.config.height);

    for (const layer of layers) {
      CanvasCompositor.drawLayer(ctx, layer, this.config.width, this.config.height);
    }

    ctx.globalAlpha = 1;
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';

    const bitmap = offscreen.transferToImageBitmap();
    this.pendingBitmaps.push(bitmap);
    return bitmap;
  }

  /**
   * Render a nested sequence clip by compositing its inner tracks onto an OffscreenCanvas.
   */
  private async renderNestedSequence(
    clip: RenderableClip,
    timeMs: number,
  ): Promise<ImageBitmap | null> {
    if (!clip.sequenceId || !this.sequences[clip.sequenceId]) return null;
    if (this.nestingDepth >= CompositorEngine.MAX_NESTING) return null;

    const seqTracks = this.sequences[clip.sequenceId].tracks;
    const clipTimeMs = timeMs - clip.startTime;
    const sourceTimeMs = computeSourceTime(clip.trimStart, clipTimeMs, clip.keyframes, clip.filters?.speed ?? 1);

    const offscreen = new OffscreenCanvas(this.config.width, this.config.height);
    const ctx = offscreen.getContext('2d')!;

    this.nestingDepth++;
    try {
      await this.renderTracksToLayers(seqTracks, sourceTimeMs, ctx);
    } finally {
      this.nestingDepth--;
    }

    const bitmap = await createImageBitmap(offscreen);
    this.pendingBitmaps.push(bitmap);
    return bitmap;
  }

  /**
   * Render a transition between two clips.
   * Creates an off-screen canvas, renders both frames with transition effect,
   * and returns the result as an ImageBitmap.
   */
  private async renderTransition(
    outgoingClip: RenderableClip,
    incomingClip: RenderableClip,
    transition: Transition,
    progress: number,
    _track: RenderableTrack,
    timeMs: number,
  ): Promise<CompositeLayer | null> {
    // Get frames for both clips
    const outgoingFrame = await this.getClipFrame(outgoingClip, timeMs);
    const incomingFrame = await this.getClipFrame(incomingClip, timeMs);

    if (!incomingFrame) return null;

    // Create off-screen canvas for the transition result
    const offscreen = new OffscreenCanvas(this.config.width, this.config.height);
    const ctx = offscreen.getContext('2d');
    if (!ctx) return null;

    // Clear with black
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.config.width, this.config.height);

    // Prepare frames by drawing them aspect-fit to full canvas size
    const preparedOutgoing = outgoingFrame
      ? await this.prepareFrameForTransition(outgoingFrame)
      : null;
    const preparedIncoming = await this.prepareFrameForTransition(incomingFrame);

    // Apply transition effect
    TransitionRenderer.render(
      ctx as unknown as CanvasRenderingContext2D,
      preparedOutgoing,
      preparedIncoming,
      {
        progress,
        type: transition.type,
        width: this.config.width,
        height: this.config.height,
      },
    );

    // Convert to ImageBitmap
    const resultBitmap = await createImageBitmap(offscreen);

    // Clean up temporary prepared bitmaps
    if (preparedOutgoing && preparedOutgoing !== outgoingFrame) {
      preparedOutgoing.close();
    }
    if (preparedIncoming !== incomingFrame) {
      preparedIncoming.close();
    }

    // Clean up source frame bitmaps
    if (outgoingFrame instanceof ImageBitmap) {
      this.pendingBitmaps.push(outgoingFrame);
    }
    if (incomingFrame instanceof ImageBitmap) {
      this.pendingBitmaps.push(incomingFrame);
    }

    return {
      type: 'video',
      frame: resultBitmap,
      opacity: 1,
    };
  }

  /**
   * Get a frame for a clip at the specified time.
   */
  private async getClipFrame(
    clip: RenderableClip,
    timeMs: number,
  ): Promise<ImageBitmap | null> {
    const isVideo = clip.type === 'video';
    const isImage = clip.type === 'image' || clip.type === 'sticker';

    if (!isVideo && !isImage) return null;

    // Calculate source time within the clip (speed-aware)
    const clipTimeMs = timeMs - clip.startTime;
    const sourceTimeMs = computeSourceTime(clip.trimStart, clipTimeMs, clip.keyframes, clip.filters?.speed ?? 1);

    try {
      if (isVideo) {
        return await this.decoderPool.getFrame(clip.assetId, sourceTimeMs);
      } else if (isImage && this.urlResolver) {
        return await this.assetCache.fetchImage(
          clip.assetId,
          this.urlResolver(clip.assetId),
        );
      }
    } catch {
      return null;
    }

    return null;
  }

  /**
   * Prepare a frame for transition rendering by drawing it aspect-fit onto a canvas-sized bitmap.
   * This ensures both frames in a transition are the same size for proper blending.
   */
  private async prepareFrameForTransition(
    frame: ImageBitmap,
  ): Promise<ImageBitmap> {
    const tempCanvas = new OffscreenCanvas(this.config.width, this.config.height);
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return frame;

    // Clear with black
    tempCtx.fillStyle = '#000';
    tempCtx.fillRect(0, 0, this.config.width, this.config.height);

    // Calculate aspect-fit dimensions
    const srcW = frame.width;
    const srcH = frame.height;
    const canvasRatio = this.config.width / this.config.height;
    const srcRatio = srcW / srcH;

    let drawW: number;
    let drawH: number;

    if (srcRatio > canvasRatio) {
      drawW = this.config.width;
      drawH = this.config.width / srcRatio;
    } else {
      drawH = this.config.height;
      drawW = this.config.height * srcRatio;
    }

    const x = (this.config.width - drawW) / 2;
    const y = (this.config.height - drawH) / 2;

    tempCtx.drawImage(frame, x, y, drawW, drawH);

    // Create a new ImageBitmap from the prepared canvas
    return createImageBitmap(tempCanvas);
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

  /**
   * Find active clips with transition detection.
   * Returns clip pair when in a transition zone.
   */
  private findActiveClipsWithTransition(
    clips: RenderableClip[],
    timeMs: number,
  ): TransitionClipPair {
    // Sort clips by startTime
    const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);

    for (let i = 0; i < sorted.length; i++) {
      const clip = sorted[i];
      const prevClip = i > 0 ? sorted[i - 1] : null;

      // Check if we're in a transition zone at the start of this clip
      if (clip.transitionIn && clip.transitionIn.type !== 'none' && prevClip) {
        const transitionStart = clip.startTime;
        const transitionEnd = clip.startTime + clip.transitionIn.durationMs;

        if (timeMs >= transitionStart && timeMs < transitionEnd) {
          // Check if previous clip is still active (for transition to work)
          if (timeMs < prevClip.endTime || prevClip.endTime >= transitionStart) {
            const progress = (timeMs - transitionStart) / clip.transitionIn.durationMs;
            return {
              outgoingClip: prevClip,
              incomingClip: clip,
              transition: clip.transitionIn,
              progress: Math.min(1, Math.max(0, progress)),
            };
          }
        }
      }

      // Normal playback (no transition or outside transition zone)
      if (timeMs >= clip.startTime && timeMs < clip.endTime) {
        return {
          outgoingClip: null,
          incomingClip: clip,
          transition: null,
          progress: 1,
        };
      }
    }

    return { outgoingClip: null, incomingClip: null, transition: null, progress: 0 };
  }

  private async renderClip(
    clip: RenderableClip,
    _track: RenderableTrack,
    _timeMs: number,
  ): Promise<CompositeLayer | null> {
    // Handle nested sequence clips
    if (clip.sequenceId) {
      const frame = await this.renderNestedSequence(clip, _timeMs);
      if (!frame) return null;

      const clipTimeMs = _timeMs - clip.startTime;
      const filter = this.getCachedFilterString(clip);
      const opacity = this.getInterpolatedClipProperty(clip, 'opacity', clipTimeMs);
      const positionX = this.getInterpolatedClipProperty(clip, 'positionX', clipTimeMs);
      const positionY = this.getInterpolatedClipProperty(clip, 'positionY', clipTimeMs);
      const scaleX = this.getInterpolatedClipProperty(clip, 'scaleX', clipTimeMs);
      const scaleY = this.getInterpolatedClipProperty(clip, 'scaleY', clipTimeMs);
      const rotation = this.getInterpolatedClipProperty(clip, 'rotation', clipTimeMs);

      const hasTransform =
        clip.positionX != null || clip.scaleX != null || clip.rotation ||
        (clip.keyframes && Object.keys(clip.keyframes).length > 0);
      let transform: CompositeLayer['transform'] | undefined;
      if (hasTransform) {
        const w = frame.width * scaleX;
        const h = frame.height * scaleY;
        const px = positionX * this.config.width - w / 2;
        const py = positionY * this.config.height - h / 2;
        transform = { x: px, y: py, width: w, height: h, rotation };
      }

      return {
        type: 'video',
        frame,
        opacity,
        filter,
        blendMode: clip.filters?.blendMode,
        transform,
      };
    }

    const isVideo = clip.type === 'video';
    const isImage = clip.type === 'image' || clip.type === 'sticker';
    const isText = clip.type === 'text';

    if (!isVideo && !isImage && !isText) return null;

    // Calculate clip-relative time for keyframe interpolation
    const clipTimeMs = _timeMs - clip.startTime;

    // Get interpolated transform values
    const positionX = this.getInterpolatedClipProperty(clip, 'positionX', clipTimeMs);
    const positionY = this.getInterpolatedClipProperty(clip, 'positionY', clipTimeMs);
    const scaleX = this.getInterpolatedClipProperty(clip, 'scaleX', clipTimeMs);
    const scaleY = this.getInterpolatedClipProperty(clip, 'scaleY', clipTimeMs);
    const rotation = this.getInterpolatedClipProperty(clip, 'rotation', clipTimeMs);
    const opacity = this.getInterpolatedClipProperty(clip, 'opacity', clipTimeMs);
    const textRevealProgress = this.getInterpolatedClipProperty(clip, 'textRevealProgress', clipTimeMs);

    // Crop interpolation
    const cropTop = this.getInterpolatedClipProperty(clip, 'cropTop', clipTimeMs);
    const cropBottom = this.getInterpolatedClipProperty(clip, 'cropBottom', clipTimeMs);
    const cropLeft = this.getInterpolatedClipProperty(clip, 'cropLeft', clipTimeMs);
    const cropRight = this.getInterpolatedClipProperty(clip, 'cropRight', clipTimeMs);
    const hasCrop = cropTop > 0 || cropBottom > 0 || cropLeft > 0 || cropRight > 0;

    try {
      let frame: ImageBitmap | null = null;

      if (isText && clip.shapeType) {
        // Render shape clip using ShapeRenderer
        frame = await ShapeRenderer.render({
          shapeType: clip.shapeType,
          fill: clip.shapeFill || '#3B82F6',
          fillOpacity: clip.shapeFillOpacity ?? 1,
          stroke: clip.shapeStroke || '#FFFFFF',
          strokeWidth: clip.shapeStrokeWidth || 0,
          cornerRadius: clip.shapeCornerRadius || 0,
          canvasWidth: this.config.width,
          canvasHeight: this.config.height,
        });

        if (!frame) return null;

        const shapeSize = ShapeRenderer.measureShape(clip.shapeType, this.config.width, this.config.height);
        const w = shapeSize.width * scaleX;
        const h = shapeSize.height * scaleY;
        const px = positionX * this.config.width - w / 2;
        const py = positionY * this.config.height - h / 2;

        return {
          type: 'text',
          frame,
          opacity,
          blendMode: clip.filters?.blendMode,
          transform: {
            x: px,
            y: py,
            width: w,
            height: h,
            rotation,
          },
        };
      } else if (isText) {
        // Render text clip using TextRenderer
        frame = await TextRenderer.render({
          text: clip.textContent || '',
          fontSize: clip.fontSize || 48,
          fontFamily: clip.fontFamily || 'Arial',
          fontColor: clip.fontColor || '#FFFFFF',
          fontWeight: clip.fontWeight || 'bold',
          textAlign: (clip.textAlign as CanvasTextAlign) || 'center',
          backgroundColor: clip.backgroundColor,
          backgroundOpacity: clip.backgroundOpacity,
          textRevealProgress,
          textStroke: clip.textStroke,
          textStrokeWidth: clip.textStrokeWidth,
          canvasWidth: this.config.width,
          canvasHeight: this.config.height,
        });

        if (!frame) return null;

        // Text clips use transform for positioning
        const textSize = TextRenderer.measureText(
          clip.textContent || '',
          clip.fontSize || 48,
          clip.fontFamily || 'Arial',
          clip.fontWeight || 'bold',
        );

        const w = textSize.width * scaleX;
        const h = textSize.height * scaleY;
        const px = positionX * this.config.width - w / 2;
        const py = positionY * this.config.height - h / 2;

        return {
          type: 'text',
          frame,
          opacity,
          blendMode: clip.filters?.blendMode,
          transform: {
            x: px,
            y: py,
            width: w,
            height: h,
            rotation,
          },
        };
      }

      // Calculate source time within the clip for video/image (speed-aware)
      const sourceTimeMs = computeSourceTime(clip.trimStart, clipTimeMs, clip.keyframes, clip.filters?.speed ?? 1);

      if (isVideo) {
        frame = await this.decoderPool.getFrame(clip.assetId, sourceTimeMs);
      } else if (isImage && this.urlResolver) {
        frame = await this.assetCache.fetchImage(
          clip.assetId,
          this.urlResolver(clip.assetId),
        );
      }

      if (!frame) return null;

      // Apply chroma key if enabled (before compositing so alpha works with layers below)
      const chromaKey = clip.filters?.chromaKey;
      if (chromaKey?.enabled && frame) {
        const processed = await this.chromaKeyProcessor.process(
          frame,
          frame.width,
          frame.height,
          chromaKey,
        );
        this.pendingBitmaps.push(processed);
        frame = processed;
      }

      // Apply color grading if enabled
      const colorGrading = clip.filters?.colorGrading;
      if (colorGrading?.enabled && frame) {
        const processed = await this.colorGradingProcessor.process(
          frame,
          frame.width,
          frame.height,
          colorGrading,
        );
        this.pendingBitmaps.push(processed);
        frame = processed;
      }

      // Get cached filter string (memoized for performance)
      const filter = this.getCachedFilterString(clip);

      // Compute pixel transform from interpolated clip values
      const hasTransform =
        clip.positionX != null || clip.scaleX != null || clip.rotation ||
        hasCrop ||
        (clip.keyframes && Object.keys(clip.keyframes).length > 0);
      let transform: CompositeLayer['transform'] | undefined;
      if (hasTransform && frame) {
        const w = frame.width * scaleX;
        const h = frame.height * scaleY;
        const px = positionX * this.config.width - w / 2;
        const py = positionY * this.config.height - h / 2;

        // Compute source crop rectangle from crop fractions
        let sourceClip: { sx: number; sy: number; sw: number; sh: number } | undefined;
        if (hasCrop) {
          const sx = cropLeft * frame.width;
          const sy = cropTop * frame.height;
          const sw = frame.width * (1 - cropLeft - cropRight);
          const sh = frame.height * (1 - cropTop - cropBottom);
          sourceClip = { sx, sy, sw, sh };
        }

        transform = {
          x: px,
          y: py,
          width: w,
          height: h,
          rotation,
          border: clip.pipBorder,
          sourceClip,
        };
      }

      return {
        type: isVideo ? 'video' : 'image',
        frame,
        opacity,
        filter,
        blendMode: clip.filters?.blendMode,
        transform,
      };
    } catch {
      return null;
    }
  }

  getAudioMixer(): AudioMixerEngine {
    return this.audioMixer;
  }

  getDuckingProcessor(): DuckingProcessor {
    return this.duckingProcessor;
  }

  setBackgroundColor(color: string): void {
    this.compositor.setBackgroundColor(color);
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

    this.duckingProcessor.stop();
    this.chromaKeyProcessor.dispose();
    this.colorGradingProcessor.dispose();
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
