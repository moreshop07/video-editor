import type { Plugin } from '../types';
import type { EffectDefinition } from '@/effects/effectDefinitions';

const vignetteEffect: EffectDefinition = {
  id: 'vignette',
  labelKey: 'effects.vignette',
  icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z',
  min: 0,
  max: 1,
  step: 0.05,
  default: 0,
  toCanvasFilter: (v) => {
    // Approximate vignette via brightness reduction
    if (v <= 0) return '';
    const brightness = 1 - v * 0.3;
    return `brightness(${brightness})`;
  },
  toFFmpegFilter: (v) => {
    if (v <= 0) return null;
    const angle = (Math.PI / 4) * v;
    return `vignette=PI/${(Math.PI / angle).toFixed(1)}`;
  },
};

export const vignettePlugin: Plugin = {
  manifest: {
    id: 'builtin.vignette',
    name: 'Vignette',
    version: '1.0.0',
    description: 'Adds a vignette darkening effect to clip edges',
    author: 'Built-in',
  },
  activate(ctx) {
    ctx.registerEffects([vignetteEffect]);
    ctx.registerTranslations('en', {
      'effects.vignette': 'Vignette',
    });
    ctx.registerTranslations('zh-TW', {
      'effects.vignette': '暗角',
    });
  },
};
