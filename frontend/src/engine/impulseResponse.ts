/**
 * Algorithmic impulse response generator for ConvolverNode reverb.
 * Generates stereo IR buffers from white noise × exponential decay.
 */

const irCache = new Map<string, AudioBuffer>();

function cacheKey(decay: number, preDelayMs: number): string {
  return `${decay.toFixed(2)}_${Math.round(preDelayMs)}`;
}

/**
 * Generate (or retrieve cached) impulse response for reverb.
 * @param audioCtx - Web Audio AudioContext
 * @param decay - Reverb tail length in seconds (0.1–10)
 * @param preDelayMs - Pre-delay in milliseconds (0–100)
 */
export function generateImpulseResponse(
  audioCtx: AudioContext,
  decay: number,
  preDelayMs: number,
): AudioBuffer {
  const key = cacheKey(decay, preDelayMs);
  const cached = irCache.get(key);
  if (cached) return cached;

  const sampleRate = audioCtx.sampleRate;
  const length = Math.ceil(sampleRate * decay);
  const buffer = audioCtx.createBuffer(2, length, sampleRate);
  const preDelaySamples = Math.ceil((preDelayMs / 1000) * sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const channelData = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      if (i < preDelaySamples) {
        channelData[i] = 0;
      } else {
        const t = (i - preDelaySamples) / sampleRate;
        // White noise × exponential decay: e^(-3t/decay)
        const envelope = Math.exp((-3 * t) / decay);
        channelData[i] = (Math.random() * 2 - 1) * envelope;
      }
    }
  }

  irCache.set(key, buffer);
  return buffer;
}

/**
 * Clear the impulse response cache (e.g., on dispose).
 */
export function clearIRCache(): void {
  irCache.clear();
}
