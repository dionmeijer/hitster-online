import { useRef, useEffect, useState, useCallback } from 'react';
import { CHALLENGE_WINDOW_MS } from '../../../shared/constants';
import type { Room, Card, CardHidden, GameMode, Player, Team } from '../../../shared/types';
import TrackPreviewModal from './TrackPreviewModal';
import { PlaylistAutocomplete } from './PlaylistAutocomplete';
import { TimelineView } from './TimelineView';
import { isSpotifyTrackPageUrl } from '../spotify';

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

/** Timeline/token key for the player whose turn it is. */
function activeEntityIdFromRoom(room: Room, activePlayerId: string): string {
  if (room.activeRound?.config.mode === 'cooperative') return 'cooperative';
  if (room.useTeams) {
    const teamEntry = Object.entries(room.teams).find(([, t]) =>
      t.playerIds.includes(activePlayerId),
    );
    return teamEntry?.[0] ?? activePlayerId;
  }
  return activePlayerId;
}

function sortPlayersMeFirst(players: Player[], sessionId: string): Player[] {
  return [...players].sort((a, b) => {
    if (a.id === sessionId) return -1;
    if (b.id === sessionId) return 1;
    return a.displayName.localeCompare(b.displayName);
  });
}

function sortTeamsMeFirst(teams: Team[], sessionId: string): Team[] {
  return [...teams].sort((a, b) => {
    const aMe = a.playerIds.includes(sessionId);
    const bMe = b.playerIds.includes(sessionId);
    if (aMe && !bMe) return -1;
    if (!aMe && bMe) return 1;
    return a.name.localeCompare(b.name);
  });
}

function activePlayerDisplayName(room: Room, activePlayerId: string | null): string {
  if (!activePlayerId) return '...';
  if (room.players[activePlayerId]) return room.players[activePlayerId].displayName;
  if (room.teams[activePlayerId]) return room.teams[activePlayerId].name;
  return '...';
}

function playerDisplayName(room: Room, playerId: string): string {
  if (room.players[playerId]) return room.players[playerId].displayName;
  const team = Object.values(room.teams).find((t) => t.playerIds.includes(playerId));
  return team?.name ?? playerId;
}

function HitsterLogo() {
  return (
    <div className="logo">
      HITSTER
      <span className="cursor-blink" aria-hidden />
    </div>
  );
}

// ── PlayerList ────────────────────────────────────────────────────────────────

interface PlayerListProps {
  room: Room;
  activePlayerId: string | null;
  activeTurnLabel: string;
  isMyTurn: boolean;
  turnIndex: number;
  turnSecondsLeft: number | null;
  sessionId: string;
}

