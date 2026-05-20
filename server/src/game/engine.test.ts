import {
  generateRoomCode,
  createRoom,
  addPlayer,
  markDisconnected,
  markReconnected,
  isPlacementCorrect,
  resolveFlip,
  advanceTurn,
  applyNamingBonus,
  initRound,
  drawCard,
  applySkip,
  timelineLength,
  buildRoundSummary,
} from './engine';
import type { Room, Card, RoundConfig } from '../../../shared/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCard(trackId: string, year: number): Card {
  return {
    trackId,
    title: `Song ${trackId}`,
    artist: 'Artist',
    releaseYear: year,
    previewUrl: `mock://${trackId}`,
    albumArt: '',
  };
}

const defaultConfig: RoundConfig = {
  mode: 'original',
  cardsToWin: 10,
};

function makeRoomWithTurn(
  cards: Card[],
  cardToPlace: Card,
  position: number,
  cardsToWin = 10
): Room {
  const room = createRoom('player1', 'Alice', 'Test Room');
  const roomWithPlayer = addPlayer(room, 'player2', 'Bob');
  const config: RoundConfig = { ...defaultConfig, cardsToWin };

  // Build a deck that is large enough
  const deck = [...cards, cardToPlace, ...Array.from({ length: 20 }, (_, i) =>
    makeCard(`filler-${i}`, 2000 + i)
  )];

  const { room: initedRoom, deck: remainingDeck } = initRound(roomWithPlayer, config, deck);

  // Manually set up: player1 has `cards` as their timeline, about to place cardToPlace at `position`
  return {
    ...initedRoom,
    activeRound: {
      ...initedRoom.activeRound!,
      timelines: {
        ...initedRoom.activeRound!.timelines,
        player1: { ownerId: 'player1', cards },
      },
      currentTurn: {
        activeId: 'player1',
        phase: 'challenge',
        placedPosition: position,
        challengeDeadline: Date.now() + 10_000,
        challenges: [],
      },
      deckRemaining: remainingDeck.length,
    },
  };
}

// ---------------------------------------------------------------------------
// generateRoomCode
// ---------------------------------------------------------------------------

