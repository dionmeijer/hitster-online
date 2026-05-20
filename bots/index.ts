/**
 * Hitster Bot Runner
 *
 * Usage:
 *   npm start                              — create a new room, fill with all profiles
 *   npm start -- --room XXXX              — join an existing room (bots won't start round)
 *   npm start -- --count 3                — use only first 3 profiles
 *   npm start -- --room XXXX --count 2
 *   npm start -- --url http://server:3000
 *   npm start -- --mode pro               — game mode (original/pro/expert/cooperative)
 *   npm start -- --genre "90s Pop"        — playlist label / genre for round
 *
 * Profiles are loaded from ./profiles.yaml. Edit that file to change bot behaviour.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import { Bot } from './bot';
import { BotProfile, ProfilesFile } from './types';

function parseArgs(): {
  serverUrl: string;
  roomCode?: string;
  count?: number;
  mode: 'original' | 'pro' | 'expert' | 'cooperative';
  genre?: string;
} {
  const args = process.argv.slice(2);
  let serverUrl = process.env.SERVER_URL ?? 'http://localhost:3000';
  let roomCode: string | undefined;
  let count: number | undefined;
  let mode: 'original' | 'pro' | 'expert' | 'cooperative' = 'original';
  let genre: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url'   && args[i + 1]) serverUrl = args[++i];
    if (args[i] === '--room'  && args[i + 1]) roomCode  = args[++i].toUpperCase();
    if (args[i] === '--count' && args[i + 1]) count     = parseInt(args[++i], 10);
    if (args[i] === '--genre' && args[i + 1]) genre     = args[++i];
    if (args[i] === '--mode'  && args[i + 1]) {
      const m = args[++i];
      if (['original', 'pro', 'expert', 'cooperative'].includes(m)) {
        mode = m as typeof mode;
      }
    }
  }

  return { serverUrl, roomCode, count, mode, genre };
}

function loadProfiles(): BotProfile[] {
  const raw = readFileSync(join(__dirname, 'profiles.yaml'), 'utf-8');
  const file = parse(raw) as ProfilesFile;
  return file.bots;
}

function pickProfiles(profiles: BotProfile[], count?: number): BotProfile[] {
  if (!count) return profiles;
  const result: BotProfile[] = [];
  for (let i = 0; i < count; i++) {
    result.push(profiles[i % profiles.length]);
  }
  return result;
}

async function main(): Promise<void> {
  const { serverUrl, roomCode: existingRoom, count, mode, genre } = parseArgs();
  const allProfiles = loadProfiles();
  const profiles = pickProfiles(allProfiles, count);

  console.log(`\nHitster Bot Runner`);
  console.log(`Server:  ${serverUrl}`);
  console.log(`Room:    ${existingRoom ?? '(create new)'}`);
  console.log(`Mode:    ${mode}`);
  console.log(`Genre:   ${genre ?? '(random)'}`);
  console.log(`Bots:    ${profiles.map(p => p.name).join(', ')}`);
  console.log(`────────────────────────────────────\n`);

  const bots = profiles.map(profile => new Bot(serverUrl, profile));

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down bots...');
    bots.forEach(b => b.disconnect());
    process.exit(0);
  });

  if (existingRoom) {
    // ── Join existing room ────────────────────────────────────────────────────
    for (let i = 0; i < bots.length; i++) {
      bots[i].connect();
      await new Promise(r => setTimeout(r, 150));
      bots[i].joinRoom(existingRoom);
    }
    console.log(`All bots joined ${existingRoom}. Waiting for owner to start the round.`);
  } else {
    // ── Create new room + start round ─────────────────────────────────────────
    const [owner, ...others] = bots;

    // 1. Connect owner
    owner.connect();
    await new Promise(r => setTimeout(r, 300));

    // 2. Owner creates room; wait for room code
    const roomCode = await new Promise<string>(resolve => {
      owner.onRoomCode(resolve);
      owner.createRoom('Bot Demo Room');
    });

    // 3. Connect and join remaining bots with a stagger
    for (let i = 0; i < others.length; i++) {
      others[i].connect();
      await new Promise(r => setTimeout(r, 200));
      others[i].joinRoom(roomCode);
      await new Promise(r => setTimeout(r, 150));
    }

    // 4. Short pause to let all joins propagate, then owner starts round
    await new Promise(r => setTimeout(r, 500));
    owner.startRound(mode, genre);

    // 5. Optional: restart loop — when round ends, start a new one
    let roundsPlayed = 0;
    const restartOnEnd = (winnerId: string | null) => {
      roundsPlayed++;
      console.log(`\n── Round ${roundsPlayed} ended (winner: ${winnerId}) ──`);
      // Uncomment to auto-restart:
      // setTimeout(() => owner.startRound(mode, genre), 2000);
    };

    bots.forEach(b => b.onRoundEnded(restartOnEnd));
  }
}

main().catch(err => {
  console.error('Bot runner failed:', err);
  process.exit(1);
});
