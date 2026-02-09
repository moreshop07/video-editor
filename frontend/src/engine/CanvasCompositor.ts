import type { CompositeLayer, SubtitleOverlay } from './types';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export class CanvasCompositor {
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private backgroundColor: string = '#000';

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

  setBackgroundColor(color: string): void {
    this.backgroundColor = color;
  }

  clear(): void {
    this.ctx.fillStyle = this.backgroundColor;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  /**
   * Draw a single layer onto a 2D context.
   * Shared between composite() and CompositorEngine.flattenLayersToIntermediate().
   */
  static drawLayer(
    ctx: Ctx2D,
    layer: CompositeLayer,
    canvasWidth: number,
    canvasHeight: number,
  ): void {
    ctx.globalAlpha = layer.opacity;
    ctx.filter = layer.filter || 'none';
    ctx.globalCompositeOperation = (layer.blendMode as GlobalCompositeOperation) || 'source-over';

    if (layer.transform) {
      const { x, y, width, height, rotation, border } = layer.transform;
      if (rotation) {
        ctx.save();
        ctx.translate(x + width / 2, y + height / 2);
        ctx.rotate((rotation * Math.PI) / 180);

        // Border/shadow for PiP
        if (border && border.width > 0) {
          if (border.shadow > 0) {
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = border.shadow;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 2;
          }
          ctx.strokeStyle = border.color;
          ctx.lineWidth = border.width;
          ctx.strokeRect(
            -width / 2 - border.width / 2,
            -height / 2 - border.width / 2,
            width + border.width,
            height + border.width,
          );
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
        }

        if (layer.transform.sourceClip) {
          const { sx, sy, sw, sh } = layer.transform.sourceClip;
          ctx.drawImage(layer.frame, sx, sy, sw, sh, -width / 2, -height / 2, width, height);
        } else {
          ctx.drawImage(layer.frame, -width / 2, -height / 2, width, height);
        }
        ctx.restore();
      } else {
        // Border/shadow for PiP (no rotation)
        if (border && border.width > 0) {
          ctx.save();
          if (border.shadow > 0) {
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = border.shadow;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 2;
          }
          ctx.strokeStyle = border.color;
          ctx.lineWidth = border.width;
          ctx.strokeRect(
            x - border.width / 2,
            y - border.width / 2,
            width + border.width,
            height + border.width,
          );
          ctx.restore();
        }

        if (layer.transform.sourceClip) {
          const { sx, sy, sw, sh } = layer.transform.sourceClip;
          ctx.drawImage(layer.frame, sx, sy, sw, sh, x, y, width, height);
        } else {
          ctx.drawImage(layer.frame, x, y, width, height);
        }
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

      if (srcW === 0 || srcH === 0) return;

      const canvasRatio = canvasWidth / canvasHeight;
      const srcRatio = srcW / srcH;
      let drawW: number;
      let drawH: number;
      if (srcRatio > canvasRatio) {
        drawW = canvasWidth;
        drawH = canvasWidth / srcRatio;
      } else {
        drawH = canvasHeight;
        drawW = canvasHeight * srcRatio;
      }
      const dx = (canvasWidth - drawW) / 2;
      const dy = (canvasHeight - drawH) / 2;
      ctx.drawImage(layer.frame, dx, dy, drawW, drawH);
    }
  }

  /**
   * Composite layers bottom-to-top onto the canvas.
   */
  composite(layers: CompositeLayer[]): void {
    this.clear();

    for (const layer of layers) {
      CanvasCompositor.drawLayer(this.ctx, layer, this.width, this.height);
    }

    this.ctx.globalAlpha = 1;
    this.ctx.filter = 'none';
    this.ctx.globalCompositeOperation = 'source-over';
  }

  renderSubtitle(overlay: SubtitleOverlay): void {
    const ctx = this.ctx;
    const s = overlay.style;

    const fontSizeFraction = s?.fontSize ?? 0.045;
    const fontFamily =
      s?.fontFamily ??
      '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
    const fontColor = s?.fontColor ?? '#FFFFFF';
    const fontWeight = s?.fontWeight ?? 'bold';
    const bgColor = s?.bgColor ?? '#000000';
    const bgOpacity = s?.bgOpacity ?? 0.6;
    const position = s?.position ?? 'bottom';
    const outline = s?.outline ?? true;

    const baseFontSize = Math.round(this.height * fontSizeFraction);
    const smallFontSize = Math.round(baseFontSize * 0.85);
    const lineHeight = baseFontSize * 1.4;
    const padding = Math.round(this.height * 0.015);
    const margin = Math.round(this.height * 0.06);

    const lines: { text: string; fontSize: number }[] = [];
    lines.push({ text: overlay.text, fontSize: baseFontSize });
    if (overlay.translatedText) {
      lines.push({ text: overlay.translatedText, fontSize: smallFontSize });
    }

    const totalTextHeight = lines.length * lineHeight;
    const bgHeight = totalTextHeight + padding * 2;

    let bgY: number;
    if (position === 'top') {
      bgY = margin;
    } else if (position === 'center') {
      bgY = (this.height - bgHeight) / 2;
    } else {
      bgY = this.height - margin - bgHeight;
    }

    const r = parseInt(bgColor.slice(1, 3), 16) || 0;
    const g = parseInt(bgColor.slice(3, 5), 16) || 0;
    const b = parseInt(bgColor.slice(5, 7), 16) || 0;

    ctx.save();
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${bgOpacity})`;
    ctx.fillRect(0, bgY, this.width, bgHeight);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let yOffset = bgY + padding + lineHeight / 2;
    for (const line of lines) {
      ctx.font = `${fontWeight} ${line.fontSize}px ${fontFamily}`;
      if (outline) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillText(line.text, this.width / 2 + 1, yOffset + 1);
      }
      ctx.fillStyle = fontColor;
      ctx.fillText(line.text, this.width / 2, yOffset);
      yOffset += lineHeight;
    }

    ctx.restore();
  }

  /**
   * Render cinematic letterbox bars (top and bottom).
   * @param barFraction - fraction of canvas height for each bar (e.g. 0.128 for 2.39:1)
   */
  renderLetterbox(barFraction: number): void {
    if (barFraction <= 0) return;
    const barHeight = Math.round(this.height * barFraction);
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.width, barHeight);
    this.ctx.fillRect(0, this.height - barHeight, this.width, barHeight);
  }
}