function PlayerList({
  room,
  activePlayerId,
  activeTurnLabel,
  isMyTurn,
  turnIndex,
  turnSecondsLeft,
  sessionId,
}: PlayerListProps) {
  const players = Object.values(room.players).filter((p) => !p.isSpectator);
  const round = room.activeRound;

  const renderPlayer = (p: typeof players[number]) => {
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
      <div
        key={p.id}
        className={`player-item${isMe ? ' is-me pinned' : ''}${isActive ? ' active-player' : ''}${!p.isConnected ? ' disconnected' : ''}`}
      >
        <div className="player-avatar">
          {p.displayName[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="player-info">
          <div className="player-name">
            {isMe ? 'You' : p.displayName}
            {isActive && <span className="player-turn-badge">TURN</span>}
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

  const teams = sortTeamsMeFirst(Object.values(room.teams), sessionId);
  const hasTeams = room.useTeams && teams.length > 0;
  const sortedPlayers = sortPlayersMeFirst(players, sessionId);

  return (
    <div className="side-panel">
      {round && activePlayerId && (
        <div
          className={`sidebar-turn-status${isMyTurn ? ' sidebar-turn-status--you' : ''}`}
          data-testid="sidebar-turn-status"
        >
          <div className="sidebar-turn-status-main">
            <div className="sidebar-turn-who">
              {isMyTurn ? 'your turn' : `${activeTurnLabel}'s turn`}
            </div>
            <div className="sidebar-turn-index">
              Turn <span className="sidebar-turn-num">{turnIndex + 1}</span>
            </div>
          </div>
          {turnSecondsLeft !== null && turnSecondsLeft > 0 && (
            <div className="sidebar-turn-timer">{turnSecondsLeft}s to place</div>
          )}
        </div>
      )}

      <div className="panel-title">Players</div>

      {hasTeams ? (
        <>
          {teams.map(team => {
            const teamPlayers = sortPlayersMeFirst(
              players.filter(p => team.playerIds.includes(p.id)),
              sessionId,
            );
            return (
              <div key={team.id}>
                <div className="player-team-header">{team.name}</div>
                {teamPlayers.map(p => renderPlayer(p))}
              </div>
            );
          })}
          {(() => {
            const unteamedPlayers = sortPlayersMeFirst(
              players.filter(p => !teams.some(t => t.playerIds.includes(p.id))),
              sessionId,
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
        sortedPlayers.map(p => renderPlayer(p))
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
  observerCard: Card | null;
  isActivePlayer: boolean;
}

function AudioPlayer({
  previewUrl,
  playAt,
  currentCard,
  revealedCard,
  isFlipped,
  observerCard,
  isActivePlayer,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const waveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const [progress, setProgress] = useState(0);
  const [showEmbed, setShowEmbed] = useState(false);
  const spotifyOnly = previewUrl !== null && isSpotifyTrackPageUrl(previewUrl);

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

  // Reset embed when a new card arrives
  useEffect(() => {
    setShowEmbed(false);
  }, [currentCard?.trackId]);

  // Show Spotify embed at playAt when no MP3 stream is available
  useEffect(() => {
    if (!spotifyOnly || !playAt || !currentCard) return;

    const delay = Math.max(0, playAt - Date.now());
    const timer = setTimeout(() => setShowEmbed(true), delay);
    return () => {
      clearTimeout(timer);
      setShowEmbed(false);
    };
  }, [spotifyOnly, playAt, currentCard?.trackId]);

  // Audio scheduling (MP3 previews only — Spotify track pages open externally)
  useEffect(() => {
    if (!previewUrl || !playAt || spotifyOnly) return;

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
  }, [previewUrl, playAt, spotifyOnly]);

  const albumArt = isFlipped
    ? (revealedCard?.albumArt ?? currentCard?.albumArt ?? null)
    : (currentCard?.albumArt ?? null);

  const showDetails = isFlipped && revealedCard;
  const showObserverDetails = !isActivePlayer && observerCard && !isFlipped;

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
          {showDetails && revealedCard ? (
            <>
              <div className="song-title">{revealedCard.title}</div>
              <div className="song-artist">{revealedCard.artist}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                <div className="song-year">{revealedCard.releaseYear}</div>
              </div>
            </>
          ) : showObserverDetails && observerCard ? (
            <>
              <div className="song-title">{observerCard.title}</div>
              <div className="song-artist">{observerCard.artist}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                <div className="song-year">{observerCard.releaseYear}</div>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 8 }}>
              {isActivePlayer
                ? spotifyOnly
                  ? showEmbed
                    ? 'Song is playing…'
                    : 'Starting preview…'
                  : 'Song is playing…'
                : spotifyOnly
                  ? showEmbed
                    ? 'Song is playing for all…'
                    : 'Starting preview…'
                  : 'Song is playing for all…'}
            </div>
          )}
        </div>

        {!spotifyOnly && (
          <div className="song-timer-wrap">
            <div className="song-timer-label">TIME LEFT</div>
            <div className="song-timer">
              0:{String(Math.ceil(timeLeft)).padStart(2, '0')}
            </div>
          </div>
        )}
      </div>

      {spotifyOnly ? (
        showEmbed && currentCard && (
          <iframe
            src={`https://open.spotify.com/embed/track/${currentCard.trackId}?utm_source=generator&autoplay=1`}
            width="100%"
            height="80"
            frameBorder={0}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="eager"
            title="Spotify Preview"
            style={{ display: 'block', borderRadius: 8, margin: '8px 0' }}
          />
        )
      ) : (
        <>
          <div className="waveform" ref={waveformRef} />
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <audio ref={audioRef} preload="auto" />
        </>
      )}
    </>
  );
}

// ── ChallengeBar ──────────────────────────────────────────────────────────────

interface ChallengeBarProps {
  deadline: number | null;
}

function ChallengeBar({ deadline }: ChallengeBarProps) {
  const [seconds, setSeconds] = useState<number>(CHALLENGE_WINDOW_MS / 1000);

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
    <div className="challenge-timer-box challenge-timer-box--compact">
      <div className="challenge-timer-label">Challenge</div>
      <div className="challenge-timer-count">{seconds}s</div>
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
  onEndGame: () => void;
}

function WinScreen({ winnerId, room, sessionId, onBackToLobby, onLeave, onEndGame }: WinScreenProps) {
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
        {isOwner && (
          <button className="win-end-game" onClick={onEndGame}>
            ✕ End Game
          </button>
        )}
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

  return (
    <div className="lobby-screen" data-testid="lobby-screen">
      <div className="lobby-topic">{room.topic}</div>

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
            <PlaylistAutocomplete
              value={playlistLabel}
              onChange={setPlaylistLabel}
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
  observerCard: Card | null;
  activePlayerId: string | null;
  previewUrl: string | null;
  playAt: number | null;
  turnEndsAt: number | null;
  timelineLength: number;
  lastFlip: {
    card: Card;
    correct: boolean;
    activePlayerId: string;
    placedPosition: number;
    challengeResults: Array<{ challengerId: string; outcome: 'stole_card' | 'lost_token' }>;
  } | null;
  lastChallenge: { challengerId: string } | null;
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
  onEndGame: () => void;
  onLeave: () => void;
  onPreviewPlaylist: (playlistLabel: string) => void;
  onClearPlaylistPreview: () => void;
  playlistPreviewCards: Card[] | null;
  playlistPreviewLoading: boolean;
}

export default function GameRoom({
  room,
  currentCard,
  observerCard,
  activePlayerId,
  previewUrl,
  playAt,
  turnEndsAt,
  lastFlip,
  lastChallenge,
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
  onEndGame,
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
  const [turnSecondsLeft, setTurnSecondsLeft] = useState<number | null>(null);
  const [hasChallenged, setHasChallenged] = useState(false);
  const lastChallengeIdRef = useRef<string | null>(null);
  const lastPlacementLogRef = useRef<number | null>(null);
  const [nameSongTitle, setNameSongTitle] = useState('');
  const [nameSongArtist, setNameSongArtist] = useState('');
  const [nameSongYear, setNameSongYear] = useState('');

  const round = room.activeRound;
  const isCooperative = round?.config.mode === 'cooperative';
  const myTeamId = Object.entries(room.teams).find(([, t]) => t.playerIds.includes(sessionId))?.[0];
  const isSpectator = room.players[sessionId]?.isSpectator === true;
  const isActivePlayer = !isSpectator && (isCooperative
    ? activePlayerId !== null  // anyone can act in cooperative (handled server-side)
    : room.useTeams && myTeamId
      ? activePlayerId === myTeamId
      : activePlayerId === sessionId);
  const timelineKey = isCooperative ? 'cooperative' : (room.useTeams && myTeamId ? myTeamId : sessionId);
  const myTimeline = round?.timelines[timelineKey];
  const myCards = myTimeline?.cards ?? [];

  const activeEntityId =
    activePlayerId && round ? activeEntityIdFromRoom(room, activePlayerId) : null;
  const activeTimeline =
    activeEntityId && round ? round.timelines[activeEntityId] : undefined;
  const activeCards = activeTimeline?.cards ?? [];
  const watchingOther =
    room.status === 'round_active' && !isCooperative && !isActivePlayer;

  // Current turn phase
  const currentTurn = round?.currentTurn;
  const isInChallengePhase = currentTurn?.phase === 'challenge';
  const isInFlipPhase = currentTurn?.phase === 'flip';
  const placedPosition =
    currentTurn?.placedPosition !== undefined && currentTurn?.placedPosition !== null
      ? currentTurn.placedPosition
      : null;
  const challengeDeadline = isInChallengePhase ? (currentTurn?.challengeDeadline ?? null) : null;

  const activeName = activePlayerDisplayName(room, activePlayerId);
  const mainTimelineLabel = watchingOther
    ? `${activeName.toUpperCase()}'S TIMELINE — watch where they place`
    : isActivePlayer
      ? 'YOUR TIMELINE — Drag the card into a gap, or click a gap'
      : 'TIMELINE';
  const mainCards = watchingOther ? activeCards : myCards;
  const mainTimelineEntityId = watchingOther ? activeEntityId : timelineKey;
  const flipEntityId =
    lastFlip && round ? activeEntityIdFromRoom(room, lastFlip.activePlayerId) : null;
  const flipReveal =
    showFlipResult && lastFlip && flipEntityId === mainTimelineEntityId
      ? {
          position: lastFlip.placedPosition,
          card: lastFlip.card,
          correct: lastFlip.correct,
        }
      : null;

  const appendLog = useCallback((who: string, action: string, consequence: string) => {
    const html = `<span class="log-who">${who}</span> <span class="log-action">${action}</span> — <span class="log-result">${consequence}</span>`;
    setLogEntries((prev) => [{ id: logCounter.current++, html }, ...prev].slice(0, 50));
  }, []);

  useEffect(() => {
    if (!turnEndsAt || currentTurn?.phase !== 'place') {
      setTurnSecondsLeft(null);
      return;
    }
    const tick = () => {
      setTurnSecondsLeft(Math.max(0, Math.ceil((turnEndsAt - Date.now()) / 1000)));
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [turnEndsAt, currentTurn?.phase]);

  // Reset challenge flag when a new place phase starts
  useEffect(() => {
    if (currentTurn?.phase === 'place') {
      setHasChallenged(false);
    }
  }, [activePlayerId, currentTurn?.phase]);

  // Log when someone enters the challenge window after placing
  useEffect(() => {
    if (!isInChallengePhase || placedPosition === null || !round) return;
    const key = round.turnIndex * 1000 + placedPosition;
    if (lastPlacementLogRef.current === key) return;
    lastPlacementLogRef.current = key;
    const placer = activePlayerDisplayName(room, activePlayerId);
    appendLog(
      placer,
      'placed a card',
      '3s to challenge if the spot looks wrong',
    );
  }, [isInChallengePhase, placedPosition, round?.turnIndex, room, activePlayerId, appendLog]);

  // Log HITSTER! challenges (all clients)
  useEffect(() => {
    if (!lastChallenge) return;
    const key = lastChallenge.challengerId + (challengeDeadline ?? '');
    if (lastChallengeIdRef.current === key) return;
    lastChallengeIdRef.current = key;
    const challenger = playerDisplayName(room, lastChallenge.challengerId);
    const isMe = lastChallenge.challengerId === sessionId;
    if (isMe) {
      appendLog('You', 'Challenge', 'Registered — result after flip');
    } else {
      appendLog(challenger, 'Challenge', 'Challenged the placement');
    }
  }, [lastChallenge, challengeDeadline, room, sessionId, appendLog]);

  // Show flip result when lastFlip changes
  useEffect(() => {
    if (!lastFlip) return;
    setShowFlipResult(true);
    setSelectedPosition(null);

    const placer = activePlayerDisplayName(room, lastFlip.activePlayerId);
    const placementResult = lastFlip.correct
      ? `${placer} was correct — card stays on their timeline`
      : `${placer} was wrong — card discarded`;

    appendLog(placer, 'card revealed', placementResult);

    for (const cr of lastFlip.challengeResults) {
      const challenger = playerDisplayName(room, cr.challengerId);
      if (cr.outcome === 'stole_card') {
        appendLog(
          challenger,
          'Challenge',
          `${placer} was wrong — ${challenger} steals the card`,
        );
      } else {
        appendLog(
          challenger,
          'Challenge',
          `${placer} was correct — ${challenger} loses 1 token`,
        );
      }
    }

    const msg = lastFlip.correct
      ? `<span class="log-highlight">${lastFlip.card.title}</span> — <span class="log-correct">✓ Correct!</span>`
      : `<span class="log-highlight">${lastFlip.card.title}</span> — <span class="log-wrong">✗ Wrong</span>`;
    setLogEntries((prev) => [{ id: logCounter.current++, html: msg }, ...prev].slice(0, 50));
  }, [lastFlip, room, appendLog]);

  useEffect(() => {
    if (!showFlipResult) return;
    const timer = setTimeout(() => setShowFlipResult(false), 3500);
    const handler = () => setShowFlipResult(false);
    window.addEventListener('keydown', handler);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handler);
    };
  }, [showFlipResult]);

  function handleSelectPosition(pos: number) {
    setSelectedPosition(pos);
  }

  function handleConfirmPlace() {
    if (selectedPosition === null) return;
    onPlaceCard(selectedPosition);
    setSelectedPosition(null);
  }

  function handleChallenge() {
    if (hasChallenged) return;
    onChallengeCard();
    setHasChallenged(true);
  }

  // Game over screen — room permanently ended by owner
  if (room.status === 'game_over') {
    return (
      <div className="win-screen">
        <div className="scanlines" />
        <div className="win-trophy">🎮</div>
        <div className="win-title">Game Over</div>
        <div className="win-subtitle">Thanks for playing!</div>
        {room.roundHistory.length > 0 && (
          <div className="win-history">
            <div className="win-history-title">Round History</div>
            {room.roundHistory.map((r, i) => {
              const rWinner = r.winnerId && room.players[r.winnerId]
                ? room.players[r.winnerId].displayName
                : r.winnerId === 'cooperative' ? 'Team'
                : r.winnerId && room.teams[r.winnerId] ? room.teams[r.winnerId].name
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
          <button className="win-leave" onClick={onLeave}>← Leave</button>
        </div>
      </div>
    );
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
        onEndGame={onEndGame}
      />
    );
  }

  // In lobby (or round_ended after dismissing win screen)
  if (room.status === 'lobby' || room.status === 'round_ended') {
    return (
      <div className="game-root">
        <div className="scanlines" />
        <header className="game-header">
          <HitsterLogo />
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
        <HitsterLogo />
        <div className="room-code-badge">ROOM: {room.code}</div>
        {!isSpectator && (
          <TokenPanel
            myTokens={myTokens}
            canSkip={isActivePlayer && !isInChallengePhase && currentCard !== null}
            onSkip={onSkipCard}
          />
        )}
      </header>

      <div className="game-main">
        {/* LEFT: Player list */}
        <PlayerList
          room={room}
          activePlayerId={activePlayerId}
          activeTurnLabel={activeName}
          isMyTurn={isActivePlayer && !isSpectator}
          turnIndex={round?.turnIndex ?? 0}
          turnSecondsLeft={turnSecondsLeft}
          sessionId={sessionId}
        />

        {/* CENTER: Gameplay */}
        <div className={`center-col${showFlipResult ? ' center-col--reveal-active' : ''}`}>
          {isSpectator && (
            <div className="spectator-banner">
              👁 Spectating — you'll join the next round automatically
            </div>
          )}
          <AudioPlayer
            previewUrl={previewUrl}
            playAt={playAt}
            currentCard={currentCard}
            revealedCard={revealedCard}
            isFlipped={isFlipped}
            observerCard={observerCard}
            isActivePlayer={isActivePlayer}
          />

          {isCooperative && round && (round.tokens['cooperative'] ?? 0) <= 2 && (
            <div className="coop-token-warning">
              ⚠ Only {round.tokens['cooperative'] ?? 0} shared token{(round.tokens['cooperative'] ?? 0) !== 1 ? 's' : ''} left!
            </div>
          )}

          <div className={watchingOther ? 'center-timeline-stack' : undefined}>
            <TimelineView
              cards={mainCards}
              pendingCard={isActivePlayer ? currentCard : null}
              label={mainTimelineLabel}
              readOnly={watchingOther}
              isActivePlayer={isActivePlayer}
              placedPosition={placedPosition}
              selectedPosition={selectedPosition}
              onSelectPosition={handleSelectPosition}
              isInChallengePhase={isInChallengePhase}
              showPlacementToAll={watchingOther || isInChallengePhase}
              testId={watchingOther ? 'watch-timeline' : 'main-timeline'}
              showHitsterUnderPlacement={
                watchingOther &&
                isInChallengePhase &&
                !isSpectator &&
                !isCooperative
              }
              challengeDeadline={challengeDeadline}
              onChallenge={handleChallenge}
              hasChallenged={hasChallenged}
              flipReveal={flipReveal}
            />

            {watchingOther && !isSpectator && (
              <TimelineView
                cards={myCards}
                pendingCard={null}
                label="YOUR TIMELINE — not your turn"
                readOnly
                placedPosition={null}
                selectedPosition={null}
                onSelectPosition={() => {}}
                isInChallengePhase={false}
                testId="my-timeline-disabled"
              />
            )}
          </div>

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

          </div>
        </div>

        {/* RIGHT: Game log + challenge timer */}
        <div className="right-side-panel">
          <div className="panel-title">Game Log</div>

          {isInChallengePhase && !isCooperative && !isSpectator && (
            <ChallengeBar deadline={challengeDeadline} />
          )}

          <div className="game-log game-log--prominent">
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

    </div>
  );
}
