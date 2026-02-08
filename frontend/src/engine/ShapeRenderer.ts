export interface ShapeRenderOptions {
  shapeType: string;
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeWidth: number;
  cornerRadius: number;
  canvasWidth: number;
  canvasHeight: number;
}

// Shape occupies 60% of canvas, centered
const SHAPE_FRACTION = 0.6;

export class ShapeRenderer {
  static async render(options: ShapeRenderOptions): Promise<ImageBitmap | null> {
    const {
      shapeType,
      fill,
      fillOpacity,
      stroke,
      strokeWidth,
      cornerRadius,
      canvasWidth,
      canvasHeight,
    } = options;

    const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const cx = canvasWidth / 2;
    const cy = canvasHeight / 2;
    const shapeW = canvasWidth * SHAPE_FRACTION;
    const shapeH = canvasHeight * SHAPE_FRACTION;

    ctx.save();

    // Setup fill
    if (fill && fill !== 'transparent') {
      ctx.globalAlpha = fillOpacity;
      ctx.fillStyle = fill;
    }

    // Setup stroke
    if (strokeWidth > 0) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
    }

    switch (shapeType) {
      case 'rectangle':
        this.drawRectangle(ctx, cx, cy, shapeW, shapeH, cornerRadius, fill, fillOpacity, stroke, strokeWidth);
        break;
      case 'circle':
        this.drawCircle(ctx, cx, cy, shapeW, shapeH, fill, fillOpacity, stroke, strokeWidth);
        break;
      case 'triangle':
        this.drawTriangle(ctx, cx, cy, shapeW, shapeH, fill, fillOpacity, stroke, strokeWidth);
        break;
      case 'star':
        this.drawStar(ctx, cx, cy, Math.min(shapeW, shapeH) / 2, fill, fillOpacity, stroke, strokeWidth);
        break;
      case 'arrow':
        this.drawArrow(ctx, cx, cy, shapeW, shapeH, stroke, strokeWidth);
        break;
      case 'line':
        this.drawLine(ctx, cx, cy, shapeW, stroke, strokeWidth);
        break;
      default:
        this.drawRectangle(ctx, cx, cy, shapeW, shapeH, 0, fill, fillOpacity, stroke, strokeWidth);
    }

    ctx.restore();

    return createImageBitmap(canvas);
  }

  private static drawRectangle(
    ctx: OffscreenCanvasRenderingContext2D,
    cx: number, cy: number,
    w: number, h: number,
    cornerRadius: number,
    fill: string, fillOpacity: number,
    stroke: string, strokeWidth: number,
  ): void {
    const x = cx - w / 2;
    const y = cy - h / 2;

    ctx.beginPath();
    if (cornerRadius > 0) {
      ctx.roundRect(x, y, w, h, cornerRadius);
    } else {
      ctx.rect(x, y, w, h);
    }

    if (fill && fill !== 'transparent') {
      ctx.globalAlpha = fillOpacity;
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (strokeWidth > 0) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth;
      ctx.stroke();
    }
  }

  private static drawCircle(
    ctx: OffscreenCanvasRenderingContext2D,
    cx: number, cy: number,
    w: number, h: number,
    fill: string, fillOpacity: number,
    stroke: string, strokeWidth: number,
  ): void {
    const rx = w / 2;
    const ry = h / 2;

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);

    if (fill && fill !== 'transparent') {
      ctx.globalAlpha = fillOpacity;
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (strokeWidth > 0) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth;
      ctx.stroke();
    }
  }

  private static drawTriangle(
    ctx: OffscreenCanvasRenderingContext2D,
    cx: number, cy: number,
    w: number, h: number,
    fill: string, fillOpacity: number,
    stroke: string, strokeWidth: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(cx, cy - h / 2);           // top
    ctx.lineTo(cx + w / 2, cy + h / 2);   // bottom right
    ctx.lineTo(cx - w / 2, cy + h / 2);   // bottom left
    ctx.closePath();

    if (fill && fill !== 'transparent') {
      ctx.globalAlpha = fillOpacity;
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (strokeWidth > 0) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth;
      ctx.stroke();
    }
  }

  private static drawStar(
    ctx: OffscreenCanvasRenderingContext2D,
    cx: number, cy: number,
    outerR: number,
    fill: string, fillOpacity: number,
    stroke: string, strokeWidth: number,
  ): void {
    const innerR = outerR * 0.4;
    const points = 5;

    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (Math.PI / points) * i - Math.PI / 2;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();

    if (fill && fill !== 'transparent') {
      ctx.globalAlpha = fillOpacity;
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (strokeWidth > 0) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth;
      ctx.stroke();
    }
  }

  private static drawArrow(
    ctx: OffscreenCanvasRenderingContext2D,
    cx: number, cy: number,
    w: number, h: number,
    stroke: string, strokeWidth: number,
  ): void {
    const halfW = w / 2;
    const headSize = Math.min(h * 0.3, w * 0.15);

    ctx.globalAlpha = 1;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Shaft
    ctx.beginPath();
    ctx.moveTo(cx - halfW, cy);
    ctx.lineTo(cx + halfW, cy);
    ctx.stroke();

    // Arrow head
    ctx.beginPath();
    ctx.moveTo(cx + halfW - headSize, cy - headSize);
    ctx.lineTo(cx + halfW, cy);
    ctx.lineTo(cx + halfW - headSize, cy + headSize);
    ctx.stroke();
  }

  private static drawLine(
    ctx: OffscreenCanvasRenderingContext2D,
    cx: number, cy: number,
    w: number,
    stroke: string, strokeWidth: number,
  ): void {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(cx - w / 2, cy);
    ctx.lineTo(cx + w / 2, cy);
    ctx.stroke();
  }

  static measureShape(
    _shapeType: string,
    canvasWidth: number,
    canvasHeight: number,
  ): { width: number; height: number } {
    return {
      width: canvasWidth * SHAPE_FRACTION,
      height: canvasHeight * SHAPE_FRACTION,
    };
  }
}
