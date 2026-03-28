export type BuiltinTransitionType =
  | 'none'
  | 'fade'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'slide-down'
  | 'wipe-left'
  | 'wipe-right'
  | 'wipe-up'
  | 'wipe-down'
  | 'zoom-in'
  | 'zoom-out';

// Allows plugin-provided transition type strings while preserving autocomplete
export type TransitionType = BuiltinTransitionType | (string & {});

export interface Transition {
  type: TransitionType;
  durationMs: number; // typically 500-1000ms
}

export interface TransitionRenderParams {
  progress: number; // 0 to 1
  type: TransitionType;
  width: number;
  height: number;
}
