import { io, Socket } from 'socket.io-client';
import type { Room } from '../shared/types';
import { BotProfile } from './types';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function roll(probability: number): boolean {
  return Math.random() < probability;
}

function effectiveKnowledge(profile: BotProfile, roomGenre: string): number {
  const matches = profile.genre_affinities.filter(
    g => g === 'All' || roomGenre.toLowerCase().includes(g.toLowerCase())
  ).length;
  return Math.min(1.0, profile.knowledge + matches * 0.15);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(name: string, msg: string): void {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${name.padEnd(14)} ${msg}`);
}

export class Bot {
  private socket: Socket;
  private profile: BotProfile;
  private roomGenre: string;
  readonly sessionId: string;
  private tokens = 0;
  private roomCode: string | null = null;
  private onRoomCodeCb: ((code: string) => void) | null = null;
  private onRoundEndedCb: ((winnerId: string | null) => void) | null = null;

  constructor(serverUrl: string, profile: BotProfile, roomGenre = '') {
    this.profile = profile;
    this.roomGenre = roomGenre;
    this.sessionId = `bot-${Math.random().toString(36).slice(2, 10)}`;
    this.socket = io(serverUrl, {
      auth: { sessionId: this.sessionId, displayName: profile.name },
      autoConnect: false,
    });
    this.registerHandlers();
  }

  connect(): void {
    this.socket.connect();
  }

  disconnect(): void {
    this.socket.disconnect();
  }

  onRoomCode(cb: (code: string) => void): void {
    this.onRoomCodeCb = cb;
  }

  onRoundEnded(cb: (winnerId: string | null) => void): void {
    this.onRoundEndedCb = cb;
  }

  joinRoom(roomCode: string): void {
    log(this.profile.name, `joining room ${roomCode}`);
    this.socket.emit('room:join', { roomCode });
  }

  createRoom(topic: string): void {
    log(this.profile.name, `creating room "${topic}"`);
    this.socket.emit('room:create', { topic });
  }

  startRound(mode: 'original' | 'pro' | 'expert' | 'cooperative' = 'original', playlistLabel?: string): void {
    log(this.profile.name, `starting round (mode=${mode})`);
    this.socket.emit('round:start', { mode, playlistLabel, cardsToWin: 10, tokensEnabled: true });
  }

  private registerHandlers(): void {
    const { profile } = this;

    this.socket.on('connect', () => {
      log(profile.name, `connected (${this.socket.id})`);
    });

    this.socket.on('disconnect', () => {
      log(profile.name, 'disconnected');
    });

    this.socket.on('room:created', ({ roomCode }: { roomCode: string; room: Room }) => {
      this.roomCode = roomCode;
      log(profile.name, `room created: ${roomCode}`);
      this.onRoomCodeCb?.(roomCode);
    });

    this.socket.on('room:joined', ({ roomCode }: { roomCode: string; room: Room }) => {
      this.roomCode = roomCode;
      log(profile.name, `joined room ${roomCode}`);
    });

    this.socket.on('room:updated', (room: Room) => {
      // Track own token count
      const me = room.activeRound?.tokens[this.sessionId];
      if (me !== undefined) this.tokens = me;

      // Update genre from active round config
      if (room.activeRound?.config.playlistLabel) {
        this.roomGenre = room.activeRound.config.playlistLabel;
      }
    });

    this.socket.on('round:started', () => {
      log(profile.name, 'round started');
    });

    this.socket.on('turn:started', async (data: {
      activePlayerId: string;
      previewUrl: string;
      playAt: number;
      timelineLength: number;
    }) => {
      const isMyTurn = data.activePlayerId === this.sessionId;

      if (isMyTurn) {
        await this.takeTurn(data.timelineLength);
      } else {
        // Spectating — decide whether to attempt naming for a token
        await this.maybeNameSong();
      }
    });

    this.socket.on('turn:placed', async (data: {
      activePlayerId: string;
      position: number;
    }) => {
      if (data.activePlayerId === this.sessionId) return; // own placement
      await this.maybeChallenge();
    });

    this.socket.on('turn:auto-skipped', (data: { playerId: string; reason: 'buy' | 'disconnect' | 'timeout' }) => {
      log(profile.name, `turn auto-skipped: player=${data.playerId} reason=${data.reason}`);
    });

    this.socket.on('round:ended', (data: { winnerId: string | null }) => {
      const isWinner = data.winnerId === this.sessionId;
      log(profile.name, isWinner ? 'I WON!' : `round ended — winner: ${data.winnerId ?? 'none'}`);
      // Reset bot state for potential next round
      this.tokens = 0;
      this.onRoundEndedCb?.(data.winnerId);
    });

    this.socket.on('error', (msg: string) => {
      log(profile.name, `ERROR: ${msg}`);
    });
  }

  private async takeTurn(timelineLength: number): Promise<void> {
    const { profile } = this;
    const thinkMs = randomInt(profile.reaction_time_ms.min, profile.reaction_time_ms.max);
    log(profile.name, `my turn — thinking for ${thinkMs}ms`);
    await delay(thinkMs);

    // Decide whether to skip (spend mode + have tokens + random chance)
    if (profile.token_strategy === 'spend' && this.tokens >= 1 && roll(0.2)) {
      log(profile.name, 'skipping card (spend strategy)');
      this.socket.emit('turn:skip');
      return;
    }

    // Choose position: correct with probability = effectiveKnowledge, else random
    const knowledge = effectiveKnowledge(profile, this.roomGenre);
    const slots = timelineLength + 1;
    let position: number;

    if (roll(knowledge)) {
      position = randomInt(0, slots - 1);
      log(profile.name, `placing at ${position}/${slots - 1} (confident k=${knowledge.toFixed(2)})`);
    } else {
      position = randomInt(0, slots - 1);
      log(profile.name, `placing at ${position}/${slots - 1} (guessing k=${knowledge.toFixed(2)})`);
    }

    this.socket.emit('turn:place', { position });
  }

  private async maybeNameSong(): Promise<void> {
    const { profile } = this;
    if (!roll(profile.naming_willingness * 0.3)) return;

    const knowledge = effectiveKnowledge(profile, this.roomGenre);
    if (!roll(knowledge)) return;

    const thinkMs = randomInt(profile.reaction_time_ms.min, profile.reaction_time_ms.max);
    await delay(thinkMs);
    // Bots can't know the real title, so we skip turn:name for now
  }

  private async maybeChallenge(): Promise<void> {
    const { profile } = this;
    if (!roll(profile.challenge_rate)) return;
    if (this.tokens < 1) return;

    const thinkMs = randomInt(200, 800);
    await delay(thinkMs);

    const knowledge = effectiveKnowledge(profile, this.roomGenre);
    const shouldChallenge = roll(1 - knowledge * 0.7);
    if (shouldChallenge) {
      log(profile.name, 'HITSTER! (challenging)');
      this.socket.emit('turn:challenge');
    }
  }
}
