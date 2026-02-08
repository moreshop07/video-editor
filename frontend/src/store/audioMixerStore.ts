import { create } from 'zustand';
import type { AudioMixerEngine } from '@/engine/AudioMixerEngine';

interface AudioMixerStoreState {
  engine: AudioMixerEngine | null;
  setEngine: (engine: AudioMixerEngine | null) => void;
}

export const useAudioMixerStore = create<AudioMixerStoreState>((set) => ({
  engine: null,
  setEngine: (engine) => set({ engine }),
}));
