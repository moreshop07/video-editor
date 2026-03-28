import { useTranslation } from 'react-i18next';
import type { TransitionType, Transition } from '@/types/transitions';
import { useTransitionRegistry } from '@/plugins/hooks';

interface TransitionPickerProps {
  value: Transition | undefined;
  onChange: (transition: Transition | undefined) => void;
  disabled?: boolean;
}

const DEFAULT_DURATION = 500;

export function TransitionPicker({ value, onChange, disabled }: TransitionPickerProps) {
  const registeredTransitions = useTransitionRegistry();

  const TRANSITIONS: { type: TransitionType; icon: string; nameKey: string }[] = [
    { type: 'none', icon: '✕', nameKey: 'transition.none' },
    ...registeredTransitions.map((t) => ({ type: t.type as TransitionType, icon: t.icon, nameKey: t.nameKey })),
  ];
  const { t } = useTranslation();

  const currentType = value?.type ?? 'none';
  const currentDuration = value?.durationMs ?? DEFAULT_DURATION;

  const handleTypeChange = (type: TransitionType) => {
    if (type === 'none') {
      onChange(undefined);
    } else {
      onChange({
        type,
        durationMs: currentDuration,
      });
    }
  };

  const handleDurationChange = (durationMs: number) => {
    if (currentType === 'none') return;
    onChange({
      type: currentType,
      durationMs,
    });
  };

  return (
    <div className="p-3">
      <h4 className="mb-3 text-xs font-medium text-[var(--color-text)]">
        {t('transition.title')}
      </h4>

      {/* Transition type grid */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {TRANSITIONS.map(({ type, icon, nameKey }) => (
          <button
            key={type}
            onClick={() => handleTypeChange(type)}
            disabled={disabled}
            className={`flex flex-col items-center justify-center p-2 rounded border transition-all ${
              currentType === type
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/20 text-[var(--color-primary)]'
                : 'border-[var(--color-border)] hover:border-[var(--color-primary)] text-[var(--color-text)]'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={t(nameKey)}
          >
            <span className="text-lg mb-1">{icon}</span>
            <span className="text-[9px] truncate w-full text-center">
              {t(nameKey)}
            </span>
          </button>
        ))}
      </div>

      {/* Duration slider - only show when a transition is selected */}
      {currentType !== 'none' && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--color-text-secondary)] whitespace-nowrap">
            {t('transition.duration')}
          </span>
          <input
            type="range"
            min={100}
            max={2000}
            step={100}
            value={currentDuration}
            onChange={(e) => handleDurationChange(Number(e.target.value))}
            disabled={disabled}
            className="flex-1 h-1 bg-[var(--color-border)] rounded-lg appearance-none cursor-pointer accent-[var(--color-primary)]"
          />
          <span className="text-xs text-[var(--color-text)] w-14 text-right">
            {currentDuration}ms
          </span>
        </div>
      )}
    </div>
  );
}
