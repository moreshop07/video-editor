export interface ClipEffect {
  id: string;
  value: number;
  enabled: boolean;
}

export interface ChromaKeySettings {
  enabled: boolean;
  keyColor: string;      // Hex color, e.g. "#00FF00"
  similarity: number;    // 0-1, tolerance (default 0.4)
  smoothness: number;    // 0-1, edge feathering (default 0.08)
  despill: number;       // 0-1, color spill removal (default 0.5)
}

export const DEFAULT_CHROMA_KEY: ChromaKeySettings = {
  enabled: false,
  keyColor: '#00FF00',
  similarity: 0.4,
  smoothness: 0.08,
  despill: 0.5,
};

export interface LUTData {
  name: string;
  size: number;           // e.g. 33 for 33x33x33
  data: number[];         // Flattened RGB float array [r,g,b, r,g,b, ...]
}

export interface ColorGradingSettings {
  enabled: boolean;
  temperature: number;    // -1 to 1 (cool ↔ warm), default 0
  tint: number;           // -1 to 1 (green ↔ magenta), default 0
  shadows: number;        // -1 to 1 (darken ↔ lighten shadows), default 0
  highlights: number;     // -1 to 1 (darken ↔ lighten highlights), default 0
  gamma: number;          // 0.2 to 3.0 (midtone adjustment), default 1.0
  lut: LUTData | null;    // Parsed LUT, null = no LUT
}

export const DEFAULT_COLOR_GRADING: ColorGradingSettings = {
  enabled: false,
  temperature: 0,
  tint: 0,
  shadows: 0,
  highlights: 0,
  gamma: 1.0,
  lut: null,
};

export interface ClipFilters {
  effects: ClipEffect[];
  speed: number; // 0.25 - 4.0, default 1.0
  chromaKey?: ChromaKeySettings;
  colorGrading?: ColorGradingSettings;
}

export const DEFAULT_CLIP_FILTERS: ClipFilters = {
  effects: [],
  speed: 1.0,
};
