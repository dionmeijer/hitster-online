import { useRef, useState, useCallback } from 'react';
import type { Card } from '../../../shared/types';
import { cardStreamUrl } from '../spotify';

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
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [embedId, setEmbedId] = useState<string | null>(null);
  const hasGenres = cards.some((c) => c.genres && c.genres.length > 0);

  const stopPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    setPlayingId(null);
  }, []);

  const togglePlay = useCallback((card: Card) => {
    const stream = cardStreamUrl(card);

    if (!stream) {
      stopPlayback();
      setEmbedId((prev) => (prev === card.trackId ? null : card.trackId));
      return;
    }

    setEmbedId(null);
    const audio = audioRef.current;
    if (!audio) return;

    if (playingId === card.trackId) {
      stopPlayback();
      return;
    }

    stopPlayback();
    audio.src = stream;
    audio.load();
    void audio.play()
      .then(() => setPlayingId(card.trackId))
      .catch(() => setPlayingId(null));
  }, [playingId, stopPlayback]);

  return (
    <div className="modal-overlay" onClick={onClose} data-testid="track-preview-modal">
      <div
        className={`modal-box track-preview-modal${hasGenres ? ' track-preview-modal--with-genre' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="track-preview-header">
          <span className="track-preview-heading">Track preview</span>
          <span className="track-preview-count">{cards.length} tracks</span>
        </div>
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
              const isPlaying = playingId === card.trackId;
              const isEmbedOpen = embedId === card.trackId;
              const active = isPlaying || isEmbedOpen;
              const playLabel = isPlaying
                ? `Pause ${card.title}`
                : isEmbedOpen
                  ? `Close ${card.title} preview`
                  : `Play ${card.title}`;

              return (
                <div key={card.trackId}>
                  <div className="track-preview-row">
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
                      className={`track-preview-play-btn${active ? ' is-playing' : ''}`}
                      onClick={() => togglePlay(card)}
                      aria-label={playLabel}
                    >
                      {active ? '❚❚' : '▶'}
                    </button>
                  </div>
                  {isEmbedOpen && (
                    <iframe
                      src={`https://open.spotify.com/embed/track/${card.trackId}?utm_source=generator&autoplay=1`}
                      width="100%"
                      height="80"
                      frameBorder={0}
                      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                      loading="lazy"
                      title={`Spotify preview: ${card.title}`}
                      style={{ display: 'block', borderRadius: 8, marginTop: 4 }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="track-preview-footer">
          <button type="button" className="track-preview-close-btn" onClick={onClose}>
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
