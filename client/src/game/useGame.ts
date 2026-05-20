import { useState, useEffect, useCallback } from 'react';
import { socket } from '../socket/client';
import type { Room, Card, CardHidden, GameMode } from '../../../shared/types';

export interface GameState {
  room: Room | null;
  currentCard: CardHidden | null;
  activePlayerId: string | null;
  previewUrl: string | null;
  playAt: number | null;
  timelineLength: number;
  lastFlip: { card: Card; correct: boolean } | null;
  roundEnded: { winnerId: string | null } | null;
  myTokens: number;
  socketError: string | null;
  connect: (displayName: string, email: string) => void;
  createRoom: (topic: string) => void;
  joinRoom: (code: string) => void;
  startRound: (mode: GameMode, playlistLabel?: string, cardsToWin?: number, tokensEnabled?: boolean) => void;
  placeCard: (position: number) => void;
  challengeCard: () => void;
  skipCard: () => void;
  nameSong: (title: string, artist: string, year?: number) => void;
  buyCard: () => void;
  dismissRoundEnd: () => void;
  createTeam: (name: string) => void;
  joinTeam: (teamId: string) => void;
  leaveTeam: () => void;
}

export function useGame(): GameState {
  const [room, setRoom] = useState<Room | null>(null);
  const [currentCard, setCurrentCard] = useState<CardHidden | null>(null);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [playAt, setPlayAt] = useState<number | null>(null);
  const [timelineLength, setTimelineLength] = useState(0);
  const [lastFlip, setLastFlip] = useState<{ card: Card; correct: boolean } | null>(null);
  const [roundEnded, setRoundEnded] = useState<{ winnerId: string | null } | null>(null);
  const [myTokens, setMyTokens] = useState(0);
  const [socketError, setSocketError] = useState<string | null>(null);

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
        if (!prev || !prev.activeRound) return prev;
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
        if (!prev || !prev.activeRound) return prev;
        return { ...prev, activeRound: { ...prev.activeRound, tokens: tokensUpdated } };
      });
    });

    socket.on('turn:named', ({ tokensUpdated }) => {
      if (tokensUpdated[sessionId] !== undefined) {
        setMyTokens(tokensUpdated[sessionId]);
      }
      setRoom((prev) => {
        if (!prev || !prev.activeRound) return prev;
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
      setSocketError(typeof msg === 'string' ? msg : (msg as { message?: string })?.message ?? 'An error occurred');
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

  const connect = useCallback((displayName: string, email: string) => {
    sessionStorage.setItem('hitster_display_name', displayName);
    sessionStorage.setItem('hitster_email', email);
    // Update auth before connecting
    socket.auth = {
      ...(socket.auth as object),
      sessionId: sessionStorage.getItem('hitster_session_id') ?? '',
      displayName,
      email,
    };
    if (!socket.connected) {
      socket.connect();
    }
  }, []);

  const createRoom = useCallback((topic: string) => {
    if (socket.connected) {
      socket.emit('room:create', { topic });
    } else {
      socket.once('connect', () => socket.emit('room:create', { topic }));
    }
  }, []);

  const joinRoom = useCallback((code: string) => {
    if (socket.connected) {
      socket.emit('room:join', { roomCode: code });
    } else {
      socket.once('connect', () => socket.emit('room:join', { roomCode: code }));
    }
  }, []);

  const startRound = useCallback((mode: GameMode, playlistLabel?: string, cardsToWin?: number, tokensEnabled?: boolean) => {
    socket.emit('round:start', { mode, playlistLabel, cardsToWin, tokensEnabled });
  }, []);

  const placeCard = useCallback((position: number) => {
    socket.emit('turn:place', { position });
  }, []);

  const challengeCard = useCallback(() => {
    socket.emit('turn:challenge');
  }, []);

  const skipCard = useCallback(() => {
    socket.emit('turn:skip');
  }, []);

  const nameSong = useCallback((title: string, artist: string, year?: number) => {
    socket.emit('turn:name', { title, artist, year });
  }, []);

  const buyCard = useCallback(() => {
    socket.emit('turn:buy');
  }, []);

  const dismissRoundEnd = useCallback(() => {
    setRoundEnded(null);
  }, []);

  const createTeam = useCallback((name: string) => {
    socket.emit('team:create', { name });
  }, []);

  const joinTeam = useCallback((teamId: string) => {
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
