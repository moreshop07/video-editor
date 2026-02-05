import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store';

export default function ProjectsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { projects, isLoading, fetchProjects, createProject } = useProjectStore();
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    setIsCreating(true);
    try {
      const project = await createProject(newProjectName.trim());
      navigate(`/editor/${project.id}`);
    } catch (error) {
      console.error('Failed to create project:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenProject = (projectId: number) => {
    navigate(`/editor/${projectId}`);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg)]">
      {/* Header */}
      <header className="flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6">
        <h1 className="text-lg font-bold text-[var(--color-text)]">
          <span className="text-[var(--color-primary)]">VE</span>{' '}
          {t('project.myProjects')}
        </h1>
      </header>

      {/* Content */}
      <main className="flex-1 p-6">
        {/* Create new project */}
        <div className="mb-6 flex items-center gap-3">
          <input
            type="text"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
            placeholder={t('project.name')}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-secondary)] outline-none focus:border-[var(--color-primary)]"
          />
          <button
            onClick={handleCreateProject}
            disabled={isCreating || !newProjectName.trim()}
            className="rounded bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {t('project.new')}
          </button>
        </div>

        {/* Project list */}
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <span className="text-sm text-[var(--color-text-secondary)]">
              {t('common.loading')}
            </span>
          </div>
        ) : projects.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2">
            <span className="text-sm text-[var(--color-text-secondary)]">
              {t('project.empty')}
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {projects.map((project) => (
              <div
                key={project.id}
                onClick={() => handleOpenProject(project.id)}
                className="group cursor-pointer overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] transition-all hover:border-[var(--color-primary)] hover:shadow-lg"
              >
                {/* Thumbnail */}
                <div className="flex aspect-video items-center justify-center bg-black/30">
                  {project.thumbnail_url ? (
                    <img
                      src={project.thumbnail_url}
                      alt={project.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <svg
                      className="h-10 w-10 text-[var(--color-text-secondary)]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1}
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  )}
                </div>

                {/* Info */}
                <div className="p-3">
                  <h3 className="truncate text-sm font-medium text-[var(--color-text)] group-hover:text-[var(--color-primary)]">
                    {project.name}
                  </h3>
                  <p className="mt-1 text-[10px] text-[var(--color-text-secondary)]">
                    {new Date(project.updated_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
