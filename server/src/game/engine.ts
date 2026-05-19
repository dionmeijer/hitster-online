import type {
  Room,
  Player,
  Card,
  Timeline,
  RoundConfig,
  RoundSummary,
  CardHidden,
} from '../../../shared/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const ROOM_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** Generate a 4-char uppercase alphanumeric room code */
export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

/** Create a fresh room */
export function createRoom(ownerId: string, displayName: string, topic: string): Room {
  const owner: Player = {
    id: ownerId,
    displayName,
    isConnected: true,
    missedTurns: 0,
  };

  return {
    code: generateRoomCode(),
    ownerId,
    topic,
    status: 'lobby',
    players: { [ownerId]: owner },
    teams: {},
    useTeams: false,
    roundHistory: [],
  };
}

/** Add a player to an existing room; returns updated Room or throws Error */
export function addPlayer(room: Room, playerId: string, displayName: string): Room {
  if (room.status !== 'lobby') {
    throw new Error('Cannot join a room that has already started');
  }
  if (room.players[playerId]) {
    // Re-joining (reconnect with same sessionId) — just mark connected
    return markReconnected(room, playerId);
  }
  const player: Player = {
    id: playerId,
    displayName,
    isConnected: true,
    missedTurns: 0,
  };
  return {
    ...room,
    players: { ...room.players, [playerId]: player },
  };
}

/** Mark player disconnected; return updated room */
export function markDisconnected(room: Room, playerId: string): Room {
  if (!room.players[playerId]) return room;
  return {
    ...room,
    players: {
      ...room.players,
      [playerId]: { ...room.players[playerId], isConnected: false },
    },
  };
}

/** Mark player reconnected */
export function markReconnected(room: Room, playerId: string): Room {
  if (!room.players[playerId]) return room;
  return {
    ...room,
    players: {
      ...room.players,
      [playerId]: { ...room.players[playerId], isConnected: true },
    },
  };
}

/**
 * Deal starting cards; populate timelines; determine turn order (oldest starting card goes first).
 * The deck is shuffled externally and passed in.
 */
export function initRound(
  room: Room,
  config: RoundConfig,
  deck: Card[]
): { room: Room; deck: Card[] } {
  const playerIds = Object.keys(room.players);
  const remaining = [...deck];

  const timelines: Record<string, Timeline> = {};
  const tokens: Record<string, number> = {};
  const startingCards: Record<string, Card> = {};

  for (const playerId of playerIds) {
    const startCard = remaining.shift();
    if (!startCard) {
      throw new Error('Not enough cards in the deck to deal starting cards');
    }
    timelines[playerId] = {
      ownerId: playerId,
      cards: [startCard],
    };
    tokens[playerId] = 0;
    startingCards[playerId] = startCard;
  }

  // Sort players by starting card releaseYear ascending (oldest goes first)
  // Ties broken by random shuffle
  const sortedPlayerIds = shuffleArray(playerIds).sort(
    (a, b) => startingCards[a].releaseYear - startingCards[b].releaseYear
  );

  const roundNumber = room.roundHistory.length + 1;

  const updatedRoom: Room = {
    ...room,
    status: 'round_active',
    activeRound: {
      config,
      roundNumber,
      turnOrder: sortedPlayerIds,
      turnIndex: 0,
      timelines,
      tokens,
      deckRemaining: remaining.length,
    },
  };

  return { room: updatedRoom, deck: remaining };
}

/** Draw the next card for a turn; return hidden version + updated deck */
export function drawCard(deck: Card[]): { card: Card; hidden: CardHidden; remaining: Card[] } {
  if (deck.length === 0) {
    throw new Error('Deck is empty');
  }
  const [card, ...remaining] = deck;
  const hidden: CardHidden = {
    trackId: card.trackId,
    previewUrl: card.previewUrl,
    albumArt: card.albumArt,
  };
  return { card, hidden, remaining };
}

/**
 * Return true if placing `card` at `position` in `timeline` is correct.
 *
 * position is 0-indexed insert point:
 *   0        = before all cards
 *   n        = after all cards (n = timeline.length)
 *
 * Correct if:
 *   (position === 0 || card.releaseYear >= timeline[position-1].releaseYear)
 *   && (position === timeline.length || card.releaseYear <= timeline[position].releaseYear)
 */
export function isPlacementCorrect(timeline: Card[], card: Card, position: number): boolean {
  const leftOk =
    position === 0 || card.releaseYear >= timeline[position - 1].releaseYear;
  const rightOk =
    position === timeline.length || card.releaseYear <= timeline[position].releaseYear;
  return leftOk && rightOk;
}

/** Apply a placement: update room's currentTurn phase to 'challenge' */
export function applyPlacement(room: Room, playerId: string, position: number): Room {
  if (!room.activeRound) throw new Error('No active round');
  const currentTurn = room.activeRound.currentTurn;
  if (!currentTurn) throw new Error('No current turn');
  if (currentTurn.activeId !== playerId) throw new Error('Not your turn');

  return {
    ...room,
    activeRound: {
      ...room.activeRound,
      currentTurn: {
        ...currentTurn,
        phase: 'challenge',
        placedPosition: position,
        challengeDeadline: Date.now() + 10_000,
      },
    },
  };
}

/**
 * Resolve the flip: move card to timeline (or discard), update tokens, advance turn phase.
 * Returns updated room, whether placement was correct, and winnerId if someone won.
 */
