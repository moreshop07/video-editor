export type TransitionType =
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
