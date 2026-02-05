export interface EffectDefinition {
  id: string;
  labelKey: string;
  icon: string; // SVG path d attribute
  min: number;
  max: number;
  step: number;
  default: number;
  toCanvasFilter: (value: number) => string;
  toFFmpegFilter: (value: number) => string | null;
}

export const effectDefinitions: EffectDefinition[] = [
  {
    id: 'blur',
    labelKey: 'effects.blur',
    icon: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707',
    min: 0,
    max: 20,
    step: 0.5,
    default: 0,
    toCanvasFilter: (v) => `blur(${v}px)`,
    toFFmpegFilter: (v) => {
      if (v <= 0) return null;
      const r = Math.round(v);
      return `boxblur=${r}:${r}`;
    },
  },
  {
    id: 'brightness',
    labelKey: 'effects.brightness',
    icon: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M12 9a3 3 0 100 6 3 3 0 000-6z',
    min: 0,
    max: 3,
    step: 0.05,
    default: 1,
    toCanvasFilter: (v) => `brightness(${v})`,
    toFFmpegFilter: (v) => {
      const adjusted = v - 1; // FFmpeg eq brightness is -1 to 1 offset
      if (Math.abs(adjusted) < 0.01) return null;
      return `eq=brightness=${adjusted.toFixed(2)}`;
    },
  },
  {
    id: 'contrast',
    labelKey: 'effects.contrast',
    icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 2v16a8 8 0 000-16z',
    min: 0,
    max: 3,
    step: 0.05,
    default: 1,
    toCanvasFilter: (v) => `contrast(${v})`,
    toFFmpegFilter: (v) => {
      if (Math.abs(v - 1) < 0.01) return null;
      return `eq=contrast=${v.toFixed(2)}`;
    },
  },
  {
    id: 'saturation',
    labelKey: 'effects.saturation',
    icon: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01',
    min: 0,
    max: 3,
    step: 0.05,
    default: 1,
    toCanvasFilter: (v) => `saturate(${v})`,
    toFFmpegFilter: (v) => {
      if (Math.abs(v - 1) < 0.01) return null;
      return `eq=saturation=${v.toFixed(2)}`;
    },
  },
  {
    id: 'grayscale',
    labelKey: 'effects.grayscale',
    icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0,
    toCanvasFilter: (v) => `grayscale(${v})`,
    toFFmpegFilter: (v) => {
      if (v <= 0) return null;
      if (v >= 0.95) return 'hue=s=0';
      return `eq=saturation=${(1 - v).toFixed(2)}`;
    },
  },
  {
    id: 'sepia',
    labelKey: 'effects.sepia',
    icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0,
    toCanvasFilter: (v) => `sepia(${v})`,
    toFFmpegFilter: (v) => {
      if (v <= 0) return null;
      // Approximate sepia via colorchannelmixer
      const s = v;
      const r1 = (0.393 * s + (1 - s)).toFixed(3);
      const r2 = (0.769 * s).toFixed(3);
      const r3 = (0.189 * s).toFixed(3);
      const g1 = (0.349 * s).toFixed(3);
      const g2 = (0.686 * s + (1 - s)).toFixed(3);
      const g3 = (0.168 * s).toFixed(3);
      const b1 = (0.272 * s).toFixed(3);
      const b2 = (0.534 * s).toFixed(3);
      const b3 = (0.131 * s + (1 - s)).toFixed(3);
      return `colorchannelmixer=${r1}:${r2}:${r3}:0:${g1}:${g2}:${g3}:0:${b1}:${b2}:${b3}:0`;
    },
  },
  {
    id: 'hueRotate',
    labelKey: 'effects.hueRotate',
    icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
    min: 0,
    max: 360,
    step: 1,
    default: 0,
    toCanvasFilter: (v) => `hue-rotate(${v}deg)`,
    toFFmpegFilter: (v) => {
      if (v <= 0) return null;
      return `hue=h=${v}`;
    },
  },
  {
    id: 'invert',
    labelKey: 'effects.invert',
    icon: 'M8 9l4-4 4 4m0 6l-4 4-4-4',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0,
    toCanvasFilter: (v) => `invert(${v})`,
    toFFmpegFilter: (v) => {
      if (v < 0.5) return null;
      return 'negate';
    },
  },
  {
    id: 'opacity',
    labelKey: 'effects.opacity',
    icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
    min: 0,
    max: 1,
    step: 0.05,
    default: 1,
    toCanvasFilter: (v) => `opacity(${v})`,
    toFFmpegFilter: () => null, // Handled by overlay alpha
  },
];

export const effectMap = new Map(
  effectDefinitions.map((def) => [def.id, def]),
);

export function getEffectDefinition(id: string): EffectDefinition | undefined {
  return effectMap.get(id);
}
