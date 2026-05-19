import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  SocketAuth,
  RoundConfig,
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

// Map from socketId → { sessionId, roomCode } for fast lookup on disconnect
const socketSession = new Map<string, { sessionId: string; roomCode: string }>();

// Map from roomCode → deck held in memory during an active round
const liveDecks = new Map<string, ReturnType<typeof engine.drawCard>['remaining']>();

// ---------------------------------------------------------------------------
// HTTP routes
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', rooms: store.getAll().length });
});

app.get('/rooms', (_req, res) => {
  res.json(store.getSummaries());
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Retrieve room or emit an error and return undefined */
function getRoom(roomCode: string, socketEmit: (msg: string) => void) {
  const room = store.get(roomCode);
  if (!room) {
    socketEmit('Room not found');
  }
  return room;
}

/** Start the next turn: draw a card and emit turn:started to the room */
function startTurn(roomCode: string): void {
  const room = store.get(roomCode);
  if (!room?.activeRound) return;

  const deck = liveDecks.get(roomCode) ?? [];
  if (deck.length === 0) return; // Deck exhausted — round:ended should have fired already

  const { card, hidden, remaining } = engine.drawCard(deck);
  liveDecks.set(roomCode, remaining);

  // Update deckRemaining on the room
  const updatedRoom = {
    ...room,
    activeRound: {
      ...room.activeRound,
      deckRemaining: remaining.length,
      // Attach the current card on the turn so resolveFlip can retrieve it
      currentTurn: {
        activeId: room.activeRound.turnOrder[room.activeRound.turnIndex],
        phase: 'reveal' as const,
        challenges: [],
      },
    },
  };
  store.set(updatedRoom);

  // Store the drawn card so we can flip it later
  pendingCards.set(roomCode, card);

  const activeId = updatedRoom.activeRound.turnOrder[updatedRoom.activeRound.turnIndex];

  io.to(roomCode).emit('turn:started', {
    card: hidden,
    previewUrl: hidden.previewUrl,
    playAt: Date.now() + 600,
    activeId,
  });
}

// Holds the card that was drawn for the current turn (not yet flipped)
const pendingCards = new Map<string, ReturnType<typeof engine.drawCard>['card']>();

// Holds timeout references for challenge windows
const challengeTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Clear any existing challenge timer for a room */
function clearChallengeTimer(roomCode: string): void {
  const timer = challengeTimers.get(roomCode);
  if (timer !== undefined) {
    clearTimeout(timer);
    challengeTimers.delete(roomCode);
  }
}

/** Resolve the flip after challenge window ends */
function resolveAndAdvance(roomCode: string): void {
  clearChallengeTimer(roomCode);

  const room = store.get(roomCode);
  const card = pendingCards.get(roomCode);

  if (!room?.activeRound || !card) return;

  const { room: flippedRoom, correct, winnerId } = engine.resolveFlip(room, card);
  pendingCards.delete(roomCode);

  const updatedTimeline = flippedRoom.activeRound?.timelines[room.activeRound.currentTurn?.activeId ?? ''];
  const tokens = flippedRoom.activeRound?.tokens ?? {};

  io.to(roomCode).emit('turn:flipped', {
    card,
    correct,
    updatedTimeline: updatedTimeline ?? { ownerId: '', cards: [] },
    tokensUpdated: tokens,
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
    io.to(roomCode).emit('round:ended', summary);
    return;
  }

  // Advance turn
  const advancedRoom = engine.advanceTurn(flippedRoom);
  store.set(advancedRoom);
  io.to(roomCode).emit('room:updated', advancedRoom);

  startTurn(roomCode);
}

// ---------------------------------------------------------------------------
// Socket.io connection handler
// ---------------------------------------------------------------------------

io.on('connection', (socket) => {
  const auth = socket.handshake.auth as SocketAuth;
  const sessionId = auth.sessionId;

  console.log(`Client connected: ${socket.id} (session: ${sessionId})`);

  // ------------------------------------------------------------------
  // room:create
  // ------------------------------------------------------------------
  socket.on('room:create', (data, callback) => {
    try {
      const room = engine.createRoom(sessionId, data.playerName, data.description);
      store.set(room);
      socket.join(room.code);
      socketSession.set(socket.id, { sessionId, roomCode: room.code });

      socket.emit('room:created', room);
      io.to(room.code).emit('room:updated', room);
      callback({ room });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create room';
      callback({ error: message });
    }
  });

  // ------------------------------------------------------------------
  // room:join
  // ------------------------------------------------------------------
  socket.on('room:join', (data, callback) => {
    try {
      const existingRoom = store.get(data.code.toUpperCase());
      if (!existingRoom) {
        callback({ error: 'Room not found' });
        return;
      }

      const updatedRoom = engine.addPlayer(existingRoom, sessionId, data.playerName);
      store.set(updatedRoom);
      socket.join(updatedRoom.code);
      socketSession.set(socket.id, { sessionId, roomCode: updatedRoom.code });

      socket.emit('room:created', updatedRoom); // reuse room:created for "you joined"
      io.to(updatedRoom.code).emit('room:updated', updatedRoom);
      callback({ room: updatedRoom });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to join room';
      callback({ error: message });
    }
  });

  // ------------------------------------------------------------------
  // round:configure — owner sets config before starting
  // ------------------------------------------------------------------
  socket.on('round:configure', (config: RoundConfig) => {
    const session = socketSession.get(socket.id);
    if (!session) return;

    const room = getRoom(session.roomCode, (msg) => socket.emit('error', msg));
    if (!room) return;
    if (room.ownerId !== sessionId) {
      socket.emit('error', 'Only the room owner can configure the round');
      return;
    }

    // Store the pending config; we'll apply it on round:start
    pendingConfigs.set(session.roomCode, config);
  });

  // ------------------------------------------------------------------
  // round:start
  // ------------------------------------------------------------------
  socket.on('round:start', async () => {
    const session = socketSession.get(socket.id);
    if (!session) return;

    const room = getRoom(session.roomCode, (msg) => socket.emit('error', msg));
    if (!room) return;
    if (room.ownerId !== sessionId) {
      socket.emit('error', 'Only the room owner can start the round');
      return;
    }
    if (room.status !== 'lobby' && room.status !== 'round_ended') {
      socket.emit('error', 'Round already active');
      return;
    }

    try {
      // Retrieve stored config or use a default
      const config: RoundConfig = pendingConfigs.get(session.roomCode) ?? {
        mode: 'original',
        tokensEnabled: true,
        cardsToWin: 10,
      };

      // Fetch tracks
      let cards = config.playlistUrl
        ? await spotify.getTracksForLabel(config.playlistUrl)
        : config.genre
          ? await spotify.getTracksForLabel(config.genre)
          : await spotify.getRandomTracks(50);

      if (cards.length < Object.keys(room.players).length + 5) {
        socket.emit('error', 'Not enough tracks available to start');
        return;
      }

      const { room: initedRoom, deck } = engine.initRound(room, config, cards);
      liveDecks.set(session.roomCode, deck);
      store.set(initedRoom);

      io.to(session.roomCode).emit('round:started', {
        config: initedRoom.activeRound!.config,
        turnOrder: initedRoom.activeRound!.turnOrder,
        timelines: initedRoom.activeRound!.timelines,
      });
      io.to(session.roomCode).emit('room:updated', initedRoom);

      // Start the first turn
      startTurn(session.roomCode);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start round';
      socket.emit('error', message);
    }
  });

  // ------------------------------------------------------------------
  // turn:place
  // ------------------------------------------------------------------
  socket.on('turn:place', (position: number) => {
    const session = socketSession.get(socket.id);
    if (!session) return;

    const room = getRoom(session.roomCode, (msg) => socket.emit('error', msg));
    if (!room?.activeRound) return;

    const activeId = room.activeRound.turnOrder[room.activeRound.turnIndex];
    if (activeId !== sessionId) {
      socket.emit('error', 'Not your turn');
      return;
    }

    try {
      const placedRoom = engine.applyPlacement(room, sessionId, position);
      store.set(placedRoom);

      io.to(session.roomCode).emit('turn:placed', { position });
      io.to(session.roomCode).emit('room:updated', placedRoom);

      // Start challenge window timer
      clearChallengeTimer(session.roomCode);
      const roomCode = session.roomCode;
      const timer = setTimeout(() => {
        resolveAndAdvance(roomCode);
      }, CHALLENGE_WINDOW_MS);
      challengeTimers.set(roomCode, timer);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Placement failed';
      socket.emit('error', message);
    }
  });

  // ------------------------------------------------------------------
  // turn:challenge
  // ------------------------------------------------------------------
  socket.on('turn:challenge', (position: number) => {
    const session = socketSession.get(socket.id);
    if (!session) return;

    const room = getRoom(session.roomCode, (msg) => socket.emit('error', msg));
    if (!room?.activeRound?.currentTurn) return;

    const currentTurn = room.activeRound.currentTurn;
    if (currentTurn.phase !== 'challenge') {
      socket.emit('error', 'Not in challenge phase');
      return;
    }
    if (currentTurn.activeId === sessionId) {
      socket.emit('error', 'Cannot challenge your own placement');
      return;
    }

    const updatedRoom = {
      ...room,
      activeRound: {
        ...room.activeRound,
        currentTurn: {
          ...currentTurn,
          challenges: [
            ...currentTurn.challenges,
            { challengerId: sessionId, position },
          ],
        },
      },
    };
    store.set(updatedRoom);

    io.to(session.roomCode).emit('turn:challenged', { challengerId: sessionId, position });
    io.to(session.roomCode).emit('room:updated', updatedRoom);
  });

  // ------------------------------------------------------------------
  // turn:skip — spend 1 token to discard current card, draw a new one
  // ------------------------------------------------------------------
  socket.on('turn:skip', () => {
    const session = socketSession.get(socket.id);
    if (!session) return;

    const room = getRoom(session.roomCode, (msg) => socket.emit('error', msg));
    if (!room?.activeRound) return;

    const activeId = room.activeRound.turnOrder[room.activeRound.turnIndex];
    if (activeId !== sessionId) {
      socket.emit('error', 'Not your turn');
      return;
    }

    try {
      const skippedRoom = engine.applySkip(room, sessionId);
      // Discard pending card
      pendingCards.delete(session.roomCode);
      store.set(skippedRoom);
      io.to(session.roomCode).emit('room:updated', skippedRoom);

      // Draw a new card for the same player
      startTurn(session.roomCode);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Skip failed';
      socket.emit('error', message);
    }
  });

  // ------------------------------------------------------------------
  // turn:name — player tries to name the song for a token bonus
  // ------------------------------------------------------------------
  socket.on('turn:name', (data: { title: string; artist: string }) => {
    const session = socketSession.get(socket.id);
    if (!session) return;

    const room = getRoom(session.roomCode, (msg) => socket.emit('error', msg));
    if (!room?.activeRound?.currentTurn) return;

    const card = pendingCards.get(session.roomCode);
    if (!card) return; // No card in play

    // Fuzzy match: lowercase trim comparison
    const normalise = (s: string) => s.toLowerCase().trim();
    const titleMatch = normalise(data.title) === normalise(card.title);
    const artistMatch = normalise(data.artist) === normalise(card.artist);
    const correct = titleMatch && artistMatch;

    let updatedRoom = room;
    if (correct) {
      updatedRoom = engine.applyNamingBonus(room, sessionId);
      store.set(updatedRoom);
    }

    const tokens = updatedRoom.activeRound?.tokens[sessionId] ?? 0;
    io.to(session.roomCode).emit('turn:named', { playerId: sessionId, correct, tokens });
    if (correct) {
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

    // If it was this player's turn, set a 15s timeout then advance
    if (
      updatedRoom.status === 'round_active' &&
      updatedRoom.activeRound?.turnOrder[updatedRoom.activeRound.turnIndex] === sessionId
    ) {
      const roomCode = session.roomCode;
      setTimeout(() => {
        const currentRoom = store.get(roomCode);
        if (!currentRoom?.activeRound) return;
        // Check it's still this player's turn
        if (currentRoom.activeRound.turnOrder[currentRoom.activeRound.turnIndex] !== sessionId) return;

        clearChallengeTimer(roomCode);
        pendingCards.delete(roomCode);

        const advanced = engine.advanceTurn(currentRoom);
        store.set(advanced);
        io.to(roomCode).emit('room:updated', advanced);
        startTurn(roomCode);
      }, 15_000);
    }
  });
});

// Map for pending round configs (roomCode → RoundConfig)
const pendingConfigs = new Map<string, RoundConfig>();

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT || '3000', 10);
httpServer.listen(PORT, () => {
  console.log(`Hitster Online server running on port ${PORT}`);
});
