/**
 * Client-side beat/onset detection using energy-based spectral flux analysis.
 * Analyzes an AudioBuffer and returns detected beat positions with strength.
 */

export interface BeatInfo {
  timeMs: number;
  strength: number; // 0-1 normalized
}

/**
 * Detect beats/onsets in an AudioBuffer.
 * Uses energy-based spectral flux with adaptive threshold.
 *
 * @param audioBuffer - The decoded audio to analyze
 * @param sensitivity - Detection sensitivity (0.5 = fewer beats, 3.0 = more beats). Default 1.0
 * @returns Array of detected beats with time and strength
 */
export function detectBeats(
  audioBuffer: AudioBuffer,
  sensitivity = 1.0,
): BeatInfo[] {
  const sampleRate = audioBuffer.sampleRate;
  const numChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;

  // 1. Mix down to mono
  const mono = new Float32Array(length);
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mono[i] += channelData[i] / numChannels;
    }
  }

  // 2. Compute RMS energy in overlapping windows
  const windowSize = 1024; // ~23ms at 44.1kHz
  const hopSize = Math.round(sampleRate * 0.01); // 10ms hop
  const numWindows = Math.floor((length - windowSize) / hopSize) + 1;

  if (numWindows <= 1) return [];

  const energy = new Float32Array(numWindows);
  for (let w = 0; w < numWindows; w++) {
    const start = w * hopSize;
    let sum = 0;
    for (let i = 0; i < windowSize; i++) {
      const idx = start + i;
      if (idx < length) {
        sum += mono[idx] * mono[idx];
      }
    }
    energy[w] = Math.sqrt(sum / windowSize);
  }

  // 3. Compute spectral flux (half-wave rectified first derivative)
  const flux = new Float32Array(numWindows);
  for (let i = 1; i < numWindows; i++) {
    const diff = energy[i] - energy[i - 1];
    flux[i] = diff > 0 ? diff : 0;
  }

  // 4. Adaptive threshold using running median over ~0.5s window
  const medianWindowSize = Math.max(3, Math.round(0.5 * sampleRate / hopSize));
  const threshold = new Float32Array(numWindows);
  const thresholdMultiplier = 1.5 / Math.max(0.1, sensitivity);

  for (let i = 0; i < numWindows; i++) {
    const start = Math.max(0, i - Math.floor(medianWindowSize / 2));
    const end = Math.min(numWindows, i + Math.ceil(medianWindowSize / 2));
    const window: number[] = [];
    for (let j = start; j < end; j++) {
      window.push(flux[j]);
    }
    window.sort((a, b) => a - b);
    const median = window[Math.floor(window.length / 2)];
    threshold[i] = median * thresholdMultiplier + 0.001; // small offset to avoid zero threshold
  }

  // 5. Peak picking: find flux peaks above threshold
  const rawBeats: { timeMs: number; strength: number }[] = [];
  const minIntervalMs = 100; // minimum 100ms between beats

  for (let i = 1; i < numWindows - 1; i++) {
    if (
      flux[i] > threshold[i] &&
      flux[i] > flux[i - 1] &&
      flux[i] >= flux[i + 1]
    ) {
      const timeMs = (i * hopSize / sampleRate) * 1000;
      rawBeats.push({ timeMs, strength: flux[i] });
    }
  }

  // 6. Remove beats that are too close together (keep stronger one)
  const beats: BeatInfo[] = [];
  for (const beat of rawBeats) {
    if (beats.length === 0) {
      beats.push(beat);
    } else {
      const last = beats[beats.length - 1];
      if (beat.timeMs - last.timeMs >= minIntervalMs) {
        beats.push(beat);
      } else if (beat.strength > last.strength) {
        beats[beats.length - 1] = beat;
      }
    }
  }

  // 7. Normalize strength to 0-1
  if (beats.length > 0) {
    const maxStrength = Math.max(...beats.map((b) => b.strength));
    if (maxStrength > 0) {
      for (const beat of beats) {
        beat.strength = beat.strength / maxStrength;
      }
    }
  }

  return beats;
}
