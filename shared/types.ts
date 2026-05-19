// ============================================================
// Hitster Online — Shared TypeScript Types
// Imported by both server and client. Define ALL types here.
// ============================================================

// ----------------------------
// Core domain types
// ----------------------------

export type GameMode = 'original' | 'pro' | 'expert' | 'cooperative';
export type RoomStatus = 'lobby' | 'round_active' | 'round_ended' | 'game_over';
export type TurnPhase = 'reveal' | 'place' | 'challenge' | 'flip';

export interface Player {
  id: string;         // sessionId (UUID, generated client-side)
  name: string;
  teamId?: string;
  isConnected: boolean;
}

export interface Team {
  id: string;
  name: string;
  playerIds: string[];
}

/** Full card — includes year. Shown after flip, and on starting cards. */
export interface Card {
  trackId: string;
  title: string;
  artist: string;
  releaseYear: number;
  previewUrl: string;
  albumArt: string;
}

/** Hidden card — sent to the placing player during REVEAL/PLACE phase. Year is omitted. */
export type CardHidden = Omit<Card, 'releaseYear' | 'title' | 'artist'>;

export interface Challenge {
  challengerId: string;  // playerId or teamId
  position: number;      // index in timeline they're challenging
}

export interface Turn {
  activeId: string;      // playerId or teamId whose turn it is
  phase: TurnPhase;
  placedPosition?: number;
  challengeDeadline?: number;  // Unix ms — when challenge window closes
  challenges: Challenge[];
}

export interface Timeline {
  ownerId: string;   // playerId or teamId
  cards: Card[];     // in placement order (left to right = oldest to newest)
}

export interface RoundConfig {
  playlistUrl?: string;       // Spotify playlist URL (optional — genre used if omitted)
  genre?: string;             // e.g. "90s Pop"
  mode: GameMode;
  tokensEnabled: boolean;
  cardsToWin: number;
}

export interface RoundSummary {
  winnerId: string | null;    // playerId, teamId, or null (cooperative loss)
  mode: GameMode;
  roundNumber: number;
}

export interface Room {
  code: string;
  ownerId: string;
  description: string;
  status: RoomStatus;
  players: Record<string, Player>;
  teams: Record<string, Team>;
  useTeams: boolean;
  roundHistory: RoundSummary[];
  // Active round state (present only when status === 'round_active' | 'round_ended')
  activeRound?: {
    config: RoundConfig;
    turnOrder: string[];         // ordered list of playerIds or teamIds
    turnIndex: number;
    timelines: Record<string, Timeline>;
    tokens: Record<string, number>;
    currentTurn?: Turn;
    deckRemaining: number;       // how many cards are left
  };
}

// ----------------------------
// Socket.io event payloads
// ----------------------------

export interface ServerToClientEvents {
  /** Full room state — sent on join and after any state change */
  'room:updated': (room: Room) => void;

  /** Turn starts — card hidden from placing player */
  'turn:started': (data: {
    card: CardHidden;
    previewUrl: string;
    playAt: number;       // Unix ms — start audio at exactly this time
    activeId: string;
  }) => void;

  /** Placing player confirmed their position */
  'turn:placed': (data: { position: number }) => void;

  /** A player challenged the placement */
  'turn:challenged': (data: { challengerId: string; position: number }) => void;

  /** Card flipped — result revealed */
  'turn:flipped': (data: {
    card: Card;
    correct: boolean;
    updatedTimeline: Timeline;
    tokensUpdated: Record<string, number>;
  }) => void;

  /** Round ended */
  'round:ended': (summary: RoundSummary) => void;

  /** Error message */
  'error': (message: string) => void;
}

export interface ClientToServerEvents {
  'room:create': (
    data: { playerName: string; description: string },
    callback: (result: { room: Room } | { error: string }) => void
  ) => void;

  'room:join': (
    data: { playerName: string; code: string },
    callback: (result: { room: Room } | { error: string }) => void
  ) => void;

  'round:configure': (config: RoundConfig) => void;
  'round:start': () => void;

  'team:create': (name: string, callback: (result: { teamId: string } | { error: string }) => void) => void;
  'team:join': (teamId: string) => void;
  'team:leave': () => void;

  'turn:place': (position: number) => void;
  'turn:challenge': (position: number) => void;
  'turn:skip': () => void;        // spend 1 token to skip current card
  'turn:buy': () => void;         // spend 3 tokens to buy a card directly
}
