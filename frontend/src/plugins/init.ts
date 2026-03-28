import { EffectRegistry } from './registries/EffectRegistry';
import { effectDefinitions } from '@/effects/effectDefinitions';
import { registerBuiltinPanels } from './builtinPanels';
import { registerBuiltinTransitions } from './builtinTransitions';
import { pluginManager } from './PluginManager';
import { vignettePlugin } from './builtins/vignettePlugin';

// Seed built-in effects into the registry
EffectRegistry.registerMany(effectDefinitions);

// Seed built-in sidebar panels
registerBuiltinPanels();

// Seed built-in transitions
registerBuiltinTransitions();

// Register bundled plugins
pluginManager.register(vignettePlugin);
