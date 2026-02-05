import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/projectStore';
import type { AutoSaveStatus } from '@/store/projectStore';

const STATUS_CONFIG: Record<AutoSaveStatus, { color: string; animateClass: string }> = {
  saved: { color: 'bg-green-500', animateClass: '' },
  saving: { color: 'bg-yellow-500', animateClass: 'animate-pulse' },
  unsaved: { color: 'bg-orange-500', animateClass: '' },
  error: { color: 'bg-red-500', animateClass: '' },
};

export default function SaveIndicator() {
  const { t } = useTranslation();
  const autoSaveStatus = useProjectStore((s) => s.autoSaveStatus);
  const config = STATUS_CONFIG[autoSaveStatus];

  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`h-1.5 w-1.5 rounded-full ${config.color} ${config.animateClass}`}
      />
      <span className="text-[10px] text-[var(--color-text-secondary)]">
        {t(`autoSave.${autoSaveStatus}`)}
      </span>
    </div>
  );
}
