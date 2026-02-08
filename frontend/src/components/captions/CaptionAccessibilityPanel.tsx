import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSubtitleStore, type CaptionStyle } from '@/store/subtitleStore';
import { useAssetStore } from '@/store/assetStore';
import { useTimelineStore } from '@/store/timelineStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CaptionTab = 'styling' | 'speakers' | 'audit' | 'soundDesc';

interface AuditIssue {
  segmentId: number;
  segmentIndex: number;
  type: 'wpm' | 'min_display' | 'contrast' | 'line_length';
  severity: 'error' | 'warning';
  message: string;
  value: number;
}

// ---------------------------------------------------------------------------
// Style presets
// ---------------------------------------------------------------------------

const STYLE_PRESETS: Record<string, CaptionStyle> = {
  default: {
    fontSize: 0.045,
    fontFamily: '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif',
    fontColor: '#FFFFFF',
    fontWeight: 'bold',
    bgColor: '#000000',
    bgOpacity: 0.6,
    position: 'bottom',
    outline: true,
  },
  youtube: {
    fontSize: 0.05,
    fontFamily: '"Roboto", "Arial", sans-serif',
    fontColor: '#FFFFFF',
    fontWeight: 'bold',
    bgColor: '#000000',
    bgOpacity: 0.75,
    position: 'bottom',
    outline: false,
  },
  netflix: {
    fontSize: 0.04,
    fontFamily: '"Helvetica Neue", "Arial", sans-serif',
    fontColor: '#FFFFFF',
    fontWeight: 'normal',
    bgColor: '#000000',
    bgOpacity: 0,
    position: 'bottom',
    outline: true,
  },
  minimal: {
    fontSize: 0.035,
    fontFamily: '"Arial", sans-serif',
    fontColor: '#E0E0E0',
    fontWeight: 'normal',
    bgColor: '#000000',
    bgOpacity: 0.3,
    position: 'bottom',
    outline: false,
  },
  highContrast: {
    fontSize: 0.055,
    fontFamily: '"Arial", sans-serif',
    fontColor: '#FFFF00',
    fontWeight: 'bold',
    bgColor: '#000000',
    bgOpacity: 0.9,
    position: 'bottom',
    outline: true,
  },
};

// ---------------------------------------------------------------------------
// Speaker color palette
// ---------------------------------------------------------------------------

const SPEAKER_COLORS = [
  '#60A5FA', '#34D399', '#F472B6', '#FBBF24', '#A78BFA',
  '#FB923C', '#2DD4BF', '#E879F9', '#F87171', '#4ADE80',
];

// ---------------------------------------------------------------------------
// Accessibility audit helpers
// ---------------------------------------------------------------------------

function hexToLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function computeContrastRatio(fg: string, bg: string): number {
  const l1 = hexToLuminance(fg);
  const l2 = hexToLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function computeAccessibilityAudit(
  segments: { id: number; index: number; start_ms: number; end_ms: number; text: string }[],
  style: CaptionStyle | null,
): { score: number; issues: AuditIssue[] } {
  const issues: AuditIssue[] = [];

  for (const seg of segments) {
    const durationSec = (seg.end_ms - seg.start_ms) / 1000;
    const wordCount = seg.text.trim().split(/\s+/).length;

    const wpm = durationSec > 0 ? (wordCount / durationSec) * 60 : 0;
    if (wpm > 200) {
      issues.push({
        segmentId: seg.id, segmentIndex: seg.index,
        type: 'wpm', severity: 'error',
        message: `${Math.round(wpm)} WPM (max 200)`,
        value: wpm,
      });
    } else if (wpm > 160) {
      issues.push({
        segmentId: seg.id, segmentIndex: seg.index,
        type: 'wpm', severity: 'warning',
        message: `${Math.round(wpm)} WPM (recommended < 160)`,
        value: wpm,
      });
    }

    if (durationSec < 1.0) {
      issues.push({
        segmentId: seg.id, segmentIndex: seg.index,
        type: 'min_display', severity: 'error',
        message: `${durationSec.toFixed(1)}s (min 1.0s)`,
        value: durationSec,
      });
    }

    const lines = seg.text.split('\n');
    for (const line of lines) {
      if (line.length > 42) {
        issues.push({
          segmentId: seg.id, segmentIndex: seg.index,
          type: 'line_length', severity: 'warning',
          message: `${line.length} chars (max 42)`,
          value: line.length,
        });
        break;
      }
    }
  }

  const fontColor = style?.fontColor ?? '#FFFFFF';
  const bgColor = style?.bgColor ?? '#000000';
  const ratio = computeContrastRatio(fontColor, bgColor);
  if (ratio < 4.5) {
    issues.push({
      segmentId: 0, segmentIndex: -1,
      type: 'contrast', severity: 'error',
      message: `${ratio.toFixed(1)}:1 (min 4.5:1)`,
      value: ratio,
    });
  }

  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  const score = Math.max(0, 100 - errors * 10 - warnings * 3);

  return { score, issues };
}

// ---------------------------------------------------------------------------
// Styling Section
// ---------------------------------------------------------------------------

function StylingSection() {
  const { t } = useTranslation();
  const { tracks, activeTrackId, updateTrackStyle } = useSubtitleStore();
  const activeTrack = tracks.find((tr) => tr.id === activeTrackId);

  const currentStyle: CaptionStyle = activeTrack?.style ?? STYLE_PRESETS.default;

  const update = useCallback(
    (patch: Partial<CaptionStyle>) => {
      if (!activeTrackId) return;
      updateTrackStyle(activeTrackId, { ...currentStyle, ...patch });
    },
    [activeTrackId, currentStyle, updateTrackStyle],
  );

  if (!activeTrack) {
    return <p className="text-xs text-[var(--text-secondary)]">{t('captions.styling.noTrack')}</p>;
  }

  return (
    <div className="space-y-3">
      {/* Presets */}
      <div>
        <label className="mb-1 block text-[10px] text-[var(--text-secondary)]">
          {t('captions.styling.presets')}
        </label>
        <div className="flex flex-wrap gap-1">
          {Object.entries(STYLE_PRESETS).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => activeTrackId && updateTrackStyle(activeTrackId, preset)}
              className="rounded bg-white/10 px-2 py-1 text-[10px] hover:bg-white/20"
            >
              {t(`captions.styling.preset${key.charAt(0).toUpperCase() + key.slice(1)}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Font Family */}
      <div>
        <label className="mb-1 block text-[10px] text-[var(--text-secondary)]">
          {t('captions.styling.fontFamily')}
        </label>
        <select
          value={currentStyle.fontFamily ?? ''}
          onChange={(e) => update({ fontFamily: e.target.value })}
          className="w-full rounded bg-[var(--bg-secondary)] px-2 py-1 text-xs"
        >
          <option value='"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif'>Noto Sans TC</option>
          <option value='"Arial", sans-serif'>Arial</option>
          <option value='"Roboto", "Arial", sans-serif'>Roboto</option>
          <option value='"Helvetica Neue", "Arial", sans-serif'>Helvetica Neue</option>
          <option value='"Georgia", serif'>Georgia</option>
          <option value='"Courier New", monospace'>Courier New</option>
        </select>
      </div>

      {/* Font Size */}
      <div>
        <label className="mb-1 block text-[10px] text-[var(--text-secondary)]">
          {t('captions.styling.fontSize')} ({Math.round((currentStyle.fontSize ?? 0.045) * 100)}%)
        </label>
        <input
          type="range"
          min={0.02}
          max={0.08}
          step={0.005}
          value={currentStyle.fontSize ?? 0.045}
          onChange={(e) => update({ fontSize: parseFloat(e.target.value) })}
          className="w-full"
        />
      </div>

      {/* Font Color */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-[var(--text-secondary)]">
          {t('captions.styling.fontColor')}
        </label>
        <input
          type="color"
          value={currentStyle.fontColor ?? '#FFFFFF'}
          onChange={(e) => update({ fontColor: e.target.value })}
          className="h-6 w-6 cursor-pointer rounded border-0"
        />
      </div>

      {/* Font Weight */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-[var(--text-secondary)]">
          {t('captions.styling.fontWeight')}
        </label>
        <div className="flex gap-1">
          {(['normal', 'bold'] as const).map((w) => (
            <button
              key={w}
              onClick={() => update({ fontWeight: w })}
              className={`rounded px-2 py-0.5 text-[10px] ${
                (currentStyle.fontWeight ?? 'bold') === w
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* Background Color */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-[var(--text-secondary)]">
          {t('captions.styling.bgColor')}
        </label>
        <input
          type="color"
          value={currentStyle.bgColor ?? '#000000'}
          onChange={(e) => update({ bgColor: e.target.value })}
          className="h-6 w-6 cursor-pointer rounded border-0"
        />
      </div>

      {/* Background Opacity */}
      <div>
        <label className="mb-1 block text-[10px] text-[var(--text-secondary)]">
          {t('captions.styling.bgOpacity')} ({Math.round((currentStyle.bgOpacity ?? 0.6) * 100)}%)
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={currentStyle.bgOpacity ?? 0.6}
          onChange={(e) => update({ bgOpacity: parseFloat(e.target.value) })}
          className="w-full"
        />
      </div>

      {/* Position */}
      <div>
        <label className="mb-1 block text-[10px] text-[var(--text-secondary)]">
          {t('captions.styling.position')}
        </label>
        <div className="flex gap-1">
          {(['top', 'center', 'bottom'] as const).map((pos) => (
            <button
              key={pos}
              onClick={() => update({ position: pos })}
              className={`flex-1 rounded px-2 py-1 text-[10px] ${
                (currentStyle.position ?? 'bottom') === pos
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              {t(`captions.styling.position${pos.charAt(0).toUpperCase() + pos.slice(1)}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Outline */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={currentStyle.outline ?? true}
          onChange={(e) => update({ outline: e.target.checked })}
          className="h-3.5 w-3.5"
        />
        <label className="text-[10px] text-[var(--text-secondary)]">
          {t('captions.styling.outline')}
        </label>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Speaker Section
// ---------------------------------------------------------------------------

function SpeakerSection() {
  const { t } = useTranslation();
  const {
    tracks, activeTrackId,
    isSpeakerDetecting, speakerDetectProgress,
    detectSpeakers,
  } = useSubtitleStore();
  const activeTrack = tracks.find((tr) => tr.id === activeTrackId);

  if (!activeTrack || activeTrack.segments.length === 0) {
    return <p className="text-xs text-[var(--text-secondary)]">{t('captions.speakers.noTrack')}</p>;
  }

  const speakers = [...new Set(activeTrack.segments.map((s) => s.speaker).filter(Boolean))] as string[];
  const speakerColorMap: Record<string, string> = {};
  speakers.forEach((sp, i) => {
    speakerColorMap[sp] = SPEAKER_COLORS[i % SPEAKER_COLORS.length];
  });

  return (
    <div className="space-y-3">
      <button
        onClick={() => detectSpeakers(activeTrack.id)}
        disabled={isSpeakerDetecting}
        className="w-full rounded bg-[var(--accent)] px-3 py-1.5 text-xs text-white disabled:opacity-50"
      >
        {isSpeakerDetecting ? t('captions.speakers.detecting') : t('captions.speakers.detect')}
      </button>

      {isSpeakerDetecting && (
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-[var(--accent)] transition-all"
            style={{ width: `${speakerDetectProgress}%` }}
          />
        </div>
      )}

      {speakers.length > 0 && (
        <>
          <p className="text-[10px] text-[var(--text-secondary)]">
            {t('captions.speakers.speakerCount', { count: speakers.length })}
          </p>
          <div className="space-y-1">
            {speakers.map((sp) => (
              <div key={sp} className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: speakerColorMap[sp] }}
                />
                <span className="text-xs">{sp}</span>
              </div>
            ))}
          </div>
          <div className="max-h-60 space-y-1 overflow-y-auto">
            {activeTrack.segments.map((seg) => (
              <div key={seg.id} className="flex gap-2 rounded bg-white/5 px-2 py-1 text-[10px]">
                {seg.speaker && (
                  <span
                    className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: speakerColorMap[seg.speaker] ?? '#888', marginTop: 4 }}
                  />
                )}
                <span className="text-[var(--text-secondary)]">
                  {Math.floor(seg.start_ms / 1000)}s
                </span>
                <span className="flex-1 truncate">{seg.text}</span>
                <span className="text-[var(--text-secondary)]">{seg.speaker ?? '-'}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit Section
// ---------------------------------------------------------------------------

function AuditSection() {
  const { t } = useTranslation();
  const { tracks, activeTrackId } = useSubtitleStore();
  const seekTo = useTimelineStore((s) => s.seekTo);
  const activeTrack = tracks.find((tr) => tr.id === activeTrackId);
  const [auditResult, setAuditResult] = useState<{
    score: number;
    issues: AuditIssue[];
  } | null>(null);

  if (!activeTrack || activeTrack.segments.length === 0) {
    return <p className="text-xs text-[var(--text-secondary)]">{t('captions.audit.noTrack')}</p>;
  }

  const runAudit = () => {
    const result = computeAccessibilityAudit(activeTrack.segments, activeTrack.style);
    setAuditResult(result);
  };

  const scoreColor =
    auditResult && auditResult.score >= 80
      ? '#34D399'
      : auditResult && auditResult.score >= 50
        ? '#FBBF24'
        : '#F87171';

  return (
    <div className="space-y-3">
      <button
        onClick={runAudit}
        className="w-full rounded bg-[var(--accent)] px-3 py-1.5 text-xs text-white"
      >
        {t('captions.audit.runAudit')}
      </button>

      {auditResult && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--text-secondary)]">
              {t('captions.audit.score')}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-xs font-bold"
              style={{ backgroundColor: scoreColor, color: '#000' }}
            >
              {auditResult.score}
            </span>
          </div>

          {auditResult.issues.length === 0 ? (
            <p className="text-xs text-green-400">{t('captions.audit.noIssues')}</p>
          ) : (
            <div className="max-h-72 space-y-1 overflow-y-auto">
              <p className="text-[10px] text-[var(--text-secondary)]">
                {t('captions.audit.issueCount', { count: auditResult.issues.length })}
              </p>
              {auditResult.issues.map((issue, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 rounded bg-white/5 px-2 py-1.5 text-[10px]"
                >
                  <span
                    className={`mt-0.5 flex-shrink-0 rounded px-1 py-0.5 text-[8px] font-bold ${
                      issue.severity === 'error'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-yellow-500/20 text-yellow-400'
                    }`}
                  >
                    {issue.severity === 'error' ? t('captions.audit.error') : t('captions.audit.warning')}
                  </span>
                  <div className="flex-1">
                    <span className="text-[var(--text-secondary)]">
                      {t(`captions.audit.${issue.type}`)}:
                    </span>{' '}
                    {issue.message}
                  </div>
                  {issue.segmentIndex >= 0 && (
                    <button
                      onClick={() => seekTo(issue.segmentId > 0 ? activeTrack.segments.find((s) => s.id === issue.segmentId)?.start_ms ?? 0 : 0)}
                      className="flex-shrink-0 text-[var(--accent)] hover:underline"
                    >
                      #{issue.segmentIndex}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sound Description Section
// ---------------------------------------------------------------------------

function SoundDescSection() {
  const { t } = useTranslation();
  const {
    tracks, activeTrackId,
    isSoundDescribing, soundDescribeProgress,
    describeSounds,
  } = useSubtitleStore();
  const assets = useAssetStore((s) => s.assets);
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const activeTrack = tracks.find((tr) => tr.id === activeTrackId);

  const videoAssets = useMemo(
    () => assets.filter((a) => a.asset_type === 'video'),
    [assets],
  );

  if (!activeTrack || activeTrack.segments.length === 0) {
    return <p className="text-xs text-[var(--text-secondary)]">{t('captions.soundDesc.noTrack')}</p>;
  }

  const descriptionSegments = activeTrack.segments.filter(
    (s) => s.speaker === '[DESCRIPTION]',
  );

  return (
    <div className="space-y-3">
      {/* Asset selector */}
      <div>
        <label className="mb-1 block text-[10px] text-[var(--text-secondary)]">
          {t('captions.soundDesc.selectAsset')}
        </label>
        <select
          value={selectedAssetId ?? ''}
          onChange={(e) => setSelectedAssetId(e.target.value ? Number(e.target.value) : null)}
          className="w-full rounded bg-[var(--bg-secondary)] px-2 py-1 text-xs"
        >
          <option value="">--</option>
          {videoAssets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.original_filename ?? `Asset #${a.id}`}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={() => selectedAssetId && describeSounds(activeTrack.id, selectedAssetId)}
        disabled={isSoundDescribing || !selectedAssetId}
        className="w-full rounded bg-[var(--accent)] px-3 py-1.5 text-xs text-white disabled:opacity-50"
      >
        {isSoundDescribing ? t('captions.soundDesc.generating') : t('captions.soundDesc.generate')}
      </button>

      {isSoundDescribing && (
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-[var(--accent)] transition-all"
            style={{ width: `${soundDescribeProgress}%` }}
          />
        </div>
      )}

      {descriptionSegments.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-[var(--text-secondary)]">
            {t('captions.soundDesc.insertedCount', { count: descriptionSegments.length })}
          </p>
          {descriptionSegments.map((seg) => (
            <div
              key={seg.id}
              className="flex items-center gap-2 rounded bg-white/5 px-2 py-1 text-[10px]"
            >
              <span className="font-bold text-yellow-400">{seg.text}</span>
              <span className="text-[var(--text-secondary)]">
                {(seg.start_ms / 1000).toFixed(1)}s – {(seg.end_ms / 1000).toFixed(1)}s
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export default function CaptionAccessibilityPanel() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<CaptionTab>('styling');

  const tabs: { key: CaptionTab; label: string }[] = [
    { key: 'styling', label: t('captions.styling.title') },
    { key: 'speakers', label: t('captions.speakers.title') },
    { key: 'audit', label: t('captions.audit.title') },
    { key: 'soundDesc', label: t('captions.soundDesc.title') },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-white/10">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-1 py-2 text-[10px] transition-colors ${
              activeTab === tab.key
                ? 'border-b-2 border-[var(--accent)] text-[var(--accent)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'styling' && <StylingSection />}
        {activeTab === 'speakers' && <SpeakerSection />}
        {activeTab === 'audit' && <AuditSection />}
        {activeTab === 'soundDesc' && <SoundDescSection />}
      </div>
    </div>
  );
}
