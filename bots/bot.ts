import { io, Socket } from 'socket.io-client';
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
  private sessionId: string;
  private tokens = 0;
  private myTurn = false;

  constructor(serverUrl: string, profile: BotProfile, roomGenre = '') {
    this.profile = profile;
    this.roomGenre = roomGenre;
    this.sessionId = `bot-${Math.random().toString(36).slice(2, 10)}`;
    this.socket = io(serverUrl, { autoConnect: false });
    this.registerHandlers();
  }

  connect(): void {
    this.socket.connect();
  }

  disconnect(): void {
    this.socket.disconnect();
  }

  joinRoom(roomCode: string): void {
    log(this.profile.name, `joining room ${roomCode}`);
    this.socket.emit('room:join', {
      roomCode,
      sessionId: this.sessionId,
      displayName: this.profile.name,
    });
  }

  createRoom(topic: string): void {
    log(this.profile.name, `creating room "${topic}"`);
    this.socket.emit('room:create', {
      sessionId: this.sessionId,
      displayName: this.profile.name,
      topic,
    });
  }

  private registerHandlers(): void {
    const { profile } = this;

    this.socket.on('connect', () => {
      log(profile.name, `connected (${this.socket.id})`);
    });

    this.socket.on('disconnect', () => {
      log(profile.name, 'disconnected');
    });

    this.socket.on('player:tokens', (data: { tokens: number }) => {
      this.tokens = data.tokens;
    });

    this.socket.on('turn:started', async (data: {
      activePlayerId: string;
      previewUrl: string;
      playAt: number;
      timelineLength: number;
    }) => {
      const isMyTurn = data.activePlayerId === this.sessionId;
      this.myTurn = isMyTurn;

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
      timelineLength: number;
    }) => {
      if (data.activePlayerId === this.sessionId) return; // own placement
      await this.maybeChallenge(data.timelineLength);
    });

    this.socket.on('error:*', (msg: string) => {
      log(profile.name, `ERROR: ${msg}`);
    });
  }

  private async takeTurn(timelineLength: number): Promise<void> {
    const { profile } = this;
    const thinkMs = randomInt(profile.reaction_time_ms.min, profile.reaction_time_ms.max);
    log(profile.name, `my turn — thinking for ${thinkMs}ms`);
    await delay(thinkMs);

    // Decide whether to skip (spend mode + have tokens + unlucky placement)
    if (
      profile.token_strategy === 'spend' &&
      this.tokens >= 1 &&
      roll(0.25)
    ) {
      log(profile.name, 'skipping card (spend strategy)');
      this.socket.emit('turn:skip');
      return;
    }

    // Choose position: correct with probability = effectiveKnowledge, else random
    const knowledge = effectiveKnowledge(profile, this.roomGenre);
    const slots = timelineLength + 1; // gaps between + outside existing cards
    let position: number;

    if (roll(knowledge)) {
      // Simulate "correct" by picking the middle slot — real impl will use actual year data
      position = Math.floor(slots / 2);
      log(profile.name, `placing at position ${position} (confident, k=${knowledge.toFixed(2)})`);
    } else {
      position = randomInt(0, slots - 1);
      log(profile.name, `placing at position ${position} (guessing, k=${knowledge.toFixed(2)})`);
    }

    this.socket.emit('turn:place', { position });
  }

  private async maybeNameSong(): Promise<void> {
    const { profile } = this;
    if (!roll(profile.naming_willingness)) return;

    const thinkMs = randomInt(profile.reaction_time_ms.min, profile.reaction_time_ms.max);
    await delay(thinkMs);

    // Bot "knows" the song based on knowledge + affinity
    const knowledge = effectiveKnowledge(profile, this.roomGenre);
    if (roll(knowledge)) {
      log(profile.name, 'naming song title + artist for token');
      // Real impl will send actual title/artist; placeholder shows intent
      this.socket.emit('turn:name', { title: '__BOT_GUESS__', artist: '__BOT_GUESS__' });
    }
  }

  private async maybeChallenge(opponentTimelineLength: number): Promise<void> {
    const { profile } = this;
    if (!roll(profile.challenge_rate)) return;
    if (this.tokens < 1) return;

    // Bot judges whether opponent placed wrong using its own knowledge roll
    const knowledge = effectiveKnowledge(profile, this.roomGenre);
    const thinksBelievesWrong = !roll(knowledge); // low-knowledge bot challenges more erratically

    if (thinksBelievesWrong) {
      log(profile.name, 'HITSTER! (challenging)');
      this.socket.emit('turn:challenge');
    }
  }
}
