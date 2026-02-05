import type { TransitionType, TransitionRenderParams } from '@/types/transitions';

type DrawableSource = ImageBitmap | HTMLVideoElement | HTMLImageElement | null;

export class TransitionRenderer {
  /**
   * Render two frames with a transition effect
   * @param ctx - Canvas 2D context
   * @param outgoing - Frame leaving (can be null)
   * @param incoming - Frame entering
   * @param params - Transition parameters
   */
  static render(
    ctx: CanvasRenderingContext2D,
    outgoing: DrawableSource,
    incoming: DrawableSource,
    params: TransitionRenderParams
  ): void {
    const { progress, type, width, height } = params;

    switch (type) {
      case 'fade':
        this.renderFade(ctx, outgoing, incoming, progress, width, height);
        break;
      case 'slide-left':
        this.renderSlide(ctx, outgoing, incoming, progress, width, height, 'left');
        break;
      case 'slide-right':
        this.renderSlide(ctx, outgoing, incoming, progress, width, height, 'right');
        break;
      case 'slide-up':
        this.renderSlide(ctx, outgoing, incoming, progress, width, height, 'up');
        break;
      case 'slide-down':
        this.renderSlide(ctx, outgoing, incoming, progress, width, height, 'down');
        break;
      case 'wipe-left':
        this.renderWipe(ctx, outgoing, incoming, progress, width, height, 'left');
        break;
      case 'wipe-right':
        this.renderWipe(ctx, outgoing, incoming, progress, width, height, 'right');
        break;
      case 'wipe-up':
        this.renderWipe(ctx, outgoing, incoming, progress, width, height, 'up');
        break;
      case 'wipe-down':
        this.renderWipe(ctx, outgoing, incoming, progress, width, height, 'down');
        break;
      case 'zoom-in':
        this.renderZoom(ctx, outgoing, incoming, progress, width, height, 'in');
        break;
      case 'zoom-out':
        this.renderZoom(ctx, outgoing, incoming, progress, width, height, 'out');
        break;
      default:
        // No transition, just draw incoming
        if (incoming) {
          ctx.drawImage(incoming, 0, 0, width, height);
        }
    }
  }

  /**
   * Cross-dissolve/fade transition
   * Outgoing fades out while incoming fades in
   */
  private static renderFade(
    ctx: CanvasRenderingContext2D,
    outgoing: DrawableSource,
    incoming: DrawableSource,
    progress: number,
    width: number,
    height: number
  ): void {
    // Draw outgoing with decreasing opacity
    if (outgoing) {
      ctx.globalAlpha = 1 - progress;
      ctx.drawImage(outgoing, 0, 0, width, height);
    }
    // Draw incoming with increasing opacity
    if (incoming) {
      ctx.globalAlpha = progress;
      ctx.drawImage(incoming, 0, 0, width, height);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Slide transition
   * Outgoing slides out while incoming slides in from the opposite direction
   */
  private static renderSlide(
    ctx: CanvasRenderingContext2D,
    outgoing: DrawableSource,
    incoming: DrawableSource,
    progress: number,
    width: number,
    height: number,
    direction: 'left' | 'right' | 'up' | 'down'
  ): void {
    ctx.save();

    switch (direction) {
      case 'left':
        // Outgoing slides left, incoming enters from right
        if (outgoing) {
          ctx.drawImage(outgoing, -width * progress, 0, width, height);
        }
        if (incoming) {
          ctx.drawImage(incoming, width * (1 - progress), 0, width, height);
        }
        break;
      case 'right':
        // Outgoing slides right, incoming enters from left
        if (outgoing) {
          ctx.drawImage(outgoing, width * progress, 0, width, height);
        }
        if (incoming) {
          ctx.drawImage(incoming, -width * (1 - progress), 0, width, height);
        }
        break;
      case 'up':
        // Outgoing slides up, incoming enters from bottom
        if (outgoing) {
          ctx.drawImage(outgoing, 0, -height * progress, width, height);
        }
        if (incoming) {
          ctx.drawImage(incoming, 0, height * (1 - progress), width, height);
        }
        break;
      case 'down':
        // Outgoing slides down, incoming enters from top
        if (outgoing) {
          ctx.drawImage(outgoing, 0, height * progress, width, height);
        }
        if (incoming) {
          ctx.drawImage(incoming, 0, -height * (1 - progress), width, height);
        }
        break;
    }

    ctx.restore();
  }

  /**
   * Wipe transition
   * Incoming wipes over outgoing from the specified direction
   */
  private static renderWipe(
    ctx: CanvasRenderingContext2D,
    outgoing: DrawableSource,
    incoming: DrawableSource,
    progress: number,
    width: number,
    height: number,
    direction: 'left' | 'right' | 'up' | 'down'
  ): void {
    // Draw full outgoing first
    if (outgoing) {
      ctx.drawImage(outgoing, 0, 0, width, height);
    }

    // Clip and draw incoming
    if (incoming) {
      ctx.save();
      ctx.beginPath();

      switch (direction) {
        case 'left':
          // Wipe from right to left
          ctx.rect(0, 0, width * progress, height);
          break;
        case 'right':
          // Wipe from left to right
          ctx.rect(width * (1 - progress), 0, width * progress, height);
          break;
        case 'up':
          // Wipe from bottom to top
          ctx.rect(0, 0, width, height * progress);
          break;
        case 'down':
          // Wipe from top to bottom
          ctx.rect(0, height * (1 - progress), width, height * progress);
          break;
      }

      ctx.clip();
      ctx.drawImage(incoming, 0, 0, width, height);
      ctx.restore();
    }
  }

  /**
   * Zoom transition
   * Zoom in: incoming zooms in from center
   * Zoom out: outgoing zooms out while incoming fades in
   */
  private static renderZoom(
    ctx: CanvasRenderingContext2D,
    outgoing: DrawableSource,
    incoming: DrawableSource,
    progress: number,
    width: number,
    height: number,
    direction: 'in' | 'out'
  ): void {
    if (direction === 'in') {
      // Draw outgoing fading out
      if (outgoing) {
        ctx.globalAlpha = 1 - progress;
        ctx.drawImage(outgoing, 0, 0, width, height);
      }

      // Draw incoming scaling up from center
      if (incoming) {
        const scale = 0.5 + progress * 0.5; // Scale from 0.5 to 1.0
        const scaledWidth = width * scale;
        const scaledHeight = height * scale;
        const offsetX = (width - scaledWidth) / 2;
        const offsetY = (height - scaledHeight) / 2;

        ctx.globalAlpha = progress;
        ctx.drawImage(incoming, offsetX, offsetY, scaledWidth, scaledHeight);
      }
    } else {
      // Zoom out: outgoing shrinks while incoming fades in
      // Draw incoming first (background)
      if (incoming) {
        ctx.globalAlpha = progress;
        ctx.drawImage(incoming, 0, 0, width, height);
      }

      // Draw outgoing shrinking
      if (outgoing) {
        const scale = 1 - progress * 0.5; // Scale from 1.0 to 0.5
        const scaledWidth = width * scale;
        const scaledHeight = height * scale;
        const offsetX = (width - scaledWidth) / 2;
        const offsetY = (height - scaledHeight) / 2;

        ctx.globalAlpha = 1 - progress;
        ctx.drawImage(outgoing, offsetX, offsetY, scaledWidth, scaledHeight);
      }
    }

    ctx.globalAlpha = 1;
  }
}
