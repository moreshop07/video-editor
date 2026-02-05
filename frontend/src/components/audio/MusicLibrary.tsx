import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { musicApi, processingApi, assetApi } from '@/api/client';
import { useTimelineStore } from '@/store/timelineStore';
import { useProjectStore } from '@/store/projectStore';
import { DEFAULT_CLIP_FILTERS } from '@/effects/types';
import type { MusicRecommendation } from '@/types/external';

interface MusicTrackItem {
  id: number;
  title: string;
  artist: string;
  file_path: string;
  duration_ms: number;
  bpm: number | null;
  energy: number | null;
  mood_tags: string[];
  genre_tags: string[];
}

const MOOD_OPTIONS = ['happy', 'sad', 'energetic', 'calm', 'dramatic', 'romantic'];
const GENRE_OPTIONS = ['pop', 'rock', 'electronic', 'classical', 'jazz', 'ambient', 'hip-hop'];

export default function MusicLibrary() {
  const { t } = useTranslation();
  const [tracks, setTracks] = useState<MusicTrackItem[]>([]);
  const [query, setQuery] = useState('');
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [previewingId, setPreviewingId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // AI Match state
  const [isMatching, setIsMatching] = useState(false);
  const [matchProgress, setMatchProgress] = useState(0);
  const [matchResults, setMatchResults] = useState<MusicRecommendation[]>([]);
  const [matchMood, setMatchMood] = useState<string | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);

  const { currentProject } = useProjectStore();
  const { tracks: timelineTracks, addTrack, addClip } = useTimelineStore();

  const fetchTracks = useCallback(async (resetPage = false) => {
    setLoading(true);
    const currentPage = resetPage ? 1 : page;
    try {
      const res = await musicApi.library({
        query: query || undefined,
        mood: selectedMood || undefined,
        genre: selectedGenre || undefined,
        page: currentPage,
        per_page: 20,
      });
      const data = res.data as MusicTrackItem[];
      if (resetPage) {
        setTracks(data);
        setPage(1);
      } else {
        setTracks((prev) => [...prev, ...data]);
      }
      setHasMore(data.length === 20);
    } catch {
      // API may not be available
    } finally {
      setLoading(false);
    }
  }, [query, selectedMood, selectedGenre, page]);

  // Fetch on filter change
  useEffect(() => {
    fetchTracks(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, selectedMood, selectedGenre]);

  const loadMore = () => {
    if (!loading && hasMore) {
      setPage((p) => p + 1);
    }
  };

  useEffect(() => {
    if (page > 1) fetchTracks(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const togglePreview = (track: MusicTrackItem) => {
    if (previewingId === track.id) {
      audioRef.current?.pause();
      setPreviewingId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(assetApi.getStreamUrl(track.id));
    audio.play().catch(() => {});
    audio.onended = () => setPreviewingId(null);
    audioRef.current = audio;
    setPreviewingId(track.id);
  };

  const addToTimeline = (track: MusicTrackItem) => {
    // Find or create a music track
    let musicTrack = timelineTracks.find((t) => t.type === 'music');
    if (!musicTrack) {
      addTrack('music');
      musicTrack = useTimelineStore.getState().tracks.find((t) => t.type === 'music');
    }
    if (!musicTrack) return;

    // Find the end of existing clips on this track
    const lastEnd = musicTrack.clips.reduce((max, c) => Math.max(max, c.endTime), 0);

    addClip(musicTrack.id, {
      id: `music_${track.id}_${Date.now()}`,
      assetId: String(track.id),
      startTime: lastEnd,
      endTime: lastEnd + track.duration_ms,
      trimStart: 0,
      trimEnd: 0,
      duration: track.duration_ms,
      name: track.title,
      type: 'audio',
      filters: DEFAULT_CLIP_FILTERS,
      volume: 1,
      fadeInMs: 0,
      fadeOutMs: 0,
    });
  };

  const handleAiMatch = useCallback(async () => {
    if (!currentProject) return;
    setIsMatching(true);
    setMatchProgress(0);
    setMatchError(null);
    setMatchResults([]);

    try {
      const res = await musicApi.match({
        project_id: currentProject.id,
        preferred_mood: matchMood || undefined,
      });
      const jobId = res.data.id as number;

      const poll = async () => {
        try {
          const jobRes = await processingApi.getJob(jobId);
          const job = jobRes.data;
          setMatchProgress(job.progress ?? 0);

          if (job.status === 'completed') {
            const result = job.result ?? {};
            setMatchResults(result.recommendations ?? []);
            setIsMatching(false);
            return;
          }
          if (job.status === 'failed') {
            setMatchError(t('music.aiMatch.failed'));
            setIsMatching(false);
            return;
          }
          setTimeout(poll, 2000);
        } catch {
          setIsMatching(false);
          setMatchError(t('music.aiMatch.failed'));
        }
      };
      poll();
    } catch {
      setIsMatching(false);
      setMatchError(t('music.aiMatch.failed'));
    }
  }, [currentProject, matchMood, t]);

  const addMatchToTimeline = useCallback((rec: MusicRecommendation) => {
    let musicTrack = timelineTracks.find((t) => t.type === 'music');
    if (!musicTrack) {
      addTrack('music');
      musicTrack = useTimelineStore.getState().tracks.find((t) => t.type === 'music');
    }
    if (!musicTrack) return;

    const lastEnd = musicTrack.clips.reduce((max, c) => Math.max(max, c.endTime), 0);
    addClip(musicTrack.id, {
      id: `music_${rec.track_id}_${Date.now()}`,
      assetId: String(rec.track_id),
      startTime: lastEnd,
      endTime: lastEnd + rec.duration_ms,
      trimStart: 0,
      trimEnd: 0,
      duration: rec.duration_ms,
      name: rec.title,
      type: 'audio',
      filters: DEFAULT_CLIP_FILTERS,
      volume: 1,
      fadeInMs: 0,
      fadeOutMs: 0,
    });
  }, [timelineTracks, addTrack, addClip]);

  const formatDuration = (ms: number) => {
    const sec = Math.floor(ms / 1000);
    const min = Math.floor(sec / 60);
    const s = sec % 60;
    return `${min}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col gap-3 overflow-y-auto p-3">
      {/* AI Music Match */}
      <div className="border-b border-white/10 pb-3">
        <h4 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
          {t('music.aiMatch.title')}
        </h4>
        <div className="mb-2 flex flex-wrap gap-1">
          {MOOD_OPTIONS.map((mood) => (
            <button
              key={`match_${mood}`}
              onClick={() => setMatchMood(matchMood === mood ? null : mood)}
              className={`rounded px-2 py-0.5 text-[9px] ${
                matchMood === mood
                  ? 'bg-purple-500 text-white'
                  : 'bg-white/5 text-[var(--color-text-secondary)] hover:bg-white/10'
              }`}
            >
              {mood}
            </button>
          ))}
        </div>
        <button
          onClick={handleAiMatch}
          disabled={isMatching || !currentProject}
          className="w-full rounded bg-purple-500 px-2 py-1.5 text-[10px] font-medium text-white hover:bg-purple-500/80 disabled:opacity-50"
        >
          {isMatching ? t('music.aiMatch.matching') : t('music.aiMatch.button')}
        </button>

        {isMatching && (
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1 flex-1 rounded bg-white/10">
              <div
                className="h-full rounded bg-purple-400 transition-all"
                style={{ width: `${matchProgress}%` }}
              />
            </div>
            <span className="text-[9px] text-[var(--color-text-secondary)]">{matchProgress}%</span>
          </div>
        )}

        {matchError && (
          <p className="mt-1 text-[9px] text-red-400">{matchError}</p>
        )}

        {matchResults.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {matchResults.map((rec, idx) => (
              <div
                key={rec.track_id}
                className="flex items-center gap-2 rounded border border-purple-500/20 bg-purple-500/5 p-2 hover:bg-purple-500/10"
              >
                <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-[9px] text-purple-400">
                  {idx + 1}
                </span>
                <button
                  onClick={() => togglePreview({ id: rec.track_id, title: rec.title, artist: rec.artist, file_path: rec.file_path, duration_ms: rec.duration_ms, bpm: rec.bpm, energy: rec.energy, mood_tags: rec.mood_tags, genre_tags: rec.genre_tags })}
                  className="flex-shrink-0 text-[var(--color-text-secondary)] hover:text-purple-400"
                >
                  <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                    {previewingId === rec.track_id ? (
                      <><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></>
                    ) : (
                      <polygon points="5,3 19,12 5,21" />
                    )}
                  </svg>
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[10px] text-[var(--color-text)]">{rec.title}</div>
                  <div className="truncate text-[9px] text-[var(--color-text-secondary)]">
                    {rec.artist} &middot; {Math.round(rec.bpm)} BPM &middot; E:{Math.round(rec.energy * 100)}%
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-0.5">
                    {rec.mood_tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="rounded bg-white/5 px-1 text-[8px] text-[var(--color-text-secondary)]">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <span className="text-[9px] font-medium text-purple-400">{rec.score}pt</span>
                <button
                  onClick={() => addMatchToTimeline(rec)}
                  className="flex-shrink-0 rounded bg-purple-500/20 px-1.5 py-0.5 text-[9px] text-purple-400 hover:bg-purple-500/30"
                  title={t('music.addToTimeline')}
                >
                  +
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder={t('music.search')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-[var(--color-text)] placeholder-[var(--color-text-secondary)] outline-none focus:border-[var(--accent)]"
      />

      {/* Mood filter */}
      <div className="flex flex-wrap gap-1">
        {MOOD_OPTIONS.map((mood) => (
          <button
            key={mood}
            onClick={() => setSelectedMood(selectedMood === mood ? null : mood)}
            className={`rounded px-2 py-0.5 text-[9px] ${
              selectedMood === mood
                ? 'bg-[var(--accent)] text-white'
                : 'bg-white/5 text-[var(--color-text-secondary)] hover:bg-white/10'
            }`}
          >
            {mood}
          </button>
        ))}
      </div>

      {/* Genre filter */}
      <div className="flex flex-wrap gap-1">
        {GENRE_OPTIONS.map((genre) => (
          <button
            key={genre}
            onClick={() => setSelectedGenre(selectedGenre === genre ? null : genre)}
            className={`rounded px-2 py-0.5 text-[9px] ${
              selectedGenre === genre
                ? 'bg-[var(--accent)] text-white'
                : 'bg-white/5 text-[var(--color-text-secondary)] hover:bg-white/10'
            }`}
          >
            {genre}
          </button>
        ))}
      </div>

      {/* Results */}
      {tracks.length === 0 && !loading && (
        <p className="text-center text-xs text-[var(--color-text-secondary)] py-4">
          {t('music.noResults')}
        </p>
      )}

      <div className="flex flex-col gap-1">
        {tracks.map((track) => (
          <div
            key={track.id}
            className="flex items-center gap-2 rounded border border-white/5 bg-white/5 p-2 hover:bg-white/10"
          >
            {/* Preview button */}
            <button
              onClick={() => togglePreview(track)}
              className="flex-shrink-0 text-[var(--color-text-secondary)] hover:text-[var(--accent)]"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                {previewingId === track.id ? (
                  <><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></>
                ) : (
                  <polygon points="5,3 19,12 5,21" />
                )}
              </svg>
            </button>

            {/* Track info */}
            <div className="flex-1 min-w-0">
              <div className="truncate text-[10px] text-[var(--color-text)]">{track.title}</div>
              <div className="truncate text-[9px] text-[var(--color-text-secondary)]">
                {track.artist} &middot; {formatDuration(track.duration_ms)}
                {track.bpm ? ` &middot; ${Math.round(track.bpm)} BPM` : ''}
              </div>
            </div>

            {/* Add button */}
            <button
              onClick={() => addToTimeline(track)}
              className="flex-shrink-0 rounded bg-[var(--accent)]/20 px-1.5 py-0.5 text-[9px] text-[var(--accent)] hover:bg-[var(--accent)]/30"
              title={t('music.addToTimeline')}
            >
              +
            </button>
          </div>
        ))}
      </div>

      {/* Load more */}
      {hasMore && tracks.length > 0 && (
        <button
          onClick={loadMore}
          disabled={loading}
          className="rounded bg-white/5 py-1.5 text-[10px] text-[var(--color-text-secondary)] hover:bg-white/10 disabled:opacity-50"
        >
          {loading ? t('common.loading') : t('music.loadMore')}
        </button>
      )}

      {loading && tracks.length === 0 && (
        <p className="text-center text-xs text-[var(--color-text-secondary)] py-4">
          {t('common.loading')}
        </p>
      )}
    </div>
  );
}
