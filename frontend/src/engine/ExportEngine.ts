/**
 * Client-side video export engine.
 * Renders timeline frames using CompositorEngine, encodes with WebCodecs VideoEncoder,
 * and muxes into MP4 using mp4-muxer.
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { CompositorEngine } from './CompositorEngine';
import type { RenderableTrack, SubtitleEntry } from './types';

export interface ExportConfig {
  width: number;
  height: number;
  fps: number;
  videoBitrate: number; // bps
  includeSubtitles: boolean;
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

  onProgress: ((progress: ExportProgress) => void) | null = null;

  /**
   * Check if client-side export is supported (requires WebCodecs VideoEncoder).
   */
  static isSupported(): boolean {
    return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
  }

  /**
   * Export the timeline to an MP4 Blob.
   */
  async export(
    config: ExportConfig,
    tracks: RenderableTrack[],
    subtitleSegments: SubtitleEntry[],
    urlResolver: (assetId: string) => string,
    durationMs: number,
  ): Promise<Blob> {
    this.cancelled = false;
    this.setStatus('preparing');

    if (!ExportEngine.isSupported()) {
      throw new Error('WebCodecs VideoEncoder is not supported in this browser');
    }

    if (durationMs <= 0) {
      throw new Error('Timeline is empty');
    }

    // Create offscreen canvas and engine for export rendering
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

    if (config.includeSubtitles) {
      this.engine.setSubtitleSegments(subtitleSegments);
    }

    // Allow time for asset preloading
    await this.waitForPreload(500);

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

    // Configure encoder - try H.264 Main Profile
    const codecString = this.selectCodec(config.width, config.height);

    encoder.configure({
      codec: codecString,
      width: config.width,
      height: config.height,
      bitrate: config.videoBitrate,
      framerate: config.fps,
    });

    // Calculate frame parameters
    const totalFrames = Math.ceil((durationMs / 1000) * config.fps);
    const frameDurationUs = Math.round((1_000_000) / config.fps);

    this.setStatus('rendering');

    try {
      for (let i = 0; i < totalFrames; i++) {
        if (this.cancelled) {
          encoder.close();
          this.cleanup();
          throw new Error('Export cancelled');
        }

        if (encoderError) {
          encoder.close();
          this.cleanup();
          throw encoderError;
        }

        const timeMs = (i / config.fps) * 1000;

        // Render the frame on the offscreen canvas
        await this.engine.renderFrame(timeMs);

        // Create VideoFrame from the canvas
        const videoFrame = new VideoFrame(canvas, {
          timestamp: i * frameDurationUs,
          duration: frameDurationUs,
        });

        // Encode - key frame every 2 seconds
        const keyFrame = i % (config.fps * 2) === 0;
        encoder.encode(videoFrame, { keyFrame });
        videoFrame.close();

        // Report progress
        this.reportProgress('rendering', i + 1, totalFrames);

        // Yield to main thread periodically to keep UI responsive
        if (i % 5 === 0) {
          await this.yieldToMainThread();
        }
      }

      // Flush remaining encoded frames
      this.setStatus('encoding');
      await encoder.flush();
      encoder.close();

      if (encoderError) {
        this.cleanup();
        throw encoderError;
      }

      // Finalize MP4 file
      muxer.finalize();

      const blob = new Blob([target.buffer], { type: 'video/mp4' });

      this.cleanup();
      this.setStatus('completed');
      this.reportProgress('completed', totalFrames, totalFrames);

      return blob;
    } catch (err) {
      this.cleanup();
      if (this.cancelled) {
        this.setStatus('cancelled');
        throw new Error('Export cancelled');
      }
      this.setStatus('failed');
      throw err;
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
  private selectCodec(width: number, height: number): string {
    const pixels = width * height;
    if (pixels > 1920 * 1080) {
      // 4K: High Profile Level 5.1
      return 'avc1.640033';
    } else if (pixels > 1280 * 720) {
      // 1080p: High Profile Level 4.0
      return 'avc1.640028';
    } else {
      // 720p and below: Main Profile Level 3.1
      return 'avc1.4D001F';
    }
  }
}
