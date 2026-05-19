/**
 * Hitster Bot Runner
 *
 * Usage:
 *   npm start                        — create a new room, fill with all profiles
 *   npm start -- --room XXXX         — join an existing room
 *   npm start -- --count 3           — use only first 3 profiles
 *   npm start -- --room XXXX --count 2
 *   npm start -- --url http://server:3000
 *
 * Profiles are loaded from ./profiles.yaml. Edit that file to change bot behaviour.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import { Bot } from './bot';
import { BotProfile, ProfilesFile } from './types';

function parseArgs(): { serverUrl: string; roomCode?: string; count?: number } {
  const args = process.argv.slice(2);
  let serverUrl = process.env.SERVER_URL ?? 'http://localhost:3000';
  let roomCode: string | undefined;
  let count: number | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) serverUrl = args[++i];
    if (args[i] === '--room' && args[i + 1]) roomCode = args[++i].toUpperCase();
    if (args[i] === '--count' && args[i + 1]) count = parseInt(args[++i], 10);
  }

  return { serverUrl, roomCode, count };
}

function loadProfiles(): BotProfile[] {
  const raw = readFileSync(join(__dirname, 'profiles.yaml'), 'utf-8');
  const file = parse(raw) as ProfilesFile;
  return file.bots;
}

function pickProfiles(profiles: BotProfile[], count?: number): BotProfile[] {
  if (!count) return profiles;
  // Round-robin if count > profiles.length
  const result: BotProfile[] = [];
  for (let i = 0; i < count; i++) {
    result.push(profiles[i % profiles.length]);
  }
  return result;
}

async function main(): Promise<void> {
  const { serverUrl, roomCode, count } = parseArgs();
  const allProfiles = loadProfiles();
  const profiles = pickProfiles(allProfiles, count);

  console.log(`\nHitster Bot Runner`);
  console.log(`Server:  ${serverUrl}`);
  console.log(`Room:    ${roomCode ?? '(create new)'}`);
  console.log(`Bots:    ${profiles.map(p => p.name).join(', ')}`);
  console.log(`────────────────────────────────────\n`);

  const bots = profiles.map(profile => new Bot(serverUrl, profile));

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down bots...');
    bots.forEach(b => b.disconnect());
    process.exit(0);
  });

  // Connect all bots with a small stagger to avoid thundering herd
  for (let i = 0; i < bots.length; i++) {
    bots[i].connect();
    await new Promise(r => setTimeout(r, 150));

    if (roomCode) {
      bots[i].joinRoom(roomCode);
    } else if (i === 0) {
      // First bot creates the room; others join once they get the room code
      // (room:created event handler will be wired once server events are implemented)
      bots[i].createRoom('Bot Demo Room');
    }
  }
}

main().catch(err => {
  console.error('Bot runner failed:', err);
  process.exit(1);
});