export function resolveFlip(
  room: Room,
  card: Card
): { room: Room; correct: boolean; winnerId?: string } {
  if (!room.activeRound) throw new Error('No active round');
  const { currentTurn, timelines, tokens, config, turnOrder } = room.activeRound;
  if (!currentTurn) throw new Error('No current turn');

  const playerId = currentTurn.activeId;
  const position = currentTurn.placedPosition ?? 0;
  const timeline = timelines[playerId];

  const correct = isPlacementCorrect(timeline.cards, card, position);

  let updatedCards: Card[];
  if (correct) {
    // Insert card at position
    updatedCards = [
      ...timeline.cards.slice(0, position),
      card,
      ...timeline.cards.slice(position),
    ];
  } else {
    // Discard — timeline unchanged
    updatedCards = timeline.cards;
  }

  const updatedTimelines: Record<string, Timeline> = {
    ...timelines,
    [playerId]: {
      ...timeline,
      cards: updatedCards,
    },
  };

  // Handle challenges — if any challenger exists
  let updatedTokens = { ...tokens };
  for (const challenge of (currentTurn.challenges ?? [])) {
    if (!correct) {
      // Opponent was wrong → challenger steals the card
      const challengerTimeline = updatedTimelines[challenge.challengerId];
      if (challengerTimeline) {
        updatedTimelines[challenge.challengerId] = {
          ...challengerTimeline,
          cards: [...challengerTimeline.cards, card].sort(
            (a, b) => a.releaseYear - b.releaseYear
          ),
        };
      }
    } else {
      // Opponent was right → challenger loses a token
      const cTokens = updatedTokens[challenge.challengerId] ?? 0;
      updatedTokens[challenge.challengerId] = Math.max(0, cTokens - 1);
    }
  }

  const updatedRoom: Room = {
    ...room,
    activeRound: {
      ...room.activeRound,
      timelines: updatedTimelines,
      tokens: updatedTokens,
      currentTurn: {
        ...currentTurn,
        phase: 'flip',
      },
    },
  };

  // Check for win
  const cardsToWin = config.cardsToWin;
  for (const pid of turnOrder) {
    const tl = updatedTimelines[pid];
    if (tl && tl.cards.length >= cardsToWin) {
      return { room: updatedRoom, correct, winnerId: pid };
    }
  }

  // Check if deck is empty
  if (room.activeRound.deckRemaining === 0) {
    // Find winner by most cards, tiebreak by avg release year
    let winnerId: string | undefined;
    let maxCards = -1;
    let maxAvgYear = -1;

    for (const pid of turnOrder) {
      const tl = updatedTimelines[pid];
      const cardCount = tl?.cards.length ?? 0;
      const avgYear =
        cardCount > 0
          ? tl.cards.reduce((sum, c) => sum + c.releaseYear, 0) / cardCount
          : 0;

      if (
        cardCount > maxCards ||
        (cardCount === maxCards && avgYear > maxAvgYear)
      ) {
        maxCards = cardCount;
        maxAvgYear = avgYear;
        winnerId = pid;
      }
    }

    const endedRoom: Room = {
      ...updatedRoom,
      status: 'round_ended',
    };

    return { room: endedRoom, correct, winnerId };
  }

  return { room: updatedRoom, correct };
}

/**
 * Advance to the next turn (increment turnIndex, wrap around).
 * Returns updated room with phase reset.
 */
export function advanceTurn(room: Room): Room {
  if (!room.activeRound) throw new Error('No active round');
  const { turnOrder, turnIndex } = room.activeRound;
  const nextIndex = (turnIndex + 1) % turnOrder.length;
  return {
    ...room,
    activeRound: {
      ...room.activeRound,
      turnIndex: nextIndex,
      currentTurn: undefined,
    },
  };
}

/** Spend 1 token to skip; draw next card without placing. Returns updated room (token deducted). */
export function applySkip(room: Room, playerId: string): Room {
  if (!room.activeRound) throw new Error('No active round');
  const tokens = room.activeRound.tokens;
  const currentTokens = tokens[playerId] ?? 0;
  if (currentTokens < 1) throw new Error('Not enough tokens to skip');

  return {
    ...room,
    activeRound: {
      ...room.activeRound,
      tokens: {
        ...tokens,
        [playerId]: currentTokens - 1,
      },
    },
  };
}

/** Award +1 token for correctly naming song (max 5) */
export function applyNamingBonus(room: Room, playerId: string): Room {
  if (!room.activeRound) throw new Error('No active round');
  const tokens = room.activeRound.tokens;
  const currentTokens = tokens[playerId] ?? 0;
  return {
    ...room,
    activeRound: {
      ...room.activeRound,
      tokens: {
        ...tokens,
        [playerId]: Math.min(5, currentTokens + 1),
      },
    },
  };
}

/** Get the number of correct cards on a player's timeline */
export function timelineLength(room: Room, playerId: string): number {
  return room.activeRound?.timelines[playerId]?.cards.length ?? 0;
}

/** Build a RoundSummary for game history */
export function buildRoundSummary(
  room: Room,
  winnerId: string | null
): RoundSummary {
  return {
    winnerId,
    mode: room.activeRound?.config.mode ?? 'original',
    roundNumber: room.roundHistory.length + 1,
  };
}
