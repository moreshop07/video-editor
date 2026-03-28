import type { ClipRendererContribution } from '../types';

class ClipRendererRegistryClass {
  private items = new Map<string, ClipRendererContribution>();

  register(r: ClipRendererContribution): void {
    this.items.set(r.clipType, r);
  }

  unregister(clipType: string): void {
    this.items.delete(clipType);
  }

  get(clipType: string): ClipRendererContribution | undefined {
    return this.items.get(clipType);
  }
}

export const ClipRendererRegistry = new ClipRendererRegistryClass();
