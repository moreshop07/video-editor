import { useTranslation } from 'react-i18next';

interface ShortcutHelpDialogProps {
  open: boolean;
  onClose: () => void;
}

const isMac =
  typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const modKey = isMac ? '⌘' : 'Ctrl';

interface ShortcutEntry {
  keys: string;
  labelKey: string;
}

interface ShortcutGroup {
  titleKey: string;
  shortcuts: ShortcutEntry[];
}

const shortcutGroups: ShortcutGroup[] = [
  {
    titleKey: 'shortcuts.playback',
    shortcuts: [
      { keys: 'Space', labelKey: 'shortcuts.playPause' },
      { keys: '→', labelKey: 'shortcuts.seekForward' },
      { keys: 'Shift + →', labelKey: 'shortcuts.seekForwardFast' },
      { keys: '←', labelKey: 'shortcuts.seekBackward' },
      { keys: 'Shift + ←', labelKey: 'shortcuts.seekBackwardFast' },
      { keys: 'Home', labelKey: 'shortcuts.goToStart' },
      { keys: 'End', labelKey: 'shortcuts.goToEnd' },
    ],
  },
  {
    titleKey: 'shortcuts.editing',
    shortcuts: [
      { keys: 'Del / ⌫', labelKey: 'shortcuts.deleteClips' },
      { keys: 'S', labelKey: 'shortcuts.splitClip' },
      { keys: `${modKey} + C`, labelKey: 'shortcuts.copyClips' },
      { keys: `${modKey} + X`, labelKey: 'shortcuts.cutClips' },
      { keys: `${modKey} + V`, labelKey: 'shortcuts.pasteClips' },
      { keys: `${modKey} + D`, labelKey: 'shortcuts.duplicateClips' },
    ],
  },
  {
    titleKey: 'shortcuts.selection',
    shortcuts: [
      { keys: `${modKey} + A`, labelKey: 'shortcuts.selectAll' },
      { keys: 'Esc', labelKey: 'shortcuts.deselectAll' },
    ],
  },
  {
    titleKey: 'shortcuts.view',
    shortcuts: [
      { keys: `${modKey} + Z`, labelKey: 'shortcuts.undo' },
      { keys: `${modKey} + Shift + Z`, labelKey: 'shortcuts.redo' },
      { keys: '+ / =', labelKey: 'shortcuts.zoomIn' },
      { keys: '-', labelKey: 'shortcuts.zoomOut' },
      { keys: 'N', labelKey: 'shortcuts.toggleSnap' },
      { keys: 'U', labelKey: 'shortcuts.muteTrack' },
    ],
  },
  {
    titleKey: 'shortcuts.markers',
    shortcuts: [
      { keys: 'M', labelKey: 'shortcuts.addMarker' },
      { keys: 'Shift + M', labelKey: 'shortcuts.addNamedMarker' },
      { keys: `${modKey} + →`, labelKey: 'shortcuts.nextMarker' },
      { keys: `${modKey} + ←`, labelKey: 'shortcuts.prevMarker' },
    ],
  },
  {
    titleKey: 'shortcuts.file',
    shortcuts: [
      { keys: `${modKey} + S`, labelKey: 'shortcuts.save' },
      { keys: '?', labelKey: 'shortcuts.showShortcuts' },
    ],
  },
];

export default function ShortcutHelpDialog({ open, onClose }: ShortcutHelpDialogProps) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-xl overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">
            {t('shortcuts.title')}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {shortcutGroups.map((group) => (
            <div key={group.titleKey} className="flex flex-col gap-2">
              <h3 className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
                {t(group.titleKey)}
              </h3>
              {group.shortcuts.map((shortcut) => (
                <div
                  key={shortcut.labelKey}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="text-xs text-[var(--color-text)]">
                    {t(shortcut.labelKey)}
                  </span>
                  <kbd className="shrink-0 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-mono text-[var(--color-text-secondary)]">
                    {shortcut.keys}
                  </kbd>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
