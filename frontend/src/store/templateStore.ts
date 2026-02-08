import { create } from 'zustand';
import { templateApi } from '@/api/client';

export interface UserTemplate {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  category: string;
  thumbnail_url: string | null;
  template_data: Record<string, unknown>;
  width: number;
  height: number;
  fps: number;
  created_at: string;
  updated_at: string;
}

interface TemplateState {
  userTemplates: UserTemplate[];
  isLoading: boolean;
  isSaving: boolean;
  fetchUserTemplates: (category?: string) => Promise<void>;
  createUserTemplate: (payload: {
    name: string;
    description?: string;
    category?: string;
    template_data: Record<string, unknown>;
    width?: number;
    height?: number;
    fps?: number;
  }) => Promise<UserTemplate>;
  updateUserTemplate: (id: number, data: { name?: string; description?: string; category?: string }) => Promise<void>;
  deleteUserTemplate: (id: number) => Promise<void>;
}

export const useTemplateStore = create<TemplateState>((set, get) => ({
  userTemplates: [],
  isLoading: false,
  isSaving: false,

  fetchUserTemplates: async (category?: string) => {
    set({ isLoading: true });
    try {
      const res = await templateApi.list(category);
      set({ userTemplates: res.data.templates });
    } catch {
      // ignore
    } finally {
      set({ isLoading: false });
    }
  },

  createUserTemplate: async (payload) => {
    set({ isSaving: true });
    try {
      const res = await templateApi.create(payload);
      const newTemplate = res.data as UserTemplate;
      set({ userTemplates: [newTemplate, ...get().userTemplates] });
      return newTemplate;
    } finally {
      set({ isSaving: false });
    }
  },

  updateUserTemplate: async (id, data) => {
    const res = await templateApi.update(id, data);
    const updated = res.data as UserTemplate;
    set({
      userTemplates: get().userTemplates.map((t) => (t.id === id ? updated : t)),
    });
  },

  deleteUserTemplate: async (id) => {
    await templateApi.delete(id);
    set({ userTemplates: get().userTemplates.filter((t) => t.id !== id) });
  },
}));
