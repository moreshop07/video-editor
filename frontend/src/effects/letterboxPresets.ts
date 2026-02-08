/**
 * Letterbox Cinematic Bar Presets
 *
 * Each preset defines the fraction of canvas height for each bar (top + bottom).
 * These are purely visual overlays — they don't affect the actual clip data.
 */

export interface LetterboxPreset {
  id: string;
  labelKey: string;
  barFraction: number;
}

export const LETTERBOX_PRESETS: LetterboxPreset[] = [
  {
    id: 'none',
    labelKey: 'letterbox.none',
    barFraction: 0,
  },
  {
    id: 'scope',
    labelKey: 'letterbox.scope',
    barFraction: 0.128,   // 2.39:1 Cinemascope
  },
  {
    id: 'anamorphic',
    labelKey: 'letterbox.anamorphic',
    barFraction: 0.122,   // 2.35:1 Anamorphic
  },
  {
    id: 'flat',
    labelKey: 'letterbox.flat',
    barFraction: 0.04,    // 1.85:1 Flat
  },
];
