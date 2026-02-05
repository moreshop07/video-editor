export interface ClipEffect {
  id: string;
  value: number;
  enabled: boolean;
}

export interface ClipFilters {
  effects: ClipEffect[];
  speed: number; // 0.25 - 4.0, default 1.0
}

export const DEFAULT_CLIP_FILTERS: ClipFilters = {
  effects: [],
  speed: 1.0,
};
