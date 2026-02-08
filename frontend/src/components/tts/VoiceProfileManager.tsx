import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnalyzerStore } from '@/store/analyzerStore';
import VoiceProfileForm from './VoiceProfileForm';
import VoicePreviewPlayer from './VoicePreviewPlayer';
import type { VoiceProfile } from '@/store/analyzerStore';

export default function VoiceProfileManager() {
  const { t } = useTranslation();
  const {
    voiceProfiles,
    voiceProfilesLoading,
    fetchVoiceProfiles,
    deleteVoiceProfile,
    previewVoice,
    previewAudioUrl,
  } = useAnalyzerStore();

  const [showForm, setShowForm] = useState(false);
  const [editingProfile, setEditingProfile] = useState<VoiceProfile | null>(null);
  const [previewing, setPreviewing] = useState<number | null>(null);

  useEffect(() => {
    fetchVoiceProfiles();
  }, [fetchVoiceProfiles]);

  const handlePreview = useCallback(async (profile: VoiceProfile) => {
    setPreviewing(profile.id);
    try {
      const sampleText = profile.provider_voice_id.startsWith('zh')
        ? t('tts.previewSample')
        : 'Hello, this is a voice preview sample.';
      await previewVoice(sampleText, profile.id);
    } catch {
      // Ignore preview errors
    } finally {
      setPreviewing(null);
    }
  }, [previewVoice, t]);

  const handleDelete = useCallback(async (id: number) => {
    await deleteVoiceProfile(id);
  }, [deleteVoiceProfile]);

  if (showForm || editingProfile) {
    return (
      <div className="flex flex-col gap-3">
        <h4 className="text-xs font-medium text-[var(--text-primary)]">
          {editingProfile ? t('voiceProfile.edit') : t('voiceProfile.create')}
        </h4>
        <VoiceProfileForm
          profile={editingProfile}
          onSave={() => { setShowForm(false); setEditingProfile(null); }}
          onCancel={() => { setShowForm(false); setEditingProfile(null); }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-[var(--text-primary)]">{t('voiceProfile.title')}</h4>
        <button
          onClick={() => setShowForm(true)}
          className="rounded bg-[var(--accent)] px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-[var(--accent)]/80"
        >
          + {t('voiceProfile.create')}
        </button>
      </div>

      {previewAudioUrl && <VoicePreviewPlayer />}

      {voiceProfilesLoading ? (
        <p className="text-xs text-[var(--text-secondary)]">...</p>
      ) : voiceProfiles.length === 0 ? (
        <p className="text-xs text-[var(--text-secondary)]">{t('voiceProfile.empty')}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {voiceProfiles.map((profile) => (
            <div
              key={profile.id}
              className="flex items-center gap-2 rounded bg-white/5 px-2.5 py-2"
            >
              {/* Provider icon */}
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[10px]">
                {profile.provider === 'fish_audio' ? '🐟' : '🎙'}
              </span>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="truncate text-xs font-medium text-[var(--text-primary)]">
                    {profile.name}
                  </span>
                  {profile.is_default && (
                    <span className="rounded bg-[var(--accent)]/20 px-1 text-[9px] text-[var(--accent)]">
                      {t('voiceProfile.isDefault')}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-[var(--text-secondary)]">
                  {profile.provider === 'edge_tts' ? 'Edge TTS' : 'Fish Audio'} — {profile.provider_voice_id}
                </span>
              </div>

              {/* Actions */}
              <div className="flex gap-1">
                <button
                  onClick={() => handlePreview(profile)}
                  disabled={previewing === profile.id}
                  className="rounded px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)] transition-colors hover:bg-white/10 hover:text-[var(--text-primary)] disabled:opacity-50"
                  title={t('voiceProfile.preview')}
                >
                  {previewing === profile.id ? '...' : '▶'}
                </button>
                <button
                  onClick={() => setEditingProfile(profile)}
                  className="rounded px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)] transition-colors hover:bg-white/10 hover:text-[var(--text-primary)]"
                >
                  {t('voiceProfile.edit')}
                </button>
                <button
                  onClick={() => handleDelete(profile.id)}
                  className="rounded px-1.5 py-0.5 text-[10px] text-red-400 transition-colors hover:bg-red-400/10"
                >
                  {t('voiceProfile.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
