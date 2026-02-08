import type { ChromaKeySettings } from '@/effects/types';

/**
 * Pixel-level chroma key processor using OffscreenCanvas.
 * Removes a configurable key color from frames, producing transparent pixels
 * that allow lower layers to show through during compositing.
 *
 * Algorithm: YCbCr chrominance distance comparison with soft edge feathering and despill.
 */
export class ChromaKeyProcessor {
  private canvas: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D;

  constructor(width: number, height: number) {
    this.canvas = new OffscreenCanvas(width, height);
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  }

  async process(
    source: CanvasImageSource,
    sourceWidth: number,
    sourceHeight: number,
    settings: ChromaKeySettings,
  ): Promise<ImageBitmap> {
    // Resize internal canvas if needed
    if (this.canvas.width !== sourceWidth || this.canvas.height !== sourceHeight) {
      this.canvas.width = sourceWidth;
      this.canvas.height = sourceHeight;
      // Re-acquire context after resize
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    }

    // Draw source frame
    this.ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight);

    // Read pixels
    const imageData = this.ctx.getImageData(0, 0, sourceWidth, sourceHeight);
    const data = imageData.data;

    // Parse key color from hex
    const keyR = parseInt(settings.keyColor.slice(1, 3), 16);
    const keyG = parseInt(settings.keyColor.slice(3, 5), 16);
    const keyB = parseInt(settings.keyColor.slice(5, 7), 16);

    // Convert key color to CbCr (YCbCr chrominance components)
    const keyCb = 128 + (-0.168736 * keyR - 0.331264 * keyG + 0.5 * keyB);
    const keyCr = 128 + (0.5 * keyR - 0.418688 * keyG - 0.081312 * keyB);

    // Precompute thresholds
    const similarityThreshold = settings.similarity * 255;
    const smoothnessRange = settings.smoothness * 255;
    const outerThreshold = similarityThreshold + smoothnessRange;

    // Determine dominant key channel for despill
    const maxKeyChannel = Math.max(keyR, keyG, keyB);
    const keyIsGreen = maxKeyChannel === keyG;
    const keyIsBlue = !keyIsGreen && maxKeyChannel === keyB;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Convert pixel to CbCr
      const cb = 128 + (-0.168736 * r - 0.331264 * g + 0.5 * b);
      const cr = 128 + (0.5 * r - 0.418688 * g - 0.081312 * b);

      // Euclidean distance in CbCr space
      const dist = Math.sqrt((cb - keyCb) ** 2 + (cr - keyCr) ** 2);

      let alpha: number;
      if (dist < similarityThreshold) {
        alpha = 0; // Fully transparent
      } else if (dist < outerThreshold) {
        // Smooth feathered transition
        alpha = (dist - similarityThreshold) / smoothnessRange;
      } else {
        alpha = 1; // Fully opaque
      }

      // Set alpha
      data[i + 3] = Math.round(alpha * 255);

      // Despill: reduce dominant key-color channel on semi-transparent edge pixels
      if (alpha > 0 && alpha < 1 && settings.despill > 0) {
        const factor = settings.despill * (1 - alpha);
        if (keyIsGreen) {
          const limit = Math.max(r, b);
          if (g > limit) {
            data[i + 1] = Math.round(g - (g - limit) * factor);
          }
        } else if (keyIsBlue) {
          const limit = Math.max(r, g);
          if (b > limit) {
            data[i + 2] = Math.round(b - (b - limit) * factor);
          }
        } else {
          // Red screen
          const limit = Math.max(g, b);
          if (r > limit) {
            data[i] = Math.round(r - (r - limit) * factor);
          }
        }
      }
    }

    this.ctx.putImageData(imageData, 0, 0);
    return createImageBitmap(this.canvas);
  }

  dispose(): void {
    // OffscreenCanvas does not need explicit disposal
  }
}
