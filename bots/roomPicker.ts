import type { RoomSummary } from '../shared/types';

export const MIN_PLAYERS_TO_START = 3;
export const PLACEMENT_DELAY_MS = { min: 5000, max: 10000 };

const ROOM_TOPICS = [
  'Bot Lounge',
  'Auto Hitster',
  'Chronology Chaos',
  'Timeline Tussle',
  'Guess the Decade',
];

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomTopic(): string {
  return ROOM_TOPICS[randomInt(0, ROOM_TOPICS.length - 1)];
}

export function isJoinableLobby(room: RoomSummary): boolean {
  return (
    (room.status === 'lobby' || room.status === 'round_ended') &&
    room.playerCount < MIN_PLAYERS_TO_START
  );
}

export async function fetchRoomSummaries(serverUrl: string): Promise<RoomSummary[]> {
  const base = serverUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/rooms`);
  if (!res.ok) return [];
  return (await res.json()) as RoomSummary[];
}

/** Prefer joining when open lobbies with fewer than 3 players exist. */
export function shouldJoinOverCreate(
  hasJoinable: boolean,
  joinWillingness: number
): boolean {
  if (!hasJoinable) return false;
  const joinBias = Math.max(0.75, joinWillingness);
  return Math.random() < joinBias;
}

/** Pick a lobby to join — prefer rooms closest to starting (more players, still under cap). */
export function pickJoinRoom(
  rooms: RoomSummary[],
  effectiveCount: (room: RoomSummary) => number
): RoomSummary | null {
  const candidates = rooms.filter(
    r => isJoinableLobby(r) && effectiveCount(r) < MIN_PLAYERS_TO_START
  );
  if (candidates.length === 0) return null;

  const maxCount = Math.max(...candidates.map(r => effectiveCount(r)));
  const topTier = candidates.filter(r => effectiveCount(r) === maxCount);
  const pool = Math.random() < 0.7 ? topTier : candidates;
  return pool[randomInt(0, pool.length - 1)];
}

export function effectivePlayerCount(
  room: RoomSummary,
  localCounts: Map<string, number>
): number {
  return Math.max(room.playerCount, localCounts.get(room.code) ?? 0);
}
