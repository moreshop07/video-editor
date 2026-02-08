import type { CurvesSettings } from './types';

export interface CurvePreset {
  id: string;
  labelKey: string;
  curves: CurvesSettings;
}

const IDENTITY = [{ x: 0, y: 0 }, { x: 1, y: 1 }];

export const CURVE_PRESETS: CurvePreset[] = [
  {
    id: 'sContrast',
    labelKey: 'curves.sContrast',
    curves: {
      master: [{ x: 0, y: 0 }, { x: 0.25, y: 0.18 }, { x: 0.75, y: 0.82 }, { x: 1, y: 1 }],
      red: [...IDENTITY],
      green: [...IDENTITY],
      blue: [...IDENTITY],
    },
  },
  {
    id: 'fadeBlack',
    labelKey: 'curves.fadeBlack',
    curves: {
      master: [{ x: 0, y: 0.08 }, { x: 1, y: 1 }],
      red: [...IDENTITY],
      green: [...IDENTITY],
      blue: [...IDENTITY],
    },
  },
  {
    id: 'crushBlack',
    labelKey: 'curves.crushBlack',
    curves: {
      master: [{ x: 0, y: 0 }, { x: 0.15, y: 0 }, { x: 1, y: 1 }],
      red: [...IDENTITY],
      green: [...IDENTITY],
      blue: [...IDENTITY],
    },
  },
  {
    id: 'crossProcess',
    labelKey: 'curves.crossProcess',
    curves: {
      master: [...IDENTITY],
      red: [{ x: 0, y: 0.05 }, { x: 0.5, y: 0.6 }, { x: 1, y: 0.95 }],
      green: [{ x: 0, y: 0 }, { x: 0.3, y: 0.2 }, { x: 0.7, y: 0.8 }, { x: 1, y: 1 }],
      blue: [{ x: 0, y: 0.1 }, { x: 0.5, y: 0.4 }, { x: 1, y: 0.9 }],
    },
  },
  {
    id: 'warmShadows',
    labelKey: 'curves.warmShadows',
    curves: {
      master: [...IDENTITY],
      red: [{ x: 0, y: 0.05 }, { x: 0.3, y: 0.35 }, { x: 1, y: 1 }],
      green: [...IDENTITY],
      blue: [{ x: 0, y: 0 }, { x: 0.3, y: 0.22 }, { x: 1, y: 1 }],
    },
  },
];
