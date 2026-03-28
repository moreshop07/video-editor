import type { ComponentType } from 'react';
import type { EffectDefinition } from '@/effects/effectDefinitions';
import type { TransitionRenderParams } from '@/types/transitions';
import type { RenderableClip, CompositeLayer } from '@/engine/types';

// ---- Plugin Manifest ----

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
}

// ---- Plugin Interface ----

export interface Plugin {
  manifest: PluginManifest;
  activate(ctx: PluginContext): void | Promise<void>;
  deactivate?(): void;
}

// ---- Plugin Context ----

export interface PluginContext {
  registerEffects(effects: EffectDefinition[]): void;
  registerSidebarPanels(panels: SidebarPanelContribution[]): void;
  registerTransitions(transitions: TransitionContribution[]): void;
  registerClipRenderers(renderers: ClipRendererContribution[]): void;
  registerTranslations(lng: string, resources: Record<string, string>): void;
  stores: PluginStoreAccess;
}

// ---- Contribution Types ----

export interface SidebarPanelContribution {
  key: string;
  labelKey: string;
  icon: string;
  component: ComponentType;
  order?: number;
}

export type TransitionRenderFn = (
  ctx: CanvasRenderingContext2D,
  outgoing: ImageBitmap | HTMLVideoElement | HTMLImageElement | null,
  incoming: ImageBitmap | HTMLVideoElement | HTMLImageElement | null,
  params: TransitionRenderParams,
) => void;

export interface TransitionContribution {
  type: string;
  nameKey: string;
  icon: string;
  render: TransitionRenderFn;
}

export interface ClipRendererContribution {
  clipType: string;
  render: (
    clip: RenderableClip,
    timeMs: number,
    canvasWidth: number,
    canvasHeight: number,
  ) => Promise<CompositeLayer | null>;
}

// ---- Store Access ----

export interface PluginStoreAccess {
  timeline: {
    getState: () => unknown;
    subscribe: (listener: () => void) => () => void;
  };
  project: {
    getState: () => unknown;
    subscribe: (listener: () => void) => () => void;
  };
  asset: {
    getState: () => unknown;
    subscribe: (listener: () => void) => () => void;
  };
}
