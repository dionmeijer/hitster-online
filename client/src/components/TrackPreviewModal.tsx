import { useRef, useState, useCallback } from 'react';
import type { Card } from '../../../shared/types';
import { cardStreamUrl, isSpotifyTrackPageUrl } from '../spotify';

interface TrackPreviewModalProps {
  cards: Card[];
  onClose: () => void;
}

export default function TrackPreviewModal({ cards, onClose }: TrackPreviewModalProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const stopPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    setPlayingId(null);
  }, []);

  const spotifyUrlFor = (card: Card) =>
    isSpotifyTrackPageUrl(card.previewUrl)
      ? card.previewUrl
      : `https://open.spotify.com/track/${card.trackId}`;

  const togglePlay = useCallback((card: Card) => {
    const stream = cardStreamUrl(card);
    if (!stream) {
      window.open(spotifyUrlFor(card), '_blank', 'noopener,noreferrer');
      return;
    }

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
      <div className="modal-box track-preview-modal" onClick={e => e.stopPropagation()}>
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
            <span className="track-preview-colhead-cell" />
          </div>
          <div className="track-preview-list">
          {cards.map(card => {
            const stream = cardStreamUrl(card);
            const isPlaying = playingId === card.trackId;
            const playLabel = stream
              ? (isPlaying ? `Pause ${card.title}` : `Play ${card.title}`)
              : `Open ${card.title} in Spotify`;

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
                <button
                  type="button"
                  className={`track-preview-play-btn${isPlaying ? ' is-playing' : ''}${stream ? '' : ' is-spotify'}`}
                  onClick={() => togglePlay(card)}
                  aria-label={playLabel}
                  title={stream ? undefined : 'No preview — opens Spotify'}
                >
                  {isPlaying ? '❚❚' : '▶'}
                </button>
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
