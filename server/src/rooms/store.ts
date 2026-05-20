import type { Room, RoomSummary } from '../../../shared/types';

export class RoomStore {
  private rooms = new Map<string, Room>();

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  set(room: Room): void {
    this.rooms.set(room.code, room);
  }

  delete(code: string): void {
    this.rooms.delete(code);
  }

  getAll(): Room[] {
    return Array.from(this.rooms.values());
  }

  getSummaries(): RoomSummary[] {
    return this.getAll().map((room): RoomSummary => {
      const players = Object.values(room.players);
      const playerCount = players.length;

      const config = room.activeRound?.config;
      const genre = config?.playlistLabel ?? '';
      const roundNumber = room.roundHistory.length + (room.status === 'round_active' ? 1 : 0);
      const cardsToWin = config?.cardsToWin ?? 6;

      // Find the player with the most cards on their timeline
      let leaderName = '';
      let leaderCards = 0;

      if (room.activeRound) {
        const timelines = room.activeRound.timelines;
        for (const [playerId, timeline] of Object.entries(timelines)) {
          const cardCount = timeline.cards.length;
          if (cardCount > leaderCards) {
            leaderCards = cardCount;
            leaderName = room.players[playerId]?.displayName ?? playerId;
          }
        }
      }

      // If no active round yet, use the room owner as the leader name placeholder
      if (!leaderName && players.length > 0) {
        leaderName = room.players[room.ownerId]?.displayName ?? players[0].displayName;
      }

      return {
        code: room.code,
        topic: room.topic,
        status: room.status,
        playerCount,
        genre,
        roundNumber,
        leaderName,
        leaderCards,
        cardsToWin,
      };
    });
  }
}
