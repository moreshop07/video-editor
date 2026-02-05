import axios, { AxiosProgressEvent } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ---- Asset API ----
export const assetApi = {
  upload: (file: File, onProgress?: (progress: number) => void) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/assets/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event: AxiosProgressEvent) => {
        if (event.total && onProgress) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      },
    });
  },
  list: (page = 1, perPage = 50) =>
    apiClient.get('/assets', { params: { page, per_page: perPage } }),
  search: (params: { asset_type?: string; tags?: string[]; mood?: string[] }) =>
    apiClient.get('/assets/search', { params }),
  get: (id: number) => apiClient.get(`/assets/${id}`),
  delete: (id: number) => apiClient.delete(`/assets/${id}`),
  getStreamUrl: (id: number) => `${API_BASE_URL}/assets/${id}/stream`,
};

// ---- Project API ----
export const projectApi = {
  create: (data: { name: string; description?: string; width?: number; height?: number; fps?: number }) =>
    apiClient.post('/projects', data),
  list: () => apiClient.get('/projects'),
  get: (id: number) => apiClient.get(`/projects/${id}`),
  update: (id: number, data: Record<string, unknown>) =>
    apiClient.patch(`/projects/${id}`, data),
  patchData: (id: number, ops: Array<{ op: string; path: string; value?: unknown }>) =>
    apiClient.patch(`/projects/${id}/data`, { ops }),
  delete: (id: number) => apiClient.delete(`/projects/${id}`),
};

// ---- Auth API ----
export const authApi = {
  register: (data: { username: string; email: string; password: string }) =>
    apiClient.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    apiClient.post('/auth/login', data),
  me: () => apiClient.get('/auth/me'),
};

// ---- Processing API ----
export const processingApi = {
  export: (data: { project_id: number; format?: string; quality?: string }) =>
    apiClient.post('/processing/export', data),
  getJob: (jobId: number) => apiClient.get(`/processing/jobs/${jobId}`),
};

// ---- Music API ----
export const musicApi = {
  library: (params?: {
    query?: string;
    mood?: string;
    genre?: string;
    min_bpm?: number;
    max_bpm?: number;
    min_energy?: number;
    max_energy?: number;
    page?: number;
    per_page?: number;
  }) => apiClient.get('/music/library', { params }),
  get: (id: number) => apiClient.get(`/music/${id}`),
  match: (data: { project_id: number; subtitle_text?: string; preferred_mood?: string }) =>
    apiClient.post('/music/match', data),
};

// ---- Sound Effects API ----
export const sfxApi = {
  list: (params?: {
    query?: string;
    category?: string;
    page?: number;
    per_page?: number;
  }) => apiClient.get('/sfx', { params }),
  get: (id: number) => apiClient.get(`/sfx/${id}`),
};

// ---- Audio Processing API ----
export const audioProcessingApi = {
  noiseReduction: (data: { asset_id: number; operation: string; params?: Record<string, unknown> }) =>
    apiClient.post('/processing/audio/noise-reduction', data),
  normalize: (data: { asset_id: number; operation: string; params?: Record<string, unknown> }) =>
    apiClient.post('/processing/audio/normalize', data),
};

// ---- Subtitle API ----
export const subtitleApi = {
  generate: (data: { project_id: number; asset_id: number; language?: string }) =>
    apiClient.post('/subtitles/generate', data),
  translate: (data: { track_id: number; target_language?: string; context_hint?: string }) =>
    apiClient.post('/subtitles/translate', data),
  listTracks: (projectId: number) =>
    apiClient.get(`/subtitles/tracks/${projectId}`),
  getTrack: (trackId: number) =>
    apiClient.get(`/subtitles/track/${trackId}`),
  updateSegment: (segmentId: number, data: { text?: string; translated_text?: string; start_ms?: number; end_ms?: number }) =>
    apiClient.patch(`/subtitles/segment/${segmentId}`, data),
  deleteTrack: (trackId: number) =>
    apiClient.delete(`/subtitles/track/${trackId}`),
};

// ---- External Assets API ----
export const externalApi = {
  search: (
    source: string,
    params: { query: string; media_type?: string; page?: number; per_page?: number },
  ) => apiClient.get(`/external/${source}/search`, { params }),
  import: (data: { url: string; source: string; original_filename: string; content_type: string }) =>
    apiClient.post('/external/import', data),
};

// ---- Sticker API ----
export const stickerApi = {
  packs: () => apiClient.get('/stickers/packs'),
  pack: (id: number) => apiClient.get(`/stickers/pack/${id}`),
  sticker: (id: number) => apiClient.get(`/stickers/${id}`),
  stickerUrl: (id: number) => `${API_BASE_URL}/stickers/${id}/file`,
};

export default apiClient;
