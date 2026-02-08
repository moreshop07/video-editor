import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { useProjectStore } from '@/store/projectStore';
import { useTimelineStore } from '@/store/timelineStore';
import SaveIndicator from '@/components/editor/SaveIndicator';
import CollaboratorAvatars from '@/components/editor/CollaboratorAvatars';
import ShareDialog from '@/components/editor/ShareDialog';
import SaveAsTemplateDialog from '@/components/templates/SaveAsTemplateDialog';

function HeaderComponent() {
  const { t, i18n } = useTranslation();
  const { currentProject, isSaving, saveProject, updateProjectData } = useProjectStore();

  const [isEditingName, setIsEditingName] = useState(false);
  const [projectName, setProjectName] = useState(currentProject?.name || t('project.name'));
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showSaveAsTemplate, setShowSaveAsTemplate] = useState(false);

  // Subscribe to temporal state for undo/redo button states
  const canUndo = useStore(
    useTimelineStore.temporal,
    (state) => state.pastStates.length > 0
  );
  const canRedo = useStore(
    useTimelineStore.temporal,
    (state) => state.futureStates.length > 0
  );

  const handleNameSubmit = useCallback(() => {
    setIsEditingName(false);
    if (projectName.trim()) {
      updateProjectData({ name: projectName.trim() });
    }
  }, [projectName, updateProjectData]);

  const toggleLanguage = useCallback(() => {
    const newLang = i18n.language === 'zh-TW' ? 'en' : 'zh-TW';
    i18n.changeLanguage(newLang);
  }, [i18n]);

  const handleUndo = useCallback(() => {
    useTimelineStore.temporal.getState().undo();
  }, []);

  const handleRedo = useCallback(() => {
    useTimelineStore.temporal.getState().redo();
  }, []);

  return (
    <>
    <header className="flex h-12 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4">
      {/* Left: Project name */}
      <div className="flex items-center gap-3">
        <div className="text-sm font-bold text-[var(--color-primary)]">VE</div>
        {isEditingName ? (
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
            className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
            autoFocus
          />
        ) : (
          <button
            onClick={() => setIsEditingName(true)}
            className="text-sm text-[var(--color-text)] hover:text-[var(--color-primary)]"
          >
            {currentProject?.name || t('project.name')}
          </button>
        )}
      </div>

      {/* Center: Undo/Redo */}
      <div className="flex items-center gap-1">
        <button
          onClick={handleUndo}
          disabled={!canUndo}
          className="rounded px-3 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title={`${t('undo')} (${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Z)`}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
          </svg>
        </button>
        <button
          onClick={handleRedo}
          disabled={!canRedo}
          className="rounded px-3 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title={`${t('redo')} (${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Shift+Z)`}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4M21 10l-4 4" />
          </svg>
        </button>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <CollaboratorAvatars />

        <button
          onClick={() => setShowShareDialog(true)}
          className="rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
        >
          {t('collaboration.share')}
        </button>

        <button
          onClick={toggleLanguage}
          className="rounded px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
        >
          {i18n.language === 'zh-TW' ? 'EN' : '中文'}
        </button>

        <SaveIndicator />

        <button
          onClick={() => saveProject()}
          disabled={isSaving}
          className="rounded bg-[var(--color-bg)] px-3 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--color-border)] disabled:opacity-50"
        >
          {isSaving ? t('common.saving') : t('common.save')}
        </button>

        <button
          onClick={() => setShowSaveAsTemplate(true)}
          className="rounded border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
        >
          {t('template.saveAs')}
        </button>

        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent('toggle-export-dialog'));
          }}
          className="rounded bg-[var(--color-primary)] px-3 py-1 text-xs font-medium text-white hover:opacity-90"
        >
          {t('export.title')}
        </button>
      </div>
    </header>

    <ShareDialog open={showShareDialog} onClose={() => setShowShareDialog(false)} />
    <SaveAsTemplateDialog open={showSaveAsTemplate} onClose={() => setShowSaveAsTemplate(false)} />
    </>
  );
}

export default React.memo(HeaderComponent);
