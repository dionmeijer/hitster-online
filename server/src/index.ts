import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { existsSync } from 'fs';
import { join } from 'path';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  SocketAuth,
  RoundConfig,
  Challenge,
} from '../../shared/types';
import { SpotifyClient } from './spotify/client';
import { RoomStore } from './rooms/store';
import * as engine from './game/engine';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const app = express();
const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

const store = new RoomStore();
const spotify = new SpotifyClient();

// In TEST_MODE the challenge window is much shorter to keep tests fast
const CHALLENGE_WINDOW_MS = process.env.TEST_MODE === 'true' ? 500 : 10_000;

// socketId → { sessionId, roomCode }
const socketSession = new Map<string, { sessionId: string; roomCode: string }>();

// roomCode → remaining deck
const liveDecks = new Map<string, ReturnType<typeof engine.drawCard>['remaining']>();

// roomCode → card drawn this turn (not yet flipped)
const pendingCards = new Map<string, ReturnType<typeof engine.drawCard>['card']>();

// roomCode → per-turn challenge list (separate from room state to avoid type pollution)
const pendingChallenges = new Map<string, Challenge[]>();

// roomCode → challenge window timer
const challengeTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ---------------------------------------------------------------------------
// HTTP routes
// ---------------------------------------------------------------------------

// Serve built React client if available, otherwise redirect to Vite dev server
const clientDist = join(__dirname, '../../client/dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(join(clientDist, 'index.html')));
} else {
  const devUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  app.get('/', (_req, res) => res.redirect(devUrl));
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', rooms: store.getAll().length });
});

