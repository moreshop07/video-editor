import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { collaborationApi } from '@/api/client';
import { useProjectStore } from '@/store/projectStore';

interface Collaborator {
  user_id: number;
  username: string;
  email: string;
  role: string;
}

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function ShareDialog({ open, onClose }: ShareDialogProps) {
  const { t } = useTranslation();
  const currentProject = useProjectStore((s) => s.currentProject);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState('');

  const projectId = currentProject?.id;

  const loadCollaborators = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await collaborationApi.list(projectId);
      setCollaborators(res.data);
    } catch {
      // ignore
    }
  }, [projectId]);

  useEffect(() => {
    if (open && projectId) {
      loadCollaborators();
    }
  }, [open, projectId, loadCollaborators]);

  const handleInvite = async () => {
    if (!projectId || !email.trim()) return;
    setIsInviting(true);
    setError('');
    try {
      await collaborationApi.invite(projectId, { email: email.trim(), role });
      setEmail('');
      await loadCollaborators();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Invite failed';
      setError(msg);
    } finally {
      setIsInviting(false);
    }
  };

  const handleRoleChange = async (userId: number, newRole: string) => {
    if (!projectId) return;
    try {
      await collaborationApi.updateRole(projectId, userId, newRole);
      await loadCollaborators();
    } catch {
      // ignore
    }
  };

  const handleRemove = async (userId: number) => {
    if (!projectId) return;
    try {
      await collaborationApi.remove(projectId, userId);
      await loadCollaborators();
    } catch {
      // ignore
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[420px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--color-text)]">
            {t('collaboration.share')}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
          >
            &times;
          </button>
        </div>

        {/* Invite form */}
        <div className="mb-4 flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('collaboration.inviteByEmail')}
            className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
            onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-xs text-[var(--color-text)]"
          >
            <option value="editor">{t('collaboration.editor')}</option>
            <option value="viewer">{t('collaboration.viewer')}</option>
          </select>
          <button
            onClick={handleInvite}
            disabled={isInviting || !email.trim()}
            className="rounded bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {t('collaboration.invite')}
          </button>
        </div>

        {error && (
          <p className="mb-3 text-xs text-red-400">{error}</p>
        )}

        {/* Collaborator list */}
        <div className="max-h-60 space-y-2 overflow-y-auto">
          {/* Owner */}
          <div className="flex items-center gap-2 rounded bg-[var(--color-bg)] px-3 py-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-primary)] text-[10px] font-bold text-white">
              {currentProject?.name?.charAt(0)?.toUpperCase() || 'O'}
            </div>
            <span className="flex-1 text-xs text-[var(--color-text)]">
              {t('collaboration.owner')}
            </span>
            <span className="rounded bg-[var(--color-primary)]/20 px-2 py-0.5 text-[10px] text-[var(--color-primary)]">
              {t('collaboration.owner')}
            </span>
          </div>

          {collaborators.length === 0 && (
            <p className="py-2 text-center text-xs text-[var(--color-text-secondary)]">
              {t('collaboration.noCollaborators')}
            </p>
          )}

          {collaborators.map((collab) => (
            <div
              key={collab.user_id}
              className="flex items-center gap-2 rounded bg-[var(--color-bg)] px-3 py-2"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-500 text-[10px] font-bold text-white">
                {collab.username.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="text-xs text-[var(--color-text)]">{collab.username}</div>
                <div className="text-[10px] text-[var(--color-text-secondary)]">{collab.email}</div>
              </div>
              <select
                value={collab.role}
                onChange={(e) => handleRoleChange(collab.user_id, e.target.value)}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[10px] text-[var(--color-text)]"
              >
                <option value="editor">{t('collaboration.editor')}</option>
                <option value="viewer">{t('collaboration.viewer')}</option>
              </select>
              <button
                onClick={() => handleRemove(collab.user_id)}
                className="text-[10px] text-red-400 hover:text-red-300"
              >
                {t('collaboration.remove')}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
