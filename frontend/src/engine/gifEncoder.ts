/**
 * Minimal GIF89a encoder.
 * Takes RGBA ImageData frames and produces an animated GIF Blob.
 * Uses median-cut color quantization and LZW compression.
 */

// ---------- Median-cut color quantization ----------

interface ColorBox {
  colors: Uint8Array[]; // each is [r,g,b]
  rMin: number; rMax: number;
  gMin: number; gMax: number;
  bMin: number; bMax: number;
  volume: number;
}

function buildBox(colors: Uint8Array[]): ColorBox {
  let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
  for (const c of colors) {
    if (c[0] < rMin) rMin = c[0];
    if (c[0] > rMax) rMax = c[0];
    if (c[1] < gMin) gMin = c[1];
    if (c[1] > gMax) gMax = c[1];
    if (c[2] < bMin) bMin = c[2];
    if (c[2] > bMax) bMax = c[2];
  }
  return {
    colors,
    rMin, rMax, gMin, gMax, bMin, bMax,
    volume: (rMax - rMin + 1) * (gMax - gMin + 1) * (bMax - bMin + 1),
  };
}

function medianCut(pixels: Uint8Array[], maxColors: number): Uint8Array[] {
  if (pixels.length === 0) {
    const palette: Uint8Array[] = [];
    for (let i = 0; i < maxColors; i++) palette.push(new Uint8Array([0, 0, 0]));
    return palette;
  }

  const boxes: ColorBox[] = [buildBox(pixels)];

  while (boxes.length < maxColors) {
    // Find the box with the largest volume that has >1 color
    let bestIdx = -1;
    let bestVol = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].colors.length > 1 && boxes[i].volume > bestVol) {
        bestVol = boxes[i].volume;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) break;

    const box = boxes[bestIdx];
    const rRange = box.rMax - box.rMin;
    const gRange = box.gMax - box.gMin;
    const bRange = box.bMax - box.bMin;

    // Sort along the longest axis
    let channel: number;
    if (rRange >= gRange && rRange >= bRange) channel = 0;
    else if (gRange >= bRange) channel = 1;
    else channel = 2;

    box.colors.sort((a, b) => a[channel] - b[channel]);

    const mid = Math.floor(box.colors.length / 2);
    const left = box.colors.slice(0, mid);
    const right = box.colors.slice(mid);

    boxes.splice(bestIdx, 1, buildBox(left), buildBox(right));
  }

  // Compute average color for each box
  return boxes.map((box) => {
    let rSum = 0, gSum = 0, bSum = 0;
    for (const c of box.colors) {
      rSum += c[0];
      gSum += c[1];
      bSum += c[2];
    }
    const n = box.colors.length;
    return new Uint8Array([
      Math.round(rSum / n),
      Math.round(gSum / n),
      Math.round(bSum / n),
    ]);
  });
}

function findClosestColor(palette: Uint8Array[], r: number, g: number, b: number): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const dr = r - palette[i][0];
    const dg = g - palette[i][1];
    const db = b - palette[i][2];
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// ---------- LZW compression ----------

function lzwEncode(indices: Uint8Array, minCodeSize: number): Uint8Array {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;

  const output: number[] = [];
  let bits = 0;
  let buf = 0;
  let codeSize = minCodeSize + 1;

  function writeBits(code: number, size: number) {
    buf |= code << bits;
    bits += size;
    while (bits >= 8) {
      output.push(buf & 0xff);
      buf >>= 8;
      bits -= 8;
    }
  }

  // Initialize code table
  let nextCode = eoiCode + 1;
  const maxTableSize = 4096;
  let table = new Map<string, number>();

  function resetTable() {
    table = new Map<string, number>();
    for (let i = 0; i < clearCode; i++) {
      table.set(String(i), i);
    }
    nextCode = eoiCode + 1;
    codeSize = minCodeSize + 1;
  }

  // Write clear code
  writeBits(clearCode, codeSize);
  resetTable();

  if (indices.length === 0) {
    writeBits(eoiCode, codeSize);
    if (bits > 0) output.push(buf & 0xff);
    return new Uint8Array(output);
  }

  let current = String(indices[0]);

  for (let i = 1; i < indices.length; i++) {
    const next = current + ',' + indices[i];
    if (table.has(next)) {
      current = next;
    } else {
      writeBits(table.get(current)!, codeSize);

      if (nextCode < maxTableSize) {
        table.set(next, nextCode++);
        if (nextCode > (1 << codeSize) && codeSize < 12) {
          codeSize++;
        }
      } else {
        // Table full, reset
        writeBits(clearCode, codeSize);
        resetTable();
      }

      current = String(indices[i]);
    }
  }

  // Write remaining
  writeBits(table.get(current)!, codeSize);
  writeBits(eoiCode, codeSize);

  if (bits > 0) output.push(buf & 0xff);

  return new Uint8Array(output);
}

