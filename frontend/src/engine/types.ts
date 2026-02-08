import type { ClipFilters, TrackAudioSettings } from '@/effects/types';
import type { Transition } from '@/types/transitions';
import type { KeyframeTracks } from '@/types/keyframes';

export type TrackType = 'video' | 'audio' | 'music' | 'sfx' | 'subtitle' | 'sticker' | 'text';

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
  audioSettings?: TrackAudioSettings;
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
  cropTop?: number;
  cropBottom?: number;
  cropLeft?: number;
  cropRight?: number;
  transitionIn?: Transition;
  // Text properties
  textContent?: string;
  fontSize?: number;
  fontFamily?: string;
  fontColor?: string;
  fontWeight?: string;
  textAlign?: string;
  backgroundColor?: string;
  backgroundOpacity?: number;
  // Keyframe animation
  keyframes?: KeyframeTracks;
  // PiP border
  pipBorder?: PipBorder;
}

export interface PipBorder {
  width: number;
  color: string;
  shadow: number;  // drop shadow blur radius, 0 = no shadow
}

export interface CompositeLayer {
  type: 'video' | 'image' | 'sticker' | 'text';
  frame: CanvasImageSource;
  opacity: number;
  filter?: string;
  transform?: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
    border?: PipBorder;
    sourceClip?: {
      sx: number;
      sy: number;
      sw: number;
      sh: number;
    };
  };
}

export interface CaptionStyle {
  fontSize?: number;
  fontFamily?: string;
  fontColor?: string;
  fontWeight?: string;
  bgColor?: string;
  bgOpacity?: number;
  position?: 'top' | 'center' | 'bottom';
  outline?: boolean;
}

export interface SubtitleOverlay {
  text: string;
  translatedText?: string | null;
  style?: CaptionStyle | null;
}

export interface SubtitleEntry {
  start_ms: number;
  end_ms: number;
  text: string;
  translated_text: string | null;
  speaker?: string | null;
  style?: CaptionStyle | null;
}

export interface IVideoDecoderPool {
  preload(assetId: string, url: string): Promise<void>;
  getFrame(assetId: string, timeMs: number): Promise<ImageBitmap | null>;
  release(assetId: string): void;
  releaseAll(): void;
}