app.get('/rooms', (_req, res) => {
  res.json(store.getSummaries());
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clearChallengeTimer(roomCode: string): void {
  const t = challengeTimers.get(roomCode);
  if (t !== undefined) { clearTimeout(t); challengeTimers.delete(roomCode); }
}

function startTurn(roomCode: string): void {
  const room = store.get(roomCode);
  if (!room?.activeRound) return;

  const deck = liveDecks.get(roomCode) ?? [];
  if (deck.length === 0) return;

  const { card, hidden, remaining } = engine.drawCard(deck);
  liveDecks.set(roomCode, remaining);
  pendingCards.set(roomCode, card);
  pendingChallenges.set(roomCode, []);

  const activeId = room.activeRound.turnOrder[room.activeRound.turnIndex];
  const timelineLen = engine.timelineLength(room, activeId);

  const updatedRoom = {
    ...room,
    activeRound: {
      ...room.activeRound,
      deckRemaining: remaining.length,
      currentCard: hidden,
      currentTurn: {
        activeId,
        phase: 'place' as const,
        challenges: [],
      },
    },
  };
  store.set(updatedRoom);

  io.to(roomCode).emit('turn:started', {
    activePlayerId: activeId,
    card: hidden,
    previewUrl: hidden.previewUrl,
    playAt: Date.now() + 600,
    timelineLength: timelineLen,
  });
}

function resolveAndAdvance(roomCode: string): void {
  clearChallengeTimer(roomCode);

  const room = store.get(roomCode);
  const card = pendingCards.get(roomCode);
  if (!room?.activeRound?.currentTurn || !card) return;

  const activePlayerId = room.activeRound.currentTurn.activeId;

  // Inject challenges into currentTurn before resolving
  const roomWithChallenges = {
    ...room,
    activeRound: {
      ...room.activeRound,
      currentTurn: {
        ...room.activeRound.currentTurn,
        challenges: pendingChallenges.get(roomCode) ?? [],
      },
    },
  };

  const { room: flippedRoom, correct, winnerId } = engine.resolveFlip(roomWithChallenges, card);
  pendingCards.delete(roomCode);
  pendingChallenges.delete(roomCode);

  const updatedTimeline = flippedRoom.activeRound?.timelines[activePlayerId]
    ?? { ownerId: activePlayerId, cards: [] };
  const tokensUpdated = flippedRoom.activeRound?.tokens ?? {};

  io.to(roomCode).emit('turn:flipped', {
    card,
    correct,
    activePlayerId,
    updatedTimeline,
    tokensUpdated,
  });

  if (winnerId || flippedRoom.status === 'round_ended') {
    const summary = engine.buildRoundSummary(flippedRoom, winnerId ?? null);
    const finalRoom = {
      ...flippedRoom,
      status: 'round_ended' as const,
      roundHistory: [...flippedRoom.roundHistory, summary],
    };
    store.set(finalRoom);
    io.to(roomCode).emit('room:updated', finalRoom);
    io.to(roomCode).emit('round:ended', { winnerId: winnerId ?? null, summary });
    return;
  }

  const advancedRoom = engine.advanceTurn(flippedRoom);
  store.set(advancedRoom);
  io.to(roomCode).emit('room:updated', advancedRoom);
  startTurn(roomCode);
}

// ---------------------------------------------------------------------------
// Socket.io
// ---------------------------------------------------------------------------

io.on('connection', (socket) => {
  const auth = socket.handshake.auth as SocketAuth;
  const sessionId = auth.sessionId;
  const displayName = auth.displayName ?? 'Anonymous';

  console.log(`Client connected: ${socket.id} (session: ${sessionId}, name: ${displayName})`);

  // ------------------------------------------------------------------
  // room:create
  // ------------------------------------------------------------------
  socket.on('room:create', (data) => {
    try {
      const room = engine.createRoom(sessionId, displayName, data.topic);
      store.set(room);
      socket.join(room.code);
      socketSession.set(socket.id, { sessionId, roomCode: room.code });

      socket.emit('room:created', { roomCode: room.code, room });
      io.to(room.code).emit('room:updated', room);
    } catch (err) {
      socket.emit('error', err instanceof Error ? err.message : 'Failed to create room');
    }
  });

  // ------------------------------------------------------------------
  // room:join
  // ------------------------------------------------------------------
  socket.on('room:join', (data) => {
    try {
      const existing = store.get(data.roomCode.toUpperCase());
      if (!existing) { socket.emit('error', 'Room not found'); return; }

      const updatedRoom = engine.addPlayer(existing, sessionId, displayName);
      store.set(updatedRoom);
      socket.join(updatedRoom.code);
      socketSession.set(socket.id, { sessionId, roomCode: updatedRoom.code });

      socket.emit('room:joined', { roomCode: updatedRoom.code, room: updatedRoom });
      io.to(updatedRoom.code).emit('room:updated', updatedRoom);
    } catch (err) {
      socket.emit('error', err instanceof Error ? err.message : 'Failed to join room');
    }
  });

  // ------------------------------------------------------------------
  // round:start
  // ------------------------------------------------------------------
  socket.on('round:start', async (data) => {
    const session = socketSession.get(socket.id);
    if (!session) return;

    const room = store.get(session.roomCode);
    if (!room) { socket.emit('error', 'Room not found'); return; }
    if (room.ownerId !== sessionId) { socket.emit('error', 'Only the room owner can start the round'); return; }
    if (room.status !== 'lobby' && room.status !== 'round_ended') {
      socket.emit('error', 'Round already active'); return;
    }

    try {
      const config: RoundConfig = {
        playlistLabel: data.playlistLabel,
        mode: data.mode,
        cardsToWin: 10,
      };

      const cards = data.playlistLabel
        ? await spotify.getTracksForLabel(data.playlistLabel)
        : await spotify.getRandomTracks(50);

      if (cards.length < Object.keys(room.players).length + 5) {
        socket.emit('error', 'Not enough tracks available to start'); return;
      }

      const { room: initedRoom, deck } = engine.initRound(room, config, cards);
      liveDecks.set(session.roomCode, deck);
      store.set(initedRoom);

      io.to(session.roomCode).emit('round:started', { room: initedRoom });
      io.to(session.roomCode).emit('room:updated', initedRoom);

      startTurn(session.roomCode);
    } catch (err) {
      socket.emit('error', err instanceof Error ? err.message : 'Failed to start round');
    }
  });

  // ------------------------------------------------------------------
  // turn:place
  // ------------------------------------------------------------------
  socket.on('turn:place', (data) => {
    const session = socketSession.get(socket.id);
    if (!session) return;

    const room = store.get(session.roomCode);
    if (!room?.activeRound) return;

    const activeId = room.activeRound.turnOrder[room.activeRound.turnIndex];
    if (activeId !== sessionId) { socket.emit('error', 'Not your turn'); return; }

    try {
      const placedRoom = engine.applyPlacement(room, sessionId, data.position);
      store.set(placedRoom);

      io.to(session.roomCode).emit('turn:placed', { position: data.position, activePlayerId: sessionId });
      io.to(session.roomCode).emit('room:updated', placedRoom);

      clearChallengeTimer(session.roomCode);
      const roomCode = session.roomCode;
      const timer = setTimeout(() => resolveAndAdvance(roomCode), CHALLENGE_WINDOW_MS);
      challengeTimers.set(roomCode, timer);
    } catch (err) {
      socket.emit('error', err instanceof Error ? err.message : 'Placement failed');
    }
  });

  // ------------------------------------------------------------------
  // turn:challenge
  // ------------------------------------------------------------------
  socket.on('turn:challenge', () => {
    const session = socketSession.get(socket.id);
    if (!session) return;

    const room = store.get(session.roomCode);
    if (!room?.activeRound?.currentTurn) return;

    const { currentTurn } = room.activeRound;
    if (currentTurn.phase !== 'challenge') { socket.emit('error', 'Not in challenge phase'); return; }
    if (currentTurn.activeId === sessionId) { socket.emit('error', 'Cannot challenge your own placement'); return; }

    const challenges = pendingChallenges.get(session.roomCode) ?? [];
    challenges.push({ challengerId: sessionId });
    pendingChallenges.set(session.roomCode, challenges);

    io.to(session.roomCode).emit('turn:challenged', { challengerId: sessionId });
  });

  // ------------------------------------------------------------------
  // turn:skip
  // ------------------------------------------------------------------
  socket.on('turn:skip', () => {
    const session = socketSession.get(socket.id);
    if (!session) return;

    const room = store.get(session.roomCode);
    if (!room?.activeRound) return;

    const activeId = room.activeRound.turnOrder[room.activeRound.turnIndex];
    if (activeId !== sessionId) { socket.emit('error', 'Not your turn'); return; }

    try {
      const skippedRoom = engine.applySkip(room, sessionId);
      pendingCards.delete(session.roomCode);
      store.set(skippedRoom);
      io.to(session.roomCode).emit('room:updated', skippedRoom);
      startTurn(session.roomCode);
    } catch (err) {
      socket.emit('error', err instanceof Error ? err.message : 'Skip failed');
    }
  });

  // ------------------------------------------------------------------
  // turn:name
  // ------------------------------------------------------------------
  socket.on('turn:name', (data) => {
    const session = socketSession.get(socket.id);
    if (!session) return;

    const room = store.get(session.roomCode);
    if (!room?.activeRound) return;

    const card = pendingCards.get(session.roomCode);
    if (!card) return;

    const norm = (s: string) => s.toLowerCase().trim();
    const correct = norm(data.title) === norm(card.title) && norm(data.artist) === norm(card.artist);

    if (correct) {
      const updatedRoom = engine.applyNamingBonus(room, sessionId);
      store.set(updatedRoom);
      const tokensUpdated = updatedRoom.activeRound?.tokens ?? {};
      io.to(session.roomCode).emit('turn:named', { playerId: sessionId, tokensUpdated });
      io.to(session.roomCode).emit('room:updated', updatedRoom);
    }
  });

  // ------------------------------------------------------------------
  // disconnect
  // ------------------------------------------------------------------
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id} (session: ${sessionId})`);

    const session = socketSession.get(socket.id);
    socketSession.delete(socket.id);
    if (!session) return;

    const room = store.get(session.roomCode);
    if (!room) return;

    const updatedRoom = engine.markDisconnected(room, sessionId);
    store.set(updatedRoom);
    io.to(session.roomCode).emit('room:updated', updatedRoom);

    // If it was this player's turn, advance after 15s
    if (
      updatedRoom.status === 'round_active' &&
      updatedRoom.activeRound?.turnOrder[updatedRoom.activeRound.turnIndex] === sessionId
    ) {
      const roomCode = session.roomCode;
      setTimeout(() => {
        const cur = store.get(roomCode);
        if (!cur?.activeRound) return;
        if (cur.activeRound.turnOrder[cur.activeRound.turnIndex] !== sessionId) return;
        clearChallengeTimer(roomCode);
        pendingCards.delete(roomCode);
        const advanced = engine.advanceTurn(cur);
        store.set(advanced);
        io.to(roomCode).emit('room:updated', advanced);
        startTurn(roomCode);
      }, 15_000);
    }
  });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT || '3000', 10);
httpServer.listen(PORT, () => {
  console.log(`Hitster Online server running on port ${PORT}`);
});
