export interface TextRenderOptions {
  text: string;
  fontSize: number;
  fontFamily: string;
  fontColor: string;
  fontWeight: string;
  textAlign: CanvasTextAlign;
  backgroundColor?: string;
  backgroundOpacity?: number;
  canvasWidth: number;
  canvasHeight: number;
}

export class TextRenderer {
  /**
   * Render text to an ImageBitmap.
   * The text is rendered centered in the canvas with optional background.
   */
  static async render(options: TextRenderOptions): Promise<ImageBitmap | null> {
    const {
      text,
      fontSize,
      fontFamily,
      fontColor,
      fontWeight,
      textAlign,
      backgroundColor,
      backgroundOpacity = 0,
      canvasWidth,
      canvasHeight,
    } = options;

    if (!text.trim()) return null;

    // Create off-screen canvas
    const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Set font for text measurement
    ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}", sans-serif`;
    ctx.textAlign = textAlign;
    ctx.textBaseline = 'middle';

    // Split text into lines
    const lines = text.split('\n');
    const lineHeight = fontSize * 1.3;
    const totalTextHeight = lines.length * lineHeight;

    // Calculate text metrics for background
    let maxLineWidth = 0;
    for (const line of lines) {
      const metrics = ctx.measureText(line);
      maxLineWidth = Math.max(maxLineWidth, metrics.width);
    }

    // Calculate text position (centered in canvas)
    const textX = canvasWidth / 2;
    const textY = canvasHeight / 2;
    const padding = fontSize * 0.4;

    // Draw background if specified
    if (backgroundColor && backgroundOpacity > 0) {
      ctx.save();
      ctx.globalAlpha = backgroundOpacity;
      ctx.fillStyle = backgroundColor;

      const bgX = textX - maxLineWidth / 2 - padding;
      const bgY = textY - totalTextHeight / 2 - padding;
      const bgWidth = maxLineWidth + padding * 2;
      const bgHeight = totalTextHeight + padding * 2;

      // Draw rounded rectangle background
      const radius = Math.min(8, fontSize * 0.2);
      ctx.beginPath();
      ctx.roundRect(bgX, bgY, bgWidth, bgHeight, radius);
      ctx.fill();
      ctx.restore();
    }

    // Draw text with shadow
    ctx.fillStyle = fontColor;

    // Text shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    // Draw each line
    let yOffset = textY - (totalTextHeight / 2) + lineHeight / 2;
    for (const line of lines) {
      ctx.fillText(line, textX, yOffset);
      yOffset += lineHeight;
    }

    ctx.restore();

    // Convert to ImageBitmap
    return createImageBitmap(canvas);
  }

  /**
   * Render text with transform parameters for positioned text.
   * Returns dimensions for transform calculations.
   */
  static measureText(
    text: string,
    fontSize: number,
    fontFamily: string,
    fontWeight: string,
  ): { width: number; height: number } {
    // Create a temporary canvas for measurement
    const canvas = new OffscreenCanvas(1, 1);
    const ctx = canvas.getContext('2d');
    if (!ctx) return { width: 0, height: 0 };

    ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}", sans-serif`;

    const lines = text.split('\n');
    const lineHeight = fontSize * 1.3;

    let maxWidth = 0;
    for (const line of lines) {
      const metrics = ctx.measureText(line);
      maxWidth = Math.max(maxWidth, metrics.width);
    }

    return {
      width: maxWidth + fontSize * 0.8, // Add padding
      height: lines.length * lineHeight + fontSize * 0.8,
    };
  }
}
