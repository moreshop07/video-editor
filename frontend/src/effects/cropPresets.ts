/**
 * Crop Aspect Ratio Presets
 *
 * Each preset defines crop fractions (0–1) to achieve a target aspect ratio
 * from a 16:9 source. Crop values are symmetric (equal top/bottom or left/right).
 */

export interface CropPreset {
  id: string;
  labelKey: string;
  cropTop: number;
  cropBottom: number;
  cropLeft: number;
  cropRight: number;
}

// Source assumed to be 16:9 (1.778)
export const CROP_PRESETS: CropPreset[] = [
  {
    id: 'none',
    labelKey: 'crop.none',
    cropTop: 0,
    cropBottom: 0,
    cropLeft: 0,
    cropRight: 0,
  },
  {
    id: '16_9',
    labelKey: 'crop.preset16_9',
    cropTop: 0,
    cropBottom: 0,
    cropLeft: 0,
    cropRight: 0,
  },
  {
    id: '9_16',
    labelKey: 'crop.preset9_16',
    // 9:16 = 0.5625 → from 16:9 need to crop sides heavily
    // target width fraction = (9/16) / (16/9) = 0.3164
    // crop each side = (1 - 0.3164) / 2 ≈ 0.342
    cropTop: 0,
    cropBottom: 0,
    cropLeft: 0.342,
    cropRight: 0.342,
  },
  {
    id: '4_3',
    labelKey: 'crop.preset4_3',
    // 4:3 = 1.333 → from 16:9 need to crop sides
    // target width fraction = (4/3) / (16/9) = 0.75
    // crop each side = (1 - 0.75) / 2 = 0.125
    cropTop: 0,
    cropBottom: 0,
    cropLeft: 0.125,
    cropRight: 0.125,
  },
  {
    id: '1_1',
    labelKey: 'crop.preset1_1',
    // 1:1 → from 16:9 need to crop sides
    // target width fraction = 1 / (16/9) = 0.5625
    // crop each side = (1 - 0.5625) / 2 ≈ 0.219
    cropTop: 0,
    cropBottom: 0,
    cropLeft: 0.219,
    cropRight: 0.219,
  },
  {
    id: 'cinemascope',
    labelKey: 'crop.presetCinemascope',
    // 2.39:1 → from 16:9 need to crop top/bottom
    // target height fraction = (16/9) / 2.39 ≈ 0.743
    // crop each = (1 - 0.743) / 2 ≈ 0.128
    cropTop: 0.128,
    cropBottom: 0.128,
    cropLeft: 0,
    cropRight: 0,
  },
  {
    id: 'anamorphic',
    labelKey: 'crop.presetAnamorphic',
    // 2.35:1 → from 16:9
    // target height fraction = (16/9) / 2.35 ≈ 0.756
    // crop each = (1 - 0.756) / 2 ≈ 0.122
    cropTop: 0.122,
    cropBottom: 0.122,
    cropLeft: 0,
    cropRight: 0,
  },
];
