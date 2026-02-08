import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTimelineStore } from '@/store/timelineStore';
import type { TrackAudioSettings, EQSettings, CompressorSettings } from '@/effects/types';
import { DEFAULT_EQ_SETTINGS, DEFAULT_COMPRESSOR_SETTINGS } from '@/effects/types';
import { VUMeter } from './VUMeter';
import { PanKnob } from './PanKnob';
import { EQCurve } from './EQCurve';

const AUDIO_TRACK_TYPES = new Set(['video', 'audio', 'music', 'sfx']);

function ChannelStrip({ trackId, trackName, trackType, muted, audioSettings }: {
  trackId: string;
  trackName: string;
  trackType: string;
  muted: boolean;
  audioSettings?: TrackAudioSettings;
}) {
  const { t } = useTranslation();
  const toggleTrackMute = useTimelineStore((s) => s.toggleTrackMute);
  const updateTrackAudio = useTimelineStore((s) => s.updateTrackAudio);
  const [showEQ, setShowEQ] = useState(false);
  const [showComp, setShowComp] = useState(false);

  const audio = audioSettings ?? { volume: 1, pan: 0 };
  const eq = audio.eq ?? DEFAULT_EQ_SETTINGS;
  const comp = audio.compressor ?? DEFAULT_COMPRESSOR_SETTINGS;

  const update = useCallback(
    (settings: Partial<TrackAudioSettings>) => updateTrackAudio(trackId, settings),
    [trackId, updateTrackAudio],
  );

  const updateEQ = useCallback(
    (eqUpdate: Partial<EQSettings>) => update({ eq: { ...eq, ...eqUpdate } }),
    [eq, update],
  );

  const updateComp = useCallback(
    (compUpdate: Partial<CompressorSettings>) => update({ compressor: { ...comp, ...compUpdate } }),
    [comp, update],
  );

  const typeIcon = trackType === 'video' ? '🎬' : trackType === 'music' ? '🎵' : trackType === 'sfx' ? '🔊' : '🎤';

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs">{typeIcon}</span>
        <span className="flex-1 truncate text-[10px] font-medium text-[var(--color-text)]">
          {trackName}
        </span>
        <button
          onClick={() => toggleTrackMute(trackId)}
          className={`h-5 w-5 rounded text-[9px] font-bold transition-colors ${
            muted
              ? 'bg-red-500/20 text-red-400'
              : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
          }`}
          title={t('mute')}
        >
          {t('mixer.mute')}
        </button>
      </div>

      {/* Meter + Volume + Pan row */}
      <div className="flex items-center gap-2">
        <VUMeter trackId={trackId} width={12} height={64} />

        {/* Volume fader */}
        <div className="flex flex-1 flex-col gap-0.5">
          <input
            type="range"
            min={0}
            max={2}
            step={0.01}
            value={audio.volume}
            onChange={(e) => update({ volume: Number(e.target.value) })}
            className="h-1 w-full accent-[var(--color-primary)]"
          />
          <span className="text-center text-[9px] text-[var(--color-text-secondary)]">
            {Math.round(audio.volume * 100)}%
          </span>
        </div>

        <PanKnob value={audio.pan} onChange={(v) => update({ pan: v })} size={28} />
      </div>

      {/* EQ section */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => updateEQ({ enabled: !eq.enabled })}
          className={`rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors ${
            eq.enabled
              ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
              : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)]'
          }`}
        >
          EQ
        </button>
        <div
          className="flex-1 cursor-pointer"
          onClick={() => setShowEQ(!showEQ)}
        >
          <EQCurve eq={eq} width={80} height={28} />
        </div>
      </div>

      {/* Expanded EQ controls */}
      {showEQ && eq.enabled && (
        <div className="flex flex-col gap-1 pl-1">
          {(['low', 'mid', 'high'] as const).map((band) => (
            <div key={band} className="flex items-center gap-1.5">
              <span className="w-6 text-[9px] text-[var(--color-text-secondary)]">
                {band === 'low' ? 'Lo' : band === 'mid' ? 'Mid' : 'Hi'}
              </span>
              <input
                type="range"
                min={-12}
                max={12}
                step={0.5}
                value={eq[band].gain}
                onChange={(e) => updateEQ({ [band]: { ...eq[band], gain: Number(e.target.value) } })}
                className="h-1 flex-1 accent-[var(--accent)]"
              />
              <span className="w-10 text-right text-[9px] text-[var(--color-text-secondary)]">
                {eq[band].gain > 0 ? '+' : ''}{eq[band].gain}dB
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Compressor section */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => updateComp({ enabled: !comp.enabled })}
          className={`rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors ${
            comp.enabled
              ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
              : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)]'
          }`}
        >
          CMP
        </button>
        {comp.enabled && (
          <button
            onClick={() => setShowComp(!showComp)}
            className="text-[9px] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
          >
            {comp.threshold}dB / {comp.ratio}:1
          </button>
        )}
      </div>

      {/* Expanded compressor controls */}
      {showComp && comp.enabled && (
        <div className="flex flex-col gap-1 pl-1">
          <div className="flex items-center gap-1.5">
            <span className="w-8 text-[9px] text-[var(--color-text-secondary)]">Thr</span>
            <input
              type="range"
              min={-60}
              max={0}
              step={1}
              value={comp.threshold}
              onChange={(e) => updateComp({ threshold: Number(e.target.value) })}
              className="h-1 flex-1 accent-[var(--accent)]"
            />
            <span className="w-10 text-right text-[9px] text-[var(--color-text-secondary)]">
              {comp.threshold}dB
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-8 text-[9px] text-[var(--color-text-secondary)]">Rat</span>
            <input
              type="range"
              min={1}
              max={20}
              step={0.5}
              value={comp.ratio}
              onChange={(e) => updateComp({ ratio: Number(e.target.value) })}
              className="h-1 flex-1 accent-[var(--accent)]"
            />
            <span className="w-10 text-right text-[9px] text-[var(--color-text-secondary)]">
              {comp.ratio}:1
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-8 text-[9px] text-[var(--color-text-secondary)]">Atk</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={comp.attack}
              onChange={(e) => updateComp({ attack: Number(e.target.value) })}
              className="h-1 flex-1 accent-[var(--accent)]"
            />
            <span className="w-10 text-right text-[9px] text-[var(--color-text-secondary)]">
              {(comp.attack * 1000).toFixed(0)}ms
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-8 text-[9px] text-[var(--color-text-secondary)]">Rel</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={comp.release}
              onChange={(e) => updateComp({ release: Number(e.target.value) })}
              className="h-1 flex-1 accent-[var(--accent)]"
            />
            <span className="w-10 text-right text-[9px] text-[var(--color-text-secondary)]">
              {(comp.release * 1000).toFixed(0)}ms
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function AudioMixerPanelComponent() {
  const { t } = useTranslation();
  const tracks = useTimelineStore((s) => s.tracks);

  const audioTracks = useMemo(
    () => tracks.filter((t) => AUDIO_TRACK_TYPES.has(t.type)),
    [tracks],
  );

  return (
    <div className="flex flex-col gap-3 overflow-y-auto p-3">
      <div className="text-xs font-medium text-[var(--color-text)]">
        {t('mixer.title')}
      </div>

      {audioTracks.length === 0 ? (
        <div className="py-8 text-center text-xs text-[var(--color-text-secondary)]">
          {t('mixer.noTracks')}
        </div>
      ) : (
        audioTracks.map((track) => (
          <ChannelStrip
            key={track.id}
            trackId={track.id}
            trackName={track.name}
            trackType={track.type}
            muted={track.muted}
            audioSettings={track.audioSettings}
          />
        ))
      )}
    </div>
  );
}

export default React.memo(AudioMixerPanelComponent);
