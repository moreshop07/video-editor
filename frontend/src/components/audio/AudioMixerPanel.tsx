import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTimelineStore } from '@/store/timelineStore';
import type { TrackAudioSettings, EQSettings, CompressorSettings, ReverbSettings, DelaySettings, ChorusSettings, DuckingSettings, DuckingPreset } from '@/effects/types';
import { DEFAULT_EQ_SETTINGS, DEFAULT_COMPRESSOR_SETTINGS, DEFAULT_REVERB, DEFAULT_DELAY, DEFAULT_CHORUS, DEFAULT_DUCKING, DUCKING_PRESETS } from '@/effects/types';
import { VUMeter } from './VUMeter';
import { PanKnob } from './PanKnob';
import { EQCurve } from './EQCurve';

const AUDIO_TRACK_TYPES = new Set(['video', 'audio', 'music', 'sfx']);

interface AudioTrackInfo {
  id: string;
  name: string;
}

function ChannelStrip({ trackId, trackName, trackType, muted, audioSettings, otherAudioTracks }: {
  trackId: string;
  trackName: string;
  trackType: string;
  muted: boolean;
  audioSettings?: TrackAudioSettings;
  otherAudioTracks: AudioTrackInfo[];
}) {
  const { t } = useTranslation();
  const toggleTrackMute = useTimelineStore((s) => s.toggleTrackMute);
  const updateTrackAudio = useTimelineStore((s) => s.updateTrackAudio);
  const setDucking = useTimelineStore((s) => s.setDucking);
  const removeDucking = useTimelineStore((s) => s.removeDucking);
  const setDuckingEnvelope = useTimelineStore((s) => s.setDuckingEnvelope);
  const [showEQ, setShowEQ] = useState(false);
  const [showComp, setShowComp] = useState(false);
  const [showReverb, setShowReverb] = useState(false);
  const [showDelay, setShowDelay] = useState(false);
  const [showChorus, setShowChorus] = useState(false);
  const [showDuck, setShowDuck] = useState(false);
  const [isBaking, setIsBaking] = useState(false);

  const audio = audioSettings ?? { volume: 1, pan: 0 };
  const eq = audio.eq ?? DEFAULT_EQ_SETTINGS;
  const comp = audio.compressor ?? DEFAULT_COMPRESSOR_SETTINGS;
  const rev = audio.reverb ?? DEFAULT_REVERB;
  const dly = audio.delay ?? DEFAULT_DELAY;
  const cho = audio.chorus ?? DEFAULT_CHORUS;
  const duck = audio.ducking ?? DEFAULT_DUCKING;

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

  const updateRev = useCallback(
    (revUpdate: Partial<ReverbSettings>) => update({ reverb: { ...rev, ...revUpdate } }),
    [rev, update],
  );

  const updateDly = useCallback(
    (dlyUpdate: Partial<DelaySettings>) => update({ delay: { ...dly, ...dlyUpdate } }),
    [dly, update],
  );

  const updateCho = useCallback(
    (choUpdate: Partial<ChorusSettings>) => update({ chorus: { ...cho, ...choUpdate } }),
    [cho, update],
  );

  const updateDuck = useCallback(
    (duckUpdate: Partial<DuckingSettings>) => setDucking(trackId, duckUpdate),
    [trackId, setDucking],
  );

  const toggleSourceTrack = useCallback(
    (sourceId: string) => {
      const current = duck.sourceTrackIds;
      const next = current.includes(sourceId)
        ? current.filter((id) => id !== sourceId)
        : [...current, sourceId];
      updateDuck({ sourceTrackIds: next });
    },
    [duck.sourceTrackIds, updateDuck],
  );

  const applyPreset = useCallback(
    (preset: DuckingPreset) => {
      updateDuck({ ...DUCKING_PRESETS[preset], preset });
    },
    [updateDuck],
  );

  const handleBake = useCallback(async () => {
    setIsBaking(true);
    try {
      // Use DuckingProcessor's generateEnvelope with current store state
      const { DuckingProcessor } = await import('@/engine/DuckingProcessor');
      const { AudioMixerEngine } = await import('@/engine/AudioMixerEngine');
      const state = useTimelineStore.getState();
      const tracks = state.tracks
        .filter((t) => AUDIO_TRACK_TYPES.has(t.type))
        .map((t) => ({
          id: t.id,
          type: t.type,
          clips: t.clips.map((c) => ({
            id: c.id,
            assetId: c.assetId,
            startTime: c.startTime,
            endTime: c.endTime,
            trimStart: c.trimStart,
            duration: c.duration,
            volume: c.volume ?? 1,
            opacity: 1,
            type: c.type,
          })),
          muted: t.muted,
          visible: t.visible,
          audioSettings: t.audioSettings,
          volume: t.audioSettings?.volume ?? 1,
        }));

      const duration = state.getTimelineDuration();
      const processor = new DuckingProcessor(null as unknown as InstanceType<typeof AudioMixerEngine>);
      const envelope = processor.generateEnvelope(
        duck.sourceTrackIds,
        tracks,
        duck,
        duration,
      );
      setDuckingEnvelope(trackId, envelope);
    } finally {
      setIsBaking(false);
    }
  }, [trackId, duck, setDuckingEnvelope]);

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

      {/* Reverb section */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => updateRev({ enabled: !rev.enabled })}
          className={`rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors ${
            rev.enabled
              ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
              : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)]'
          }`}
        >
          REV
        </button>
        {rev.enabled && (
          <button
            onClick={() => setShowReverb(!showReverb)}
            className="text-[9px] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
          >
            {Math.round(rev.mix * 100)}% / {rev.decay.toFixed(1)}s
          </button>
        )}
      </div>

      {/* Expanded reverb controls */}
      {showReverb && rev.enabled && (
        <div className="flex flex-col gap-1 pl-1">
          <div className="flex items-center gap-1.5">
            <span className="w-8 text-[9px] text-[var(--color-text-secondary)]">Mix</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={rev.mix}
              onChange={(e) => updateRev({ mix: Number(e.target.value) })}
              className="h-1 flex-1 accent-[var(--accent)]"
            />
            <span className="w-10 text-right text-[9px] text-[var(--color-text-secondary)]">
              {Math.round(rev.mix * 100)}%
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-8 text-[9px] text-[var(--color-text-secondary)]">{t('reverb.decay')}</span>
            <input
              type="range"
              min={0.1}
              max={10}
              step={0.1}
              value={rev.decay}
              onChange={(e) => updateRev({ decay: Number(e.target.value) })}
              className="h-1 flex-1 accent-[var(--accent)]"
            />
            <span className="w-10 text-right text-[9px] text-[var(--color-text-secondary)]">
              {rev.decay.toFixed(1)}s
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-8 text-[9px] text-[var(--color-text-secondary)]">Pre</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={rev.preDelay}
              onChange={(e) => updateRev({ preDelay: Number(e.target.value) })}
              className="h-1 flex-1 accent-[var(--accent)]"
            />
            <span className="w-10 text-right text-[9px] text-[var(--color-text-secondary)]">
              {rev.preDelay}ms
            </span>
          </div>
        </div>
      )}

      {/* Delay section */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => updateDly({ enabled: !dly.enabled })}
          className={`rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors ${
            dly.enabled
              ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
              : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)]'
          }`}
        >
          DLY
        </button>
        {dly.enabled && (
          <button
            onClick={() => setShowDelay(!showDelay)}
            className="text-[9px] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
          >
            {Math.round(dly.time * 1000)}ms / {Math.round(dly.feedback * 100)}%
          </button>
        )}
      </div>

      {/* Expanded delay controls */}
      {showDelay && dly.enabled && (
        <div className="flex flex-col gap-1 pl-1">
          <div className="flex items-center gap-1.5">
            <span className="w-8 text-[9px] text-[var(--color-text-secondary)]">Mix</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={dly.mix}
              onChange={(e) => updateDly({ mix: Number(e.target.value) })}
              className="h-1 flex-1 accent-[var(--accent)]"
            />
            <span className="w-10 text-right text-[9px] text-[var(--color-text-secondary)]">
              {Math.round(dly.mix * 100)}%
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-8 text-[9px] text-[var(--color-text-secondary)]">{t('delay.time')}</span>
            <input
              type="range"
              min={10}
              max={2000}
              step={10}
              value={dly.time * 1000}
              onChange={(e) => updateDly({ time: Number(e.target.value) / 1000 })}
              className="h-1 flex-1 accent-[var(--accent)]"
            />
            <span className="w-10 text-right text-[9px] text-[var(--color-text-secondary)]">
              {Math.round(dly.time * 1000)}ms
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-8 text-[9px] text-[var(--color-text-secondary)]">Fdbk</span>
            <input
              type="range"
              min={0}
              max={0.9}
              step={0.01}
              value={dly.feedback}
              onChange={(e) => updateDly({ feedback: Number(e.target.value) })}
              className="h-1 flex-1 accent-[var(--accent)]"
            />
            <span className="w-10 text-right text-[9px] text-[var(--color-text-secondary)]">
              {Math.round(dly.feedback * 100)}%
            </span>
          </div>
        </div>
      )}

      {/* Chorus section */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => updateCho({ enabled: !cho.enabled })}
          className={`rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors ${
            cho.enabled
              ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
              : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)]'
          }`}
        >
          CHO
        </button>
        {cho.enabled && (
          <button
            onClick={() => setShowChorus(!showChorus)}
            className="text-[9px] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
          >
            {cho.rate.toFixed(1)}Hz / {(cho.depth * 1000).toFixed(0)}ms
          </button>
        )}
      </div>

      {/* Expanded chorus controls */}
      {showChorus && cho.enabled && (
        <div className="flex flex-col gap-1 pl-1">
          <div className="flex items-center gap-1.5">
            <span className="w-8 text-[9px] text-[var(--color-text-secondary)]">Mix</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={cho.mix}
              onChange={(e) => updateCho({ mix: Number(e.target.value) })}
              className="h-1 flex-1 accent-[var(--accent)]"
            />
            <span className="w-10 text-right text-[9px] text-[var(--color-text-secondary)]">
              {Math.round(cho.mix * 100)}%
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-8 text-[9px] text-[var(--color-text-secondary)]">{t('chorus.rate')}</span>
            <input
              type="range"
              min={0.1}
              max={8}
              step={0.1}
              value={cho.rate}
              onChange={(e) => updateCho({ rate: Number(e.target.value) })}
              className="h-1 flex-1 accent-[var(--accent)]"
            />
            <span className="w-10 text-right text-[9px] text-[var(--color-text-secondary)]">
              {cho.rate.toFixed(1)}Hz
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-8 text-[9px] text-[var(--color-text-secondary)]">{t('chorus.depth')}</span>
            <input
              type="range"
              min={1}
              max={20}
              step={0.5}
              value={cho.depth * 1000}
              onChange={(e) => updateCho({ depth: Number(e.target.value) / 1000 })}
              className="h-1 flex-1 accent-[var(--accent)]"
            />
            <span className="w-10 text-right text-[9px] text-[var(--color-text-secondary)]">
              {(cho.depth * 1000).toFixed(0)}ms
            </span>
          </div>
        </div>
      )}

      {/* Ducking section */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => {
            if (duck.enabled) {
              removeDucking(trackId);
            } else {
              updateDuck({ enabled: true });
            }
          }}
          className={`rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors ${
            duck.enabled
              ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
              : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)]'
          }`}
        >
          DCK
        </button>
        {duck.enabled && (
          <button
            onClick={() => setShowDuck(!showDuck)}
            className="text-[9px] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
          >
            {duck.sourceTrackIds.length} src / -{Math.round((1 - duck.reduction) * 100)}%
          </button>
        )}
      </div>

      {/* Expanded ducking controls */}
      {showDuck && duck.enabled && (
        <div className="flex flex-col gap-1.5 pl-1">
          {/* Source track selector */}
          <div className="text-[9px] text-[var(--color-text-secondary)]">
            {t('ducking.source')}
          </div>
          {otherAudioTracks.length === 0 ? (
            <div className="text-[8px] text-[var(--color-text-secondary)] italic">
              {t('ducking.noSource')}
            </div>
          ) : (
            otherAudioTracks.map((at) => (
              <label key={at.id} className="flex items-center gap-1.5 text-[9px] text-[var(--color-text)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={duck.sourceTrackIds.includes(at.id)}
                  onChange={() => toggleSourceTrack(at.id)}
                  className="h-3 w-3 accent-[var(--accent)]"
                />
                {at.name}
              </label>
            ))
          )}

          {/* Preset */}
          <select
            value={duck.preset}
            onChange={(e) => applyPreset(e.target.value as DuckingPreset)}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-[9px] text-[var(--color-text)] outline-none"
          >
            <option value="dialogueOverMusic">{t('ducking.presetDialogue')}</option>
            <option value="voiceover">{t('ducking.presetVoiceover')}</option>
            <option value="podcast">{t('ducking.presetPodcast')}</option>
            <option value="custom">{t('ducking.presetCustom')}</option>
          </select>

          {/* Threshold */}
          <div className="flex items-center gap-1.5">
            <span className="w-8 text-[9px] text-[var(--color-text-secondary)]">Thr</span>
            <input
              type="range"
              min={0}
              max={0.3}
              step={0.005}
              value={duck.threshold}
              onChange={(e) => updateDuck({ threshold: Number(e.target.value), preset: 'custom' })}
              className="h-1 flex-1 accent-[var(--accent)]"
            />
            <span className="w-10 text-right text-[9px] text-[var(--color-text-secondary)]">
              {duck.threshold.toFixed(3)}
            </span>
          </div>

          {/* Reduction */}
          <div className="flex items-center gap-1.5">
            <span className="w-8 text-[9px] text-[var(--color-text-secondary)]">Red</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={duck.reduction}
              onChange={(e) => updateDuck({ reduction: Number(e.target.value), preset: 'custom' })}
              className="h-1 flex-1 accent-[var(--accent)]"
            />
            <span className="w-10 text-right text-[9px] text-[var(--color-text-secondary)]">
              -{Math.round((1 - duck.reduction) * 100)}%
            </span>
          </div>

          {/* Attack */}
          <div className="flex items-center gap-1.5">
            <span className="w-8 text-[9px] text-[var(--color-text-secondary)]">Atk</span>
            <input
              type="range"
              min={5}
              max={500}
              step={5}
              value={duck.attackMs}
              onChange={(e) => updateDuck({ attackMs: Number(e.target.value), preset: 'custom' })}
              className="h-1 flex-1 accent-[var(--accent)]"
            />
            <span className="w-10 text-right text-[9px] text-[var(--color-text-secondary)]">
              {duck.attackMs}ms
            </span>
          </div>

          {/* Release */}
          <div className="flex items-center gap-1.5">
            <span className="w-8 text-[9px] text-[var(--color-text-secondary)]">Rel</span>
            <input
              type="range"
              min={50}
              max={2000}
              step={10}
              value={duck.releaseMs}
              onChange={(e) => updateDuck({ releaseMs: Number(e.target.value), preset: 'custom' })}
              className="h-1 flex-1 accent-[var(--accent)]"
            />
            <span className="w-10 text-right text-[9px] text-[var(--color-text-secondary)]">
              {duck.releaseMs}ms
            </span>
          </div>

          {/* Bake + Clear buttons */}
          <div className="flex gap-1.5">
            <button
              onClick={handleBake}
              disabled={isBaking || duck.sourceTrackIds.length === 0}
              className="flex-1 rounded px-2 py-1 text-[9px] bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/30 transition-colors disabled:opacity-40"
            >
              {isBaking ? t('ducking.baking') : t('ducking.bake')}
            </button>
            {audio.duckingEnvelope && (
              <button
                onClick={() => setDuckingEnvelope(trackId, [])}
                className="rounded px-2 py-1 text-[9px] text-red-400 hover:bg-red-500/10 transition-colors"
              >
                {t('ducking.clearEnvelope')}
              </button>
            )}
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
            otherAudioTracks={audioTracks
              .filter((t) => t.id !== track.id)
              .map((t) => ({ id: t.id, name: t.name }))}
          />
        ))
      )}
    </div>
  );
}

export default React.memo(AudioMixerPanelComponent);
