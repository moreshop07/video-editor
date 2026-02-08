import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnalyzerStore } from '@/store/analyzerStore';
import type { VoiceProfile } from '@/store/analyzerStore';

interface VoiceProfileFormProps {
  profile?: VoiceProfile | null;
  onSave: () => void;
  onCancel: () => void;
}

export default function VoiceProfileForm({ profile, onSave, onCancel }: VoiceProfileFormProps) {
  const { t } = useTranslation();
  const { voices, fishAudioAvailable, createVoiceProfile, updateVoiceProfile } =
    useAnalyzerStore();

  const [name, setName] = useState(profile?.name || '');
  const [description, setDescription] = useState(profile?.description || '');
  const [provider, setProvider] = useState<string>(profile?.provider || 'edge_tts');
  const [providerVoiceId, setProviderVoiceId] = useState(profile?.provider_voice_id || '');
  const [speed, setSpeed] = useState<number>((profile?.settings as Record<string, number>)?.speed || 1.0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!providerVoiceId && provider === 'edge_tts' && voices.length > 0) {
      setProviderVoiceId(voices[0].voice_id);
    }
  }, [provider, voices, providerVoiceId]);

  const handleSubmit = async () => {
    if (!name.trim() || !providerVoiceId.trim()) return;
    setSaving(true);
    try {
      const settings: Record<string, unknown> = { speed };
      if (profile) {
        await updateVoiceProfile(profile.id, { name, description: description || undefined, settings });
      } else {
        await createVoiceProfile({
          name,
          description: description || undefined,
          provider,
          provider_voice_id: providerVoiceId,
          settings,
        });
      }
      onSave();
    } catch {
      // Error handled by store
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Name */}
      <div>
        <label className="mb-1 block text-xs text-[var(--text-secondary)]">{t('voiceProfile.name')}</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('voiceProfile.namePlaceholder')}
          className="w-full rounded bg-white/5 px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
      </div>

      {/* Description */}
      <div>
        <label className="mb-1 block text-xs text-[var(--text-secondary)]">{t('voiceProfile.description')}</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('voiceProfile.descriptionPlaceholder')}
          className="w-full rounded bg-white/5 px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
      </div>

      {/* Provider (only for new profiles) */}
      {!profile && (
        <div>
          <label className="mb-1 block text-xs text-[var(--text-secondary)]">{t('voiceProfile.provider')}</label>
          <div className="flex gap-3">
            <label className="flex items-center gap-1.5 text-sm text-[var(--text-primary)]">
              <input
                type="radio"
                name="provider"
                value="edge_tts"
                checked={provider === 'edge_tts'}
                onChange={() => { setProvider('edge_tts'); setProviderVoiceId(''); }}
              />
              {t('voiceProfile.edgeTts')}
            </label>
            <label className={`flex items-center gap-1.5 text-sm ${fishAudioAvailable ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] opacity-50'}`}>
              <input
                type="radio"
                name="provider"
                value="fish_audio"
                checked={provider === 'fish_audio'}
                onChange={() => { setProvider('fish_audio'); setProviderVoiceId(''); }}
                disabled={!fishAudioAvailable}
              />
              {t('voiceProfile.fishAudio')}
              {!fishAudioAvailable && <span className="text-[10px]">({t('voiceProfile.fishAudioUnavailable')})</span>}
            </label>
          </div>
        </div>
      )}

      {/* Voice selector */}
      <div>
        <label className="mb-1 block text-xs text-[var(--text-secondary)]">{t('voiceProfile.voice')}</label>
        {provider === 'edge_tts' ? (
          <select
            value={providerVoiceId}
            onChange={(e) => setProviderVoiceId(e.target.value)}
            className="w-full rounded bg-white/5 px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none"
          >
            {voices.map((v) => (
              <option key={v.voice_id} value={v.voice_id}>{v.label}</option>
            ))}
          </select>
        ) : (
          <input
            value={providerVoiceId}
            onChange={(e) => setProviderVoiceId(e.target.value)}
            placeholder="Fish Audio Model ID"
            className="w-full rounded bg-white/5 px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
        )}
      </div>

      {/* Speed */}
      <div>
        <label className="mb-1 flex items-center justify-between text-xs text-[var(--text-secondary)]">
          <span>{t('voiceProfile.speed')}</span>
          <span>{speed.toFixed(1)}x</span>
        </label>
        <input
          type="range"
          min={0.5}
          max={2.0}
          step={0.1}
          value={speed}
          onChange={(e) => setSpeed(parseFloat(e.target.value))}
          className="w-full"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={saving || !name.trim() || !providerVoiceId.trim()}
          className="flex-1 rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[var(--accent)]/80 disabled:opacity-50"
        >
          {saving ? '...' : t('voiceProfile.save')}
        </button>
        <button
          onClick={onCancel}
          className="rounded px-3 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          {t('voiceProfile.cancel')}
        </button>
      </div>
    </div>
  );
}
