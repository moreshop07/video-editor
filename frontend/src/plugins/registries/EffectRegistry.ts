import type { EffectDefinition } from '@/effects/effectDefinitions';

class EffectRegistryClass {
  private items = new Map<string, EffectDefinition>();
  private snapshot: EffectDefinition[] = [];
  private listeners = new Set<() => void>();

  register(def: EffectDefinition): void {
    this.items.set(def.id, def);
    this.rebuildSnapshot();
  }

  registerMany(defs: EffectDefinition[]): void {
    for (const def of defs) {
      this.items.set(def.id, def);
    }
    this.rebuildSnapshot();
  }

  unregister(id: string): void {
    if (this.items.delete(id)) {
      this.rebuildSnapshot();
    }
  }

  get(id: string): EffectDefinition | undefined {
    return this.items.get(id);
  }

  getAll(): EffectDefinition[] {
    return this.snapshot;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private rebuildSnapshot(): void {
    this.snapshot = Array.from(this.items.values());
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

export const EffectRegistry = new EffectRegistryClass();
