import type { ExternalAssetItem, ExternalSource, ExternalMediaType } from '@/types/external';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function parsePexelsResponse(
  data: any,
  mediaType: ExternalMediaType,
): ExternalAssetItem[] {
  if (mediaType === 'video') {
    return (data.videos ?? []).map((v: any) => ({
      id: String(v.id),
      source: 'pexels' as const,
      title: v.url?.split('/').pop()?.replace(/-/g, ' ') || `Pexels Video ${v.id}`,
      thumbnailUrl: v.image || v.video_pictures?.[0]?.picture || '',
      previewUrl: v.video_files?.[0]?.link || '',
      downloadUrl:
        v.video_files?.find((f: any) => f.quality === 'hd')?.link ||
        v.video_files?.[0]?.link ||
        '',
      contentType: 'video/mp4',
      width: v.width,
      height: v.height,
      duration: v.duration,
      attribution: v.user?.name || 'Unknown',
      attributionUrl: v.user?.url || v.url || '',
      license: 'Pexels License',
    }));
  }

  return (data.photos ?? []).map((p: any) => ({
    id: String(p.id),
    source: 'pexels' as const,
    title: p.alt || `Pexels Photo ${p.id}`,
    thumbnailUrl: p.src?.small || p.src?.tiny || '',
    previewUrl: p.src?.medium || p.src?.small || '',
    downloadUrl: p.src?.original || p.src?.large2x || '',
    contentType: 'image/jpeg',
    width: p.width,
    height: p.height,
    attribution: p.photographer || 'Unknown',
    attributionUrl: p.photographer_url || p.url || '',
    license: 'Pexels License',
  }));
}

export function parsePixabayResponse(
  data: any,
  mediaType: ExternalMediaType,
): ExternalAssetItem[] {
  if (mediaType === 'video') {
    return (data.hits ?? []).map((h: any) => ({
      id: String(h.id),
      source: 'pixabay' as const,
      title: h.tags || `Pixabay Video ${h.id}`,
      thumbnailUrl: `https://i.vimeocdn.com/video/${h.picture_id}_295x166.jpg`,
      previewUrl: h.videos?.small?.url || h.videos?.tiny?.url || '',
      downloadUrl: h.videos?.large?.url || h.videos?.medium?.url || '',
      contentType: 'video/mp4',
      duration: h.duration,
      attribution: h.user || 'Unknown',
      attributionUrl: h.pageURL || '',
      license: 'Pixabay License',
    }));
  }

  return (data.hits ?? []).map((h: any) => ({
    id: String(h.id),
    source: 'pixabay' as const,
    title: h.tags || `Pixabay Image ${h.id}`,
    thumbnailUrl: h.previewURL || '',
    previewUrl: h.webformatURL || '',
    downloadUrl: h.largeImageURL || h.webformatURL || '',
    contentType: 'image/jpeg',
    width: h.imageWidth,
    height: h.imageHeight,
    attribution: h.user || 'Unknown',
    attributionUrl: h.pageURL || '',
    license: 'Pixabay License',
  }));
}

export function parseFreesoundResponse(data: any): ExternalAssetItem[] {
  return (data.results ?? []).map((r: any) => ({
    id: String(r.id),
    source: 'freesound' as const,
    title: r.name || `Freesound ${r.id}`,
    thumbnailUrl: r.images?.spectral_m || '',
    previewUrl: r.previews?.['preview-lq-mp3'] || r.previews?.['preview-hq-mp3'] || '',
    downloadUrl: r.previews?.['preview-hq-mp3'] || r.download || '',
    contentType: 'audio/mpeg',
    duration: r.duration,
    attribution: r.username || 'Unknown',
    attributionUrl: r.url || '',
    license: r.license || 'Freesound License',
  }));
}

export function parseExternalResponse(
  source: ExternalSource,
  data: any,
  mediaType: ExternalMediaType,
): ExternalAssetItem[] {
  switch (source) {
    case 'pexels':
      return parsePexelsResponse(data, mediaType);
    case 'pixabay':
      return parsePixabayResponse(data, mediaType);
    case 'freesound':
      return parseFreesoundResponse(data);
    default:
      return [];
  }
}
