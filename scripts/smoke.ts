/**
 * Smoke test — verifies a running server is healthy and plays a full game.
 *
 * Usage:
 *   npm run smoke                         (targets http://localhost:3000)
 *   SERVER_URL=http://host:3000 npm run smoke
 *
 * The script:
 *   1. Checks the /health endpoint
 *   2. Connects 3 bots (Expert Eva, Casual Carl, Wild Card)
 *   3. Creates a room, starts a round, plays until someone wins or 120s elapses
 *   4. Prints a pass/fail summary and exits with code 0 (pass) or 1 (fail)
 *
 * Requires the server to be running with TEST_MODE=true.
 */

import { io, Socket } from 'socket.io-client';

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3000';
const TIMEOUT_MS = 120_000;

// ── Types ──────────────────────────────────────────────────────────────────

interface Check {
  name: string;
  passed: boolean;
  detail?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function pass(checks: Check[], name: string, detail?: string) {
  checks.push({ name, passed: true, detail });
  console.log(`  ✓  ${name}${detail ? ' — ' + detail : ''}`);
}

function fail(checks: Check[], name: string, detail?: string) {
  checks.push({ name, passed: false, detail });
  console.log(`  ✗  ${name}${detail ? ' — ' + detail : ''}`);
}

async function httpGet(path: string): Promise<{ ok: boolean; body: unknown }> {
  const res = await fetch(`${SERVER_URL}${path}`);
  const body = await res.json().catch(() => null);
  return { ok: res.ok, body };
}

function makeSocket(sessionId: string, name: string): Socket {
  return io(SERVER_URL, {
    auth: { sessionId, displayName: name },
    autoConnect: false,
  });
}

function waitFor<T>(socket: Socket, event: string, timeoutMs = 10_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout waiting for "${event}"`)), timeoutMs);
    socket.once(event, (data: T) => { clearTimeout(t); resolve(data); });
  });
}

// ── Main ───────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  const checks: Check[] = [];
  console.log(`\nSmoke test → ${SERVER_URL}\n`);

  // 1. Health check
  try {
    const { ok, body } = await httpGet('/health');
    if (ok) pass(checks, 'GET /health', JSON.stringify(body));
    else     fail(checks, 'GET /health', 'non-2xx response');
  } catch (e) {
    fail(checks, 'GET /health', String(e));
    printSummary(checks);
    process.exit(1);
  }

  // 2. Connect three sockets
  const owner  = makeSocket('smoke-owner',  'SmokeOwner');
  const player2 = makeSocket('smoke-p2',    'SmokeP2');
  const player3 = makeSocket('smoke-p3',    'SmokeP3');
  const sockets = [owner, player2, player3];

  try {
    await Promise.all(sockets.map(s => new Promise<void>((res, rej) => {
      s.connect();
      s.once('connect', res);
      s.once('connect_error', rej);
    })));
    pass(checks, '3 sockets connected');
  } catch (e) {
    fail(checks, '3 sockets connected', String(e));
    printSummary(checks); process.exit(1);
  }

  // 3. Create room
  let roomCode: string;
  try {
    owner.emit('room:create', { topic: 'Smoke Test Room' });
    const created = await waitFor<{ roomCode: string }>(owner, 'room:created');
    roomCode = created.roomCode;
    pass(checks, 'room:created', `code=${roomCode}`);
  } catch (e) {
    fail(checks, 'room:created', String(e));
    sockets.forEach(s => s.disconnect());
    printSummary(checks); process.exit(1);
  }

  // 4. Other players join
  try {
    player2.emit('room:join', { roomCode });
    player3.emit('room:join', { roomCode });
    await Promise.all([
      waitFor(player2, 'room:joined'),
      waitFor(player3, 'room:joined'),
    ]);
    pass(checks, 'players joined room');
  } catch (e) {
    fail(checks, 'players joined room', String(e));
  }

  // 5. Owner starts round
  try {
    owner.emit('round:start', { playlistLabel: 'Test Playlist', mode: 'original' });
    await waitFor(owner, 'round:started', 8_000);
    pass(checks, 'round:started');
  } catch (e) {
    fail(checks, 'round:started', String(e));
  }

  // 6. Play turns until round:ended or timeout
  let roundEnded = false;
  let winner: string | undefined;
  const deadline = Date.now() + TIMEOUT_MS;

  const handleTurnStarted = async (data: { activePlayerId: string; timelineLength: number }) => {
    // Each active socket places at a random position after a short delay
    const activeSock = sockets.find(s => (s.auth as Record<string, string>).sessionId === data.activePlayerId);
    if (!activeSock) return;
    await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
    const slots = data.timelineLength + 1;
    activeSock.emit('turn:place', { position: Math.floor(Math.random() * slots) });
  };

  sockets.forEach(s => s.on('turn:started', handleTurnStarted));

  try {
    const result = await Promise.race([
      waitFor<{ winnerId: string }>(owner, 'round:ended', TIMEOUT_MS),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('game timeout')), TIMEOUT_MS)),
    ]);
    roundEnded = true;
    winner = (result as { winnerId: string }).winnerId;
    pass(checks, 'round:ended', `winner=${winner}`);
  } catch (e) {
    fail(checks, 'round:ended', `${Date.now() < deadline ? String(e) : 'timed out after ' + TIMEOUT_MS / 1000 + 's'}`);
  }

  // 7. Disconnect cleanly
  sockets.forEach(s => s.disconnect());

  printSummary(checks);
  const allPassed = checks.every(c => c.passed);
  process.exit(allPassed ? 0 : 1);
}

function printSummary(checks: Check[]): void {
  const passed = checks.filter(c => c.passed).length;
  const total  = checks.length;
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`${passed === total ? '✓ ALL PASSED' : '✗ FAILED'} — ${passed}/${total} checks\n`);
}

run().catch(err => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
