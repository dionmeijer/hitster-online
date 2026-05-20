import { useState, useEffect, useCallback, useRef } from 'react';
import type { Room, RoomSummary } from '../../../shared/types';

interface EntryPageProps {
  onConnect: (displayName: string, email: string) => void;
  onCreateRoom: (topic: string) => void;
  onJoinRoom: (code: string) => void;
  serverUrl?: string;
  serverError?: string | null;
  roomJoined?: Room | null;
}

const AVATAR_COLORS = [
  '#4ade80', '#a78bfa', '#fbbf24', '#f87171',
  '#60a5fa', '#fb923c', '#c084fc', '#34d399', '#f472b6',
];

function avatarColor(name: string): string {
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function statusBadgeClass(status: string): string {
  if (status === 'lobby') return 'badge-lobby';
  if (status === 'round_active') return 'badge-active';
  return 'badge-over';
}

function statusBadgeText(status: string): string {
  if (status === 'lobby') return 'LOBBY';
  if (status === 'round_active') return 'LIVE';
  return 'ENDED';
}

function isRoomJoinable(status: string): boolean {
  return status === 'lobby';
}

export default function EntryPage({ onConnect, onCreateRoom, onJoinRoom, serverUrl, serverError, roomJoined }: EntryPageProps) {
  const [email, setEmail] = useState(() => sessionStorage.getItem('hitster_email') ?? '');
  const [emailDirty, setEmailDirty] = useState(() => !!sessionStorage.getItem('hitster_email'));
  const [emailError, setEmailError] = useState(false);
  const [displayName, setDisplayName] = useState(() => sessionStorage.getItem('hitster_display_name') ?? '');
  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState('');
  const [joinTopic, setJoinTopic] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const topicInputRef = useRef<HTMLInputElement>(null);

  // Clear connecting spinner when room is joined or an error arrives
  useEffect(() => {
    if (roomJoined || serverError) {
      setConnecting(false);
    }
  }, [roomJoined, serverError]);

  const resolvedName = displayName.trim() || (email.trim() ? email.trim().split('@')[0] : '');
  const emailValid = isValidEmail(email);

  // Fetch rooms every 10s
  const fetchRooms = useCallback(async () => {
    const base = serverUrl ?? (import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3000');
    try {
      const res = await fetch(`${base}/rooms`);
      if (res.ok) {
        const data = await res.json() as RoomSummary[];
        setRooms(data);
      }
    } catch {
      // ignore network errors — keep showing old data
    } finally {
      setRoomsLoading(false);
    }
  }, [serverUrl]);

  useEffect(() => {
    void fetchRooms();
    const interval = setInterval(() => { void fetchRooms(); }, 2000);
    return () => clearInterval(interval);
  }, [fetchRooms]);

  function handleEmailBlur() {
    if (email.trim() && !emailValid) {
      setEmailError(true);
      setEmailDirty(true);
    }
  }

  function handleEmailChange(v: string) {
    setEmail(v);
    sessionStorage.setItem('hitster_email', v);
    setEmailError(false);
    setEmailDirty(true);
  }

  function openJoin() {
    setJoinOpen(true);
    setTimeout(() => codeInputRef.current?.focus(), 50);
  }

  function closeJoin() {
    setJoinOpen(false);
    setCode('');
  }

  function handleCodeInput(v: string) {
    setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4));
  }

  function handleCreateClick() {
    if (!emailValid) return;
    setShowCreateModal(true);
    setTimeout(() => topicInputRef.current?.focus(), 50);
  }

  function handleJoinSubmit() {
    if (code.length !== 4 || !emailValid) return;
    setConnecting(true);
    onConnect(resolvedName || email, email);
    onJoinRoom(code);
  }

  function handleCreateSubmit() {
    if (!emailValid || !joinTopic.trim()) return;
    setConnecting(true);
    onConnect(resolvedName || email, email);
    onCreateRoom(joinTopic.trim());
    setShowCreateModal(false);
    setJoinTopic('');
  }

  function prefillCode(roomCode: string) {
    openJoin();
    setCode(roomCode);
  }

  const openRoomCount = rooms.filter(r => r.status !== 'game_over').length;

  return (
    <div className="entry-root">
      {/* Scanlines overlay */}
      <div className="scanlines" />

      {/* Header */}
      <header className="entry-header">
        <div className="logo">
          HITSTER
          <span className="cursor-blink" />
        </div>
        <div className="live-dot">
          <span className="dot-pulse" />
          LIVE
        </div>
      </header>

      {/* Split layout */}
      <div className="entry-split">
        {/* LEFT: Form */}
        <div className="form-col">
          <div className="hero-title">
            HIT<span className="hero-title-green">STER</span>
          </div>
          <div className="hero-sub">
            Build your timeline. Guess the decade. First to 10 songs wins.
          </div>

          {/* Email */}
          <div className="field">
            <div className="field-label">
              <span className="req-dot" />
              Email address
            </div>
            <input
              className={`form-input${emailValid && emailDirty ? ' valid' : ''}${emailError ? ' err' : ''}`}
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={email}
              onChange={e => handleEmailChange(e.target.value)}
              onBlur={handleEmailBlur}
            />
            {emailError && (
              <div className="err-msg">Enter a valid email address</div>
            )}
          </div>

          {/* Display name */}
          <div className="field">
            <div className="field-label">
              Display name{' '}
              <span className="opt-label">optional</span>
            </div>
            <input
              className="form-input"
              type="text"
              placeholder="Leave blank to use email"
              maxLength={24}
              value={displayName}
              onChange={e => { setDisplayName(e.target.value); sessionStorage.setItem('hitster_display_name', e.target.value); }}
            />
            <div className="preview-row">
              <div className="pr-label">Shown as</div>
              <div
                className="pr-ava"
                style={resolvedName ? {
                  background: avatarColor(resolvedName) + '22',
                  borderColor: avatarColor(resolvedName),
                  color: avatarColor(resolvedName),
                } : {}}
              >
                {resolvedName ? resolvedName[0].toUpperCase() : '?'}
              </div>
              <div className="pr-name">{resolvedName || '—'}</div>
            </div>
          </div>

          <hr className="form-divider" />

          {/* Create button */}
          <button
            className="btn btn-create"
            disabled={!emailValid || connecting}
            onClick={handleCreateClick}
          >
            {connecting ? '⏳ Connecting…' : '⊕ Create a room'}
          </button>

          {/* Server error banner */}
          {serverError && (
            <div className="server-error-msg" role="alert">
              {serverError}
            </div>
          )}

          {/* Join section */}
          {!joinOpen ? (
            <button
              className="btn btn-join"
              disabled={!emailValid || connecting}
              onClick={openJoin}
            >
              → Join a room
            </button>
          ) : (
            <div className="join-open">
              <div className="join-row">
                <input
                  ref={codeInputRef}
                  className="form-input code-input"
                  type="text"
                  placeholder="XXXX"
                  maxLength={4}
                  value={code}
                  onChange={e => handleCodeInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleJoinSubmit()}
                />
                <button
                  className="btn-go"
                  onClick={handleJoinSubmit}
                  disabled={code.length !== 4 || !emailValid || connecting}
                >
                  {connecting ? '…' : 'Join'}
                </button>
              </div>
              <button className="btn-cancel" onClick={closeJoin}>
                ← Back
              </button>
            </div>
          )}
        </div>

        {/* RIGHT: Room Browser */}
        <div className="rooms-col">
          <div className="rooms-header">
            <div className="rooms-title">Active Rooms</div>
            <div className="rooms-count">
              {roomsLoading ? 'Loading…' : `${openRoomCount} room${openRoomCount !== 1 ? 's' : ''} open`}
            </div>
          </div>

          {!roomsLoading && rooms.length === 0 && (
            <div className="no-rooms">
              <div className="no-rooms-icon">🎮</div>
              <div className="no-rooms-text">No rooms yet.<br />Be the first to create one!</div>
            </div>
          )}

          {rooms.map(room => (
            <div
              key={room.code}
              className={`room-card${room.status === 'lobby' ? ' lobby' : ''}${room.status === 'game_over' ? ' over' : ''}`}
              onClick={() => isRoomJoinable(room.status) ? prefillCode(room.code) : undefined}
              style={{ cursor: isRoomJoinable(room.status) ? 'pointer' : 'default' }}
            >
              <div className="rc-top">
                <div>
                  <div className="rc-code">{room.code}</div>
                  <div className="rc-topic">{room.topic}</div>
                  {room.genre && <div className="rc-genre">{room.genre}</div>}
                </div>
                <div className={`status-badge ${statusBadgeClass(room.status)}`}>
                  {statusBadgeText(room.status)}
                </div>
              </div>

              <div className="rc-players">
                {Array.from({ length: room.playerCount }, (_, i) => {
                  const initial = room.leaderName ? room.leaderName[0].toUpperCase() : '?';
                  const col = avatarColor(room.leaderName ?? String(i));
                  return (
                    <div key={i} className="player-chip">
                      <div
                        className="chip-ava"
                        style={{ background: col + '22', border: `1px solid ${col}`, color: col }}
                      >
                        {i === 0 && room.leaderName ? room.leaderName[0].toUpperCase() : initial}
                      </div>
                      {i === 0 && room.leaderName ? room.leaderName : `P${i + 1}`}
                    </div>
                  );
                })}
              </div>

              <div className="rc-progress">
                {room.roundNumber && room.leaderCards !== undefined && room.cardsToWin ? (
                  <>
                    <div className="rp-label">Round {room.roundNumber} · Progress</div>
                    <div className="rp-leader">
                      {room.leaderName} — {room.leaderCards} / {room.cardsToWin} cards
                    </div>
                    <div className="rp-bar-wrap">
                      <div
                        className="rp-bar"
                        style={{ width: `${(room.leaderCards / room.cardsToWin) * 100}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rp-label">Waiting to start</div>
                    <div className="rp-waiting">
                      {room.playerCount} player{room.playerCount !== 1 ? 's' : ''} in lobby
                    </div>
                  </>
                )}
              </div>

              {isRoomJoinable(room.status) && (
                <div className="rc-join-hint">CLICK TO JOIN →</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Create a Room</div>
            <div className="field">
              <div className="field-label">Room Topic / Theme</div>
              <input
                ref={topicInputRef}
                className="form-input"
                type="text"
                placeholder="e.g. 90s Night, Pop Classics…"
                maxLength={40}
                value={joinTopic}
                onChange={e => setJoinTopic(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateSubmit()}
              />
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-create"
                disabled={!joinTopic.trim()}
                onClick={handleCreateSubmit}
              >
                ⊕ Create
              </button>
              <button className="btn-cancel" onClick={() => setShowCreateModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
