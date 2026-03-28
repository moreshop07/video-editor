import { TransitionRegistry } from './registries/TransitionRegistry';
import type { TransitionContribution } from './types';

// Built-in transitions (render functions handled by TransitionRenderer's switch)
// These entries are for the TransitionPicker UI only; the actual rendering
// still lives in TransitionRenderer.ts for built-in types.
const builtinTransitions: Omit<TransitionContribution, 'render'>[] = [
  { type: 'fade', icon: '◐', nameKey: 'transition.fade' },
  { type: 'slide-left', icon: '←', nameKey: 'transition.slideLeft' },
  { type: 'slide-right', icon: '→', nameKey: 'transition.slideRight' },
  { type: 'slide-up', icon: '↑', nameKey: 'transition.slideUp' },
  { type: 'slide-down', icon: '↓', nameKey: 'transition.slideDown' },
  { type: 'wipe-left', icon: '◧', nameKey: 'transition.wipeLeft' },
  { type: 'wipe-right', icon: '◨', nameKey: 'transition.wipeRight' },
  { type: 'wipe-up', icon: '⬒', nameKey: 'transition.wipeUp' },
  { type: 'wipe-down', icon: '⬓', nameKey: 'transition.wipeDown' },
  { type: 'zoom-in', icon: '⊕', nameKey: 'transition.zoomIn' },
  { type: 'zoom-out', icon: '⊖', nameKey: 'transition.zoomOut' },
];

// Placeholder render fn — built-in types are dispatched by TransitionRenderer's switch,
// so this is never actually called for built-in transitions.
const noop = () => {};

export function registerBuiltinTransitions(): void {
  for (const t of builtinTransitions) {
    TransitionRegistry.register({ ...t, render: noop } as TransitionContribution);
  }
}
