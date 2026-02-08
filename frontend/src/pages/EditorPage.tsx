import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AppShell from '@/components/layout/AppShell';
import VideoPreview from '@/components/editor/preview/VideoPreview';
import Timeline from '@/components/editor/timeline/Timeline';
import PropertiesPanel from '@/components/editor/panels/PropertiesPanel';
import ExportDialog from '@/components/export/ExportDialog';
import { useProjectStore, useAssetStore, useTimelineStore } from '@/store';
import { ProjectWebSocket } from '@/api/websocket';
import { useAutoSave } from '@/hooks/useAutoSave';
import type { ProjectData } from '@/store/timelineStore';

export default function EditorPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const wsRef = useRef<ProjectWebSocket | null>(null);

  const { currentProject, isLoading, loadProject } = useProjectStore();
  const { fetchAssets } = useAssetStore();
  const loadFromProjectData = useTimelineStore((s) => s.loadFromProjectData);

  const [showExportDialog, setShowExportDialog] = useState(false);

  // Auto-save timeline changes via WebSocket
  useAutoSave(wsRef.current);

  // Load project data on mount
  useEffect(() => {
    if (projectId) {
      loadProject(Number(projectId));
    }
    fetchAssets();
  }, [projectId, loadProject, fetchAssets]);

  // Hydrate timeline store from project_data when project loads
  useEffect(() => {
    if (currentProject?.project_data) {
      loadFromProjectData(currentProject.project_data as ProjectData);
    }
  }, [currentProject?.id, loadFromProjectData]);

  // Initialize WebSocket connection
  useEffect(() => {
    if (!projectId) return;
    const ws = new ProjectWebSocket(projectId);
    ws.connect();
    wsRef.current = ws;

    ws.onProjectSync((data) => {
      console.log('Project sync received:', data);
    });

    ws.onJobProgress((data) => {
      console.log('Job progress:', data);
    });

    return () => {
      ws.disconnect();
    };
  }, [projectId]);

  // Listen for export dialog toggle event from Header
  useEffect(() => {
    const handler = () => setShowExportDialog((prev) => !prev);
    window.addEventListener('toggle-export-dialog', handler);
    return () => window.removeEventListener('toggle-export-dialog', handler);
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[var(--color-bg)]">
        <span className="text-sm text-[var(--color-text-secondary)]">
          {t('common.loading')}
        </span>
      </div>
    );
  }

  return (
    <>
      <AppShell
        preview={<VideoPreview />}
        timeline={<Timeline />}
        properties={<PropertiesPanel />}
      />

      <ExportDialog
        open={showExportDialog}
        onClose={() => setShowExportDialog(false)}
      />
    </>
  );
}