describe('generateRoomCode', () => {
  it('returns a 4-character string', () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(4);
  });

  it('contains only uppercase alphanumeric characters', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      expect(code).toMatch(/^[A-Z0-9]{4}$/);
    }
  });

  it('generates different codes over multiple calls (probabilistic)', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateRoomCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// isPlacementCorrect
// ---------------------------------------------------------------------------

describe('isPlacementCorrect', () => {
  it('is always correct on an empty timeline', () => {
    const card = makeCard('c1', 1990);
    expect(isPlacementCorrect([], card, 0)).toBe(true);
  });

  it('correctly places before a later card', () => {
    const timeline = [makeCard('c1', 2000)];
    const card = makeCard('c2', 1990);
    expect(isPlacementCorrect(timeline, card, 0)).toBe(true);
  });

  it('incorrectly places before a later card when card is newer', () => {
    const timeline = [makeCard('c1', 2000)];
    const card = makeCard('c2', 2010);
    expect(isPlacementCorrect(timeline, card, 0)).toBe(false);
  });

  it('correctly places after an earlier card', () => {
    const timeline = [makeCard('c1', 1990)];
    const card = makeCard('c2', 2000);
    expect(isPlacementCorrect(timeline, card, 1)).toBe(true);
  });

  it('incorrectly places after an earlier card when card is older', () => {
    const timeline = [makeCard('c1', 1990)];
    const card = makeCard('c2', 1980);
    expect(isPlacementCorrect(timeline, card, 1)).toBe(false);
  });

  it('correctly places between two cards', () => {
    const timeline = [makeCard('c1', 1990), makeCard('c2', 2010)];
    const card = makeCard('c3', 2000);
    expect(isPlacementCorrect(timeline, card, 1)).toBe(true);
  });

  it('incorrectly places between two cards when year is outside range', () => {
    const timeline = [makeCard('c1', 1990), makeCard('c2', 2010)];
    const card = makeCard('c3', 1980);
    expect(isPlacementCorrect(timeline, card, 1)).toBe(false);
  });

  it('same year adjacent — placing before is correct', () => {
    const timeline = [makeCard('c1', 1995)];
    const card = makeCard('c2', 1995);
    // Place before (position 0): card.year (1995) <= timeline[0].year (1995) → correct
    expect(isPlacementCorrect(timeline, card, 0)).toBe(true);
  });

  it('same year adjacent — placing after is correct', () => {
    const timeline = [makeCard('c1', 1995)];
    const card = makeCard('c2', 1995);
    // Place after (position 1): card.year (1995) >= timeline[0].year (1995) → correct
    expect(isPlacementCorrect(timeline, card, 1)).toBe(true);
  });

  it('boundary: place at beginning of multi-card timeline', () => {
    const timeline = [makeCard('c1', 1990), makeCard('c2', 2000), makeCard('c3', 2010)];
    const card = makeCard('c4', 1985);
    expect(isPlacementCorrect(timeline, card, 0)).toBe(true);
  });

  it('boundary: place at end of multi-card timeline', () => {
    const timeline = [makeCard('c1', 1990), makeCard('c2', 2000), makeCard('c3', 2010)];
    const card = makeCard('c4', 2020);
    expect(isPlacementCorrect(timeline, card, 3)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveFlip — correct placement adds to timeline
// ---------------------------------------------------------------------------

describe('resolveFlip', () => {
  it('correct placement adds card to timeline', () => {
    const existingCards = [makeCard('c1', 1990), makeCard('c2', 2010)];
    const newCard = makeCard('new', 2000);
    // Position 1 is between 1990 and 2010 — correct
    const room = makeRoomWithTurn(existingCards, newCard, 1);

    const { room: updatedRoom, correct } = resolveFlip(room, newCard);
    expect(correct).toBe(true);
    const timeline = updatedRoom.activeRound!.timelines['player1'];
    expect(timeline.cards).toHaveLength(3);
    expect(timeline.cards[1].trackId).toBe('new');
  });

  it('incorrect placement discards the card', () => {
    const existingCards = [makeCard('c1', 1990), makeCard('c2', 2010)];
    const newCard = makeCard('new', 2020);
    // Position 1 would be between 1990 and 2010, but card is 2020 — incorrect
    const room = makeRoomWithTurn(existingCards, newCard, 1);

    const { room: updatedRoom, correct } = resolveFlip(room, newCard);
    expect(correct).toBe(false);
    const timeline = updatedRoom.activeRound!.timelines['player1'];
    // Card should NOT be on the timeline
    expect(timeline.cards).toHaveLength(2);
    expect(timeline.cards.find((c) => c.trackId === 'new')).toBeUndefined();
  });

  it('win detection: correct placement on 9-card timeline triggers win', () => {
    const existingCards = Array.from({ length: 9 }, (_, i) =>
      makeCard(`c${i}`, 1990 + i)
    );
    // Place card at the end (year 1999 + 1 = 2000 > 1998)
    const newCard = makeCard('winner', 2000);
    const room = makeRoomWithTurn(existingCards, newCard, 9, 10);

    const { winnerId, correct } = resolveFlip(room, newCard);
    expect(correct).toBe(true);
    expect(winnerId).toBe('player1');
  });

  it('win detection: incorrect placement on 9-card timeline does NOT trigger win', () => {
    const existingCards = Array.from({ length: 9 }, (_, i) =>
      makeCard(`c${i}`, 1990 + i)
    );
    // Place card at position 0, but card year is newer than timeline[0] — incorrect
    const newCard = makeCard('notWinner', 2020);
    const room = makeRoomWithTurn(existingCards, newCard, 0, 10);

    const { winnerId, correct } = resolveFlip(room, newCard);
    expect(correct).toBe(false);
    expect(winnerId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// advanceTurn
// ---------------------------------------------------------------------------

describe('advanceTurn', () => {
  it('increments turnIndex', () => {
    const room = createRoom('player1', 'Alice', 'Test');
    const room2 = addPlayer(room, 'player2', 'Bob');
    const deck = Array.from({ length: 10 }, (_, i) => makeCard(`d${i}`, 1990 + i));
    const { room: initedRoom } = initRound(room2, defaultConfig, deck);

    expect(initedRoom.activeRound!.turnIndex).toBe(0);
    const advanced = advanceTurn(initedRoom);
    expect(advanced.activeRound!.turnIndex).toBe(1);
  });

  it('wraps around from last player to first', () => {
    const room = createRoom('player1', 'Alice', 'Test');
    const room2 = addPlayer(room, 'player2', 'Bob');
    const deck = Array.from({ length: 10 }, (_, i) => makeCard(`d${i}`, 1990 + i));
    const { room: initedRoom } = initRound(room2, defaultConfig, deck);

    // Move to last player (index 1 with 2 players)
    const atLast = { ...initedRoom, activeRound: { ...initedRoom.activeRound!, turnIndex: 1 } };
    const wrapped = advanceTurn(atLast);
    expect(wrapped.activeRound!.turnIndex).toBe(0);
  });

  it('clears currentTurn after advancing', () => {
    const room = createRoom('player1', 'Alice', 'Test');
    const deck = Array.from({ length: 5 }, (_, i) => makeCard(`d${i}`, 1990 + i));
    const { room: initedRoom } = initRound(room, defaultConfig, deck);

    const withTurn: Room = {
      ...initedRoom,
      activeRound: {
        ...initedRoom.activeRound!,
        currentTurn: {
          activeId: 'player1',
          phase: 'flip',
          challenges: [],
        },
      },
    };

    const advanced = advanceTurn(withTurn);
    expect(advanced.activeRound!.currentTurn).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Token cap at 5
// ---------------------------------------------------------------------------

describe('applyNamingBonus', () => {
  function makeRoomWithTokens(playerId: string, tokens: number): Room {
    const room = createRoom(playerId, 'Alice', 'Test');
    const deck = Array.from({ length: 5 }, (_, i) => makeCard(`d${i}`, 1990 + i));
    const { room: initedRoom } = initRound(room, defaultConfig, deck);
    return {
      ...initedRoom,
      activeRound: {
        ...initedRoom.activeRound!,
        tokens: { [playerId]: tokens },
      },
    };
  }

  it('awards +1 token normally', () => {
    const room = makeRoomWithTokens('player1', 2);
    const updated = applyNamingBonus(room, 'player1');
    expect(updated.activeRound!.tokens['player1']).toBe(3);
  });

  it('caps tokens at 5', () => {
    const room = makeRoomWithTokens('player1', 5);
    const updated = applyNamingBonus(room, 'player1');
    expect(updated.activeRound!.tokens['player1']).toBe(5);
  });

  it('does not exceed 5 when at 4', () => {
    const room = makeRoomWithTokens('player1', 4);
    const updated = applyNamingBonus(room, 'player1');
    expect(updated.activeRound!.tokens['player1']).toBe(5);
  });

  it('applySkip deducts 1 token', () => {
    const room = makeRoomWithTokens('player1', 3);
    const updated = applySkip(room, 'player1');
    expect(updated.activeRound!.tokens['player1']).toBe(2);
  });

  it('applySkip throws when tokens < 1', () => {
    const room = makeRoomWithTokens('player1', 0);
    expect(() => applySkip(room, 'player1')).toThrow('Not enough tokens');
  });
});

// ---------------------------------------------------------------------------
// drawCard
// ---------------------------------------------------------------------------

describe('drawCard', () => {
  it('draws the first card and returns the rest', () => {
    const deck = [makeCard('a', 2000), makeCard('b', 2001), makeCard('c', 2002)];
    const { card, hidden, remaining } = drawCard(deck);
    expect(card.trackId).toBe('a');
    expect(hidden.trackId).toBe('a');
    expect((hidden as { releaseYear?: number }).releaseYear).toBeUndefined();
    expect(remaining).toHaveLength(2);
  });

  it('throws when deck is empty', () => {
    expect(() => drawCard([])).toThrow('Deck is empty');
  });
});

// ---------------------------------------------------------------------------
// timelineLength
// ---------------------------------------------------------------------------

describe('timelineLength', () => {
  it('returns 0 when no active round', () => {
    const room = createRoom('player1', 'Alice', 'Test');
    expect(timelineLength(room, 'player1')).toBe(0);
  });

  it('returns correct count during active round', () => {
    const room = createRoom('player1', 'Alice', 'Test');
    const deck = Array.from({ length: 5 }, (_, i) => makeCard(`d${i}`, 1990 + i));
    const { room: initedRoom } = initRound(room, defaultConfig, deck);
    // After initRound, player1 has 1 starting card
    expect(timelineLength(initedRoom, 'player1')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// markDisconnected / markReconnected
// ---------------------------------------------------------------------------

describe('markDisconnected / markReconnected', () => {
  it('marks a player as disconnected', () => {
    const room = createRoom('p1', 'Alice', 'Test');
    const updated = markDisconnected(room, 'p1');
    expect(updated.players['p1'].isConnected).toBe(false);
  });

  it('marks a disconnected player as reconnected', () => {
    const room = createRoom('p1', 'Alice', 'Test');
    const disc = markDisconnected(room, 'p1');
    const recon = markReconnected(disc, 'p1');
    expect(recon.players['p1'].isConnected).toBe(true);
  });

  it('is a no-op for unknown player id', () => {
    const room = createRoom('p1', 'Alice', 'Test');
    const updated = markDisconnected(room, 'nobody');
    expect(updated).toEqual(room);
  });

  it('all players disconnected when last player leaves lobby', () => {
    const room = createRoom('p1', 'Alice', 'Test');
    const room2 = addPlayer(room, 'p2', 'Bob');
    const d1 = markDisconnected(room2, 'p1');
    const d2 = markDisconnected(d1, 'p2');
    const allGone = Object.values(d2.players).every(p => !p.isConnected);
    expect(allGone).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildRoundSummary
// ---------------------------------------------------------------------------

describe('buildRoundSummary', () => {
  it('returns correct mode and roundNumber', () => {
    const room = createRoom('p1', 'Alice', 'Test');
    const deck = Array.from({ length: 5 }, (_, i) => makeCard(`d${i}`, 1990 + i));
    const { room: initedRoom } = initRound(room, defaultConfig, deck);
    const summary = buildRoundSummary(initedRoom, 'p1');
    expect(summary.winnerId).toBe('p1');
    expect(summary.mode).toBe('original');
    expect(summary.roundNumber).toBe(1);
  });

  it('roundNumber increments with round history', () => {
    const room = createRoom('p1', 'Alice', 'Test');
    const deck = Array.from({ length: 5 }, (_, i) => makeCard(`d${i}`, 1990 + i));
    const { room: initedRoom } = initRound(room, defaultConfig, deck);
    const prevSummary = buildRoundSummary(initedRoom, 'p1');
    const roomWithHistory = { ...initedRoom, roundHistory: [prevSummary] };
    const summary2 = buildRoundSummary(roomWithHistory, 'p1');
    expect(summary2.roundNumber).toBe(2);
  });

  it('supports null winnerId (cooperative loss / tie)', () => {
    const room = createRoom('p1', 'Alice', 'Test');
    const deck = Array.from({ length: 5 }, (_, i) => makeCard(`d${i}`, 1990 + i));
    const { room: initedRoom } = initRound(room, defaultConfig, deck);
    const summary = buildRoundSummary(initedRoom, null);
    expect(summary.winnerId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// addPlayer
// ---------------------------------------------------------------------------

describe('addPlayer', () => {
  it('adds a new player to a lobby room', () => {
    const room = createRoom('p1', 'Alice', 'Test');
    const updated = addPlayer(room, 'p2', 'Bob');
    expect(Object.keys(updated.players)).toHaveLength(2);
    expect(updated.players['p2'].displayName).toBe('Bob');
    expect(updated.players['p2'].isConnected).toBe(true);
  });

  it('reconnects an existing player instead of duplicating', () => {
    const room = createRoom('p1', 'Alice', 'Test');
    const disc = markDisconnected(room, 'p1');
    const recon = addPlayer(disc, 'p1', 'Alice');
    expect(Object.keys(recon.players)).toHaveLength(1);
    expect(recon.players['p1'].isConnected).toBe(true);
  });

  it('throws when room is not in lobby status', () => {
    const room = createRoom('p1', 'Alice', 'Test');
    const deck = Array.from({ length: 5 }, (_, i) => makeCard(`d${i}`, 1990 + i));
    const { room: active } = initRound(room, defaultConfig, deck);
    expect(() => addPlayer(active, 'p2', 'Bob')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// initRound — deck size validation (server emits error when too few tracks)
// ---------------------------------------------------------------------------

// Note: minimum deck size is enforced in the socket handler (index.ts), not in the engine.
// These tests cover engine behaviour for round initialisation.
describe('initRound deck size and card distribution', () => {
  it('distributes 1 starting card to each player', () => {
    let room = createRoom('p1', 'Alice', 'Test');
    room = addPlayer(room, 'p2', 'Bob');
    const deck = Array.from({ length: 15 }, (_, i) => makeCard(`t${i}`, 1980 + i));
    const { room: started } = initRound(room, defaultConfig, deck);
    expect(started.activeRound?.timelines['p1'].cards).toHaveLength(1);
    expect(started.activeRound?.timelines['p2'].cards).toHaveLength(1);
  });

  it('remaining deck excludes starting cards', () => {
    let room = createRoom('p1', 'Alice', 'Test');
    room = addPlayer(room, 'p2', 'Bob');
    const deck = Array.from({ length: 15 }, (_, i) => makeCard(`t${i}`, 1980 + i));
    const { deck: remaining } = initRound(room, defaultConfig, deck);
    // 2 players × 1 starting card = 2 consumed
    expect(remaining).toHaveLength(13);
  });

  it('sets room status to round_active', () => {
    let room = createRoom('p1', 'Alice', 'Test');
    room = addPlayer(room, 'p2', 'Bob');
    const deck = Array.from({ length: 15 }, (_, i) => makeCard(`t${i}`, 1980 + i));
    const { room: started } = initRound(room, defaultConfig, deck);
    expect(started.status).toBe('round_active');
  });

  it('stores playlistLabel as genre in config', () => {
    let room = createRoom('p1', 'Alice', 'Test');
    room = addPlayer(room, 'p2', 'Bob');
    const deck = Array.from({ length: 15 }, (_, i) => makeCard(`t${i}`, 1980 + i));
    const config: RoundConfig = { ...defaultConfig, playlistLabel: "90's rock" };
    const { room: started } = initRound(room, config, deck);
    expect(started.activeRound?.config.playlistLabel).toBe("90's rock");
  });
});
