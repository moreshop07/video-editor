import { create } from 'zustand';
import { assetApi } from '@/api/client';

export interface Asset {
  id: number;
  user_id: number;
  filename: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  asset_type: string;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  thumbnail_url: string | null;
  waveform_url: string | null;
  auto_tags: string[];
  mood_tags: string[];
  color_palette: string[];
  created_at: string;
}

interface UploadProgress {
  file: File;
  progress: number;
  status: 'uploading' | 'done' | 'error';
  error?: string;
}

interface AssetState {
  assets: Asset[];
  loading: boolean;
  error: string | null;
  uploads: Map<string, UploadProgress>;
  searchQuery: string;
  filterType: string | null;

  fetchAssets: () => Promise<void>;
  uploadAsset: (file: File) => Promise<Asset | null>;
  uploadMultiple: (files: File[]) => Promise<void>;
  deleteAsset: (id: number) => Promise<void>;
  setSearchQuery: (query: string) => void;
  setFilterType: (type: string | null) => void;
  getFilteredAssets: () => Asset[];
}

export const useAssetStore = create<AssetState>((set, get) => ({
  assets: [],
  loading: false,
  error: null,
  uploads: new Map(),
  searchQuery: '',
  filterType: null,

  fetchAssets: async () => {
    set({ loading: true, error: null });
    try {
      const response = await assetApi.list();
      set({ assets: response.data, loading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to fetch assets', loading: false });
    }
  },

  uploadAsset: async (file: File) => {
    const uploadId = `${file.name}-${Date.now()}`;
    const uploads = new Map(get().uploads);
    uploads.set(uploadId, { file, progress: 0, status: 'uploading' });
    set({ uploads });

    try {
      const response = await assetApi.upload(file, (progress) => {
        const uploads = new Map(get().uploads);
        const entry = uploads.get(uploadId);
        if (entry) {
          uploads.set(uploadId, { ...entry, progress });
          set({ uploads });
        }
      });

      const asset: Asset = response.data;

      // Update uploads map
      const updatedUploads = new Map(get().uploads);
      updatedUploads.set(uploadId, { file, progress: 100, status: 'done' });

      // Remove from uploads after a delay
      setTimeout(() => {
        const u = new Map(get().uploads);
        u.delete(uploadId);
        set({ uploads: u });
      }, 2000);

      // Add to assets list
      set({ assets: [asset, ...get().assets], uploads: updatedUploads });
      return asset;
    } catch (err: any) {
      const uploads = new Map(get().uploads);
      uploads.set(uploadId, {
        file,
        progress: 0,
        status: 'error',
        error: err.response?.data?.detail || err.message,
      });
      set({ uploads });
      return null;
    }
  },

  uploadMultiple: async (files: File[]) => {
    await Promise.allSettled(files.map((f) => get().uploadAsset(f)));
  },

  deleteAsset: async (id: number) => {
    try {
      await assetApi.delete(id);
      set({ assets: get().assets.filter((a) => a.id !== id) });
    } catch (err: any) {
      set({ error: err.message || 'Failed to delete asset' });
    }
  },

  setSearchQuery: (query: string) => set({ searchQuery: query }),
  setFilterType: (type: string | null) => set({ filterType: type }),

  getFilteredAssets: () => {
    const { assets, searchQuery, filterType } = get();
    return assets.filter((asset) => {
      const matchesType = !filterType || filterType === 'all' || asset.asset_type === filterType;
      const matchesSearch =
        !searchQuery ||
        asset.original_filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        asset.auto_tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesType && matchesSearch;
    });
  },
}));
