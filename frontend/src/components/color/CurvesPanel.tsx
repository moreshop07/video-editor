import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { CurvesSettings, CurvePoint } from '@/effects/types';
import { DEFAULT_CURVE_POINTS } from '@/effects/types';
import { CurveEditor } from './CurveEditor';
import { CURVE_PRESETS } from '@/effects/curvePresets';

type CurveChannel = 'master' | 'red' | 'green' | 'blue';

const CHANNEL_COLORS: Record<CurveChannel, string> = {
  master: '#FFFFFF',
  red: '#EF4444',
  green: '#22C55E',
  blue: '#3B82F6',
};

interface CurvesPanelProps {
  curves: CurvesSettings;
  onChange: (curves: CurvesSettings) => void;
}

export function CurvesPanel({ curves, onChange }: CurvesPanelProps) {
  const { t } = useTranslation();
  const [activeChannel, setActiveChannel] = useState<CurveChannel>('master');

  const handleCurveChange = useCallback(
    (points: CurvePoint[]) => {
      onChange({ ...curves, [activeChannel]: points });
    },
    [curves, activeChannel, onChange],
  );

  const handleReset = useCallback(() => {
    onChange({
      ...curves,
      [activeChannel]: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    });
  }, [curves, activeChannel, onChange]);

  const handlePreset = useCallback(
    (presetId: string) => {
      const preset = CURVE_PRESETS.find((p) => p.id === presetId);
      if (preset) {
        onChange(preset.curves);
      }
    },
    [onChange],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
          {t('curves.title')}
        </div>
        <button
          onClick={handleReset}
          className="text-[9px] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
        >
          {t('curves.reset')}
        </button>
      </div>

      {/* Channel tabs */}
      <div className="flex gap-1">
        {(['master', 'red', 'green', 'blue'] as CurveChannel[]).map((ch) => (
          <button
            key={ch}
            onClick={() => setActiveChannel(ch)}
            className={`flex-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
              activeChannel === ch
                ? 'bg-white/15 text-white'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-white/5'
            }`}
            style={activeChannel === ch ? { color: CHANNEL_COLORS[ch] } : undefined}
          >
            {t(`curves.${ch}`)}
          </button>
        ))}
      </div>

      {/* Curve editor */}
      <CurveEditor
        points={curves[activeChannel]}
        onChange={handleCurveChange}
        color={CHANNEL_COLORS[activeChannel]}
      />

      {/* Presets */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-[var(--color-text-secondary)]">
          {t('curves.preset')}
        </label>
        <select
          onChange={(e) => {
            if (e.target.value) handlePreset(e.target.value);
            e.target.value = '';
          }}
          defaultValue=""
          className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
        >
          <option value="" disabled>—</option>
          {CURVE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{t(p.labelKey)}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
