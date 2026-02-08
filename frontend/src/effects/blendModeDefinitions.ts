export interface BlendModeDefinition {
  id: string;
  labelKey: string;
  category: 'normal' | 'darken' | 'lighten' | 'contrast' | 'other';
}

export const BLEND_MODES: BlendModeDefinition[] = [
  // Normal
  { id: 'source-over', labelKey: 'blendMode.normal', category: 'normal' },
  // Darken
  { id: 'multiply', labelKey: 'blendMode.multiply', category: 'darken' },
  { id: 'darken', labelKey: 'blendMode.darken', category: 'darken' },
  { id: 'color-burn', labelKey: 'blendMode.colorBurn', category: 'darken' },
  // Lighten
  { id: 'screen', labelKey: 'blendMode.screen', category: 'lighten' },
  { id: 'lighten', labelKey: 'blendMode.lighten', category: 'lighten' },
  { id: 'color-dodge', labelKey: 'blendMode.colorDodge', category: 'lighten' },
  // Contrast
  { id: 'overlay', labelKey: 'blendMode.overlay', category: 'contrast' },
  { id: 'soft-light', labelKey: 'blendMode.softLight', category: 'contrast' },
  { id: 'hard-light', labelKey: 'blendMode.hardLight', category: 'contrast' },
  // Other
  { id: 'difference', labelKey: 'blendMode.difference', category: 'other' },
  { id: 'exclusion', labelKey: 'blendMode.exclusion', category: 'other' },
  { id: 'hue', labelKey: 'blendMode.hue', category: 'other' },
  { id: 'saturation', labelKey: 'blendMode.saturation', category: 'other' },
  { id: 'color', labelKey: 'blendMode.color', category: 'other' },
  { id: 'luminosity', labelKey: 'blendMode.luminosity', category: 'other' },
];

export const BACKGROUND_PRESETS = [
  { color: '#000000', labelKey: 'background.black' },
  { color: '#ffffff', labelKey: 'background.white' },
  { color: '#333333', labelKey: 'background.gray' },
  { color: '#00b140', labelKey: 'background.green' },
  { color: '#0047ab', labelKey: 'background.blue' },
];
