import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useRef, useEffect, useState, useCallback } from 'react';
// ── Helpers ──────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
    '#4ade80', '#a78bfa', '#fbbf24', '#f87171',
    '#60a5fa', '#fb923c', '#c084fc', '#34d399', '#f472b6',
];
function avatarColor(name) {
    let sum = 0;
    for (let i = 0; i < name.length; i++)
        sum += name.charCodeAt(i);
    return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}
function PlayerList({ room, activePlayerId, sessionId }) {
    const players = Object.values(room.players);
    const round = room.activeRound;
    return (_jsxs("div", { className: "side-panel", children: [_jsx("div", { className: "panel-title", children: "Players" }), players.map(p => {
                const color = avatarColor(p.displayName);
                const isActive = p.id === activePlayerId;
                const isMe = p.id === sessionId;
                const timeline = round?.timelines[p.id];
                const cardCount = timeline?.cards.length ?? 0;
                const tokens = round?.tokens[p.id] ?? 0;
                return (_jsxs("div", { className: `player-item${isActive ? ' active-player' : ''}`, children: [_jsx("div", { className: "player-avatar", style: { background: color + '22', color }, children: p.displayName[0]?.toUpperCase() ?? '?' }), _jsxs("div", { className: "player-info", children: [_jsxs("div", { className: "player-name", children: [isMe ? 'You' : p.displayName, isActive && (_jsx("span", { style: { color: '#4ade80', fontSize: 11, marginLeft: 4 }, children: "\u25B6" }))] }), _jsxs("div", { className: "player-score", children: [cardCount, " card", cardCount !== 1 ? 's' : ''] }), _jsx("div", { className: "player-token-dots", children: Array.from({ length: 5 }, (_, i) => (_jsx("div", { className: `token-dot${i >= tokens ? ' empty' : ''}` }, i))) })] })] }, p.id));
            }), round && (_jsxs("div", { className: "round-info", children: [_jsx("div", { className: "panel-title", children: "Round" }), _jsxs("div", { className: "round-info-row", children: ["Mode: ", _jsx("span", { className: "round-info-val", children: round.config.mode }), _jsx("br", {}), "Deck: ", _jsxs("span", { className: "round-info-val", children: [round.deckRemaining, " left"] }), _jsx("br", {}), "Target: ", _jsxs("span", { className: "round-info-val-green", children: [round.config.cardsToWin, " cards"] })] })] }))] }));
}
function AudioPlayer({ previewUrl, playAt, currentCard, revealedCard, isFlipped }) {
    const audioRef = useRef(null);
    const waveformRef = useRef(null);
    const waveIntervalRef = useRef(null);
    const progressIntervalRef = useRef(null);
    const [timeLeft, setTimeLeft] = useState(30);
    const [progress, setProgress] = useState(0);
    // Waveform animation
    useEffect(() => {
        if (!waveformRef.current)
            return;
        // Create bars
        waveformRef.current.innerHTML = '';
        const bars = [];
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
            if (waveIntervalRef.current)
                clearInterval(waveIntervalRef.current);
        };
    }, []);
    // Audio scheduling
    useEffect(() => {
        if (!previewUrl || !playAt)
            return;
        const audio = audioRef.current;
        if (!audio)
            return;
        audio.src = previewUrl;
        audio.load();
        const now = Date.now();
        const delay = playAt - now;
        const startTime = Math.max(0, delay);
        let timer = null;
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
            if (timer)
                clearTimeout(timer);
            if (progressIntervalRef.current)
                clearInterval(progressIntervalRef.current);
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
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "now-playing", children: [_jsx("div", { className: "album-art-wrap", children: albumArt ? (_jsxs(_Fragment, { children: [_jsx("img", { src: albumArt, alt: "Album art" }), !isFlipped && _jsx("div", { className: "album-art-blur", children: "\uD83C\uDFB5" })] })) : (_jsx("div", { className: "album-art-blur", children: "\uD83C\uDFB5" })) }), _jsxs("div", { className: "song-info", children: [_jsx("div", { className: "song-label", children: isFlipped ? 'REVEALED' : 'NOW PLAYING — PLACE THIS CARD' }), showDetails ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "song-title", children: revealedCard.title }), _jsx("div", { className: "song-artist", children: revealedCard.artist }), _jsx("div", { style: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }, children: _jsx("div", { className: "song-year", children: revealedCard.releaseYear }) })] })) : (_jsx("div", { style: { fontSize: 13, color: '#6b7280', marginTop: 8 }, children: "Song is playing for all..." }))] }), _jsxs("div", { className: "song-timer-wrap", children: [_jsx("div", { className: "song-timer-label", children: "TIME LEFT" }), _jsxs("div", { className: "song-timer", children: ["0:", String(Math.ceil(timeLeft)).padStart(2, '0')] })] })] }), _jsx("div", { className: "waveform", ref: waveformRef }), _jsx("div", { className: "progress-track", children: _jsx("div", { className: "progress-fill", style: { width: `${progress}%` } }) }), _jsx("audio", { ref: audioRef, preload: "auto" })] }));
}
function Timeline({ cards, pendingCard, isActivePlayer, placedPosition, selectedPosition, onSelectPosition, isInChallengePhase, }) {
    // Build an interleaved array: [dropzone, card, dropzone, card, ..., dropzone]
    // Total slots = cards.length + 1
    const canPlace = isActivePlayer && pendingCard !== null && placedPosition === null && !isInChallengePhase;
    return (_jsxs("div", { className: "timeline-section", children: [_jsx("div", { className: "timeline-label", children: isActivePlayer
                    ? 'YOUR TIMELINE — Click a gap to place the new card'
                    : 'TIMELINE' }), _jsxs("div", { className: "timeline-track", children: [Array.from({ length: cards.length + 1 }, (_, i) => {
                        const isSelected = selectedPosition === i;
                        const isPlaced = placedPosition === i;
                        return (_jsxs("div", { style: { display: 'flex', alignItems: 'center' }, children: [_jsx("div", { className: `drop-zone${isSelected ? ' selected-zone' : ''}${isPlaced ? ' selected-zone' : ''}`, onClick: () => canPlace && onSelectPosition(i), style: { cursor: canPlace ? 'pointer' : 'default' }, children: _jsx("div", { className: "drop-zone-line" }) }), cards[i] && (_jsxs("div", { className: `timeline-card placed-card`, children: [_jsx("div", { className: "card-year", children: cards[i].releaseYear }), _jsx("div", { className: "card-title", children: cards[i].title }), _jsx("div", { className: "card-artist", children: cards[i].artist })] }))] }, `slot-${i}`));
                    }), isActivePlayer && pendingCard && placedPosition === null && (_jsxs("div", { className: "pending-card-slot", style: { marginLeft: 16 }, children: [_jsx("div", { className: "pending-card-icon", children: "\uD83C\uDFB5" }), _jsx("div", { className: "pending-card-label", children: "New Card" })] })), isActivePlayer && pendingCard && placedPosition !== null && (_jsxs("div", { className: "timeline-card placed-pending", style: { marginLeft: 16 }, children: [_jsx("div", { className: "card-face-down", children: "?" }), _jsx("div", { style: { fontSize: 9, color: '#fbbf24', marginTop: 4 }, children: "Placed!" })] }))] })] }));
}
function ChallengeBar({ deadline, onChallenge, isActivePlayer }) {
    const [seconds, setSeconds] = useState(10);
    useEffect(() => {
        if (!deadline)
            return;
        const tick = () => {
            const rem = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
            setSeconds(rem);
        };
        tick();
        const id = setInterval(tick, 250);
        return () => clearInterval(id);
    }, [deadline]);
    if (!deadline)
        return null;
    return (_jsxs("div", { className: "challenge-timer-box", children: [_jsx("div", { className: "challenge-timer-label", children: "CHALLENGE WINDOW" }), _jsx("div", { className: "challenge-timer-count", children: seconds }), !isActivePlayer && seconds > 0 && (_jsx("button", { className: "action-btn btn-hitster", onClick: onChallenge, style: { marginTop: 8 }, children: "HITSTER!" }))] }));
}
function FlipResult({ card, correct, onDismiss }) {
    useEffect(() => {
        const timer = setTimeout(onDismiss, 3500);
        const handler = () => onDismiss();
        window.addEventListener('keydown', handler);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('keydown', handler);
        };
    }, [onDismiss]);
    return (_jsx("div", { className: "flip-result-overlay", onClick: onDismiss, children: _jsxs("div", { className: `flip-result-box ${correct ? 'correct' : 'wrong'}`, children: [_jsx("div", { className: "flip-result-icon", children: correct ? '✓' : '✗' }), _jsx("div", { className: "flip-result-label", children: correct ? 'Correct!' : 'Wrong!' }), _jsx("div", { className: "flip-result-card-title", children: card.title }), _jsx("div", { className: "flip-result-card-artist", children: card.artist }), _jsx("div", { className: "flip-result-card-year", children: card.releaseYear }), _jsx("div", { className: "flip-result-dismiss", children: "Press any key or click to continue" })] }) }));
}
function WinScreen({ winnerId, room, sessionId, onPlayAgain }) {
    const isCoopWin = winnerId === 'cooperative';
    const isCoopLoss = !winnerId && room.activeRound?.config.mode === 'cooperative';
    const winner = !isCoopWin && winnerId ? room.players[winnerId] : null;
    const isMe = winnerId === sessionId;
    const cardsToWin = room.activeRound?.config.cardsToWin ?? room.roundHistory.at(-1)?.mode ? undefined : 10;
    let title;
    let subtitle;
    if (isCoopWin) {
        title = 'Team Wins!';
        subtitle = `You reached ${cardsToWin ?? 10} cards together!`;
    }
    else if (isCoopLoss) {
        title = 'Team Lost';
        subtitle = 'The shared token pool ran out.';
    }
    else if (isMe) {
        title = 'You Win!';
        subtitle = 'You built the perfect timeline!';
    }
    else if (winner) {
        title = `${winner.displayName} Wins!`;
        subtitle = `${winner.displayName} reached ${cardsToWin ?? 10} cards first.`;
    }
    else {
        title = 'Game Over!';
        subtitle = 'The deck ran out.';
    }
    return (_jsxs("div", { className: "win-screen", children: [_jsx("div", { className: "scanlines" }), _jsx("div", { className: "win-trophy", children: isCoopLoss ? '💀' : '🏆' }), _jsx("div", { className: "win-title", children: title }), _jsx("div", { className: "win-subtitle", children: subtitle }), _jsx("button", { className: "win-play-again", onClick: onPlayAgain, children: "\u2295 Play Again" })] }));
}
// ── Lobby screen ──────────────────────────────────────────────────────────────
const MODES = [
    { value: 'original', label: 'Original', desc: '2 starting tokens, naming bonus on' },
    { value: 'pro', label: 'Pro', desc: '5 starting tokens, no naming bonus' },
    { value: 'expert', label: 'Expert', desc: '3 starting tokens, no naming bonus' },
    { value: 'cooperative', label: 'Cooperative', desc: 'Shared timeline & tokens, reach target together' },
];
function LobbyScreen({ room, sessionId, onStartRound, onLeave, socketError }) {
    const isOwner = room.ownerId === sessionId;
    const players = Object.values(room.players);
    const [playlistLabel, setPlaylistLabel] = useState('');
    const [mode, setMode] = useState('original');
    const [cardsToWin, setCardsToWin] = useState(10);
    const [tokensEnabled, setTokensEnabled] = useState(true);
    const [starting, setStarting] = useState(false);
    useEffect(() => {
        if (socketError)
            setStarting(false);
    }, [socketError]);
    function handleStart() {
        setStarting(true);
        onStartRound(mode, playlistLabel.trim() || undefined, cardsToWin, tokensEnabled);
    }
    return (_jsxs("div", { className: "lobby-screen", children: [_jsx("div", { className: "lobby-code", "data-testid": "lobby-room-code", children: room.code }), _jsx("div", { className: "lobby-code-label", children: "Share this code to invite friends" }), _jsx("div", { className: "lobby-player-list", children: players.map(p => {
                    const color = avatarColor(p.displayName);
                    return (_jsxs("div", { className: "lobby-player-chip", "data-testid": "lobby-player", children: [_jsx("div", { className: "player-avatar", style: { background: color + '22', color, width: 24, height: 24, fontSize: 8 }, children: p.displayName[0]?.toUpperCase() }), _jsx("span", { "data-testid": "lobby-player-name", children: p.displayName }), p.id === room.ownerId && (_jsx("span", { style: { fontSize: 10, color: '#fbbf24' }, children: "\u2605" }))] }, p.id));
                }) }), isOwner && (_jsxs(_Fragment, { children: [_jsx("div", { className: "lobby-playlist-field", children: _jsx("input", { className: "form-input", type: "text", placeholder: "Genre or Spotify playlist URL (optional)", value: playlistLabel, onChange: e => setPlaylistLabel(e.target.value), "data-testid": "playlist-label-input" }) }), _jsxs("div", { className: "lobby-config-section", children: [_jsx("div", { className: "lobby-config-label", children: "Game Mode" }), _jsx("div", { className: "lobby-mode-grid", "data-testid": "mode-selector", children: MODES.map(m => (_jsxs("label", { className: `lobby-mode-option${mode === m.value ? ' selected' : ''}`, "data-testid": `mode-option-${m.value}`, children: [_jsx("input", { type: "radio", name: "game-mode", value: m.value, checked: mode === m.value, onChange: () => setMode(m.value), style: { display: 'none' } }), _jsx("div", { className: "lobby-mode-name", children: m.label }), _jsx("div", { className: "lobby-mode-desc", children: m.desc })] }, m.value))) }), _jsxs("div", { className: "lobby-config-row", children: [_jsx("label", { className: "lobby-config-label", htmlFor: "cards-to-win", children: "Cards to Win" }), _jsx("input", { id: "cards-to-win", className: "form-input", type: "number", min: 1, max: 20, value: cardsToWin, onChange: e => setCardsToWin(Math.max(1, Math.min(20, Number(e.target.value)))), "data-testid": "cards-to-win-input", style: { width: 72 } })] }), _jsxs("div", { className: "lobby-config-row", children: [_jsx("label", { className: "lobby-config-label", htmlFor: "tokens-enabled", children: "Tokens Enabled" }), _jsx("input", { id: "tokens-enabled", type: "checkbox", checked: tokensEnabled, onChange: e => setTokensEnabled(e.target.checked), "data-testid": "tokens-enabled-toggle" })] })] })] })), socketError && (_jsx("div", { className: "server-error-msg", children: socketError })), isOwner ? (_jsx("button", { className: "lobby-start-btn", disabled: players.length < 1 || starting, onClick: handleStart, "data-testid": "start-round-btn", children: starting ? 'Starting…' : '▶ Start Round' })) : (_jsxs("div", { className: "lobby-waiting", children: ["Waiting for ", room.players[room.ownerId]?.displayName ?? 'host', " to start..."] })), _jsx("button", { className: "lobby-leave-btn", onClick: onLeave, "data-testid": "leave-btn", children: "\u2190 Leave Room" })] }));
}
function TokenPanel({ myTokens, canSkip, onSkip }) {
    return (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 12 }, children: [_jsx("span", { style: { fontSize: 12, color: '#6b7280' }, children: "YOUR TOKENS" }), _jsx("div", { className: "token-row", children: Array.from({ length: 5 }, (_, i) => (_jsx("div", { className: `token-circle${i >= myTokens ? ' empty' : ''}`, children: i < myTokens ? '🪙' : '' }, i))) }), canSkip && (_jsx("button", { className: "action-btn btn-skip-action", disabled: myTokens < 1, onClick: onSkip, children: "SKIP (1\uD83E\uDE99)" }))] }));
}
export default function GameRoom({ room, currentCard, activePlayerId, previewUrl, playAt, lastFlip, roundEnded, myTokens, sessionId, socketError, onStartRound, onPlaceCard, onChallengeCard, onSkipCard, onNameSong, onBuyCard, onLeave, }) {
    const [selectedPosition, setSelectedPosition] = useState(null);
    const [showFlipResult, setShowFlipResult] = useState(false);
    const [logEntries, setLogEntries] = useState([]);
    const logCounter = useRef(0);
    const [nameSongTitle, setNameSongTitle] = useState('');
    const [nameSongArtist, setNameSongArtist] = useState('');
    const isActivePlayer = activePlayerId === sessionId;
    const round = room.activeRound;
    const isCooperative = round?.config.mode === 'cooperative';
    const timelineKey = isCooperative ? 'cooperative' : sessionId;
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
            const entry = { id: logCounter.current++, html: msg };
            setLogEntries(prev => [entry, ...prev].slice(0, 50));
        }
    }, [lastFlip]);
    const handleDismissFlip = useCallback(() => {
        setShowFlipResult(false);
    }, []);
    function handleSelectPosition(pos) {
        setSelectedPosition(pos);
    }
    function handleConfirmPlace() {
        if (selectedPosition === null)
            return;
        onPlaceCard(selectedPosition);
    }
    // In lobby
    if (room.status === 'lobby') {
        return (_jsxs("div", { className: "game-root", children: [_jsx("div", { className: "scanlines" }), _jsxs("header", { className: "game-header", children: [_jsx("div", { className: "logo", children: "HITSTER" }), _jsxs("div", { className: "room-code-badge", children: ["ROOM: ", room.code] }), _jsx("button", { style: { background: 'none', border: '1px solid #374151', color: '#6b7280', padding: '6px 12px', cursor: 'pointer', fontFamily: 'Rajdhani, sans-serif', fontSize: 13 }, onClick: onLeave, children: "Leave" })] }), _jsx(LobbyScreen, { room: room, sessionId: sessionId, onStartRound: onStartRound, onLeave: onLeave, socketError: socketError })] }));
    }
    // Win screen
    if (roundEnded) {
        return (_jsx(WinScreen, { winnerId: roundEnded.winnerId, room: room, sessionId: sessionId, onPlayAgain: onLeave }));
    }
    // Active round
    const isFlipped = isInFlipPhase || showFlipResult;
    const revealedCard = lastFlip?.card ?? null;
    return (_jsxs("div", { className: "game-root", "data-testid": "round-active", children: [_jsx("div", { className: "scanlines" }), _jsxs("header", { className: "game-header", children: [_jsx("div", { className: "logo", children: "HITSTER" }), _jsxs("div", { className: "room-code-badge", children: ["ROOM: ", room.code] }), _jsx(TokenPanel, { myTokens: myTokens, canSkip: isActivePlayer && !isInChallengePhase && currentCard !== null, onSkip: onSkipCard })] }), _jsxs("div", { className: "game-main", children: [_jsx(PlayerList, { room: room, activePlayerId: activePlayerId, sessionId: sessionId }), _jsxs("div", { className: "center-col", children: [_jsx(AudioPlayer, { previewUrl: previewUrl, playAt: playAt, currentCard: currentCard, revealedCard: revealedCard, isFlipped: isFlipped }), _jsx(Timeline, { cards: myCards, pendingCard: currentCard, isActivePlayer: isActivePlayer, placedPosition: typeof placedPosition === 'number' ? placedPosition : null, selectedPosition: selectedPosition, onSelectPosition: handleSelectPosition, isInChallengePhase: isInChallengePhase }), _jsxs("div", { className: "actions-bar", children: [isActivePlayer && currentCard && placedPosition === null && (_jsx("button", { className: "action-btn btn-confirm", disabled: selectedPosition === null, onClick: handleConfirmPlace, children: "CONFIRM PLACE" })), isActivePlayer && currentCard && !isInChallengePhase && (_jsx("button", { className: "action-btn btn-skip-action", "data-testid": "skip-btn", disabled: myTokens < 1, onClick: onSkipCard, children: "SKIP (1\uD83E\uDE99)" })), isActivePlayer && currentCard && !isInChallengePhase && currentTurn?.phase === 'place' && (_jsx("button", { className: "action-btn btn-buy-action", "data-testid": "buy-btn", disabled: myTokens < 3, onClick: onBuyCard, title: "Spend 3 tokens to place without hearing \u2014 your next turn will be skipped", children: "BUY (3\uD83E\uDE99)" })), !isActivePlayer && isInChallengePhase && !isCooperative && (_jsx("button", { className: "action-btn btn-hitster", onClick: onChallengeCard, children: "HITSTER!" })), _jsx("div", { className: "turn-info-label", children: round && (_jsxs(_Fragment, { children: ["Turn ", _jsx("span", { children: round.turnIndex + 1 }), ' / ', isActivePlayer ? 'Your turn' : (_jsxs("span", { children: [room.players[activePlayerId ?? '']?.displayName ?? '...', "'s turn"] }))] })) })] })] }), _jsxs("div", { className: "right-side-panel", children: [_jsx("div", { className: "panel-title", children: "Game Log" }), _jsx(ChallengeBar, { deadline: isCooperative ? null : challengeDeadline, onChallenge: onChallengeCard, isActivePlayer: isActivePlayer }), _jsxs("div", { className: "game-log", children: [logEntries.map(entry => (_jsx("div", { className: "log-entry", dangerouslySetInnerHTML: { __html: entry.html } }, entry.id))), logEntries.length === 0 && (_jsx("div", { style: { color: '#374151', fontSize: 12 }, children: "Game log will appear here." }))] }), isActivePlayer && currentCard && !isInChallengePhase && (_jsxs("div", { style: { marginTop: 24 }, children: [_jsx("div", { className: "panel-title", children: "Name the Song (+1\uD83E\uDE99)" }), _jsx("div", { className: "name-song-form", children: _jsx("input", { className: "name-song-input", "data-testid": "name-song-title", placeholder: "Title", value: nameSongTitle, onChange: e => setNameSongTitle(e.target.value) }) }), _jsxs("div", { className: "name-song-form", style: { marginTop: 6 }, children: [_jsx("input", { className: "name-song-input", "data-testid": "name-song-artist", placeholder: "Artist", value: nameSongArtist, onChange: e => setNameSongArtist(e.target.value) }), _jsx("button", { className: "name-song-submit", "data-testid": "name-song-submit", disabled: !nameSongTitle.trim() || !nameSongArtist.trim(), onClick: () => {
                                                    onNameSong(nameSongTitle.trim(), nameSongArtist.trim());
                                                    setNameSongTitle('');
                                                    setNameSongArtist('');
                                                }, children: "Submit" })] })] }))] })] }), showFlipResult && lastFlip && (_jsx(FlipResult, { card: lastFlip.card, correct: lastFlip.correct, onDismiss: handleDismissFlip }))] }));
}
