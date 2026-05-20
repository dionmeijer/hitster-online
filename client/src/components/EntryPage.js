import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useCallback, useRef } from 'react';
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
function isValidEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}
function statusBadgeClass(status) {
    if (status === 'lobby')
        return 'badge-lobby';
    if (status === 'round_active')
        return 'badge-active';
    return 'badge-over';
}
function statusBadgeText(status) {
    if (status === 'lobby')
        return 'LOBBY';
    if (status === 'round_active')
        return 'LIVE';
    return 'ENDED';
}
function isRoomJoinable(status) {
    return status === 'lobby';
}
export default function EntryPage({ onConnect, onCreateRoom, onJoinRoom, serverUrl, serverError, roomJoined }) {
    const [email, setEmail] = useState(() => sessionStorage.getItem('hitster_email') ?? '');
    const [emailDirty, setEmailDirty] = useState(() => !!sessionStorage.getItem('hitster_email'));
    const [emailError, setEmailError] = useState(false);
    const [displayName, setDisplayName] = useState(() => sessionStorage.getItem('hitster_display_name') ?? '');
    const [joinOpen, setJoinOpen] = useState(false);
    const [code, setCode] = useState('');
    const [joinTopic, setJoinTopic] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [rooms, setRooms] = useState([]);
    const [roomsLoading, setRoomsLoading] = useState(true);
    const [connecting, setConnecting] = useState(false);
    const codeInputRef = useRef(null);
    const topicInputRef = useRef(null);
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
                const data = await res.json();
                setRooms(data);
            }
        }
        catch {
            // ignore network errors — keep showing old data
        }
        finally {
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
    function handleEmailChange(v) {
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
    function handleCodeInput(v) {
        setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4));
    }
    function handleCreateClick() {
        if (!emailValid)
            return;
        setShowCreateModal(true);
        setTimeout(() => topicInputRef.current?.focus(), 50);
    }
    function handleJoinSubmit() {
        if (code.length !== 4 || !emailValid)
            return;
        setConnecting(true);
        onConnect(resolvedName || email, email);
        onJoinRoom(code);
    }
    function handleCreateSubmit() {
        if (!emailValid || !joinTopic.trim())
            return;
        setConnecting(true);
        onConnect(resolvedName || email, email);
        onCreateRoom(joinTopic.trim());
        setShowCreateModal(false);
        setJoinTopic('');
    }
    function prefillCode(roomCode) {
        openJoin();
        setCode(roomCode);
    }
    const openRoomCount = rooms.filter(r => r.status !== 'game_over').length;
    return (_jsxs("div", { className: "entry-root", children: [_jsx("div", { className: "scanlines" }), _jsxs("header", { className: "entry-header", children: [_jsxs("div", { className: "logo", children: ["HITSTER", _jsx("span", { className: "cursor-blink" })] }), _jsxs("div", { className: "live-dot", children: [_jsx("span", { className: "dot-pulse" }), "LIVE"] })] }), _jsxs("div", { className: "entry-split", children: [_jsxs("div", { className: "form-col", children: [_jsxs("div", { className: "hero-title", children: ["HIT", _jsx("span", { className: "hero-title-green", children: "STER" })] }), _jsx("div", { className: "hero-sub", children: "Build your timeline. Guess the decade. First to 10 songs wins." }), _jsxs("div", { className: "field", children: [_jsxs("div", { className: "field-label", children: [_jsx("span", { className: "req-dot" }), "Email address"] }), _jsx("input", { className: `form-input${emailValid && emailDirty ? ' valid' : ''}${emailError ? ' err' : ''}`, type: "email", placeholder: "you@example.com", autoComplete: "email", value: email, onChange: e => handleEmailChange(e.target.value), onBlur: handleEmailBlur }), emailError && (_jsx("div", { className: "err-msg", children: "Enter a valid email address" }))] }), _jsxs("div", { className: "field", children: [_jsxs("div", { className: "field-label", children: ["Display name", ' ', _jsx("span", { className: "opt-label", children: "optional" })] }), _jsx("input", { className: "form-input", type: "text", placeholder: "Leave blank to use email", maxLength: 24, value: displayName, onChange: e => { setDisplayName(e.target.value); sessionStorage.setItem('hitster_display_name', e.target.value); } }), _jsxs("div", { className: "preview-row", children: [_jsx("div", { className: "pr-label", children: "Shown as" }), _jsx("div", { className: "pr-ava", style: resolvedName ? {
                                                    background: avatarColor(resolvedName) + '22',
                                                    borderColor: avatarColor(resolvedName),
                                                    color: avatarColor(resolvedName),
                                                } : {}, children: resolvedName ? resolvedName[0].toUpperCase() : '?' }), _jsx("div", { className: "pr-name", children: resolvedName || '—' })] })] }), _jsx("hr", { className: "form-divider" }), _jsx("button", { className: "btn btn-create", disabled: !emailValid || connecting, onClick: handleCreateClick, children: connecting ? '⏳ Connecting…' : '⊕ Create a room' }), serverError && (_jsx("div", { className: "server-error-msg", role: "alert", children: serverError })), !joinOpen ? (_jsx("button", { className: "btn btn-join", disabled: !emailValid || connecting, onClick: openJoin, children: "\u2192 Join by code" })) : (_jsxs("div", { className: "join-open", children: [_jsxs("div", { className: "join-row", children: [_jsx("input", { ref: codeInputRef, className: "form-input code-input", type: "text", placeholder: "XXXX", maxLength: 4, value: code, onChange: e => handleCodeInput(e.target.value), onKeyDown: e => e.key === 'Enter' && handleJoinSubmit() }), _jsx("button", { className: "btn-go", onClick: handleJoinSubmit, disabled: code.length !== 4 || !emailValid || connecting, children: connecting ? '…' : 'Join' })] }), _jsx("button", { className: "btn-cancel", onClick: closeJoin, children: "\u2190 Back" })] }))] }), _jsxs("div", { className: "rooms-col", children: [_jsxs("div", { className: "rooms-header", children: [_jsx("div", { className: "rooms-title", children: "Active Rooms" }), _jsx("div", { className: "rooms-count", children: roomsLoading ? 'Loading…' : `${openRoomCount} room${openRoomCount !== 1 ? 's' : ''} open` })] }), !roomsLoading && rooms.length === 0 && (_jsxs("div", { className: "no-rooms", children: [_jsx("div", { className: "no-rooms-icon", children: "\uD83C\uDFAE" }), _jsxs("div", { className: "no-rooms-text", children: ["No rooms yet.", _jsx("br", {}), "Be the first to create one!"] })] })), rooms.map(room => (_jsxs("div", { className: `room-card${room.status === 'lobby' ? ' lobby' : ''}${room.status === 'game_over' ? ' over' : ''}`, onClick: () => isRoomJoinable(room.status) ? prefillCode(room.code) : undefined, style: { cursor: isRoomJoinable(room.status) ? 'pointer' : 'default' }, children: [_jsxs("div", { className: "rc-top", children: [_jsxs("div", { children: [_jsx("div", { className: "rc-code", children: room.code }), _jsx("div", { className: "rc-topic", children: room.topic }), room.genre && _jsx("div", { className: "rc-genre", children: room.genre })] }), _jsx("div", { className: `status-badge ${statusBadgeClass(room.status)}`, children: statusBadgeText(room.status) })] }), _jsx("div", { className: "rc-players", children: Array.from({ length: room.playerCount }, (_, i) => {
                                            const initial = room.leaderName ? room.leaderName[0].toUpperCase() : '?';
                                            const col = avatarColor(room.leaderName ?? String(i));
                                            return (_jsxs("div", { className: "player-chip", children: [_jsx("div", { className: "chip-ava", style: { background: col + '22', border: `1px solid ${col}`, color: col }, children: i === 0 && room.leaderName ? room.leaderName[0].toUpperCase() : initial }), i === 0 && room.leaderName ? room.leaderName : `P${i + 1}`] }, i));
                                        }) }), _jsx("div", { className: "rc-progress", children: room.roundNumber && room.leaderCards !== undefined && room.cardsToWin ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "rp-label", children: ["Round ", room.roundNumber, " \u00B7 Progress"] }), _jsxs("div", { className: "rp-leader", children: [room.leaderName, " \u2014 ", room.leaderCards, " / ", room.cardsToWin, " cards"] }), _jsx("div", { className: "rp-bar-wrap", children: _jsx("div", { className: "rp-bar", style: { width: `${(room.leaderCards / room.cardsToWin) * 100}%` } }) })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "rp-label", children: "Waiting to start" }), _jsxs("div", { className: "rp-waiting", children: [room.playerCount, " player", room.playerCount !== 1 ? 's' : '', " in lobby"] })] })) }), isRoomJoinable(room.status) && (_jsx("div", { className: "rc-join-hint", children: "CLICK TO JOIN \u2192" }))] }, room.code)))] })] }), showCreateModal && (_jsx("div", { className: "modal-overlay", onClick: () => setShowCreateModal(false), children: _jsxs("div", { className: "modal-box", onClick: e => e.stopPropagation(), children: [_jsx("div", { className: "modal-title", children: "Create a Room" }), _jsxs("div", { className: "field", children: [_jsx("div", { className: "field-label", children: "Room Topic / Theme" }), _jsx("input", { ref: topicInputRef, className: "form-input", type: "text", placeholder: "e.g. 90s Night, Pop Classics\u2026", maxLength: 40, value: joinTopic, onChange: e => setJoinTopic(e.target.value), onKeyDown: e => e.key === 'Enter' && handleCreateSubmit() })] }), _jsxs("div", { className: "modal-actions", children: [_jsx("button", { className: "btn btn-create", disabled: !joinTopic.trim(), onClick: handleCreateSubmit, children: "\u2295 Create" }), _jsx("button", { className: "btn-cancel", onClick: () => setShowCreateModal(false), children: "Cancel" })] })] }) }))] }));
}
