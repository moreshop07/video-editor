import { createContext, useContext, useRef, type ReactNode, type MutableRefObject } from 'react';

interface TrackRegistryType {
  elements: MutableRefObject<Map<string, HTMLElement>>;
  trackTypes: MutableRefObject<Map<string, string>>;
}

const TrackRegistryContext = createContext<TrackRegistryType | null>(null);

export function TrackRegistryProvider({ children }: { children: ReactNode }) {
  const elements = useRef(new Map<string, HTMLElement>());
  const trackTypes = useRef(new Map<string, string>());
  return (
    <TrackRegistryContext.Provider value={{ elements, trackTypes }}>
      {children}
    </TrackRegistryContext.Provider>
  );
}

export function useTrackRegistry() {
  const ctx = useContext(TrackRegistryContext);
  if (!ctx) throw new Error('useTrackRegistry must be used within TrackRegistryProvider');
  return ctx;
}
