import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/projectStore';
import { useTimelineStore, serializeForSave } from '@/store/timelineStore';
import { useTemplateStore } from '@/store/templateStore';

interface SaveAsTemplateDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function SaveAsTemplateDialog({ open, onClose }: SaveAsTemplateDialogProps) {
  const { t } = useTranslation();
  const project = useProjectStore((s) => s.currentProject);
  const timelineState = useTimelineStore();
  const { createUserTemplate, isSaving } = useTemplateStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('custom');
  const [error, setError] = useState('');

  const handleSave = useCallback(async () => {
    if (!name.trim()) return;
    setError('');
    try {
      const projectData = serializeForSave(timelineState);
      await createUserTemplate({
        name: name.trim(),
        description: description.trim() || undefined,
        category,
        template_data: projectData as unknown as Record<string, unknown>,
        width: project?.width ?? 1920,
        height: project?.height ?? 1080,
        fps: project?.fps ?? 30,
      });
      setName('');
      setDescription('');
      setCategory('custom');
      onClose();
    } catch {
      setError(t('template.saveFailed'));
    }
  }, [name, description, category, timelineState, project, createUserTemplate, onClose, t]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xl">
        <h2 className="mb-4 text-sm font-semibold text-[var(--color-text)]">
          {t('template.saveAsTitle')}
        </h2>

        {/* Name */}
        <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">
          {t('template.saveName')} *
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mb-3 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
          placeholder={t('template.saveName')}
          autoFocus
        />

        {/* Description */}
        <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">
          {t('template.saveDescription')}
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mb-3 w-full resize-none rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
          rows={2}
          placeholder={t('template.saveDescription')}
        />

        {/* Category */}
        <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">
          {t('template.saveCategory')}
        </label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="mb-3 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none"
        >
          <option value="custom">{t('template.category.custom')}</option>
          <option value="social">{t('template.category.social')}</option>
          <option value="professional">{t('template.category.professional')}</option>
          <option value="creative">{t('template.category.creative')}</option>
          <option value="marketing">{t('template.category.marketing')}</option>
        </select>

        {/* Dimensions (read-only) */}
        <p className="mb-4 text-[10px] text-[var(--color-text-secondary)]">
          {project?.width ?? 1920}x{project?.height ?? 1080} &middot; {project?.fps ?? 30}fps
        </p>

        {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded border border-[var(--color-border)] px-4 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)]"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || isSaving}
            className="rounded bg-[var(--color-primary)] px-4 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {isSaving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
