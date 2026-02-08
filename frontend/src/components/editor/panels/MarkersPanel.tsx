import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useTimelineStore, type Marker, type MarkerType } from '@/store/timelineStore';

const DEFAULT_COLORS: Record<MarkerType, string> = {
  marker: '#f59e0b',
  chapter: '#3b82f6',
  cuePoint: '#ef4444',
};

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const frac = Math.floor((ms % 1000) / 10);
  return `${min}:${sec.toString().padStart(2, '0')}.${frac.toString().padStart(2, '0')}`;
}

function formatVTTTime(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const frac = ms % 1000;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${frac.toString().padStart(3, '0')}`;
}

export default function MarkersPanel() {
  const { t } = useTranslation();
  const {
    markers,
    currentTime,
    addMarker,
    removeMarker,
    updateMarker,
    setCurrentTime,
  } = useTimelineStore();

  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editColor, setEditColor] = useState('#f59e0b');
  const [editType, setEditType] = useState<MarkerType>('marker');

  const filteredMarkers = useMemo(() => {
    if (!search.trim()) return markers;
    const query = search.toLowerCase();
    return markers.filter(
      (m) =>
        m.label.toLowerCase().includes(query) ||
        m.type.toLowerCase().includes(query),
    );
  }, [markers, search]);

  const handleAddMarker = useCallback(
    (type: MarkerType = 'marker') => {
      addMarker({
        time: currentTime,
        label: '',
        color: DEFAULT_COLORS[type],
        type,
      });
    },
    [addMarker, currentTime],
  );

  const startEdit = useCallback((marker: Marker) => {
    setEditingId(marker.id);
    setEditLabel(marker.label);
    setEditColor(marker.color);
    setEditType(marker.type);
  }, []);

  const saveEdit = useCallback(() => {
    if (editingId) {
      updateMarker(editingId, {
        label: editLabel,
        color: editColor,
        type: editType,
      });
      setEditingId(null);
    }
  }, [editingId, editLabel, editColor, editType, updateMarker]);

  const exportWebVTT = useCallback(() => {
    const chapters = markers
      .filter((m) => m.type === 'chapter')
      .sort((a, b) => a.time - b.time);
    if (chapters.length === 0) return;

    let vtt = 'WEBVTT\n\n';
    for (let i = 0; i < chapters.length; i++) {
      const start = formatVTTTime(chapters[i].time);
      const end =
        i + 1 < chapters.length
          ? formatVTTTime(chapters[i + 1].time)
          : formatVTTTime(chapters[i].time + 10000);
      vtt += `${i + 1}\n${start} --> ${end}\n${chapters[i].label || `Chapter ${i + 1}`}\n\n`;
    }

    const blob = new Blob([vtt], { type: 'text/vtt' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chapters.vtt';
    a.click();
    URL.revokeObjectURL(url);
  }, [markers]);

  return (
    <div className="flex flex-col gap-3 overflow-y-auto p-3">
      {/* Add buttons */}
      <div className="flex items-center gap-1 flex-wrap">
        <button
          onClick={() => handleAddMarker('marker')}
          className="rounded px-2 py-1 text-[10px] bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
        >
          + {t('markers.addMarker')}
        </button>
        <button
          onClick={() => handleAddMarker('chapter')}
          className="rounded px-2 py-1 text-[10px] bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
        >
          + {t('markers.addChapter')}
        </button>
        <button
          onClick={() => handleAddMarker('cuePoint')}
          className="rounded px-2 py-1 text-[10px] bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
        >
          + {t('markers.addCuePoint')}
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('markers.search')}
        className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
      />

      {/* Marker list */}
      {filteredMarkers.length === 0 ? (
        <p className="text-center text-[10px] text-[var(--color-text-secondary)] py-4">
          {t('markers.empty')}
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {filteredMarkers.map((marker) => (
            <div key={marker.id}>
              {editingId === marker.id ? (
                /* Inline edit form */
                <div className="flex flex-col gap-1.5 rounded border border-[var(--color-primary)] bg-[var(--color-bg)] p-2">
                  <input
                    type="text"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    placeholder={t('markers.label')}
                    className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] outline-none"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit();
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      className="h-6 w-8 cursor-pointer rounded border border-[var(--color-border)]"
                    />
                    <select
                      value={editType}
                      onChange={(e) => setEditType(e.target.value as MarkerType)}
                      className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-1 text-[10px] text-[var(--color-text)] outline-none"
                    >
                      <option value="marker">{t('markers.type.marker')}</option>
                      <option value="chapter">{t('markers.type.chapter')}</option>
                      <option value="cuePoint">{t('markers.type.cuePoint')}</option>
                    </select>
                    <button
                      onClick={saveEdit}
                      className="rounded bg-[var(--color-primary)] px-2 py-0.5 text-[10px] text-white"
                    >
                      OK
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-[10px] text-[var(--color-text-secondary)]"
                    >
                      {t('cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                /* Display row */
                <div
                  className="flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer hover:bg-[var(--color-bg)] group transition-colors"
                  onClick={() => setCurrentTime(marker.time)}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: marker.color }}
                  />
                  <span className="text-xs text-[var(--color-text)] flex-1 truncate">
                    {marker.label || t('markers.unnamed')}
                  </span>
                  <span className="text-[10px] text-[var(--color-text-secondary)] font-mono">
                    {formatTime(marker.time)}
                  </span>
                  <span className="text-[9px] px-1 rounded bg-white/10 text-[var(--color-text-secondary)]">
                    {t(`markers.type.${marker.type}`)}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startEdit(marker);
                    }}
                    className="text-[10px] text-[var(--color-text-secondary)] opacity-0 group-hover:opacity-100 hover:text-[var(--color-text)]"
                  >
                    {t('markers.edit')}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeMarker(marker.id);
                    }}
                    className="text-[10px] text-red-400 opacity-0 group-hover:opacity-100 hover:text-red-300"
                  >
                    {t('delete')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Export chapters */}
      {markers.some((m) => m.type === 'chapter') && (
        <div className="border-t border-[var(--color-border)] pt-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)] mb-2">
            {t('markers.exportChapters')}
          </div>
          <button
            onClick={exportWebVTT}
            className="rounded px-3 py-1.5 text-xs bg-[var(--color-primary)]/20 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/30 transition-colors"
          >
            {t('markers.exportWebVTT')}
          </button>
        </div>
      )}
    </div>
  );
}
