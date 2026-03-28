import type { Plugin, PluginContext, PluginManifest } from './types';
import { EffectRegistry } from './registries/EffectRegistry';
import { SidebarRegistry } from './registries/SidebarRegistry';
import { TransitionRegistry } from './registries/TransitionRegistry';
import { ClipRendererRegistry } from './registries/ClipRendererRegistry';
import { useTimelineStore } from '@/store/timelineStore';
import { useProjectStore } from '@/store/projectStore';
import { useAssetStore } from '@/store/assetStore';
import i18n from '@/i18n';

interface PluginEntry {
  plugin: Plugin;
  enabled: boolean;
  contributions: {
    effectIds: string[];
    sidebarKeys: string[];
    transitionTypes: string[];
    clipRendererTypes: string[];
  };
}

class PluginManagerClass {
  private plugins = new Map<string, PluginEntry>();
  private snapshot: Array<{ manifest: PluginManifest; enabled: boolean }> = [];
  private listeners = new Set<() => void>();

  async register(plugin: Plugin): Promise<void> {
    const id = plugin.manifest.id;
    if (this.plugins.has(id)) {
      console.warn(`Plugin "${id}" is already registered.`);
      return;
    }

    const contributions: PluginEntry['contributions'] = {
      effectIds: [],
      sidebarKeys: [],
      transitionTypes: [],
      clipRendererTypes: [],
    };

    const ctx: PluginContext = {
      registerEffects: (effects) => {
        EffectRegistry.registerMany(effects);
        contributions.effectIds.push(...effects.map((e) => e.id));
      },
      registerSidebarPanels: (panels) => {
        for (const panel of panels) {
          SidebarRegistry.register(panel);
          contributions.sidebarKeys.push(panel.key);
        }
      },
      registerTransitions: (transitions) => {
        for (const t of transitions) {
          TransitionRegistry.register(t);
          contributions.transitionTypes.push(t.type);
        }
      },
      registerClipRenderers: (renderers) => {
        for (const r of renderers) {
          ClipRendererRegistry.register(r);
          contributions.clipRendererTypes.push(r.clipType);
        }
      },
      registerTranslations: (lng, resources) => {
        i18n.addResourceBundle(lng, 'translation', resources, true, true);
      },
      stores: {
        timeline: {
          getState: useTimelineStore.getState,
          subscribe: useTimelineStore.subscribe,
        },
        project: {
          getState: useProjectStore.getState,
          subscribe: useProjectStore.subscribe,
        },
        asset: {
          getState: useAssetStore.getState,
          subscribe: useAssetStore.subscribe,
        },
      },
    };

    await plugin.activate(ctx);
    this.plugins.set(id, { plugin, enabled: true, contributions });
    this.rebuildSnapshot();
  }

  unregister(pluginId: string): void {
    const entry = this.plugins.get(pluginId);
    if (!entry) return;

    for (const id of entry.contributions.effectIds) EffectRegistry.unregister(id);
    for (const key of entry.contributions.sidebarKeys) SidebarRegistry.unregister(key);
    for (const type of entry.contributions.transitionTypes) TransitionRegistry.unregister(type);
    for (const type of entry.contributions.clipRendererTypes) ClipRendererRegistry.unregister(type);

    entry.plugin.deactivate?.();
    this.plugins.delete(pluginId);
    this.rebuildSnapshot();
  }

  setEnabled(pluginId: string, enabled: boolean): void {
    const entry = this.plugins.get(pluginId);
    if (!entry || entry.enabled === enabled) return;

    entry.enabled = enabled;

    if (!enabled) {
      // Remove contributions when disabled
      for (const id of entry.contributions.effectIds) EffectRegistry.unregister(id);
      for (const key of entry.contributions.sidebarKeys) SidebarRegistry.unregister(key);
      for (const type of entry.contributions.transitionTypes) TransitionRegistry.unregister(type);
      for (const type of entry.contributions.clipRendererTypes) ClipRendererRegistry.unregister(type);
    } else {
      // Re-register contributions when re-enabled
      // Re-activate the plugin to re-register contributions
      const contributions: PluginEntry['contributions'] = {
        effectIds: [],
        sidebarKeys: [],
        transitionTypes: [],
        clipRendererTypes: [],
      };

      const ctx: PluginContext = {
        registerEffects: (effects) => {
          EffectRegistry.registerMany(effects);
          contributions.effectIds.push(...effects.map((e) => e.id));
        },
        registerSidebarPanels: (panels) => {
          for (const panel of panels) {
            SidebarRegistry.register(panel);
            contributions.sidebarKeys.push(panel.key);
          }
        },
        registerTransitions: (transitions) => {
          for (const t of transitions) {
            TransitionRegistry.register(t);
            contributions.transitionTypes.push(t.type);
          }
        },
        registerClipRenderers: (renderers) => {
          for (const r of renderers) {
            ClipRendererRegistry.register(r);
            contributions.clipRendererTypes.push(r.clipType);
          }
        },
        registerTranslations: (lng, resources) => {
          i18n.addResourceBundle(lng, 'translation', resources, true, true);
        },
        stores: {
          timeline: {
            getState: useTimelineStore.getState,
            subscribe: useTimelineStore.subscribe,
          },
          project: {
            getState: useProjectStore.getState,
            subscribe: useProjectStore.subscribe,
          },
          asset: {
            getState: useAssetStore.getState,
            subscribe: useAssetStore.subscribe,
          },
        },
      };

      entry.plugin.activate(ctx);
      entry.contributions = contributions;
    }

    this.rebuildSnapshot();
  }

  getEntries = (): Array<{ manifest: PluginManifest; enabled: boolean }> => {
    return this.snapshot;
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private rebuildSnapshot(): void {
    this.snapshot = Array.from(this.plugins.values()).map((e) => ({
      manifest: e.plugin.manifest,
      enabled: e.enabled,
    }));
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

export const pluginManager = new PluginManagerClass();
