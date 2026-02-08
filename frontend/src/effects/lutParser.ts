import type { LUTData } from './types';

/**
 * Parse a .cube LUT file (industry standard 3D LUT format).
 * Supports TITLE, LUT_3D_SIZE, DOMAIN_MIN, DOMAIN_MAX, and float triplet data lines.
 */
export function parseCubeFile(text: string): LUTData {
  const lines = text.split('\n');
  let name = 'Untitled LUT';
  let size = 0;
  const data: number[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) continue;

    // Parse metadata
    if (line.startsWith('TITLE')) {
      name = line.replace(/^TITLE\s+/, '').replace(/^"(.*)"$/, '$1');
      continue;
    }

    if (line.startsWith('LUT_3D_SIZE')) {
      size = parseInt(line.split(/\s+/)[1], 10);
      continue;
    }

    // Skip DOMAIN_MIN, DOMAIN_MAX (assume 0.0-1.0 standard range)
    if (line.startsWith('DOMAIN_MIN') || line.startsWith('DOMAIN_MAX')) {
      continue;
    }

    // Parse float triplets (R G B)
    const parts = line.split(/\s+/);
    if (parts.length >= 3) {
      const r = parseFloat(parts[0]);
      const g = parseFloat(parts[1]);
      const b = parseFloat(parts[2]);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        data.push(r, g, b);
      }
    }
  }

  if (size === 0) {
    throw new Error('Invalid .cube file: missing LUT_3D_SIZE');
  }

  const expectedEntries = size * size * size * 3;
  if (data.length !== expectedEntries) {
    throw new Error(
      `Invalid .cube file: expected ${expectedEntries / 3} entries for size ${size}, got ${data.length / 3}`,
    );
  }

  return { name, size, data };
}
