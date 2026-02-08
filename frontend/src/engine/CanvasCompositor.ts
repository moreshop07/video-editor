import type { CompositeLayer, SubtitleOverlay } from './types';

export class CanvasCompositor {
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D canvas context');
    this.ctx = ctx;
    this.width = width;
    this.height = height;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  clear(): void {
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  /**
   * Composite layers bottom-to-top onto the canvas.
   */
  composite(layers: CompositeLayer[]): void {
    this.clear();

    for (const layer of layers) {
      this.ctx.globalAlpha = layer.opacity;
      this.ctx.filter = layer.filter || 'none';

      if (layer.transform) {
        const { x, y, width, height, rotation, border } = layer.transform;
        if (rotation) {
          this.ctx.save();
          this.ctx.translate(x + width / 2, y + height / 2);
          this.ctx.rotate((rotation * Math.PI) / 180);

          // Border/shadow for PiP
          if (border && border.width > 0) {
            if (border.shadow > 0) {
              this.ctx.shadowColor = 'rgba(0,0,0,0.5)';
              this.ctx.shadowBlur = border.shadow;
              this.ctx.shadowOffsetX = 0;
              this.ctx.shadowOffsetY = 2;
            }
            this.ctx.strokeStyle = border.color;
            this.ctx.lineWidth = border.width;
            this.ctx.strokeRect(
              -width / 2 - border.width / 2,
              -height / 2 - border.width / 2,
              width + border.width,
              height + border.width,
            );
            this.ctx.shadowColor = 'transparent';
            this.ctx.shadowBlur = 0;
          }

          this.ctx.drawImage(layer.frame, -width / 2, -height / 2, width, height);
          this.ctx.restore();
        } else {
          // Border/shadow for PiP (no rotation)
          if (border && border.width > 0) {
            this.ctx.save();
            if (border.shadow > 0) {
              this.ctx.shadowColor = 'rgba(0,0,0,0.5)';
              this.ctx.shadowBlur = border.shadow;
              this.ctx.shadowOffsetX = 0;
              this.ctx.shadowOffsetY = 2;
            }
            this.ctx.strokeStyle = border.color;
            this.ctx.lineWidth = border.width;
            this.ctx.strokeRect(
              x - border.width / 2,
              y - border.width / 2,
              width + border.width,
              height + border.width,
            );
            this.ctx.restore();
          }

          this.ctx.drawImage(layer.frame, x, y, width, height);
        }
      } else {
        // Aspect-fit into canvas
        const src = layer.frame;
        const srcW = 'videoWidth' in src
          ? (src as HTMLVideoElement).videoWidth
          : (src as ImageBitmap).width;
        const srcH = 'videoHeight' in src
          ? (src as HTMLVideoElement).videoHeight
          : (src as ImageBitmap).height;

        if (srcW === 0 || srcH === 0) continue;

        const { x, y, width, height } = this.calculateAspectFit(srcW, srcH);
        this.ctx.drawImage(layer.frame, x, y, width, height);
      }
    }

    this.ctx.globalAlpha = 1;
    this.ctx.filter = 'none';
  }

  renderSubtitle(overlay: SubtitleOverlay): void {
    const ctx = this.ctx;
    const baseFontSize = Math.round(this.height * 0.045);
    const smallFontSize = Math.round(baseFontSize * 0.85);
    const lineHeight = baseFontSize * 1.4;
    const padding = Math.round(this.height * 0.015);
    const bottomMargin = Math.round(this.height * 0.06);

    const lines: { text: string; fontSize: number }[] = [];
    lines.push({ text: overlay.text, fontSize: baseFontSize });
    if (overlay.translatedText) {
      lines.push({ text: overlay.translatedText, fontSize: smallFontSize });
    }

    const totalTextHeight = lines.length * lineHeight;
    const bgHeight = totalTextHeight + padding * 2;
    const bgY = this.height - bottomMargin - bgHeight;

    // Semi-transparent background bar
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, bgY, this.width, bgHeight);

    // Draw each line centered
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let yOffset = bgY + padding + lineHeight / 2;
    for (const line of lines) {
      ctx.font = `bold ${line.fontSize}px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`;
      // Text shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillText(line.text, this.width / 2 + 1, yOffset + 1);
      // Main text
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(line.text, this.width / 2, yOffset);
      yOffset += lineHeight;
    }

    ctx.restore();
  }

  private calculateAspectFit(
    srcW: number,
    srcH: number,
  ): { x: number; y: number; width: number; height: number } {
    const canvasRatio = this.width / this.height;
    const srcRatio = srcW / srcH;

    let drawW: number;
    let drawH: number;

    if (srcRatio > canvasRatio) {
      // Source is wider — fit to width
      drawW = this.width;
      drawH = this.width / srcRatio;
    } else {
      // Source is taller — fit to height
      drawH = this.height;
      drawW = this.height * srcRatio;
    }

    const x = (this.width - drawW) / 2;
    const y = (this.height - drawH) / 2;

    return { x, y, width: drawW, height: drawH };
  }
}
