import type { ColorGradingSettings } from '@/effects/types';

/**
 * Pixel-level color grading processor using OffscreenCanvas.
 * Supports temperature, tint, shadows/highlights, gamma, and 3D LUT application.
 */
export class ColorGradingProcessor {
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
    settings: ColorGradingSettings,
  ): Promise<ImageBitmap> {
    if (this.canvas.width !== sourceWidth || this.canvas.height !== sourceHeight) {
      this.canvas.width = sourceWidth;
      this.canvas.height = sourceHeight;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    }

    this.ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight);
    const imageData = this.ctx.getImageData(0, 0, sourceWidth, sourceHeight);
    const data = imageData.data;

    const { temperature, tint, shadows, highlights, gamma, lut } = settings;
    const hasBasicGrading = temperature !== 0 || tint !== 0 || shadows !== 0 || highlights !== 0 || gamma !== 1.0;
    const hasLut = lut !== null && lut.data.length > 0;

    // Precompute gamma LUT for performance (256 entries)
    let gammaLut: Uint8Array | null = null;
    if (gamma !== 1.0) {
      gammaLut = new Uint8Array(256);
      const invGamma = 1.0 / gamma;
      for (let i = 0; i < 256; i++) {
        gammaLut[i] = Math.round(Math.pow(i / 255, invGamma) * 255);
      }
    }

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      if (hasBasicGrading) {
        // Temperature: shift warm (R+) / cool (B+)
        if (temperature !== 0) {
          const tempShift = temperature * 30;
          r = clamp(r + tempShift);
          b = clamp(b - tempShift);
        }

        // Tint: shift magenta (G-) / green (G+)
        if (tint !== 0) {
          const tintShift = tint * 30;
          g = clamp(g - tintShift);
        }

        // Shadows & Highlights (luminance-weighted)
        if (shadows !== 0 || highlights !== 0) {
          const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

          if (shadows !== 0) {
            // Affect dark pixels more (weight = 1 - lum)
            const shadowWeight = (1 - lum) * (1 - lum);
            const shadowShift = shadows * 40 * shadowWeight;
            r = clamp(r + shadowShift);
            g = clamp(g + shadowShift);
            b = clamp(b + shadowShift);
          }

          if (highlights !== 0) {
            // Affect bright pixels more (weight = lum)
            const highlightWeight = lum * lum;
            const highlightShift = highlights * 40 * highlightWeight;
            r = clamp(r + highlightShift);
            g = clamp(g + highlightShift);
            b = clamp(b + highlightShift);
          }
        }

        // Gamma
        if (gammaLut) {
          r = gammaLut[Math.round(r)];
          g = gammaLut[Math.round(g)];
          b = gammaLut[Math.round(b)];
        }
      }

      // Apply 3D LUT via trilinear interpolation
      if (hasLut) {
        const result = applyLut(r / 255, g / 255, b / 255, lut!.data, lut!.size);
        r = Math.round(result[0] * 255);
        g = Math.round(result[1] * 255);
        b = Math.round(result[2] * 255);
      }

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }

    this.ctx.putImageData(imageData, 0, 0);
    return createImageBitmap(this.canvas);
  }

  dispose(): void {
    // OffscreenCanvas does not need explicit disposal
  }
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * Apply 3D LUT with trilinear interpolation.
 * Input r,g,b in [0,1]. Returns [r,g,b] in [0,1].
 */
function applyLut(
  r: number, g: number, b: number,
  lutData: number[], lutSize: number,
): [number, number, number] {
  const maxIdx = lutSize - 1;

  // Scale to LUT coordinates
  const rScaled = r * maxIdx;
  const gScaled = g * maxIdx;
  const bScaled = b * maxIdx;

  // Integer indices
  const r0 = Math.min(Math.floor(rScaled), maxIdx);
  const g0 = Math.min(Math.floor(gScaled), maxIdx);
  const b0 = Math.min(Math.floor(bScaled), maxIdx);
  const r1 = Math.min(r0 + 1, maxIdx);
  const g1 = Math.min(g0 + 1, maxIdx);
  const b1 = Math.min(b0 + 1, maxIdx);

  // Fractional parts
  const rf = rScaled - r0;
  const gf = gScaled - g0;
  const bf = bScaled - b0;

  // Lookup helper (R varies fastest in .cube format)
  const idx = (ri: number, gi: number, bi: number) => (bi * lutSize * lutSize + gi * lutSize + ri) * 3;

  // 8 corner samples
  const i000 = idx(r0, g0, b0);
  const i100 = idx(r1, g0, b0);
  const i010 = idx(r0, g1, b0);
  const i110 = idx(r1, g1, b0);
  const i001 = idx(r0, g0, b1);
  const i101 = idx(r1, g0, b1);
  const i011 = idx(r0, g1, b1);
  const i111 = idx(r1, g1, b1);

  // Trilinear interpolation for each channel
  const result: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const c000 = lutData[i000 + c];
    const c100 = lutData[i100 + c];
    const c010 = lutData[i010 + c];
    const c110 = lutData[i110 + c];
    const c001 = lutData[i001 + c];
    const c101 = lutData[i101 + c];
    const c011 = lutData[i011 + c];
    const c111 = lutData[i111 + c];

    // Interpolate along R
    const c00 = c000 + (c100 - c000) * rf;
    const c10 = c010 + (c110 - c010) * rf;
    const c01 = c001 + (c101 - c001) * rf;
    const c11 = c011 + (c111 - c011) * rf;

    // Interpolate along G
    const c0 = c00 + (c10 - c00) * gf;
    const c1 = c01 + (c11 - c01) * gf;

    // Interpolate along B
    result[c] = Math.max(0, Math.min(1, c0 + (c1 - c0) * bf));
  }

  return result;
}
