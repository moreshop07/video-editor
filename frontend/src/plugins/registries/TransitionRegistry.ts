import type { TransitionContribution } from '../types';

class TransitionRegistryClass {
  private items = new Map<string, TransitionContribution>();
  private snapshot: TransitionContribution[] = [];
  private listeners = new Set<() => void>();

  register(t: TransitionContribution): void {
    this.items.set(t.type, t);
    this.rebuildSnapshot();
  }

  unregister(type: string): void {
    if (this.items.delete(type)) {
      this.rebuildSnapshot();
    }
  }

  get(type: string): TransitionContribution | undefined {
    return this.items.get(type);
  }

  getAll(): TransitionContribution[] {
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

export const TransitionRegistry = new TransitionRegistryClass();
