// Types
export type {
  PluginManifest,
  Plugin,
  PluginContext,
  SidebarPanelContribution,
  TransitionContribution,
  TransitionRenderFn,
  ClipRendererContribution,
  PluginStoreAccess,
} from './types';

// Registries
export { EffectRegistry } from './registries/EffectRegistry';
export { SidebarRegistry } from './registries/SidebarRegistry';
export { TransitionRegistry } from './registries/TransitionRegistry';
export { ClipRendererRegistry } from './registries/ClipRendererRegistry';

// Hooks
export {
  useEffectRegistry,
  useSidebarRegistry,
  useTransitionRegistry,
  usePluginList,
} from './hooks';

// Manager
export { pluginManager } from './PluginManager';
