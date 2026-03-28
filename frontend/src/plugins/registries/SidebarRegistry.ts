import type { SidebarPanelContribution } from '../types';

class SidebarRegistryClass {
  private items = new Map<string, SidebarPanelContribution>();
  private snapshot: SidebarPanelContribution[] = [];
  private listeners = new Set<() => void>();

  register(panel: SidebarPanelContribution): void {
    this.items.set(panel.key, panel);
    this.rebuildSnapshot();
  }

  unregister(key: string): void {
    if (this.items.delete(key)) {
      this.rebuildSnapshot();
    }
  }

  get(key: string): SidebarPanelContribution | undefined {
    return this.items.get(key);
  }

  getAll(): SidebarPanelContribution[] {
    return this.snapshot;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private rebuildSnapshot(): void {
    this.snapshot = Array.from(this.items.values())
      .sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

export const SidebarRegistry = new SidebarRegistryClass();
