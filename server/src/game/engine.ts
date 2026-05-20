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
      [playerId]: { ...room.players[playerId], isConnected: true, missedTurns: 0 },
    },
  };
}

const STARTING_TOKENS: Record<string, number> = {
  original: 2,
  pro: 5,
  expert: 3,
  cooperative: 5,
};

/**
 * Returns the entity key used for timeline/token lookups.
 * In cooperative mode all players share one timeline/pool keyed 'cooperative'.
 */
export function activeEntityId(room: Room, _playerId: string): string {
  return room.activeRound?.config.mode === 'cooperative' ? 'cooperative' : _playerId;
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

  const startTokens = STARTING_TOKENS[config.mode] ?? 2;

  if (config.mode === 'cooperative') {
    // All starting cards go to the shared timeline; turn order still uses player IDs
    const sharedCards: Card[] = [];
    for (const playerId of playerIds) {
      const startCard = remaining.shift();
      if (!startCard) throw new Error('Not enough cards in the deck to deal starting cards');
      sharedCards.push(startCard);
      startingCards[playerId] = startCard;
    }
    timelines['cooperative'] = {
      ownerId: 'cooperative',
      cards: sharedCards.sort((a, b) => a.releaseYear - b.releaseYear),
    };
    tokens['cooperative'] = startTokens;
  } else {
    for (const playerId of playerIds) {
      const startCard = remaining.shift();
      if (!startCard) throw new Error('Not enough cards in the deck to deal starting cards');
      timelines[playerId] = { ownerId: playerId, cards: [startCard] };
      tokens[playerId] = startTokens;
      startingCards[playerId] = startCard;
    }
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
  const entityId = config.mode === 'cooperative' ? 'cooperative' : playerId;
  const position = currentTurn.placedPosition ?? 0;
  const timeline = timelines[entityId];

  const correct = isPlacementCorrect(timeline.cards, card, position);

  let updatedCards: Card[];
  if (correct) {
    updatedCards = [
      ...timeline.cards.slice(0, position),
      card,
      ...timeline.cards.slice(position),
    ];
  } else {
    updatedCards = timeline.cards;
  }

  const updatedTimelines: Record<string, Timeline> = {
    ...timelines,
    [entityId]: {
      ...timeline,
      cards: updatedCards,
    },
  };

  let updatedTokens = { ...tokens };

  if (config.mode === 'cooperative') {
    // Wrong placement costs 1 shared token in cooperative
    if (!correct && config.tokensEnabled) {
      updatedTokens['cooperative'] = Math.max(0, (updatedTokens['cooperative'] ?? 0) - 1);
    }
  } else {
    // Handle challenges — no challenges in cooperative
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

  const cardsToWin = config.cardsToWin;

  if (config.mode === 'cooperative') {
    // Cooperative loss: shared token pool depleted
    if (config.tokensEnabled && updatedTokens['cooperative'] <= 0) {
      return { room: { ...updatedRoom, status: 'round_ended' }, correct };
    }
    // Cooperative win: shared timeline reaches cardsToWin
    if (updatedTimelines['cooperative'].cards.length >= cardsToWin) {
      return { room: updatedRoom, correct, winnerId: 'cooperative' };
    }
  } else {
    // Check for individual win
    for (const pid of turnOrder) {
      const tl = updatedTimelines[pid];
      if (tl && tl.cards.length >= cardsToWin) {
        return { room: updatedRoom, correct, winnerId: pid };
      }
    }
  }

  // Check if deck is empty
  if (room.activeRound.deckRemaining === 0) {
    if (config.mode === 'cooperative') {
      // Cooperative deck-empty: no winner (loss by default)
      return { room: { ...updatedRoom, status: 'round_ended' }, correct };
    }

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

    return { room: { ...updatedRoom, status: 'round_ended' }, correct, winnerId };
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
  const { tokens, config } = room.activeRound;
  if (!config.tokensEnabled) throw new Error('Tokens are disabled in this game');

  const entityId = config.mode === 'cooperative' ? 'cooperative' : playerId;
  const currentTokens = tokens[entityId] ?? 0;
  if (currentTokens < 1) throw new Error('Not enough tokens to skip');

  return {
    ...room,
    activeRound: {
      ...room.activeRound,
      tokens: { ...tokens, [entityId]: currentTokens - 1 },
    },
  };
}

/**
 * Spend 3 tokens to "buy" the current card placement.
 * The player still places the card themselves; their NEXT turn is auto-skipped.
 */
export function applyBuy(room: Room, playerId: string): Room {
  if (!room.activeRound) throw new Error('No active round');
  const { tokens, currentTurn, config } = room.activeRound;
  if (!config.tokensEnabled) throw new Error('Tokens are disabled in this game');
  if (!currentTurn) throw new Error('No current turn');
  if (currentTurn.activeId !== playerId) throw new Error('Not your turn');
  if (currentTurn.phase !== 'place') throw new Error('Can only buy during place phase');

  const entityId = config.mode === 'cooperative' ? 'cooperative' : playerId;
  const current = tokens[entityId] ?? 0;
  if (current < 3) throw new Error('Not enough tokens to buy (need 3)');

  const pendingSkips = room.activeRound.pendingSkips ?? [];
  return {
    ...room,
    activeRound: {
      ...room.activeRound,
      tokens: { ...tokens, [entityId]: current - 3 },
      pendingSkips: pendingSkips.includes(playerId) ? pendingSkips : [...pendingSkips, playerId],
    },
  };
}

/** Increment a player's missedTurns counter */
export function incrementMissedTurns(room: Room, playerId: string): Room {
  if (!room.players[playerId]) return room;
  return {
    ...room,
    players: {
      ...room.players,
      [playerId]: {
        ...room.players[playerId],
        missedTurns: (room.players[playerId].missedTurns ?? 0) + 1,
      },
    },
  };
}

/**
 * Remove a player from the active turn order (called after 2 consecutive missed turns).
 * Adjusts turnIndex so the current position keeps pointing to the correct next player.
 */
export function removeFromTurnOrder(room: Room, playerId: string): Room {
  if (!room.activeRound) return room;
  const { turnOrder, turnIndex } = room.activeRound;
  const idx = turnOrder.indexOf(playerId);
  if (idx === -1) return room;

  const newTurnOrder = turnOrder.filter(id => id !== playerId);
  if (newTurnOrder.length === 0) return room; // last player — caller handles game-end

  let newTurnIndex = turnIndex;
  if (idx < turnIndex) {
    newTurnIndex = turnIndex - 1;
  } else if (idx === turnIndex) {
    newTurnIndex = turnIndex % newTurnOrder.length;
  }
  // idx > turnIndex: index unchanged

  return {
    ...room,
    activeRound: {
      ...room.activeRound,
      turnOrder: newTurnOrder,
      turnIndex: newTurnIndex,
      currentTurn: idx === turnIndex ? undefined : room.activeRound.currentTurn,
    },
  };
}

/** Award +1 token for correctly naming song (max 5). No-op in pro/expert modes. */
export function applyNamingBonus(room: Room, playerId: string): Room {
  if (!room.activeRound) throw new Error('No active round');
  const { tokens, config } = room.activeRound;
  // Pro and expert disable the naming bonus
  if (!config.tokensEnabled || config.mode === 'pro' || config.mode === 'expert') return room;

  const entityId = config.mode === 'cooperative' ? 'cooperative' : playerId;
  const currentTokens = tokens[entityId] ?? 0;
  return {
    ...room,
    activeRound: {
      ...room.activeRound,
      tokens: { ...tokens, [entityId]: Math.min(5, currentTokens + 1) },
    },
  };
}

/** Get the number of cards on the active entity's timeline */
export function timelineLength(room: Room, playerId: string): number {
  const entityId = room.activeRound?.config.mode === 'cooperative' ? 'cooperative' : playerId;
  return room.activeRound?.timelines[entityId]?.cards.length ?? 0;
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
