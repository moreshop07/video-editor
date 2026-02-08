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

export interface ClipFilters {
  effects: ClipEffect[];
  speed: number; // 0.25 - 4.0, default 1.0
  chromaKey?: ChromaKeySettings;
}

export const DEFAULT_CLIP_FILTERS: ClipFilters = {
  effects: [],
  speed: 1.0,
};
