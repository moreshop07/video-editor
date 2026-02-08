import type { ColorGradingSettings } from './types';

export interface ColorGradingPreset {
  id: string;
  labelKey: string;
  settings: Omit<ColorGradingSettings, 'enabled' | 'lut'>;
}

export const colorGradingPresets: ColorGradingPreset[] = [
  {
    id: 'cinematic',
    labelKey: 'colorGrading.cinematic',
    settings: {
      temperature: 0.15,
      tint: -0.05,
      shadows: -0.3,
      highlights: -0.1,
      gamma: 0.9,
    },
  },
  {
    id: 'vintage',
    labelKey: 'colorGrading.vintage',
    settings: {
      temperature: 0.2,
      tint: 0.05,
      shadows: 0.15,
      highlights: -0.15,
      gamma: 1.1,
    },
  },
  {
    id: 'coolTone',
    labelKey: 'colorGrading.coolTone',
    settings: {
      temperature: -0.25,
      tint: -0.1,
      shadows: -0.1,
      highlights: 0.05,
      gamma: 1.0,
    },
  },
  {
    id: 'highContrast',
    labelKey: 'colorGrading.highContrast',
    settings: {
      temperature: 0,
      tint: 0,
      shadows: -0.35,
      highlights: 0.25,
      gamma: 0.9,
    },
  },
  {
    id: 'warmGlow',
    labelKey: 'colorGrading.warmGlow',
    settings: {
      temperature: 0.3,
      tint: 0.05,
      shadows: 0.05,
      highlights: 0.15,
      gamma: 1.05,
    },
  },
];
