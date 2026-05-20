import { useRef, useState, useCallback, useEffect } from 'react';
import type { Card } from '../../../shared/types';
import { cardStreamUrl, fetchEmbedPreviewStream } from '../spotify';

function formatGenres(genres?: string[]): string {
  if (!genres?.length) return '—';
  return genres
    .slice(0, 2)
    .map((g) => g.replace(/-/g, ' '))
    .join(', ');
}

interface TrackPreviewModalProps {
  cards: Card[];
  onClose: () => void;
}

export default function TrackPreviewModal({ cards, onClose }: TrackPreviewModalProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const resolvedStreams = useRef(new Map<string, string>());
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [loadingTrackId, setLoadingTrackId] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const hasGenres = cards.some((c) => c.genres && c.genres.length > 0);

  const stopPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    setActiveTrackId(null);
    setLoadingTrackId(null);
  }, []);

  const playStream = useCallback((trackId: string, stream: string) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = stream;
    audio.load();
    void audio
      .play()
      .then(() => {
        setActiveTrackId(trackId);
        setResolveError(null);
      })
      .catch(() => {
        setActiveTrackId(null);
        setResolveError('Playback blocked — try clicking play again.');
      });
  }, []);

  const resolveStreamUrl = useCallback(async (card: Card): Promise<string | null> => {
    const fromApi = cardStreamUrl(card);
    if (fromApi) return fromApi;

    const cached = resolvedStreams.current.get(card.trackId);
    if (cached) return cached;

    const fromEmbed = await fetchEmbedPreviewStream(card.trackId);
    if (fromEmbed) {
      resolvedStreams.current.set(card.trackId, fromEmbed);
    }
    return fromEmbed;
  }, []);

  const playCard = useCallback(
    async (card: Card) => {
      setResolveError(null);
      setLoadingTrackId(card.trackId);

      try {
        const stream = await resolveStreamUrl(card);
        if (!stream) {
          setResolveError(`No preview available for “${card.title}”.`);
          setActiveTrackId(null);
          return;
        }
        playStream(card.trackId, stream);
      } catch {
        setResolveError(`Could not load preview for “${card.title}”.`);
        setActiveTrackId(null);
      } finally {
        setLoadingTrackId(null);
      }
    },
    [playStream, resolveStreamUrl],
  );

  const handleClose = useCallback(() => {
    stopPlayback();
    onClose();
  }, [onClose, stopPlayback]);

  const togglePlay = useCallback(
    (card: Card) => {
      if (activeTrackId === card.trackId && !loadingTrackId) {
        stopPlayback();
        return;
      }
      void playCard(card);
    },
    [activeTrackId, loadingTrackId, playCard, stopPlayback],
  );

  const cardsKey = cards.map((c) => c.trackId).join(',');

  useEffect(() => {
    if (!cardsKey) return;
    const first =
      cards.find((c) => cardStreamUrl(c) !== null) ?? cards[0];
    void playCard(first);
    return () => stopPlayback();
  }, [cardsKey, cards, playCard, stopPlayback]);

  return (
    <div className="modal-overlay" onClick={handleClose} data-testid="track-preview-modal">
      <div
        className={`modal-box track-preview-modal${hasGenres ? ' track-preview-modal--with-genre' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="track-preview-header">
          <span className="track-preview-heading">Track preview</span>
          <span className="track-preview-count">{cards.length} tracks</span>
        </div>
        {resolveError && (
          <p className="track-preview-error" role="alert">
            {resolveError}
          </p>
        )}
        <div className="track-preview-body">
          <div className="track-preview-colhead" aria-hidden="true">
            <span className="track-preview-colhead-cell" />
            <span className="track-preview-colhead-cell">Year</span>
            <span className="track-preview-colhead-cell">Title</span>
            <span className="track-preview-colhead-cell">Artist</span>
            {hasGenres && <span className="track-preview-colhead-cell track-preview-colhead-genre">Genre</span>}
            <span className="track-preview-colhead-cell" />
          </div>
          <div className="track-preview-list">
            {cards.map((card) => {
              const isActive = activeTrackId === card.trackId;
              const isLoading = loadingTrackId === card.trackId;
              const playLabel = isLoading
                ? `Loading ${card.title}`
                : isActive
                  ? `Pause ${card.title}`
                  : `Play ${card.title}`;

              return (
                <div key={card.trackId} className="track-preview-row">
                  {card.albumArt ? (
                    <img src={card.albumArt} alt="" className="track-preview-art" />
                  ) : (
                    <div className="track-preview-art track-preview-art--placeholder" aria-hidden />
                  )}
                  <span className="track-preview-year" title={String(card.releaseYear)}>
                    {card.releaseYear}
                  </span>
                  <span className="track-preview-title" title={card.title}>
                    {card.title}
                  </span>
                  <span className="track-preview-artist" title={card.artist}>
                    {card.artist}
                  </span>
                  {hasGenres && (
                    <span
                      className="track-preview-genre-cell"
                      title={formatGenres(card.genres)}
                      data-testid="track-preview-genre-cell"
                    >
                      {formatGenres(card.genres)}
                    </span>
                  )}
                  <button
                    type="button"
                    className={`track-preview-play-btn is-spotify${isActive ? ' is-playing' : ''}${isLoading ? ' is-loading' : ''}`}
                    onClick={() => togglePlay(card)}
                    disabled={isLoading}
                    aria-label={playLabel}
                    aria-pressed={isActive}
                    data-testid={`track-preview-play-${card.trackId}`}
                  >
                    {isLoading ? '…' : isActive ? '❚❚' : '▶'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        <div className="track-preview-footer">
          <button type="button" className="track-preview-close-btn" onClick={handleClose}>
            Close
          </button>
        </div>
        <audio
          ref={audioRef}
          className="track-preview-audio-hidden"
          onEnded={stopPlayback}
          onError={stopPlayback}
          preload="none"
        />
      </div>
    </div>
  );
}
