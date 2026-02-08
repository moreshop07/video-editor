import { useCollaborationStore } from '@/store/collaborationStore';
import { useTranslation } from 'react-i18next';

export default function CollaboratorAvatars() {
  const { t } = useTranslation();
  const connectedUsers = useCollaborationStore((s) => s.connectedUsers);
  const users = Object.values(connectedUsers);

  if (users.length <= 1) return null;

  return (
    <div className="flex items-center gap-1">
      {users.map((user) => (
        <div
          key={user.userId}
          className="group relative flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{ backgroundColor: user.color }}
        >
          {user.username.charAt(0).toUpperCase()}
          {/* Tooltip */}
          <div className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-2 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
            {user.username}
          </div>
        </div>
      ))}
      <span className="ml-1 text-[10px] text-[var(--color-text-secondary)]">
        {users.length} {t('collaboration.online')}
      </span>
    </div>
  );
}
