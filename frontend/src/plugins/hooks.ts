import { useSyncExternalStore } from 'react';
import { EffectRegistry } from './registries/EffectRegistry';
import { SidebarRegistry } from './registries/SidebarRegistry';
import { TransitionRegistry } from './registries/TransitionRegistry';
import { pluginManager } from './PluginManager';
import type { EffectDefinition } from '@/effects/effectDefinitions';
import type { SidebarPanelContribution, TransitionContribution, PluginManifest } from './types';

export function useEffectRegistry(): EffectDefinition[] {
  return useSyncExternalStore(EffectRegistry.subscribe, EffectRegistry.getAll);
}

export function useSidebarRegistry(): SidebarPanelContribution[] {
  return useSyncExternalStore(SidebarRegistry.subscribe, SidebarRegistry.getAll);
}

export function useTransitionRegistry(): TransitionContribution[] {
  return useSyncExternalStore(TransitionRegistry.subscribe, TransitionRegistry.getAll);
}

export function usePluginList(): Array<{ manifest: PluginManifest; enabled: boolean }> {
  return useSyncExternalStore(pluginManager.subscribe, pluginManager.getEntries);
}
