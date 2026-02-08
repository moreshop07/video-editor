/**
 * WAV encoder: renders audio tracks via OfflineAudioContext and produces a WAV Blob.
 */

import type { RenderableTrack } from './types';

/**
 * Render audio from timeline tracks and encode as WAV PCM.
 */
export async function exportWav(
  tracks: RenderableTrack[],
  urlResolver: (assetId: string) => string,
  durationMs: number,
  sampleRate = 44100,
  onProgress?: (percent: number) => void,
): Promise<Blob> {
  const durationSec = durationMs / 1000;
  const totalSamples = Math.ceil(sampleRate * durationSec);

  if (totalSamples <= 0) {
    throw new Error('Duration is zero or negative');
  }

  const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);

  // Collect audio clips from all tracks
  const audioClips: {
    url: string;
    startTimeSec: number;
    trimStartSec: number;
    durationSec: number;
    volume: number;
    trackVolume: number;
  }[] = [];

  for (const track of tracks) {
    if (track.muted) continue;
    const trackVol = track.volume ?? 1;

    for (const clip of track.clips) {
      if (clip.type !== 'audio' && clip.type !== 'video') continue;
      if (!clip.assetId) continue;

      const clipStartSec = clip.startTime / 1000;
      const clipDurationSec = (clip.endTime - clip.startTime) / 1000;
      const trimStartSec = (clip.trimStart ?? 0) / 1000;
      const clipVolume = clip.volume ?? 1;

      audioClips.push({
        url: urlResolver(clip.assetId),
        startTimeSec: clipStartSec,
        trimStartSec,
        durationSec: clipDurationSec,
        volume: clipVolume,
        trackVolume: trackVol,
      });
    }
  }

  onProgress?.(10);

  // Fetch and decode all audio buffers
  const bufferPromises = audioClips.map(async (clip) => {
    try {
      const response = await fetch(clip.url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer);
      return audioBuffer;
    } catch {
      return null; // Skip clips that fail to load
    }
  });

  const audioBuffers = await Promise.all(bufferPromises);
  onProgress?.(40);

  // Schedule playback for each clip
  for (let i = 0; i < audioClips.length; i++) {
    const buffer = audioBuffers[i];
    if (!buffer) continue;

    const clip = audioClips[i];
    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;

    const gainNode = offlineCtx.createGain();
    gainNode.gain.value = clip.volume * clip.trackVolume;

    source.connect(gainNode);
    gainNode.connect(offlineCtx.destination);

    const offset = clip.trimStartSec;
    const duration = clip.durationSec;
    source.start(clip.startTimeSec, offset, duration);
  }

  onProgress?.(50);

  // Render audio
  const renderedBuffer = await offlineCtx.startRendering();
  onProgress?.(80);

  // Convert to WAV
  const wavBlob = audioBufferToWav(renderedBuffer);
  onProgress?.(100);

  return wavBlob;
}

/**
 * Convert AudioBuffer to WAV Blob (16-bit PCM, little-endian).
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const numSamples = buffer.length;
  const dataSize = numSamples * blockAlign;

  // WAV header is 44 bytes
  const headerSize = 44;
  const totalSize = headerSize + dataSize;
  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  let offset = 0;

  // RIFF header
  writeString(view, offset, 'RIFF'); offset += 4;
  view.setUint32(offset, totalSize - 8, true); offset += 4;
  writeString(view, offset, 'WAVE'); offset += 4;

  // fmt sub-chunk
  writeString(view, offset, 'fmt '); offset += 4;
  view.setUint32(offset, 16, true); offset += 4; // sub-chunk size
  view.setUint16(offset, 1, true); offset += 2; // PCM format
  view.setUint16(offset, numChannels, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, byteRate, true); offset += 4;
  view.setUint16(offset, blockAlign, true); offset += 2;
  view.setUint16(offset, bitsPerSample, true); offset += 2;

  // data sub-chunk
  writeString(view, offset, 'data'); offset += 4;
  view.setUint32(offset, dataSize, true); offset += 4;

  // Interleave channel data and convert float32 → int16
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let sample = channels[ch][i];
      // Clamp to [-1, 1]
      sample = Math.max(-1, Math.min(1, sample));
      // Convert to 16-bit integer
      const intSample = sample < 0
        ? Math.max(-32768, Math.round(sample * 32768))
        : Math.min(32767, Math.round(sample * 32767));
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
