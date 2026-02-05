import type { ClipEffect } from './types';
import { getEffectDefinition } from './effectDefinitions';

/**
 * Combines enabled effects into a single CSS filter string
 * for use with CanvasRenderingContext2D.filter.
 */
export function buildCanvasFilterString(effects: ClipEffect[]): string {
  const parts: string[] = [];

  for (const effect of effects) {
    if (!effect.enabled) continue;
    const def = getEffectDefinition(effect.id);
    if (!def) continue;
    parts.push(def.toCanvasFilter(effect.value));
  }

  return parts.length > 0 ? parts.join(' ') : 'none';
}
