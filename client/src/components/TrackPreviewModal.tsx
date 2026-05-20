import { useRef } from 'react';
import type { Card } from '../../../shared/types';

interface TrackPreviewModalProps {
  cards: Card[];
  onClose: () => void;
}

export default function TrackPreviewModal({ cards, onClose }: TrackPreviewModalProps) {
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  function handlePlay(e: React.SyntheticEvent<HTMLAudioElement>) {
    const el = e.currentTarget;
    if (activeAudioRef.current && activeAudioRef.current !== el) {
      activeAudioRef.current.pause();
    }
    activeAudioRef.current = el;
  }

  return (
    <div className="modal-overlay" onClick={onClose} data-testid="track-preview-modal">
      <div className="modal-box track-preview-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Track Preview — {cards.length} tracks</div>
        <div className="track-preview-list">
          {cards.map(card => (
            <div key={card.trackId} className="track-preview-row">
              {card.albumArt && (
                <img
                  src={card.albumArt}
                  alt=""
                  className="track-preview-art"
                />
              )}
              <div className="track-preview-info">
                <div className="track-preview-title">{card.title}</div>
                <div className="track-preview-meta">{card.artist} · {card.releaseYear}</div>
              </div>
              {card.previewUrl ? (
                <audio
                  controls
                  src={card.previewUrl}
                  className="track-preview-audio"
                  onPlay={handlePlay}
                  preload="none"
                />
              ) : (
                <span className="track-preview-no-audio">No preview</span>
              )}
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="lobby-start-btn" style={{ marginTop: 0 }} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
