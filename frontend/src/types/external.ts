export type ExternalSource = 'pexels' | 'pixabay' | 'freesound';
export type ExternalMediaType = 'image' | 'video' | 'audio';

export interface ExternalAssetItem {
  id: string;
  source: ExternalSource;
  title: string;
  thumbnailUrl: string;
  previewUrl: string;
  downloadUrl: string;
  contentType: string;
  width?: number;
  height?: number;
  duration?: number;
  attribution: string;
  attributionUrl: string;
  license: string;
}

export interface MusicRecommendation {
  track_id: number;
  title: string;
  artist: string;
  duration_ms: number;
  bpm: number;
  energy: number;
  mood_tags: string[];
  genre_tags: string[];
  file_path: string;
  score: number;
}

export interface MusicMatchResult {
  mood_analysis: {
    mood_tags: string[];
    energy: number;
    tempo_min: number;
    tempo_max: number;
    genre_suggestions: string[];
  };
  recommendations: MusicRecommendation[];
  total_matches: number;
}
