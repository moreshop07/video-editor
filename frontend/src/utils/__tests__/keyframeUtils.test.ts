import { describe, it, expect } from 'vitest';
import {
  getInterpolatedValue,
  getInterpolatedProperties,
  setKeyframe,
  removeKeyframe,
  hasKeyframeAt,
  getKeyframeAt,
  getAllKeyframeTimes,
  hasKeyframes,
} from '../keyframeUtils';
import type { Keyframe, KeyframeTracks } from '@/types/keyframes';

describe('keyframeUtils', () => {
  describe('getInterpolatedValue', () => {
    it('returns default value when no keyframes', () => {
      expect(getInterpolatedValue(undefined, 1000, 0.5)).toBe(0.5);
      expect(getInterpolatedValue([], 1000, 0.5)).toBe(0.5);
    });

    it('returns first keyframe value before first keyframe', () => {
      const keyframes: Keyframe[] = [
        { time: 1000, value: 0.3 },
        { time: 2000, value: 0.7 },
      ];
      expect(getInterpolatedValue(keyframes, 500, 0.5)).toBe(0.3);
    });

    it('returns last keyframe value after last keyframe', () => {
      const keyframes: Keyframe[] = [
        { time: 1000, value: 0.3 },
        { time: 2000, value: 0.7 },
      ];
      expect(getInterpolatedValue(keyframes, 3000, 0.5)).toBe(0.7);
    });

    it('interpolates linearly between keyframes', () => {
      const keyframes: Keyframe[] = [
        { time: 1000, value: 0 },
        { time: 2000, value: 100 },
      ];
      expect(getInterpolatedValue(keyframes, 1500, 0)).toBe(50);
    });

    it('handles multiple keyframes', () => {
      const keyframes: Keyframe[] = [
        { time: 0, value: 0 },
        { time: 1000, value: 100 },
        { time: 2000, value: 50 },
      ];
      expect(getInterpolatedValue(keyframes, 500, 0)).toBe(50);
      expect(getInterpolatedValue(keyframes, 1500, 0)).toBe(75);
    });
  });

  describe('setKeyframe', () => {
    it('creates new track when none exists', () => {
      const result = setKeyframe(undefined, 'positionX', 1000, 0.5);
      expect(result.positionX).toEqual([{ time: 1000, value: 0.5 }]);
    });

    it('adds keyframe to existing track', () => {
      const tracks: KeyframeTracks = {
        positionX: [{ time: 0, value: 0 }],
      };
      const result = setKeyframe(tracks, 'positionX', 1000, 0.5);
      expect(result.positionX).toHaveLength(2);
      expect(result.positionX).toContainEqual({ time: 1000, value: 0.5 });
    });

    it('updates existing keyframe at same time', () => {
      const tracks: KeyframeTracks = {
        positionX: [{ time: 1000, value: 0.3 }],
      };
      const result = setKeyframe(tracks, 'positionX', 1000, 0.7);
      expect(result.positionX).toHaveLength(1);
      expect(result.positionX[0].value).toBe(0.7);
    });

    it('keeps keyframes sorted by time', () => {
      const tracks: KeyframeTracks = {
        positionX: [
          { time: 0, value: 0 },
          { time: 2000, value: 1 },
        ],
      };
      const result = setKeyframe(tracks, 'positionX', 1000, 0.5);
      expect(result.positionX.map((k) => k.time)).toEqual([0, 1000, 2000]);
    });
  });

  describe('removeKeyframe', () => {
    it('returns empty object when no tracks', () => {
      expect(removeKeyframe(undefined, 'positionX', 1000)).toEqual({});
    });

    it('removes keyframe at time', () => {
      const tracks: KeyframeTracks = {
        positionX: [
          { time: 0, value: 0 },
          { time: 1000, value: 0.5 },
        ],
      };
      const result = removeKeyframe(tracks, 'positionX', 1000);
      expect(result.positionX).toHaveLength(1);
      expect(result.positionX[0].time).toBe(0);
    });

    it('removes property when no keyframes left', () => {
      const tracks: KeyframeTracks = {
        positionX: [{ time: 1000, value: 0.5 }],
      };
      const result = removeKeyframe(tracks, 'positionX', 1000);
      expect(result.positionX).toBeUndefined();
    });
  });

  describe('hasKeyframeAt', () => {
    it('returns false when no tracks', () => {
      expect(hasKeyframeAt(undefined, 'positionX', 1000)).toBe(false);
    });

    it('returns false when no keyframe at time', () => {
      const tracks: KeyframeTracks = {
        positionX: [{ time: 0, value: 0 }],
      };
      expect(hasKeyframeAt(tracks, 'positionX', 1000)).toBe(false);
    });

    it('returns true when keyframe exists', () => {
      const tracks: KeyframeTracks = {
        positionX: [{ time: 1000, value: 0.5 }],
      };
      expect(hasKeyframeAt(tracks, 'positionX', 1000)).toBe(true);
    });

    it('uses 10ms tolerance', () => {
      const tracks: KeyframeTracks = {
        positionX: [{ time: 1000, value: 0.5 }],
      };
      expect(hasKeyframeAt(tracks, 'positionX', 1005)).toBe(true);
      expect(hasKeyframeAt(tracks, 'positionX', 1015)).toBe(false);
    });
  });

  describe('getAllKeyframeTimes', () => {
    it('returns empty array when no tracks', () => {
      expect(getAllKeyframeTimes(undefined)).toEqual([]);
    });

    it('returns sorted unique times across all properties', () => {
      const tracks: KeyframeTracks = {
        positionX: [
          { time: 0, value: 0 },
          { time: 2000, value: 1 },
        ],
        positionY: [
          { time: 1000, value: 0 },
          { time: 2000, value: 1 },
        ],
      };
      expect(getAllKeyframeTimes(tracks)).toEqual([0, 1000, 2000]);
    });
  });

  describe('hasKeyframes', () => {
    it('returns false when no tracks', () => {
      expect(hasKeyframes(undefined)).toBe(false);
    });

    it('returns false when no keyframes in tracks', () => {
      const tracks: KeyframeTracks = {
        positionX: [],
      };
      expect(hasKeyframes(tracks)).toBe(false);
    });

    it('returns true when keyframes exist', () => {
      const tracks: KeyframeTracks = {
        positionX: [{ time: 0, value: 0 }],
      };
      expect(hasKeyframes(tracks)).toBe(true);
    });
  });
});
