import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { TEMPLATES, TEMPLATE_CATEGORIES, type Template, type TemplateCategory } from '@/data/templates';
import { useTemplateStore, type UserTemplate } from '@/store/templateStore';
import { useTimelineStore } from '@/store/timelineStore';
import { useProjectStore } from '@/store/projectStore';

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

export default function TemplateBrowserPanel() {
  const { t } = useTranslation();
  const { userTemplates, fetchUserTemplates, deleteUserTemplate } = useTemplateStore();
  const loadFromProjectData = useTimelineStore((s) => s.loadFromProjectData);
  const updateProjectData = useProjectStore((s) => s.updateProjectData);

  const [activeCategory, setActiveCategory] = useState<TemplateCategory | 'all'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchUserTemplates();
  }, [fetchUserTemplates]);

  const filterByCategory = (tpl: { category: string }) =>
    activeCategory === 'all' || tpl.category === activeCategory;

  const filterBySearch = (name: string, desc: string) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return name.toLowerCase().includes(q) || desc.toLowerCase().includes(q);
  };

  const filteredBuiltIn = TEMPLATES.filter(
    (tpl) => filterByCategory(tpl) && filterBySearch(t(tpl.nameKey), t(tpl.descriptionKey)),
  );
  const filteredUser = userTemplates.filter(
    (ut) => filterByCategory(ut) && filterBySearch(ut.name, ut.description || ''),
  );

  const handleApply = useCallback(
    (template: Template) => {
      if (!confirm(t('template.replaceConfirm'))) return;
      loadFromProjectData(template.projectData);
      updateProjectData({ width: template.width, height: template.height, fps: template.fps });
    },
    [loadFromProjectData, updateProjectData, t],
  );

  const handleDeleteUser = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(t('template.deleteConfirm'))) return;
    await deleteUserTemplate(id);
  };

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-3">
      {/* Category filter */}
      <div className="flex flex-wrap gap-1">
        {TEMPLATE_CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={`rounded-full px-2 py-0.5 text-[10px] transition-colors ${
              activeCategory === cat.key
                ? 'bg-[var(--accent)] text-white'
                : 'bg-white/5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
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
        className="w-full rounded bg-white/5 px-2 py-1 text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
      />

      {/* Built-in */}
      {filteredBuiltIn.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-medium text-[var(--text-secondary)]">{t('template.builtIn')}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {filteredBuiltIn.map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => handleApply(tpl)}
                className="group overflow-hidden rounded border border-white/10 text-left transition-colors hover:border-[var(--accent)]"
              >
                <div className={`flex aspect-video items-center justify-center bg-gradient-to-br ${tpl.gradient} text-xl`}>
                  {tpl.thumbnail}
                </div>
                <div className="px-1.5 py-1">
                  <p className="truncate text-[10px] font-medium text-[var(--text-primary)]">{t(tpl.nameKey)}</p>
                  <p className="truncate text-[9px] text-[var(--text-secondary)]">{tpl.width}x{tpl.height}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* User templates */}
      {filteredUser.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-medium text-[var(--text-secondary)]">{t('template.myTemplates')}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {filteredUser.map((ut) => (
              <button
                key={ut.id}
                onClick={() => handleApply(userTemplateToTemplate(ut))}
                className="group relative overflow-hidden rounded border border-white/10 text-left transition-colors hover:border-[var(--accent)]"
              >
                <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-700 text-xl">
                  📁
                </div>
                <div className="px-1.5 py-1">
                  <p className="truncate text-[10px] font-medium text-[var(--text-primary)]">{ut.name}</p>
                  <p className="truncate text-[9px] text-[var(--text-secondary)]">{ut.width}x{ut.height}</p>
                </div>
                <button
                  onClick={(e) => handleDeleteUser(ut.id, e)}
                  className="absolute right-0.5 top-0.5 hidden rounded bg-red-600/80 p-0.5 text-white hover:bg-red-600 group-hover:block"
                >
                  <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </button>
            ))}
          </div>
        </div>
      )}

      {filteredBuiltIn.length === 0 && filteredUser.length === 0 && (
        <p className="py-4 text-center text-[10px] text-[var(--text-secondary)]">{t('template.noResults')}</p>
      )}
    </div>
  );
}
