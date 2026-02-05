import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

// Mock the API client
vi.mock('@/api/client', () => ({
  projectApi: {
    get: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

function getState() {
  return useProjectStore.getState();
}

describe('projectStore', () => {
  beforeEach(() => {
    useProjectStore.setState({
      currentProject: null,
      projects: [],
      isLoading: false,
      isSaving: false,
      autoSaveStatus: 'saved',
    });
  });

  it('should have correct initial state', () => {
    const state = getState();
    expect(state.currentProject).toBeNull();
    expect(state.projects).toEqual([]);
    expect(state.isLoading).toBe(false);
    expect(state.isSaving).toBe(false);
    expect(state.autoSaveStatus).toBe('saved');
  });

  it('loadProject should call API and set currentProject', async () => {
    const { projectApi } = await import('@/api/client');
    const mockProject = {
      id: 1,
      user_id: 1,
      name: 'Test',
      description: null,
      thumbnail_url: null,
      duration_ms: 0,
      width: 1920,
      height: 1080,
      fps: 30,
      project_data: {},
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };
    vi.mocked(projectApi.get).mockResolvedValueOnce({
      data: mockProject,
    } as never);

    await getState().loadProject(1);

    expect(projectApi.get).toHaveBeenCalledWith(1);
    expect(getState().currentProject).toEqual(mockProject);
    expect(getState().isLoading).toBe(false);
  });

  it('createProject should append to projects list', async () => {
    const { projectApi } = await import('@/api/client');
    const newProject = {
      id: 2,
      user_id: 1,
      name: 'New Project',
      description: null,
      thumbnail_url: null,
      duration_ms: 0,
      width: 1920,
      height: 1080,
      fps: 30,
      project_data: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };
    vi.mocked(projectApi.create).mockResolvedValueOnce({
      data: newProject,
    } as never);

    const result = await getState().createProject('New Project');

    expect(projectApi.create).toHaveBeenCalledWith({
      name: 'New Project',
      description: undefined,
    });
    expect(result).toEqual(newProject);
    expect(getState().projects).toHaveLength(1);
    expect(getState().currentProject).toEqual(newProject);
  });

  it('fetchProjects should populate projects list', async () => {
    const { projectApi } = await import('@/api/client');
    const projects = [
      { id: 1, name: 'P1' },
      { id: 2, name: 'P2' },
    ];
    vi.mocked(projectApi.list).mockResolvedValueOnce({
      data: projects,
    } as never);

    await getState().fetchProjects();

    expect(projectApi.list).toHaveBeenCalled();
    expect(getState().projects).toEqual(projects);
    expect(getState().isLoading).toBe(false);
  });

  it('setAutoSaveStatus should update status', () => {
    getState().setAutoSaveStatus('saving');
    expect(getState().autoSaveStatus).toBe('saving');
    getState().setAutoSaveStatus('error');
    expect(getState().autoSaveStatus).toBe('error');
  });
});
