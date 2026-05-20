import { useState, useEffect, useCallback } from 'react';
import { socket } from '../socket/client';
export function useGame() {
    const [room, setRoom] = useState(null);
    const [currentCard, setCurrentCard] = useState(null);
    const [activePlayerId, setActivePlayerId] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [playAt, setPlayAt] = useState(null);
    const [timelineLength, setTimelineLength] = useState(0);
    const [lastFlip, setLastFlip] = useState(null);
    const [roundEnded, setRoundEnded] = useState(null);
    const [myTokens, setMyTokens] = useState(0);
    const [socketError, setSocketError] = useState(null);
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
            setPlayAt(null);
            setLastFlip(null);
            setRoundEnded(null);
            const tokenKey = r.activeRound?.config.mode === 'cooperative' ? 'cooperative' : sessionId;
            if (r.activeRound?.tokens[tokenKey] !== undefined) {
                setMyTokens(r.activeRound.tokens[tokenKey]);
            }
        });
        socket.on('turn:started', ({ activePlayerId: pid, card, previewUrl: url, playAt: pa, timelineLength: tl }) => {
            setActivePlayerId(pid);
            setCurrentCard(card);
            setPreviewUrl(url);
            setPlayAt(pa);
            setTimelineLength(tl);
            setLastFlip(null);
        });
        socket.on('turn:placed', ({ activePlayerId: pid }) => {
            setActivePlayerId(pid);
        });
        socket.on('turn:challenged', () => {
            // challenge acknowledged — state updates come via turn:flipped
        });
        socket.on('turn:flipped', ({ card, correct, updatedTimeline, tokensUpdated }) => {
            setLastFlip({ card, correct });
            setCurrentCard(null);
            setRoom((prev) => {
                if (!prev || !prev.activeRound)
                    return prev;
                return {
                    ...prev,
                    activeRound: {
                        ...prev.activeRound,
                        timelines: {
                            ...prev.activeRound.timelines,
                            [updatedTimeline.ownerId]: updatedTimeline,
                        },
                        tokens: tokensUpdated,
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
            setPlayAt(null);
        });
        socket.on('error', (msg) => {
            console.error('[hitster socket error]', msg);
            setSocketError(typeof msg === 'string' ? msg : msg?.message ?? 'An error occurred');
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
            socket.off('error');
        };
    }, [sessionId]);
    const connect = useCallback((displayName, email) => {
        sessionStorage.setItem('hitster_display_name', displayName);
        sessionStorage.setItem('hitster_email', email);
        // Update auth before connecting
        socket.auth = {
            ...socket.auth,
            sessionId: sessionStorage.getItem('hitster_session_id') ?? '',
            displayName,
            email,
        };
        if (!socket.connected) {
            socket.connect();
        }
    }, []);
    const createRoom = useCallback((topic) => {
        if (socket.connected) {
            socket.emit('room:create', { topic });
        }
        else {
            socket.once('connect', () => socket.emit('room:create', { topic }));
        }
    }, []);
    const joinRoom = useCallback((code) => {
        if (socket.connected) {
            socket.emit('room:join', { roomCode: code });
        }
        else {
            socket.once('connect', () => socket.emit('room:join', { roomCode: code }));
        }
    }, []);
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
    return {
        room,
        currentCard,
        activePlayerId,
        previewUrl,
        playAt,
        timelineLength,
        lastFlip,
        roundEnded,
        myTokens,
        socketError,
        connect,
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
    };
}
