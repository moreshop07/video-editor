import { useTranslation } from 'react-i18next';
import { usePluginList } from '@/plugins/hooks';
import { pluginManager } from '@/plugins/PluginManager';

export default function PluginManagerPanel() {
  const { t } = useTranslation();
  const plugins = usePluginList();

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-3">
      <h4 className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
        {t('plugins.installed')}
      </h4>

      {plugins.length === 0 ? (
        <p className="text-center text-xs text-[var(--color-text-secondary)]">
          {t('plugins.noPlugins')}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {plugins.map((entry) => (
            <div
              key={entry.manifest.id}
              className="flex items-center justify-between rounded border border-white/5 bg-white/5 p-2"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-[var(--color-text)]">
                  {entry.manifest.name}
                </span>
                <span className="text-[10px] text-[var(--color-text-secondary)]">
                  {t('plugins.version')} {entry.manifest.version}
                  {entry.manifest.author && ` · ${t('plugins.author')} ${entry.manifest.author}`}
                </span>
                {entry.manifest.description && (
                  <span className="text-[10px] text-[var(--color-text-secondary)]">
                    {entry.manifest.description}
                  </span>
                )}
              </div>
              <button
                onClick={() => pluginManager.setEnabled(entry.manifest.id, !entry.enabled)}
                className={`rounded px-2 py-0.5 text-[10px] transition-colors ${
                  entry.enabled
                    ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
                    : 'bg-white/5 text-[var(--color-text-secondary)]'
                }`}
              >
                {entry.enabled ? t('plugins.enabled') : t('plugins.disabled')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
