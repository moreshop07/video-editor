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

// ── Audio Mixing Types ──

export interface EQBand {
  frequency: number;  // Hz
  gain: number;       // -12 to +12 dB
  Q: number;          // Quality factor 0.1–10
}

export interface EQSettings {
  enabled: boolean;
  low: EQBand;       // lowshelf, default 200Hz
  mid: EQBand;       // peaking, default 1000Hz
  high: EQBand;      // highshelf, default 5000Hz
}

export const DEFAULT_EQ_SETTINGS: EQSettings = {
  enabled: false,
  low: { frequency: 200, gain: 0, Q: 1 },
  mid: { frequency: 1000, gain: 0, Q: 1 },
  high: { frequency: 5000, gain: 0, Q: 1 },
};

export interface CompressorSettings {
  enabled: boolean;
  threshold: number;  // -100 to 0 dB, default -24
  ratio: number;      // 1 to 20, default 4
  attack: number;     // 0 to 1 seconds, default 0.003
  release: number;    // 0 to 1 seconds, default 0.25
  knee: number;       // 0 to 40, default 30
}

export const DEFAULT_COMPRESSOR_SETTINGS: CompressorSettings = {
  enabled: false,
  threshold: -24,
  ratio: 4,
  attack: 0.003,
  release: 0.25,
  knee: 30,
};

export interface TrackAudioSettings {
  volume: number;     // 0–2, default 1
  pan: number;        // -1 (left) to 1 (right), default 0
  eq?: EQSettings;
  compressor?: CompressorSettings;
  ducking?: DuckingSettings;
  duckingEnvelope?: DuckingEnvelope;
}

export const DEFAULT_TRACK_AUDIO: TrackAudioSettings = {
  volume: 1,
  pan: 0,
};

// ── Audio Ducking Types ──

export type DuckingPreset = 'dialogueOverMusic' | 'voiceover' | 'podcast' | 'custom';

export interface DuckingSettings {
  enabled: boolean;
  sourceTrackIds: string[];   // Tracks that trigger ducking (e.g., dialogue)
  threshold: number;          // RMS level 0–1 on source, default 0.05
  reduction: number;          // Gain multiplier when ducked 0–1, default 0.2
  attackMs: number;           // Ramp down time in ms, default 50
  releaseMs: number;          // Ramp up time in ms, default 300
  preset: DuckingPreset;
}

export const DEFAULT_DUCKING: DuckingSettings = {
  enabled: false,
  sourceTrackIds: [],
  threshold: 0.05,
  reduction: 0.2,
  attackMs: 50,
  releaseMs: 300,
  preset: 'dialogueOverMusic',
};

export const DUCKING_PRESETS: Record<DuckingPreset, Pick<DuckingSettings, 'threshold' | 'reduction' | 'attackMs' | 'releaseMs'>> = {
  dialogueOverMusic: { threshold: 0.05, reduction: 0.2, attackMs: 50, releaseMs: 300 },
  voiceover:         { threshold: 0.03, reduction: 0.15, attackMs: 30, releaseMs: 500 },
  podcast:           { threshold: 0.04, reduction: 0.25, attackMs: 40, releaseMs: 400 },
  custom:            { threshold: 0.05, reduction: 0.2, attackMs: 50, releaseMs: 300 },
};

export interface DuckingEnvelopePoint {
  timeMs: number;
  gain: number;   // 0–1, where 1 = no reduction, reduction value = fully ducked
}

export type DuckingEnvelope = DuckingEnvelopePoint[];
