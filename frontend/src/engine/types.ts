import type { ClipFilters } from '@/effects/types';
import type { Transition } from '@/types/transitions';

export type TrackType = 'video' | 'audio' | 'music' | 'sfx' | 'subtitle' | 'sticker';

export type EngineState = 'idle' | 'loading' | 'ready' | 'playing' | 'seeking';

export interface EngineConfig {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  fps: number;
}

export interface RenderableTrack {
  id: string;
  type: TrackType;
  clips: RenderableClip[];
  muted: boolean;
  visible: boolean;
  volume: number;
}

export interface RenderableClip {
  id: string;
  assetId: string;
  startTime: number;
  endTime: number;
  trimStart: number;
  duration: number;
  volume: number;
  opacity: number;
  type: string;
  filters?: ClipFilters;
  fadeInMs?: number;
  fadeOutMs?: number;
  positionX?: number;
  positionY?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  transitionIn?: Transition;
}

export interface CompositeLayer {
  type: 'video' | 'image' | 'sticker';
  frame: CanvasImageSource;
  opacity: number;
  filter?: string;
  transform?: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
  };
}

export interface SubtitleOverlay {
  text: string;
  translatedText?: string | null;
}

export interface SubtitleEntry {
  start_ms: number;
  end_ms: number;
  text: string;
  translated_text: string | null;
}

export interface IVideoDecoderPool {
  preload(assetId: string, url: string): Promise<void>;
  getFrame(assetId: string, timeMs: number): Promise<ImageBitmap | null>;
  release(assetId: string): void;
  releaseAll(): void;
}
