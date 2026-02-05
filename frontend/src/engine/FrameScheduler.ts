/**
 * rAF-based playback clock that drives the rendering loop.
 * Calls onTick with the current timeline time each frame.
 */
export class FrameScheduler {
  private rafId: number | null = null;
  private lastTimestamp: number | null = null;
  private currentTimeMs = 0;
  private durationMs = 0;
  private playing = false;

  // Audio sync properties
  private audioContext: AudioContext | null = null;
  private audioStartTime = 0;
  private timelineStartMs = 0;

  // Frame skipping properties
  private targetFrameMs = 1000 / 60;
  private lastRenderEndTime = 0;
  private skipNextRender = false;

  onTick: ((timeMs: number) => void) | null = null;
  onEnd: (() => void) | null = null;

  setDuration(durationMs: number): void {
    this.durationMs = durationMs;
  }

  setAudioContext(ctx: AudioContext | null): void {
    this.audioContext = ctx;
  }

  setTargetFps(fps: number): void {
    this.targetFrameMs = 1000 / fps;
  }

  reportRenderComplete(): void {
    this.lastRenderEndTime = performance.now();
  }

  shouldSkipFrame(): boolean {
    return this.skipNextRender;
  }

  play(fromTimeMs: number): void {
    this.currentTimeMs = fromTimeMs;
    this.timelineStartMs = fromTimeMs;
    this.lastTimestamp = null;
    this.lastRenderEndTime = performance.now();
    this.playing = true;

    // Record audio clock start time for sync
    if (this.audioContext) {
      this.audioStartTime = this.audioContext.currentTime;
    }

    this.tick();
  }

  pause(): void {
    this.playing = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.lastTimestamp = null;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getCurrentTime(): number {
    return this.currentTimeMs;
  }

  private tick = (): void => {
    if (!this.playing) return;

    this.rafId = requestAnimationFrame((timestamp) => {
      if (!this.playing) return;

      // Use audio clock as master if available and running
      if (this.audioContext?.state === 'running') {
        const audioElapsed = (this.audioContext.currentTime - this.audioStartTime) * 1000;
        this.currentTimeMs = this.timelineStartMs + audioElapsed;
      } else if (this.lastTimestamp !== null) {
        // Fallback to rAF delta when audio not available
        const deltaMs = timestamp - this.lastTimestamp;
        this.currentTimeMs += deltaMs;
      }

      // Check if we've reached the end
      if (this.durationMs > 0 && this.currentTimeMs >= this.durationMs) {
        this.currentTimeMs = this.durationMs;
        this.playing = false;
        this.onTick?.(this.currentTimeMs);
        this.onEnd?.();
        return;
      }

      // Determine if we should skip the next frame
      const now = performance.now();
      const timeSinceLastRender = now - this.lastRenderEndTime;
      this.skipNextRender = timeSinceLastRender > this.targetFrameMs * 1.5;

      this.onTick?.(this.currentTimeMs);

      this.lastTimestamp = timestamp;
      this.tick();
    });
  };

  dispose(): void {
    this.pause();
    this.onTick = null;
    this.onEnd = null;
  }
}
