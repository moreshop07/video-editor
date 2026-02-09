/**
 * Client-side video export engine.
 * Renders timeline frames using CompositorEngine, encodes with WebCodecs VideoEncoder,
 * and muxes into MP4/WebM. Also supports GIF and WAV (audio-only) export.
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from 'webm-muxer';
import { CompositorEngine } from './CompositorEngine';
import { encodeGif } from './gifEncoder';
import { exportWav } from './wavEncoder';
import type { RenderableTrack, SubtitleEntry } from './types';

export type ExportFormat = 'mp4' | 'webm' | 'gif' | 'wav';

export interface ExportConfig {
  width: number;
  height: number;
  fps: number;
  videoBitrate: number; // bps
  includeSubtitles: boolean;
  format: ExportFormat;
}

export type ExportStatus = 'idle' | 'preparing' | 'rendering' | 'encoding' | 'completed' | 'failed' | 'cancelled';

export interface ExportProgress {
  status: ExportStatus;
  currentFrame: number;
  totalFrames: number;
  percent: number;
}

/** Compute video bitrate from quality preset and resolution */
export function getVideoBitrate(
  quality: 'low' | 'medium' | 'high' | 'custom',
  width: number,
  height: number,
): number {
  const pixels = width * height;
  switch (quality) {
    case 'low':
      return Math.round(pixels * 3); // ~6 Mbps for 1080p
    case 'medium':
      return Math.round(pixels * 6); // ~12 Mbps for 1080p
    case 'high':
      return Math.round(pixels * 10); // ~20 Mbps for 1080p
    case 'custom':
    default:
      return Math.round(pixels * 6);
  }
}

export class ExportEngine {
  private engine: CompositorEngine | null = null;
  private cancelled = false;
  private status: ExportStatus = 'idle';
  private _sequences?: Record<string, { tracks: RenderableTrack[] }>;

  onProgress: ((progress: ExportProgress) => void) | null = null;

  /**
   * Check if client-side export is supported (requires WebCodecs VideoEncoder).
   * Note: GIF and WAV export don't require WebCodecs.
   */
  static isSupported(): boolean {
    return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
  }

  /**
   * Export the timeline to a Blob in the specified format.
   */
  async export(
    config: ExportConfig,
    tracks: RenderableTrack[],
    subtitleSegments: SubtitleEntry[],
    urlResolver: (assetId: string) => string,
    durationMs: number,
    sequences?: Record<string, { tracks: RenderableTrack[] }>,
  ): Promise<Blob> {
    this.cancelled = false;
    this._sequences = sequences;

    switch (config.format) {
      case 'wav':
        return this.exportWavFormat(config, tracks, urlResolver, durationMs);
      case 'gif':
        return this.exportGifFormat(config, tracks, subtitleSegments, urlResolver, durationMs);
      case 'webm':
        return this.exportWebmFormat(config, tracks, subtitleSegments, urlResolver, durationMs);
      case 'mp4':
      default:
        return this.exportMp4Format(config, tracks, subtitleSegments, urlResolver, durationMs);
    }
  }

  /**
   * Cancel an in-progress export.
   */
  cancel(): void {
    this.cancelled = true;
    this.setStatus('cancelled');
  }

  getStatus(): ExportStatus {
    return this.status;
  }

  // ---------- MP4 export (existing) ----------

