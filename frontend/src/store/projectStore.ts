import { create } from 'zustand';
import { temporal } from 'zundo';
import { projectApi } from '@/api/client';
import type { ProjectData } from './timelineStore';

export type AutoSaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

export interface Project {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
  duration_ms: number;
  width: number;
  height: number;
  fps: number;
  project_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface ProjectState {
  currentProject: Project | null;
  projects: Project[];
  isLoading: boolean;
  isSaving: boolean;
  autoSaveStatus: AutoSaveStatus;
}

export interface CreateProjectOptions {
  width?: number;
  height?: number;
  fps?: number;
  projectData?: ProjectData;
}

interface ProjectActions {
  loadProject: (projectId: number) => Promise<void>;
  saveProject: () => Promise<void>;
  createProject: (name: string, description?: string, options?: CreateProjectOptions) => Promise<Project>;
  updateProjectData: (data: Partial<Project>) => void;
  fetchProjects: () => Promise<void>;
  setCurrentProject: (project: Project | null) => void;
  setAutoSaveStatus: (status: AutoSaveStatus) => void;
}

type ProjectStore = ProjectState & ProjectActions;

export const useProjectStore = create<ProjectStore>()(
  temporal(
    (set, get) => ({
      currentProject: null,
      projects: [],
      isLoading: false,
      isSaving: false,
      autoSaveStatus: 'saved' as AutoSaveStatus,

      loadProject: async (projectId: number) => {
        set({ isLoading: true });
        try {
          const response = await projectApi.get(projectId);
          set({ currentProject: response.data, isLoading: false });
        } catch (error) {
          console.error('Failed to load project:', error);
          set({ isLoading: false });
        }
      },

      saveProject: async () => {
        const { currentProject } = get();
        if (!currentProject) return;

        set({ isSaving: true });
        try {
          await projectApi.update(currentProject.id, {
            name: currentProject.name,
            description: currentProject.description,
          });
          set({ isSaving: false });
        } catch (error) {
          console.error('Failed to save project:', error);
          set({ isSaving: false });
        }
      },

      createProject: async (name: string, description?: string, options?: CreateProjectOptions) => {
        const response = await projectApi.create({
          name,
          description,
          width: options?.width,
          height: options?.height,
          fps: options?.fps,
        });
        const project = response.data;

        // If template provides initial project_data, save it immediately
        if (options?.projectData) {
          await projectApi.patchData(project.id, [
            { op: 'replace', path: '', value: options.projectData },
          ]);
          project.project_data = options.projectData;
        }

        set((state) => ({
          projects: [...state.projects, project],
          currentProject: project,
        }));
        return project;
      },

      updateProjectData: (data: Partial<Project>) => {
        set((state) => ({
          currentProject: state.currentProject
            ? { ...state.currentProject, ...data }
            : null,
        }));
      },

      fetchProjects: async () => {
        set({ isLoading: true });
        try {
          const response = await projectApi.list();
          set({ projects: response.data, isLoading: false });
        } catch (error) {
          console.error('Failed to fetch projects:', error);
          set({ isLoading: false });
        }
      },

      setCurrentProject: (project: Project | null) => {
        set({ currentProject: project });
      },

      setAutoSaveStatus: (status: AutoSaveStatus) => {
        set({ autoSaveStatus: status });
      },
    }),
    { limit: 50 }
  )
);