// ---------- GIF builder ----------

function writeU16LE(arr: number[], value: number) {
  arr.push(value & 0xff, (value >> 8) & 0xff);
}

/**
 * Encode an array of RGBA ImageData frames into an animated GIF Blob.
 */
export function encodeGif(
  frames: ImageData[],
  width: number,
  height: number,
  delayMs: number,
): Blob {
  if (frames.length === 0) {
    throw new Error('No frames to encode');
  }

  const delayCentiseconds = Math.max(1, Math.round(delayMs / 10));
  const paletteSize = 256;
  const minCodeSize = 8; // for 256-color palette

  const out: number[] = [];

  // -- GIF89a Header --
  out.push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61); // "GIF89a"

  // -- Logical Screen Descriptor --
  writeU16LE(out, width);
  writeU16LE(out, height);
  // No global color table (each frame has local)
  out.push(0x00); // packed: no GCT
  out.push(0x00); // background color index
  out.push(0x00); // pixel aspect ratio

  // -- Netscape 2.0 Application Extension (looping) --
  out.push(0x21, 0xff, 0x0b); // extension introducer, app extension, block size
  // "NETSCAPE2.0"
  out.push(0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30);
  out.push(0x03, 0x01); // sub-block size, loop sub-block id
  writeU16LE(out, 0); // loop count 0 = infinite
  out.push(0x00); // block terminator

  for (const frame of frames) {
    const data = frame.data;
    const pixelCount = width * height;

    // Sample pixels for quantization (every 4th pixel for speed)
    const samplePixels: Uint8Array[] = [];
    const step = Math.max(1, Math.floor(pixelCount / 10000));
    for (let i = 0; i < pixelCount; i += step) {
      const offset = i * 4;
      samplePixels.push(new Uint8Array([data[offset], data[offset + 1], data[offset + 2]]));
    }

    // Quantize to 256 colors
    let palette = medianCut(samplePixels, paletteSize);
    // Pad palette to exactly 256 entries
    while (palette.length < paletteSize) {
      palette.push(new Uint8Array([0, 0, 0]));
    }

    // Map all pixels to palette indices
    const indices = new Uint8Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      const offset = i * 4;
      indices[i] = findClosestColor(palette, data[offset], data[offset + 1], data[offset + 2]);
    }

    // -- Graphic Control Extension --
    out.push(0x21, 0xf9, 0x04); // extension, GCE label, block size
    out.push(0x00); // packed: no transparency, no disposal
    writeU16LE(out, delayCentiseconds); // delay
    out.push(0x00); // transparent color index
    out.push(0x00); // block terminator

    // -- Image Descriptor --
    out.push(0x2c); // image separator
    writeU16LE(out, 0); // left
    writeU16LE(out, 0); // top
    writeU16LE(out, width);
    writeU16LE(out, height);
    // Local color table, 256 colors (size = 7 → 2^(7+1) = 256)
    out.push(0x87); // packed: local color table, size = 7

    // -- Local Color Table (256 × 3 bytes) --
    for (let i = 0; i < 256; i++) {
      out.push(palette[i][0], palette[i][1], palette[i][2]);
    }

    // -- Image Data (LZW) --
    out.push(minCodeSize); // LZW minimum code size

    const lzwData = lzwEncode(indices, minCodeSize);

    // Write in sub-blocks of max 255 bytes
    let pos = 0;
    while (pos < lzwData.length) {
      const chunkSize = Math.min(255, lzwData.length - pos);
      out.push(chunkSize);
      for (let i = 0; i < chunkSize; i++) {
        out.push(lzwData[pos + i]);
      }
      pos += chunkSize;
    }
    out.push(0x00); // block terminator
  }

  // -- GIF Trailer --
  out.push(0x3b);

  return new Blob([new Uint8Array(out)], { type: 'image/gif' });
}
