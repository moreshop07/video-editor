import { useTranslation } from 'react-i18next';
import { TEMPLATES, type Template } from '@/data/templates';

interface TemplateGalleryProps {
  onSelect: (template: Template) => void;
  disabled?: boolean;
}

export function TemplateGallery({ onSelect, disabled }: TemplateGalleryProps) {
  const { t } = useTranslation();

  return (
    <div className="mb-8">
      <h2 className="mb-4 text-sm font-medium text-[var(--color-text)]">
        {t('template.title')}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {TEMPLATES.map((template) => (
          <button
            key={template.id}
            onClick={() => onSelect(template)}
            disabled={disabled}
            className="group overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-left transition-all hover:border-[var(--color-primary)] hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {/* Thumbnail */}
            <div className="flex aspect-video items-center justify-center bg-black/20 text-3xl">
              {template.thumbnail}
            </div>
            {/* Info */}
            <div className="p-2">
              <h3 className="truncate text-xs font-medium text-[var(--color-text)] group-hover:text-[var(--color-primary)]">
                {t(template.nameKey)}
              </h3>
              <p className="mt-0.5 truncate text-[9px] text-[var(--color-text-secondary)]">
                {template.width}x{template.height}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
