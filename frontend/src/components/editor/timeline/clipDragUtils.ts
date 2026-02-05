import type { Clip, Track } from '@/store/timelineStore';

const TRACK_COMPATIBILITY: Record<string, string[]> = {
  video: ['video'],
  audio: ['audio', 'music', 'sfx'],
  image: ['video', 'sticker'],
  music: ['audio', 'music'],
  sfx: ['audio', 'sfx'],
  subtitle: ['subtitle'],
  sticker: ['sticker', 'video'],
};

export function isCompatibleTrackType(clipType: string, trackType: string): boolean {
  return TRACK_COMPATIBILITY[clipType]?.includes(trackType) ?? false;
}

export function hasOverlap(
  targetTrack: Track,
  clipId: string,
  proposedStart: number,
  proposedEnd: number,
): boolean {
  return targetTrack.clips.some((c) => {
    if (c.id === clipId) return false;
    return proposedStart < c.endTime && proposedEnd > c.startTime;
  });
}

/**
 * Given a mouse Y position and a map of track elements,
 * find which track the cursor is over.
 */
export function findTrackAtY(
  clientY: number,
  elements: Map<string, HTMLElement>,
  trackTypes: Map<string, string>,
  clipType: string,
): string | null {
  for (const [trackId, element] of elements) {
    const rect = element.getBoundingClientRect();
    if (clientY >= rect.top && clientY <= rect.bottom) {
      const targetType = trackTypes.get(trackId);
      if (targetType && isCompatibleTrackType(clipType, targetType)) {
        return trackId;
      }
      return null; // Over a track but incompatible type
    }
  }
  return null;
}