  private async exportMp4Format(
    config: ExportConfig,
    tracks: RenderableTrack[],
    subtitleSegments: SubtitleEntry[],
    urlResolver: (assetId: string) => string,
    durationMs: number,
  ): Promise<Blob> {
    this.setStatus('preparing');

    if (!ExportEngine.isSupported()) {
      throw new Error('WebCodecs VideoEncoder is not supported in this browser');
    }

    if (durationMs <= 0) {
      throw new Error('Timeline is empty');
    }

    const canvas = await this.setupEngine(config, tracks, subtitleSegments, urlResolver);

    if (this.cancelled) {
      this.cleanup();
      throw new Error('Export cancelled');
    }

    // Set up mp4-muxer
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: {
        codec: 'avc',
        width: config.width,
        height: config.height,
      },
      fastStart: 'in-memory',
    });

    // Set up VideoEncoder
    let encoderError: Error | null = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        muxer.addVideoChunk(chunk, meta ?? undefined);
      },
      error: (e) => {
        encoderError = e instanceof Error ? e : new Error(String(e));
      },
    });

    const codecString = this.selectH264Codec(config.width, config.height);

    encoder.configure({
      codec: codecString,
      width: config.width,
      height: config.height,
      bitrate: config.videoBitrate,
      framerate: config.fps,
    });

    const totalFrames = Math.ceil((durationMs / 1000) * config.fps);
    const frameDurationUs = Math.round((1_000_000) / config.fps);

    this.setStatus('rendering');

    try {
      for (let i = 0; i < totalFrames; i++) {
        if (this.cancelled) { encoder.close(); this.cleanup(); throw new Error('Export cancelled'); }
        if (encoderError) { encoder.close(); this.cleanup(); throw encoderError; }

        const timeMs = (i / config.fps) * 1000;
        await this.engine!.renderFrame(timeMs);

        const videoFrame = new VideoFrame(canvas, {
          timestamp: i * frameDurationUs,
          duration: frameDurationUs,
        });

        const keyFrame = i % (config.fps * 2) === 0;
        encoder.encode(videoFrame, { keyFrame });
        videoFrame.close();

        this.reportProgress('rendering', i + 1, totalFrames);
        if (i % 5 === 0) await this.yieldToMainThread();
      }

      this.setStatus('encoding');
      await encoder.flush();
      encoder.close();

      if (encoderError) { this.cleanup(); throw encoderError; }

      muxer.finalize();
      const blob = new Blob([target.buffer], { type: 'video/mp4' });

      this.cleanup();
      this.setStatus('completed');
      this.reportProgress('completed', totalFrames, totalFrames);
      return blob;
    } catch (err) {
      this.cleanup();
      if (this.cancelled) { this.setStatus('cancelled'); throw new Error('Export cancelled'); }
      this.setStatus('failed');
      throw err;
    }
  }

  // ---------- WebM export ----------

  private async exportWebmFormat(
    config: ExportConfig,
    tracks: RenderableTrack[],
    subtitleSegments: SubtitleEntry[],
    urlResolver: (assetId: string) => string,
    durationMs: number,
  ): Promise<Blob> {
    this.setStatus('preparing');

    if (!ExportEngine.isSupported()) {
      throw new Error('WebCodecs VideoEncoder is not supported in this browser');
    }

    if (durationMs <= 0) {
      throw new Error('Timeline is empty');
    }

    const canvas = await this.setupEngine(config, tracks, subtitleSegments, urlResolver);

    if (this.cancelled) { this.cleanup(); throw new Error('Export cancelled'); }

    // Set up webm-muxer
    const target = new WebmTarget();
    const codec = await this.selectVP9Codec(config.width, config.height);
    const muxer = new WebmMuxer({
      target,
      video: {
        codec: codec.startsWith('vp09') ? 'V_VP9' : 'V_VP8',
        width: config.width,
        height: config.height,
      },
    });

    let encoderError: Error | null = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        muxer.addVideoChunk(chunk, meta ?? undefined);
      },
      error: (e) => {
        encoderError = e instanceof Error ? e : new Error(String(e));
      },
    });

    encoder.configure({
      codec,
      width: config.width,
      height: config.height,
      bitrate: config.videoBitrate,
      framerate: config.fps,
    });

    const totalFrames = Math.ceil((durationMs / 1000) * config.fps);
    const frameDurationUs = Math.round((1_000_000) / config.fps);

    this.setStatus('rendering');

    try {
      for (let i = 0; i < totalFrames; i++) {
        if (this.cancelled) { encoder.close(); this.cleanup(); throw new Error('Export cancelled'); }
        if (encoderError) { encoder.close(); this.cleanup(); throw encoderError; }

        const timeMs = (i / config.fps) * 1000;
        await this.engine!.renderFrame(timeMs);

        const videoFrame = new VideoFrame(canvas, {
          timestamp: i * frameDurationUs,
          duration: frameDurationUs,
        });

        const keyFrame = i % (config.fps * 2) === 0;
        encoder.encode(videoFrame, { keyFrame });
        videoFrame.close();

        this.reportProgress('rendering', i + 1, totalFrames);
        if (i % 5 === 0) await this.yieldToMainThread();
      }

      this.setStatus('encoding');
      await encoder.flush();
      encoder.close();

      if (encoderError) { this.cleanup(); throw encoderError; }

      muxer.finalize();
      const blob = new Blob([target.buffer], { type: 'video/webm' });

      this.cleanup();
      this.setStatus('completed');
      this.reportProgress('completed', totalFrames, totalFrames);
      return blob;
    } catch (err) {
      this.cleanup();
      if (this.cancelled) { this.setStatus('cancelled'); throw new Error('Export cancelled'); }
      this.setStatus('failed');
      throw err;
    }
  }

  // ---------- GIF export ----------

  private async exportGifFormat(
    config: ExportConfig,
    tracks: RenderableTrack[],
    subtitleSegments: SubtitleEntry[],
    urlResolver: (assetId: string) => string,
    durationMs: number,
  ): Promise<Blob> {
    this.setStatus('preparing');

    if (durationMs <= 0) {
      throw new Error('Timeline is empty');
    }

    // GIF uses a lower FPS (capped at 10) for reasonable file size
    const gifFps = Math.min(config.fps, 10);
    const canvas = await this.setupEngine(
      { ...config, fps: gifFps },
      tracks,
      subtitleSegments,
      urlResolver,
    );

    if (this.cancelled) { this.cleanup(); throw new Error('Export cancelled'); }

    const totalFrames = Math.ceil((durationMs / 1000) * gifFps);
    const delayMs = Math.round(1000 / gifFps);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      this.cleanup();
      throw new Error('Cannot get 2d context for GIF export');
    }

    this.setStatus('rendering');
    const frames: ImageData[] = [];

    try {
      for (let i = 0; i < totalFrames; i++) {
        if (this.cancelled) { this.cleanup(); throw new Error('Export cancelled'); }

        const timeMs = (i / gifFps) * 1000;
        await this.engine!.renderFrame(timeMs);

        // Get ImageData from canvas
        const imageData = ctx.getImageData(0, 0, config.width, config.height);
        frames.push(imageData);

        this.reportProgress('rendering', i + 1, totalFrames);
        if (i % 3 === 0) await this.yieldToMainThread();
      }

      this.setStatus('encoding');
      this.reportProgress('encoding', totalFrames, totalFrames);

      const blob = encodeGif(frames, config.width, config.height, delayMs);

      this.cleanup();
      this.setStatus('completed');
      this.reportProgress('completed', totalFrames, totalFrames);
      return blob;
    } catch (err) {
      this.cleanup();
      if (this.cancelled) { this.setStatus('cancelled'); throw new Error('Export cancelled'); }
      this.setStatus('failed');
      throw err;
    }
  }

  // ---------- WAV export ----------

  private async exportWavFormat(
    config: ExportConfig,
    tracks: RenderableTrack[],
    urlResolver: (assetId: string) => string,
    durationMs: number,
  ): Promise<Blob> {
    this.setStatus('preparing');

    if (durationMs <= 0) {
      throw new Error('Timeline is empty');
    }

    this.setStatus('rendering');

    try {
      const blob = await exportWav(
        tracks,
        urlResolver,
        durationMs,
        44100,
        (percent) => {
          this.reportProgress('rendering', percent, 100);
        },
      );

      if (this.cancelled) { throw new Error('Export cancelled'); }

      this.setStatus('completed');
      this.reportProgress('completed', 100, 100);
      return blob;
    } catch (err) {
      if (this.cancelled) { this.setStatus('cancelled'); throw new Error('Export cancelled'); }
      this.setStatus('failed');
      throw err;
    }
  }

  // ---------- Shared helpers ----------

  private async setupEngine(
    config: ExportConfig,
    tracks: RenderableTrack[],
    subtitleSegments: SubtitleEntry[],
    urlResolver: (assetId: string) => string,
  ): Promise<HTMLCanvasElement> {
    const canvas = document.createElement('canvas');
    canvas.width = config.width;
    canvas.height = config.height;

    this.engine = new CompositorEngine({
      canvas,
      width: config.width,
      height: config.height,
      fps: config.fps,
    });

    await this.engine.init();
    this.engine.setAssetUrlResolver(urlResolver);
    this.engine.setTracks(tracks);
    if (this._sequences) {
      this.engine.setSequences(this._sequences);
    }

    if (config.includeSubtitles) {
      this.engine.setSubtitleSegments(subtitleSegments);
    }

    await this.waitForPreload(500);
    return canvas;
  }

  private setStatus(status: ExportStatus): void {
    this.status = status;
  }

  private reportProgress(status: ExportStatus, currentFrame: number, totalFrames: number): void {
    this.onProgress?.({
      status,
      currentFrame,
      totalFrames,
      percent: Math.round((currentFrame / totalFrames) * 100),
    });
  }

  private cleanup(): void {
    if (this.engine) {
      this.engine.dispose();
      this.engine = null;
    }
  }

  private async waitForPreload(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async yieldToMainThread(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  /**
   * Select appropriate H.264 codec string based on resolution.
   */
  private selectH264Codec(width: number, height: number): string {
    const pixels = width * height;
    if (pixels > 1920 * 1080) {
      return 'avc1.640033'; // High Profile Level 5.1
    } else if (pixels > 1280 * 720) {
      return 'avc1.640028'; // High Profile Level 4.0
    } else {
      return 'avc1.4D001F'; // Main Profile Level 3.1
    }
  }

  /**
   * Select VP9 codec string, falling back to VP8 if not supported.
   */
  private async selectVP9Codec(_width: number, _height: number): Promise<string> {
    // Try VP9 first
    const vp9 = 'vp09.00.10.08';
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec: vp9,
        width: _width,
        height: _height,
        bitrate: 1_000_000,
      });
      if (support.supported) return vp9;
    } catch {
      // fall through
    }

    // Fallback to VP8
    return 'vp8';
  }
}
