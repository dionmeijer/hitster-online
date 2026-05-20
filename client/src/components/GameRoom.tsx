import { useRef, useEffect, useState, useCallback } from 'react';
import type { Room, Card, CardHidden, GameMode } from '../../../shared/types';
import TrackPreviewModal from './TrackPreviewModal';

// ── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  '#4ade80', '#a78bfa', '#fbbf24', '#f87171',
  '#60a5fa', '#fb923c', '#c084fc', '#34d399', '#f472b6',
];

function avatarColor(name: string): string {
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

// ── PlayerList ────────────────────────────────────────────────────────────────

interface PlayerListProps {
  room: Room;
  activePlayerId: string | null;
  sessionId: string;
}

function PlayerList({ room, activePlayerId, sessionId }: PlayerListProps) {
  const players = Object.values(room.players);
  const round = room.activeRound;

  const renderPlayer = (p: typeof players[number]) => {
    const color = avatarColor(p.displayName);
    const pTeamId = Object.entries(room.teams).find(([, t]) => t.playerIds.includes(p.id))?.[0];
    const isActive = round?.config.mode === 'cooperative'
      ? false
      : room.useTeams && pTeamId
        ? activePlayerId === pTeamId
        : p.id === activePlayerId;
    const isMe = p.id === sessionId;
    const entityKey = round?.config.mode === 'cooperative' ? 'cooperative'
      : (room.useTeams && pTeamId ? pTeamId : p.id);
    const timeline = round?.timelines[entityKey];
    const cardCount = timeline?.cards.length ?? 0;
    const tokens = round?.tokens[entityKey] ?? 0;

    return (
      <div key={p.id} className={`player-item${isActive ? ' active-player' : ''}${!p.isConnected ? ' disconnected' : ''}`}>
        <div
          className="player-avatar"
          style={{ background: color + '22', color }}
        >
          {p.displayName[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="player-info">
          <div className="player-name">
            {isMe ? 'You' : p.displayName}
            {isActive && (
              <span style={{ color: '#4ade80', fontSize: 11, marginLeft: 4 }}>▶</span>
            )}
            {!p.isConnected && (
              <span className="player-disconnected-badge">⚡ offline</span>
            )}
          </div>
          <div className="player-score">{cardCount} card{cardCount !== 1 ? 's' : ''}</div>
          <div className="player-token-dots">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className={`token-dot${i >= tokens ? ' empty' : ''}`} />
            ))}
          </div>
        </div>
      </div>
    );
  };

  const teams = Object.values(room.teams);
  const hasTeams = room.useTeams && teams.length > 0;

  return (
    <div className="side-panel">
      <div className="panel-title">Players</div>

      {hasTeams ? (
        <>
          {teams.map(team => {
            const teamPlayers = players.filter(p => team.playerIds.includes(p.id));
            return (
              <div key={team.id}>
                <div className="player-team-header">{team.name}</div>
                {teamPlayers.map(p => renderPlayer(p))}
              </div>
            );
          })}
          {(() => {
            const unteamedPlayers = players.filter(p =>
              !teams.some(t => t.playerIds.includes(p.id))
            );
            return unteamedPlayers.length > 0 ? (
              <div>
                <div className="player-team-header">No team</div>
                {unteamedPlayers.map(p => renderPlayer(p))}
              </div>
            ) : null;
          })()}
        </>
      ) : (
        players.map(p => renderPlayer(p))
      )}

      {round && (
        <div className="round-info">
          <div className="panel-title">Round</div>
          <div className="round-info-row">
            Mode: <span className="round-info-val">{round.config.mode}</span><br />
            Deck: <span className="round-info-val" style={{
              color: round.deckRemaining <= 3 ? '#ef4444' : round.deckRemaining <= 10 ? '#fbbf24' : undefined
            }}>{round.deckRemaining} left</span><br />
            Target: <span className="round-info-val-green">{round.config.cardsToWin} cards</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── AudioPlayer ───────────────────────────────────────────────────────────────

interface AudioPlayerProps {
  previewUrl: string | null;
  playAt: number | null;
  currentCard: CardHidden | null;
  revealedCard: Card | null;
  isFlipped: boolean;
}

function AudioPlayer({ previewUrl, playAt, currentCard, revealedCard, isFlipped }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const waveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const [progress, setProgress] = useState(0);

  // Waveform animation
  useEffect(() => {
    if (!waveformRef.current) return;
    // Create bars
    waveformRef.current.innerHTML = '';
    const bars: HTMLDivElement[] = [];
    for (let i = 0; i < 60; i++) {
      const bar = document.createElement('div');
      bar.className = 'waveform-bar';
      bar.style.height = `${Math.random() * 28 + 4}px`;
      waveformRef.current.appendChild(bar);
      bars.push(bar);
    }

    waveIntervalRef.current = setInterval(() => {
      bars.forEach(b => {
        b.style.height = `${Math.random() * 28 + 4}px`;
      });
    }, 150);

    return () => {
      if (waveIntervalRef.current) clearInterval(waveIntervalRef.current);
    };
  }, []);

  // Audio scheduling
  useEffect(() => {
    if (!previewUrl || !playAt) return;

    const audio = audioRef.current;
    if (!audio) return;

    audio.src = previewUrl;
    audio.load();

    const now = Date.now();
    const delay = playAt - now;
    const startTime = Math.max(0, delay);
    let timer: ReturnType<typeof setTimeout> | null = null;

    // Progress / countdown
    const startProgress = () => {
      setTimeLeft(30);
      setProgress(0);
      let elapsed = 0;

      progressIntervalRef.current = setInterval(() => {
        elapsed += 0.1;
        const pct = Math.min((elapsed / 30) * 100, 100);
        setProgress(pct);
        setTimeLeft(Math.max(30 - elapsed, 0));
        if (elapsed >= 30 && progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
        }
      }, 100);
    };

    timer = setTimeout(() => {
      void audio.play().catch(() => {
        // autoplay blocked — ignore
      });
      startProgress();
    }, startTime);

    return () => {
      if (timer) clearTimeout(timer);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      audio.pause();
      audio.src = '';
      setTimeLeft(30);
      setProgress(0);
    };
  }, [previewUrl, playAt]);

  const albumArt = isFlipped
    ? (revealedCard?.albumArt ?? currentCard?.albumArt ?? null)
    : (currentCard?.albumArt ?? null);

  const showDetails = isFlipped && revealedCard;

  return (
    <>
      <div className="now-playing">
        <div className="album-art-wrap">
          {albumArt ? (
            <>
              <img src={albumArt} alt="Album art" />
              {!isFlipped && <div className="album-art-blur">🎵</div>}
            </>
          ) : (
            <div className="album-art-blur">🎵</div>
          )}
        </div>

        <div className="song-info">
          <div className="song-label">
            {isFlipped ? 'REVEALED' : 'NOW PLAYING — PLACE THIS CARD'}
          </div>
          {showDetails ? (
            <>
              <div className="song-title">{revealedCard.title}</div>
              <div className="song-artist">{revealedCard.artist}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                <div className="song-year">{revealedCard.releaseYear}</div>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 8 }}>
              Song is playing for all...
            </div>
          )}
        </div>

        <div className="song-timer-wrap">
          <div className="song-timer-label">TIME LEFT</div>
          <div className="song-timer">
            0:{String(Math.ceil(timeLeft)).padStart(2, '0')}
          </div>
        </div>
      </div>

      <div className="waveform" ref={waveformRef} />
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <audio ref={audioRef} preload="auto" />
    </>
  );
}

// ── Timeline ──────────────────────────────────────────────────────────────────

interface TimelineProps {
  cards: Card[];
  pendingCard: CardHidden | null;
  isActivePlayer: boolean;
  placedPosition: number | null;
  selectedPosition: number | null;
  onSelectPosition: (pos: number) => void;
  isInChallengePhase: boolean;
}

function Timeline({
  cards,
  pendingCard,
  isActivePlayer,
  placedPosition,
  selectedPosition,
  onSelectPosition,
  isInChallengePhase,
}: TimelineProps) {
  // Build an interleaved array: [dropzone, card, dropzone, card, ..., dropzone]
  // Total slots = cards.length + 1
  const canPlace = isActivePlayer && pendingCard !== null && placedPosition === null && !isInChallengePhase;

  return (
    <div className="timeline-section">
      <div className="timeline-label">
        {isActivePlayer
          ? 'YOUR TIMELINE — Click a gap to place the new card'
          : 'TIMELINE'}
      </div>
      <div className="timeline-track">
        {Array.from({ length: cards.length + 1 }, (_, i) => {
          const isSelected = selectedPosition === i;
          const isPlaced = placedPosition === i;
          return (
            <div key={`slot-${i}`} style={{ display: 'flex', alignItems: 'center' }}>
              {/* Drop zone */}
              <div
                className={`drop-zone${isSelected ? ' selected-zone' : ''}${isPlaced ? ' selected-zone' : ''}`}
                onClick={() => canPlace && onSelectPosition(i)}
                style={{ cursor: canPlace ? 'pointer' : 'default' }}
              >
                <div className="drop-zone-line" />
              </div>

              {/* Card after this drop zone (if exists) */}
              {cards[i] && (
                <div className={`timeline-card placed-card`}>
                  <div className="card-year">{cards[i].releaseYear}</div>
                  <div className="card-title">{cards[i].title}</div>
                  <div className="card-artist">{cards[i].artist}</div>
                </div>
              )}
            </div>
          );
        })}

        {/* Pending card display slot — shown when active and no placement yet */}
        {isActivePlayer && pendingCard && placedPosition === null && (
          <div className="pending-card-slot" style={{ marginLeft: 16 }}>
            <div className="pending-card-icon">🎵</div>
            <div className="pending-card-label">New Card</div>
          </div>
        )}

        {/* Placed-but-not-flipped card */}
        {isActivePlayer && pendingCard && placedPosition !== null && (
          <div className="timeline-card placed-pending" style={{ marginLeft: 16 }}>
            <div className="card-face-down">?</div>
            <div style={{ fontSize: 9, color: '#fbbf24', marginTop: 4 }}>Placed!</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── ChallengeBar ──────────────────────────────────────────────────────────────

interface ChallengeBarProps {
  deadline: number | null;
  onChallenge: () => void;
  isActivePlayer: boolean;
}

function ChallengeBar({ deadline, onChallenge, isActivePlayer }: ChallengeBarProps) {
  const [seconds, setSeconds] = useState<number>(10);

  useEffect(() => {
    if (!deadline) return;
    const tick = () => {
      const rem = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSeconds(rem);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [deadline]);

  if (!deadline) return null;

  return (
    <div className="challenge-timer-box">
      <div className="challenge-timer-label">CHALLENGE WINDOW</div>
      <div className="challenge-timer-count">{seconds}</div>
      {!isActivePlayer && seconds > 0 && (
        <button
          className="action-btn btn-hitster"
          onClick={onChallenge}
          style={{ marginTop: 8 }}
        >
          HITSTER!
        </button>
      )}
    </div>
  );
}

// ── FlipResult overlay ────────────────────────────────────────────────────────

interface FlipResultProps {
  card: Card;
  correct: boolean;
  onDismiss: () => void;
}

function FlipResult({ card, correct, onDismiss }: FlipResultProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3500);
    const handler = () => onDismiss();
    window.addEventListener('keydown', handler);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handler);
    };
  }, [onDismiss]);

  return (
    <div className="flip-result-overlay" onClick={onDismiss}>
      <div className={`flip-result-box ${correct ? 'correct' : 'wrong'}`}>
        <div className="flip-result-icon">{correct ? '✓' : '✗'}</div>
        <div className="flip-result-label">
          {correct ? 'Correct!' : 'Wrong!'}
        </div>
        <div className="flip-result-card-title">{card.title}</div>
        <div className="flip-result-card-artist">{card.artist}</div>
        <div className="flip-result-card-year">{card.releaseYear}</div>
        <div className="flip-result-dismiss">Press any key or click to continue</div>
      </div>
    </div>
  );
}

// ── WinScreen ─────────────────────────────────────────────────────────────────

interface WinScreenProps {
  winnerId: string | null;
  room: Room;
  sessionId: string;
  onBackToLobby: () => void;
  onLeave: () => void;
}

function WinScreen({ winnerId, room, sessionId, onBackToLobby, onLeave }: WinScreenProps) {
  const isCoopWin = winnerId === 'cooperative';
  const isCoopLoss = !winnerId && room.activeRound?.config.mode === 'cooperative';
  const isTeamWin = winnerId && room.teams[winnerId] !== undefined;
  const winner = !isCoopWin && !isTeamWin && winnerId ? room.players[winnerId] : null;
  const winnerTeam = isTeamWin && winnerId ? room.teams[winnerId] : null;
  const isMe = winnerId === sessionId;
  const isMyTeam = winnerId !== null && room.teams[winnerId ?? '']?.playerIds.includes(sessionId);
  const cardsToWin = room.activeRound?.config.cardsToWin ?? 10;

  let title: string;
  let subtitle: string;
  if (isCoopWin) {
    title = 'Team Wins!';
    subtitle = `You reached ${cardsToWin} cards together!`;
  } else if (isCoopLoss) {
    title = 'Team Lost';
    subtitle = 'The shared token pool ran out.';
  } else if (winnerTeam) {
    title = isMyTeam ? 'Your Team Wins!' : `${winnerTeam.name} Wins!`;
    subtitle = `${winnerTeam.name} reached ${cardsToWin} cards first.`;
  } else if (isMe) {
    title = 'You Win!';
    subtitle = 'You built the perfect timeline!';
  } else if (winner) {
    title = `${winner.displayName} Wins!`;
    subtitle = `${winner.displayName} reached ${cardsToWin} cards first.`;
  } else {
    title = 'Game Over!';
    subtitle = 'The deck ran out.';
  }

  const isOwner = room.ownerId === sessionId;

  return (
    <div className="win-screen">
      <div className="scanlines" />
      <div className="win-trophy">{isCoopLoss ? '💀' : '🏆'}</div>
      <div className="win-title">{title}</div>
      <div className="win-subtitle">{subtitle}</div>

      {/* Round history */}
      {room.roundHistory.length > 0 && (
        <div className="win-history">
          <div className="win-history-title">Round History</div>
          {room.roundHistory.map((r, i) => {
            const rWinner = r.winnerId && room.players[r.winnerId]
              ? room.players[r.winnerId].displayName
              : r.winnerId === 'cooperative' ? 'Team' : r.winnerId && room.teams[r.winnerId]
                ? room.teams[r.winnerId].name
                : 'No winner';
            return (
              <div key={i} className="win-history-row">
                <span className="win-history-round">Round {r.roundNumber}</span>
                <span className="win-history-mode">{r.mode}</span>
                <span className="win-history-winner">{rWinner}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="win-actions">
        <button className="win-play-again" onClick={onBackToLobby}>
          {isOwner ? '⊕ Back to Lobby' : '← Back to Lobby'}
        </button>
        <button className="win-leave" onClick={onLeave}>
          Leave Room
        </button>
      </div>
    </div>
  );
}

// ── Lobby screen ──────────────────────────────────────────────────────────────

const MODES: { value: GameMode; label: string; desc: string }[] = [
  { value: 'original', label: 'Original', desc: '2 starting tokens, naming bonus on' },
  { value: 'pro',      label: 'Pro',      desc: '5 starting tokens, no naming bonus' },
  { value: 'expert',   label: 'Expert',   desc: '3 starting tokens, no naming bonus' },
  { value: 'cooperative', label: 'Cooperative', desc: 'Shared timeline & tokens, reach target together' },
];

interface LobbyScreenProps {
  room: Room;
  sessionId: string;
  onStartRound: (mode: GameMode, playlistLabel?: string, cardsToWin?: number, tokensEnabled?: boolean) => void;
  onCreateTeam: (name: string) => void;
  onJoinTeam: (teamId: string) => void;
  onLeaveTeam: () => void;
  onLeave: () => void;
  socketError?: string | null;
  onPreviewPlaylist: (playlistLabel: string) => void;
  onClearPlaylistPreview: () => void;
  playlistPreviewCards: Card[] | null;
  playlistPreviewLoading: boolean;
}

function LobbyScreen({ room, sessionId, onStartRound, onCreateTeam, onJoinTeam, onLeaveTeam, onLeave, socketError, onPreviewPlaylist, onClearPlaylistPreview, playlistPreviewCards, playlistPreviewLoading }: LobbyScreenProps) {
  const isOwner = room.ownerId === sessionId;
  const players = Object.values(room.players);
  const [playlistLabel, setPlaylistLabel] = useState('');
  const [mode, setMode] = useState<GameMode>('original');
  const [cardsToWin, setCardsToWin] = useState(10);
  const [tokensEnabled, setTokensEnabled] = useState(true);
  const [starting, setStarting] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (socketError) setStarting(false);
  }, [socketError]);

  const myTeam = Object.values(room.teams).find(t => t.playerIds.includes(sessionId));
  const teams = Object.values(room.teams);

  function handleStart() {
    setStarting(true);
    onStartRound(mode, playlistLabel.trim() || undefined, cardsToWin, tokensEnabled);
  }

  function handleCreateTeam() {
    const name = newTeamName.trim();
    if (!name) return;
    onCreateTeam(name);
    setNewTeamName('');
  }

  function handleCopyLink() {
    const url = `${window.location.origin}/?room=${room.code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="lobby-screen">
      <div className="lobby-code" data-testid="lobby-room-code">{room.code}</div>
      <div className="lobby-code-label">Share this code to invite friends</div>
      <button className="lobby-copy-link-btn" onClick={handleCopyLink}>
        {copied ? '✓ Copied!' : '🔗 Copy invite link'}
      </button>

      <div className="lobby-player-list">
        {players.map(p => {
          const color = avatarColor(p.displayName);
          return (
            <div key={p.id} className="lobby-player-chip" data-testid="lobby-player">
              <div
                className="player-avatar"
                style={{ background: color + '22', color, width: 24, height: 24, fontSize: 8 }}
              >
                {p.displayName[0]?.toUpperCase()}
              </div>
              <span data-testid="lobby-player-name">{p.displayName}</span>
              {p.id === room.ownerId && (
                <span style={{ fontSize: 10, color: '#fbbf24' }}>★</span>
              )}
            </div>
          );
        })}
      </div>

      {isOwner && (
        <>
          <div className="lobby-playlist-field">
            <input
              className="form-input"
              type="text"
              placeholder="Genre or Spotify playlist URL (optional)"
              value={playlistLabel}
              onChange={e => setPlaylistLabel(e.target.value)}
              data-testid="playlist-label-input"
            />
            <button
              className="lobby-preview-btn"
              disabled={!playlistLabel.trim() || playlistPreviewLoading}
              onClick={() => onPreviewPlaylist(playlistLabel.trim())}
              data-testid="preview-tracks-btn"
            >
              {playlistPreviewLoading ? '…' : '🔍 Preview'}
            </button>
          </div>

          {playlistPreviewCards && (
            <TrackPreviewModal
              cards={playlistPreviewCards}
              onClose={onClearPlaylistPreview}
            />
          )}

          <div className="lobby-config-section">
            <div className="lobby-config-label">Game Mode</div>
            <div className="lobby-mode-grid" data-testid="mode-selector">
              {MODES.map(m => (
                <label
                  key={m.value}
                  className={`lobby-mode-option${mode === m.value ? ' selected' : ''}`}
                  data-testid={`mode-option-${m.value}`}
                >
                  <input
                    type="radio"
                    name="game-mode"
                    value={m.value}
                    checked={mode === m.value}
                    onChange={() => setMode(m.value)}
                    style={{ display: 'none' }}
                  />
                  <div className="lobby-mode-name">{m.label}</div>
                  <div className="lobby-mode-desc">{m.desc}</div>
                </label>
              ))}
            </div>

            <div className="lobby-config-row">
              <label className="lobby-config-label" htmlFor="cards-to-win">
                Cards to Win
              </label>
              <input
                id="cards-to-win"
                className="form-input"
                type="number"
                min={1}
                max={20}
                value={cardsToWin}
                onChange={e => setCardsToWin(Math.max(1, Math.min(20, Number(e.target.value))))}
                data-testid="cards-to-win-input"
                style={{ width: 72 }}
              />
            </div>

            <div className="lobby-config-row">
              <label className="lobby-config-label" htmlFor="tokens-enabled">
                Tokens Enabled
              </label>
              <input
                id="tokens-enabled"
                type="checkbox"
                checked={tokensEnabled}
                onChange={e => setTokensEnabled(e.target.checked)}
                data-testid="tokens-enabled-toggle"
              />
            </div>
          </div>
        </>
      )}

      {/* ── Teams section ── */}
      <div className="lobby-teams-section">
        <div className="lobby-config-label">Teams (optional)</div>

        {teams.length > 0 && (
          <div className="lobby-teams-list" data-testid="teams-list">
            {teams.map(team => {
              const isMyTeamRow = team.id === myTeam?.id;
              return (
                <div key={team.id} className={`lobby-team-row${isMyTeamRow ? ' my-team' : ''}`} data-testid="team-row">
                  <div className="lobby-team-name">{team.name}</div>
                  <div className="lobby-team-members">
                    {team.playerIds.map(pid => (
                      <span key={pid} className="lobby-team-member">
                        {room.players[pid]?.displayName ?? pid}
                      </span>
                    ))}
                  </div>
                  {!isMyTeamRow ? (
                    <button
                      className="lobby-team-btn"
                      onClick={() => onJoinTeam(team.id)}
                      data-testid="join-team-btn"
                    >
                      Join
                    </button>
                  ) : (
                    <button
                      className="lobby-team-btn leave"
                      onClick={onLeaveTeam}
                      data-testid="leave-team-btn"
                    >
                      Leave
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="lobby-create-team-row">
          <input
            className="form-input"
            type="text"
            placeholder="New team name…"
            maxLength={20}
            value={newTeamName}
            onChange={e => setNewTeamName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateTeam()}
            data-testid="new-team-name-input"
            style={{ flex: 1, minWidth: 0 }}
          />
          <button
            className="lobby-team-btn"
            disabled={!newTeamName.trim()}
            onClick={handleCreateTeam}
            data-testid="create-team-btn"
          >
            + Create
          </button>
        </div>
      </div>

      {socketError && (
        <div className="server-error-msg">{socketError}</div>
      )}

      {isOwner ? (
        <button
          className="lobby-start-btn"
          disabled={players.length < 1 || starting}
          onClick={handleStart}
          data-testid="start-round-btn"
        >
          {starting ? 'Starting…' : '▶ Start Round'}
        </button>
      ) : (
        <div className="lobby-waiting">
          Waiting for {room.players[room.ownerId]?.displayName ?? 'host'} to start...
        </div>
      )}

      <button className="lobby-leave-btn" onClick={onLeave} data-testid="leave-btn">
        ← Leave Room
      </button>
    </div>
  );
}

// ── GameLog ───────────────────────────────────────────────────────────────────

interface LogEntry {
  id: number;
  html: string;
}

// ── TokenPanel ────────────────────────────────────────────────────────────────

interface TokenPanelProps {
  myTokens: number;
  canSkip: boolean;
  onSkip: () => void;
}

function TokenPanel({ myTokens, canSkip, onSkip }: TokenPanelProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 12, color: '#6b7280' }}>YOUR TOKENS</span>
      <div className="token-row">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={`token-circle${i >= myTokens ? ' empty' : ''}`}>
            {i < myTokens ? '🪙' : ''}
          </div>
        ))}
      </div>
      {canSkip && (
        <button
          className="action-btn btn-skip-action"
          disabled={myTokens < 1}
          onClick={onSkip}
        >
          SKIP (1🪙)
        </button>
      )}
    </div>
  );
}

// ── Main GameRoom component ───────────────────────────────────────────────────

export interface GameRoomProps {
  room: Room;
  currentCard: CardHidden | null;
  activePlayerId: string | null;
  previewUrl: string | null;
  playAt: number | null;
  timelineLength: number;
  lastFlip: { card: Card; correct: boolean } | null;
  roundEnded: { winnerId: string | null } | null;
  myTokens: number;
  sessionId: string;
  socketError?: string | null;
  onStartRound: (mode: GameMode, playlistLabel?: string, cardsToWin?: number, tokensEnabled?: boolean) => void;
  onPlaceCard: (position: number) => void;
  onChallengeCard: () => void;
  onSkipCard: () => void;
  onNameSong: (title: string, artist: string, year?: number) => void;
  onBuyCard: () => void;
  onDismissRoundEnd: () => void;
  onCreateTeam: (name: string) => void;
  onJoinTeam: (teamId: string) => void;
  onLeaveTeam: () => void;
  onLeave: () => void;
  onPreviewPlaylist: (playlistLabel: string) => void;
  onClearPlaylistPreview: () => void;
  playlistPreviewCards: Card[] | null;
  playlistPreviewLoading: boolean;
}

export default function GameRoom({
  room,
  currentCard,
  activePlayerId,
  previewUrl,
  playAt,
  lastFlip,
  roundEnded,
  myTokens,
  sessionId,
  socketError,
  onStartRound,
  onPlaceCard,
  onChallengeCard,
  onSkipCard,
  onNameSong,
  onBuyCard,
  onDismissRoundEnd,
  onCreateTeam,
  onJoinTeam,
  onLeaveTeam,
  onLeave,
  onPreviewPlaylist,
  onClearPlaylistPreview,
  playlistPreviewCards,
  playlistPreviewLoading,
}: GameRoomProps) {
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null);
  const [showFlipResult, setShowFlipResult] = useState(false);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const logCounter = useRef(0);
  const [nameSongTitle, setNameSongTitle] = useState('');
  const [nameSongArtist, setNameSongArtist] = useState('');
  const [nameSongYear, setNameSongYear] = useState('');

  const round = room.activeRound;
  const isCooperative = round?.config.mode === 'cooperative';
  const myTeamId = Object.entries(room.teams).find(([, t]) => t.playerIds.includes(sessionId))?.[0];
  const isActivePlayer = isCooperative
    ? activePlayerId !== null  // anyone can act in cooperative (handled server-side)
    : room.useTeams && myTeamId
      ? activePlayerId === myTeamId
      : activePlayerId === sessionId;
  const timelineKey = isCooperative ? 'cooperative' : (room.useTeams && myTeamId ? myTeamId : sessionId);
  const myTimeline = round?.timelines[timelineKey];
  const myCards = myTimeline?.cards ?? [];

  // Current turn phase
  const currentTurn = round?.currentTurn;
  const isInChallengePhase = currentTurn?.phase === 'challenge';
  const isInFlipPhase = currentTurn?.phase === 'flip';
  const placedPosition = isActivePlayer ? (currentTurn?.placedPosition ?? null) : null;
  const challengeDeadline = isInChallengePhase ? (currentTurn?.challengeDeadline ?? null) : null;

  // Show flip result when lastFlip changes
  useEffect(() => {
    if (lastFlip) {
      setShowFlipResult(true);
      setSelectedPosition(null);

      const msg = lastFlip.correct
        ? `<span class="log-highlight">${lastFlip.card.title}</span> — <span class="log-correct">✓ Correct!</span>`
        : `<span class="log-highlight">${lastFlip.card.title}</span> — <span class="log-wrong">✗ Wrong</span>`;

      const entry: LogEntry = { id: logCounter.current++, html: msg };
      setLogEntries(prev => [entry, ...prev].slice(0, 50));
    }
  }, [lastFlip]);

  const handleDismissFlip = useCallback(() => {
    setShowFlipResult(false);
  }, []);

  function handleSelectPosition(pos: number) {
    setSelectedPosition(pos);
  }

  function handleConfirmPlace() {
    if (selectedPosition === null) return;
    onPlaceCard(selectedPosition);
  }

  // Win screen — shown first so dismiss → lobby transition works
  if (roundEnded) {
    return (
      <WinScreen
        winnerId={roundEnded.winnerId}
        room={room}
        sessionId={sessionId}
        onBackToLobby={onDismissRoundEnd}
        onLeave={onLeave}
      />
    );
  }

  // In lobby (or round_ended after dismissing win screen)
  if (room.status === 'lobby' || room.status === 'round_ended') {
    return (
      <div className="game-root">
        <div className="scanlines" />
        <header className="game-header">
          <div className="logo">HITSTER</div>
          <div className="room-code-badge">ROOM: {room.code}</div>
          <button
            style={{ background: 'none', border: '1px solid #374151', color: '#6b7280', padding: '6px 12px', cursor: 'pointer', fontFamily: 'Rajdhani, sans-serif', fontSize: 13 }}
            onClick={onLeave}
          >
            Leave
          </button>
        </header>
        <LobbyScreen
          room={room}
          sessionId={sessionId}
          onStartRound={onStartRound}
          onLeave={onLeave}
          onCreateTeam={onCreateTeam}
          onJoinTeam={onJoinTeam}
          onLeaveTeam={onLeaveTeam}
          socketError={socketError}
          onPreviewPlaylist={onPreviewPlaylist}
          onClearPlaylistPreview={onClearPlaylistPreview}
          playlistPreviewCards={playlistPreviewCards}
          playlistPreviewLoading={playlistPreviewLoading}
        />
      </div>
    );
  }

  // Active round
  const isFlipped = isInFlipPhase || showFlipResult;
  const revealedCard = lastFlip?.card ?? null;

  return (
    <div className="game-root" data-testid="round-active">
      <div className="scanlines" />

      {/* Header */}
      <header className="game-header">
        <div className="logo">HITSTER</div>
        <div className="room-code-badge">ROOM: {room.code}</div>
        <TokenPanel
          myTokens={myTokens}
          canSkip={isActivePlayer && !isInChallengePhase && currentCard !== null}
          onSkip={onSkipCard}
        />
      </header>

      <div className="game-main">
        {/* LEFT: Player list */}
        <PlayerList room={room} activePlayerId={activePlayerId} sessionId={sessionId} />

        {/* CENTER: Gameplay */}
        <div className="center-col">
          <AudioPlayer
            previewUrl={previewUrl}
            playAt={playAt}
            currentCard={currentCard}
            revealedCard={revealedCard}
            isFlipped={isFlipped}
          />

          {isCooperative && round && (round.tokens['cooperative'] ?? 0) <= 2 && (
            <div className="coop-token-warning">
              ⚠ Only {round.tokens['cooperative'] ?? 0} shared token{(round.tokens['cooperative'] ?? 0) !== 1 ? 's' : ''} left!
            </div>
          )}

          <Timeline
            cards={myCards}
            pendingCard={currentCard}
            isActivePlayer={isActivePlayer}
            placedPosition={typeof placedPosition === 'number' ? placedPosition : null}
            selectedPosition={selectedPosition}
            onSelectPosition={handleSelectPosition}
            isInChallengePhase={isInChallengePhase}
          />

          {/* Actions bar */}
          <div className="actions-bar">
            {isActivePlayer && currentCard && placedPosition === null && (
              <button
                className="action-btn btn-confirm"
                disabled={selectedPosition === null}
                onClick={handleConfirmPlace}
              >
                CONFIRM PLACE
              </button>
            )}

            {isActivePlayer && currentCard && !isInChallengePhase && (
              <button
                className="action-btn btn-skip-action"
                data-testid="skip-btn"
                disabled={myTokens < 1}
                onClick={onSkipCard}
              >
                SKIP (1🪙)
              </button>
            )}

            {isActivePlayer && currentCard && !isInChallengePhase && currentTurn?.phase === 'place' && (
              <button
                className="action-btn btn-buy-action"
                data-testid="buy-btn"
                disabled={myTokens < 3}
                onClick={onBuyCard}
                title="Spend 3 tokens to place without hearing — your next turn will be skipped"
              >
                BUY (3🪙)
              </button>
            )}

            {!isActivePlayer && isInChallengePhase && !isCooperative && (
              <button
                className="action-btn btn-hitster"
                onClick={onChallengeCard}
              >
                HITSTER!
              </button>
            )}

            <div className="turn-info-label">
              {round && (
                <>
                  Turn <span>{round.turnIndex + 1}</span>
                  {' / '}
                  {isActivePlayer ? 'Your turn' : (
                    <span>
                      {room.players[activePlayerId ?? '']?.displayName ?? '...'}'s turn
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Game log + challenge timer */}
        <div className="right-side-panel">
          <div className="panel-title">Game Log</div>

          <ChallengeBar
            deadline={isCooperative ? null : challengeDeadline}
            onChallenge={onChallengeCard}
            isActivePlayer={isActivePlayer}
          />

          <div className="game-log">
            {logEntries.map(entry => (
              <div
                key={entry.id}
                className="log-entry"
                dangerouslySetInnerHTML={{ __html: entry.html }}
              />
            ))}
            {logEntries.length === 0 && (
              <div style={{ color: '#374151', fontSize: 12 }}>Game log will appear here.</div>
            )}
          </div>

          {/* Name song panel */}
          {isActivePlayer && currentCard && !isInChallengePhase && (
            <div style={{ marginTop: 24 }}>
              <div className="panel-title">
                {round?.config.mode === 'pro' || round?.config.mode === 'expert'
                  ? 'Name the Song (required to score)'
                  : 'Name the Song (+1🪙)'}
              </div>
              <div className="name-song-form">
                <input
                  className="name-song-input"
                  data-testid="name-song-title"
                  placeholder="Title"
                  value={nameSongTitle}
                  onChange={e => setNameSongTitle(e.target.value)}
                />
              </div>
              <div className="name-song-form" style={{ marginTop: 6 }}>
                <input
                  className="name-song-input"
                  data-testid="name-song-artist"
                  placeholder="Artist"
                  value={nameSongArtist}
                  onChange={e => setNameSongArtist(e.target.value)}
                />
              </div>
              {round?.config.mode === 'expert' && (
                <div className="name-song-form" style={{ marginTop: 6 }}>
                  <input
                    className="name-song-input"
                    data-testid="name-song-year"
                    type="number"
                    placeholder="Year"
                    value={nameSongYear}
                    onChange={e => setNameSongYear(e.target.value)}
                  />
                </div>
              )}
              <div className="name-song-form" style={{ marginTop: 6 }}>
                <button
                  className="name-song-submit"
                  data-testid="name-song-submit"
                  disabled={
                    !nameSongTitle.trim() ||
                    !nameSongArtist.trim() ||
                    (round?.config.mode === 'expert' && !nameSongYear)
                  }
                  onClick={() => {
                    const year = round?.config.mode === 'expert' ? Number(nameSongYear) : undefined;
                    onNameSong(nameSongTitle.trim(), nameSongArtist.trim(), year);
                    setNameSongTitle('');
                    setNameSongArtist('');
                    setNameSongYear('');
                  }}
                >
                  Submit
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Flip result overlay */}
      {showFlipResult && lastFlip && (
        <FlipResult
          card={lastFlip.card}
          correct={lastFlip.correct}
          onDismiss={handleDismissFlip}
        />
      )}
    </div>
  );
}
