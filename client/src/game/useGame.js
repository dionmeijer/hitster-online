import { useState, useEffect, useCallback } from 'react';
import { socket } from '../socket/client';
/** Restore turn UI when joining or reconnecting mid-round (before turn:started snapshot). */
function hydrateTurnFromRoom(r) {
    const ar = r.activeRound;
    if (r.status !== 'round_active' || !ar?.currentTurn?.activeId) {
        return { activePlayerId: null, currentCard: null, previewUrl: null, streamUrl: null };
    }
    const card = ar.currentCard ?? null;
    return {
        activePlayerId: ar.currentTurn.activeId,
        currentCard: card,
        previewUrl: card?.previewUrl ?? null,
        streamUrl: card?.streamUrl ?? null,
    };
}
export function useGame() {
    const [room, setRoom] = useState(null);
    const [currentCard, setCurrentCard] = useState(null);
    const [activePlayerId, setActivePlayerId] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [streamUrl, setStreamUrl] = useState(null);
    const [playAt, setPlayAt] = useState(null);
    const [turnEndsAt, setTurnEndsAt] = useState(null);
    const [timelineLength, setTimelineLength] = useState(0);
    const [lastFlip, setLastFlip] = useState(null);
    const [roundEnded, setRoundEnded] = useState(null);
    const [myTokens, setMyTokens] = useState(0);
    const [socketError, setSocketError] = useState(null);
    const [playlistPreviewCards, setPlaylistPreviewCards] = useState(null);
    const [playlistPreviewLoading, setPlaylistPreviewLoading] = useState(false);
    const sessionId = sessionStorage.getItem('hitster_session_id') ?? '';
    useEffect(() => {
        socket.on('room:created', ({ room: r }) => {
            setRoom(r);
            setRoundEnded(null);
            setLastFlip(null);
            setSocketError(null);
        });
        socket.on('room:joined', ({ room: r }) => {
            setRoom(r);
            setRoundEnded(null);
            setLastFlip(null);
            setSocketError(null);
            const hydrated = hydrateTurnFromRoom(r);
            setActivePlayerId(hydrated.activePlayerId);
            setCurrentCard(hydrated.currentCard);
            setPreviewUrl(hydrated.previewUrl);
            setStreamUrl(hydrated.streamUrl);
            setPlayAt(null);
            setTurnEndsAt(null);
        });
        socket.on('room:updated', (r) => {
            setRoom(r);
            const tokenKey = r.activeRound?.config.mode === 'cooperative' ? 'cooperative' : sessionId;
            if (r.activeRound?.tokens[tokenKey] !== undefined) {
                setMyTokens(r.activeRound.tokens[tokenKey]);
            }
        });
        socket.on('round:started', ({ room: r }) => {
            setRoom(r);
            setSocketError(null);
            setCurrentCard(null);
            setActivePlayerId(null);
            setPreviewUrl(null);
            setStreamUrl(null);
            setPlayAt(null);
            setTurnEndsAt(null);
            setLastFlip(null);
            setRoundEnded(null);
            const tokenKey = r.activeRound?.config.mode === 'cooperative' ? 'cooperative' : sessionId;
            if (r.activeRound?.tokens[tokenKey] !== undefined) {
                setMyTokens(r.activeRound.tokens[tokenKey]);
            }
        });
        socket.on('turn:started', ({ activePlayerId: pid, card, previewUrl: url, streamUrl: su, playAt: pa, timelineLength: tl, turnEndsAt: te }) => {
            setActivePlayerId(pid);
            setCurrentCard(card);
            setPreviewUrl(url);
            setStreamUrl(su ?? null);
            setPlayAt(pa > Date.now() ? pa : null);
            setTurnEndsAt(te);
            setTimelineLength(tl);
            setLastFlip(null);
            // New turns start in place phase; mid-turn join snapshots must keep challenge/flip state.
            setRoom(prev => {
                if (!prev?.activeRound)
                    return prev;
                const serverTurn = prev.activeRound.currentTurn;
                if (serverTurn?.activeId === pid &&
                    (serverTurn.phase === 'challenge' || serverTurn.phase === 'flip')) {
                    return {
                        ...prev,
                        activeRound: {
                            ...prev.activeRound,
                            currentCard: card,
                        },
                    };
                }
                return {
                    ...prev,
                    activeRound: {
                        ...prev.activeRound,
                        currentCard: card,
                        currentTurn: { activeId: pid, phase: 'place', challenges: [] },
                    },
                };
            });
        });
        socket.on('turn:placed', ({ activePlayerId: pid, position, challengeEndsAt }) => {
            setActivePlayerId(pid);
            setRoom((prev) => {
                if (!prev?.activeRound?.currentTurn)
                    return prev;
                return {
                    ...prev,
                    activeRound: {
                        ...prev.activeRound,
                        currentTurn: {
                            ...prev.activeRound.currentTurn,
                            activeId: pid,
                            phase: 'challenge',
                            placedPosition: position,
                            challengeDeadline: challengeEndsAt,
                            challenges: prev.activeRound.currentTurn.challenges ?? [],
                        },
                    },
                };
            });
        });
        socket.on('turn:challenged', ({ challengerId }) => {
            setRoom((prev) => {
                if (!prev?.activeRound?.currentTurn)
                    return prev;
                const existing = prev.activeRound.currentTurn.challenges ?? [];
                if (existing.some((c) => c.challengerId === challengerId))
                    return prev;
                return {
                    ...prev,
                    activeRound: {
                        ...prev.activeRound,
                        currentTurn: {
                            ...prev.activeRound.currentTurn,
                            challenges: [...existing, { challengerId }],
                        },
                    },
                };
            });
        });
        socket.on('turn:flipped', ({ card, correct, activePlayerId: flipActiveId, placedPosition: flipPosition, timelines, tokensUpdated, challengeResults, }) => {
            setLastFlip({
                card,
                correct,
                activePlayerId: flipActiveId,
                placedPosition: flipPosition,
                challengeResults,
            });
            setCurrentCard(null);
            setTurnEndsAt(null);
            setRoom((prev) => {
                if (!prev || !prev.activeRound)
                    return prev;
                const turn = prev.activeRound.currentTurn;
                return {
                    ...prev,
                    activeRound: {
                        ...prev.activeRound,
                        timelines,
                        tokens: tokensUpdated,
                        currentTurn: turn
                            ? { ...turn, phase: 'flip', placedPosition: undefined }
                            : turn,
                    },
                };
            });
            if (tokensUpdated[sessionId] !== undefined) {
                setMyTokens(tokensUpdated[sessionId]);
            }
        });
        socket.on('turn:bought', ({ tokensUpdated }) => {
            if (tokensUpdated[sessionId] !== undefined) {
                setMyTokens(tokensUpdated[sessionId]);
            }
            setRoom((prev) => {
                if (!prev || !prev.activeRound)
                    return prev;
                return { ...prev, activeRound: { ...prev.activeRound, tokens: tokensUpdated } };
            });
        });
        socket.on('turn:named', ({ tokensUpdated }) => {
            if (tokensUpdated[sessionId] !== undefined) {
                setMyTokens(tokensUpdated[sessionId]);
            }
            setRoom((prev) => {
                if (!prev || !prev.activeRound)
                    return prev;
                return {
                    ...prev,
                    activeRound: {
                        ...prev.activeRound,
                        tokens: tokensUpdated,
                    },
                };
            });
        });
        socket.on('round:ended', ({ winnerId }) => {
            setRoundEnded({ winnerId });
            setCurrentCard(null);
            setActivePlayerId(null);
            setPreviewUrl(null);
            setStreamUrl(null);
            setPlayAt(null);
            setTurnEndsAt(null);
        });
        socket.on('playlist:previewed', ({ cards }) => {
            setPlaylistPreviewCards(cards);
            setPlaylistPreviewLoading(false);
        });
        socket.on('error', (msg) => {
            console.error('[hitster socket error]', msg);
            setSocketError(typeof msg === 'string' ? msg : msg?.message ?? 'An error occurred');
            setPlaylistPreviewLoading(false);
        });
        return () => {
            socket.off('room:created');
            socket.off('room:joined');
            socket.off('room:updated');
            socket.off('round:started');
            socket.off('turn:started');
            socket.off('turn:placed');
            socket.off('turn:challenged');
            socket.off('turn:flipped');
            socket.off('turn:bought');
            socket.off('turn:named');
            socket.off('round:ended');
            socket.off('playlist:previewed');
            socket.off('error');
        };
    }, [sessionId]);
    const applySocketAuth = useCallback((displayName, email) => {
        sessionStorage.setItem('hitster_display_name', displayName);
        sessionStorage.setItem('hitster_email', email);
        socket.auth = {
            ...socket.auth,
            sessionId: sessionStorage.getItem('hitster_session_id') ?? '',
            displayName,
            email,
        };
    }, []);
    const ensureConnected = useCallback((onConnected) => {
        if (socket.connected) {
            onConnected();
            return;
        }
        socket.once('connect', onConnected);
        if (!socket.active) {
            socket.connect();
        }
    }, []);
    const connect = useCallback((displayName, email) => {
        applySocketAuth(displayName, email);
        if (!socket.connected && !socket.active) {
            socket.connect();
        }
    }, [applySocketAuth]);
    const connectAndCreateRoom = useCallback((displayName, email, topic) => {
        applySocketAuth(displayName, email);
        const trimmed = topic.trim();
        ensureConnected(() => socket.emit('room:create', { topic: trimmed }));
    }, [applySocketAuth, ensureConnected]);
    const connectAndJoinRoom = useCallback((displayName, email, roomCode) => {
        applySocketAuth(displayName, email);
        const code = roomCode.trim().toUpperCase();
        ensureConnected(() => socket.emit('room:join', { roomCode: code }));
    }, [applySocketAuth, ensureConnected]);
    const createRoom = useCallback((topic) => {
        ensureConnected(() => socket.emit('room:create', { topic }));
    }, [ensureConnected]);
    const joinRoom = useCallback((code) => {
        const roomCode = code.trim().toUpperCase();
        ensureConnected(() => socket.emit('room:join', { roomCode }));
    }, [ensureConnected]);
    const startRound = useCallback((mode, playlistLabel, cardsToWin, tokensEnabled) => {
        socket.emit('round:start', { mode, playlistLabel, cardsToWin, tokensEnabled });
    }, []);
    const placeCard = useCallback((position) => {
        socket.emit('turn:place', { position });
    }, []);
    const challengeCard = useCallback(() => {
        socket.emit('turn:challenge');
    }, []);
    const skipCard = useCallback(() => {
        socket.emit('turn:skip');
    }, []);
    const nameSong = useCallback((title, artist, year) => {
        socket.emit('turn:name', { title, artist, year });
    }, []);
    const buyCard = useCallback(() => {
        socket.emit('turn:buy');
    }, []);
    const dismissRoundEnd = useCallback(() => {
        setRoundEnded(null);
    }, []);
    const createTeam = useCallback((name) => {
        socket.emit('team:create', { name });
    }, []);
    const joinTeam = useCallback((teamId) => {
        socket.emit('team:join', { teamId });
    }, []);
    const leaveTeam = useCallback(() => {
        socket.emit('team:leave');
    }, []);
    const previewPlaylist = useCallback((playlistLabel) => {
        setPlaylistPreviewLoading(true);
        setPlaylistPreviewCards(null);
        socket.emit('playlist:preview', { playlistLabel });
    }, []);
    const clearPlaylistPreview = useCallback(() => {
        setPlaylistPreviewCards(null);
        setPlaylistPreviewLoading(false);
    }, []);
    const endGame = useCallback(() => {
        socket.emit('room:end');
    }, []);
    return {
        room,
        currentCard,
        activePlayerId,
        previewUrl,
        streamUrl,
        playAt,
        turnEndsAt,
        timelineLength,
        lastFlip,
        roundEnded,
        myTokens,
        socketError,
        playlistPreviewCards,
        playlistPreviewLoading,
        connect,
        connectAndCreateRoom,
        connectAndJoinRoom,
        createRoom,
        joinRoom,
        startRound,
        placeCard,
        challengeCard,
        skipCard,
        nameSong,
        buyCard,
        dismissRoundEnd,
        createTeam,
        joinTeam,
        leaveTeam,
        previewPlaylist,
        clearPlaylistPreview,
        endGame,
    };
}
