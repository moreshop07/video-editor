import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { TEMPLATES, TEMPLATE_CATEGORIES, type Template, type TemplateCategory } from '@/data/templates';
import { useTemplateStore, type UserTemplate } from '@/store/templateStore';

interface TemplateGalleryProps {
  onSelect: (template: Template) => void;
  disabled?: boolean;
}

function userTemplateToTemplate(ut: UserTemplate): Template {
  return {
    id: `user-${ut.id}`,
    name: ut.name,
    nameKey: '',
    description: ut.description || '',
    descriptionKey: '',
    category: (ut.category as TemplateCategory) || 'blank',
    thumbnail: '📁',
    gradient: 'from-indigo-600 to-purple-700',
    width: ut.width,
    height: ut.height,
    fps: ut.fps,
    projectData: ut.template_data as Template['projectData'],
  };
}

export function TemplateGallery({ onSelect, disabled }: TemplateGalleryProps) {
  const { t } = useTranslation();
  const { userTemplates, isLoading, fetchUserTemplates, deleteUserTemplate } = useTemplateStore();
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    fetchUserTemplates();
  }, [fetchUserTemplates]);

  const filterByCategory = (tpl: { category: string }) =>
    activeCategory === 'all' || tpl.category === activeCategory;

  const filterBySearch = (tpl: { name: string; description: string; nameKey?: string; descriptionKey?: string }) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const name = tpl.nameKey ? t(tpl.nameKey).toLowerCase() : tpl.name.toLowerCase();
    const desc = tpl.descriptionKey ? t(tpl.descriptionKey).toLowerCase() : tpl.description.toLowerCase();
    return name.includes(q) || desc.includes(q);
  };

  const filteredBuiltIn = TEMPLATES.filter((tpl) => filterByCategory(tpl) && filterBySearch(tpl));
  const filteredUser = userTemplates
    .filter((ut) => filterByCategory(ut) && filterBySearch({ name: ut.name, description: ut.description || '' }));

  const handleDeleteUser = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(t('template.deleteConfirm'))) return;
    setDeletingId(id);
    try {
      await deleteUserTemplate(id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mb-8">
      {/* Category tabs */}
      <div className="mb-3 flex flex-wrap gap-1">
        {TEMPLATE_CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              activeCategory === cat.key
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
            }`}
          >
            {t(cat.labelKey)}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('template.search')}
        className="mb-4 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-xs text-[var(--color-text)] placeholder-[var(--color-text-secondary)] outline-none focus:border-[var(--color-primary)]"
      />

      {/* Built-in templates */}
      {filteredBuiltIn.length > 0 && (
        <>
          <h2 className="mb-2 text-xs font-medium text-[var(--color-text-secondary)]">
            {t('template.builtIn')}
          </h2>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {filteredBuiltIn.map((template) => (
              <button
                key={template.id}
                onClick={() => onSelect(template)}
                disabled={disabled}
                className="group overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-left transition-all hover:border-[var(--color-primary)] hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className={`flex aspect-video items-center justify-center bg-gradient-to-br ${template.gradient} text-3xl`}>
                  {template.thumbnail}
                </div>
                <div className="p-2">
                  <h3 className="truncate text-xs font-medium text-[var(--color-text)] group-hover:text-[var(--color-primary)]">
                    {t(template.nameKey)}
                  </h3>
                  <p className="mt-0.5 truncate text-[9px] text-[var(--color-text-secondary)]">
                    {template.width}x{template.height} &middot; {template.fps}fps
                  </p>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* User templates */}
      {(filteredUser.length > 0 || isLoading) && (
        <>
          <h2 className="mb-2 text-xs font-medium text-[var(--color-text-secondary)]">
            {t('template.myTemplates')}
          </h2>
          {isLoading ? (
            <p className="text-xs text-[var(--color-text-secondary)]">...</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {filteredUser.map((ut) => (
                <button
                  key={ut.id}
                  onClick={() => onSelect(userTemplateToTemplate(ut))}
                  disabled={disabled}
                  className="group relative overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-left transition-all hover:border-[var(--color-primary)] hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-700 text-3xl">
                    📁
                  </div>
                  <div className="p-2">
                    <h3 className="truncate text-xs font-medium text-[var(--color-text)] group-hover:text-[var(--color-primary)]">
                      {ut.name}
                    </h3>
                    <p className="mt-0.5 truncate text-[9px] text-[var(--color-text-secondary)]">
                      {ut.width}x{ut.height} &middot; {ut.fps}fps
                    </p>
                  </div>
                  {/* Delete button */}
                  <button
                    onClick={(e) => handleDeleteUser(ut.id, e)}
                    disabled={deletingId === ut.id}
                    className="absolute right-1 top-1 hidden rounded bg-red-600/80 p-1 text-white hover:bg-red-600 group-hover:block"
                    title={t('common.delete')}
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* No results */}
      {filteredBuiltIn.length === 0 && filteredUser.length === 0 && !isLoading && (
        <p className="py-4 text-center text-xs text-[var(--color-text-secondary)]">
          {t('template.noResults')}
        </p>
      )}
    </div>
  );
}
