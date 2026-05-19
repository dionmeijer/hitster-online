/**
 * E2E tests for the Hitster Online room lobby scenarios.
 *
 * Run with:
 *   npm run test:e2e
 *
 * Requires TEST_MODE=true server + Vite client (started automatically by
 * playwright.config.ts webServer entries).
 */

import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fillEmailAndName(page: Page, email: string, name?: string) {
  await page.goto('/');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', email);
  if (name) {
    await page.fill('input[placeholder="Leave blank to use email"]', name);
  }
}

async function createRoom(page: Page, topic: string): Promise<string> {
  await page.click('button:has-text("Create a room")');
  await page.waitForSelector('.modal-box');
  await page.fill('.modal-box input[type="text"]', topic);
  await page.click('.modal-box button:has-text("Create")');
  // Wait until we're in the lobby and the room code is visible
  const codeEl = page.locator('[data-testid="lobby-room-code"]');
  await expect(codeEl).toBeVisible({ timeout: 8_000 });
  return (await codeEl.textContent()) ?? '';
}

async function startRound(page: Page, playlistLabel?: string) {
  if (playlistLabel) {
    await page.fill('[data-testid="playlist-label-input"]', playlistLabel);
  }
  await page.click('[data-testid="start-round-btn"]');
}

async function waitForRooms(page: Page, timeout = 6_000): Promise<void> {
  // The room list polls every 2s; wait up to 6s for at least one card
  await expect(page.locator('.room-card').first()).toBeVisible({ timeout });
}

// ---------------------------------------------------------------------------
// 1. Email and name persist when returning to the lobby
// ---------------------------------------------------------------------------

test('email and name persist after leaving a room', async ({ page }) => {
  await fillEmailAndName(page, 'persist@example.com', 'PersistBot');
  await createRoom(page, 'Persistence Test');

  // Verify we're in the room lobby
  await expect(page.locator('[data-testid="lobby-room-code"]')).toBeVisible();

  // Leave the room
  await page.click('[data-testid="leave-btn"]');

  // Back at entry page — check values are pre-filled from sessionStorage
  await expect(page.locator('input[type="email"]')).toHaveValue('persist@example.com');
  await expect(page.locator('input[placeholder="Leave blank to use email"]')).toHaveValue('PersistBot');

  // Display name preview chip should show "PersistBot"
  await expect(page.locator('.pr-name')).toHaveText('PersistBot');
});

// ---------------------------------------------------------------------------
// 2. Start a game → room shows LIVE in lobby with current user as participant
// ---------------------------------------------------------------------------

test('active game appears in lobby with correct status and participant', async ({ browser }: { browser: Browser }) => {
  const ctx1: BrowserContext = await browser.newContext();
  const ctx2: BrowserContext = await browser.newContext();
  const p1: Page = await ctx1.newPage();
  const p2: Page = await ctx2.newPage();

  try {
    await fillEmailAndName(p1, 'host@example.com', 'HostPlayer');
    const roomCode = await createRoom(p1, 'Active Game Room');
    await startRound(p1);

    // p1 is now in an active game — wait for game screen to appear
    await expect(p1.locator('[data-testid="round-active"]')).toBeVisible({ timeout: 8_000 });

    // p2 opens the entry page — room browser should show the room as LIVE
    await p2.goto('/');
    await waitForRooms(p2);

    const card = p2.locator('.room-card', { hasText: roomCode });
    await expect(card).toBeVisible();
    await expect(card.locator('.status-badge')).toHaveText('LIVE');
    await expect(card).toContainText('HostPlayer');
  } finally {
    await ctx1.close();
    await ctx2.close();
  }
});

// ---------------------------------------------------------------------------
// 3. Create a room with genre "90's rock" — visible in lobby
// ---------------------------------------------------------------------------

test("room with genre '90s rock' appears in lobby with genre label", async ({ browser }: { browser: Browser }) => {
  const ctx1: BrowserContext = await browser.newContext();
  const ctx2: BrowserContext = await browser.newContext();
  const p1: Page = await ctx1.newPage();
  const p2: Page = await ctx2.newPage();

  try {
    await fillEmailAndName(p1, 'rock@example.com', 'RockBot');
    const roomCode = await createRoom(p1, '90s Rock Night');
    await startRound(p1, "90's rock");

    // p2 checks lobby
    await p2.goto('/');
    await waitForRooms(p2);

    const card = p2.locator('.room-card', { hasText: roomCode });
    await expect(card).toBeVisible();
    await expect(card.locator('.rc-genre')).toHaveText("90's rock");
  } finally {
    await ctx1.close();
    await ctx2.close();
  }
});

// ---------------------------------------------------------------------------
// 4. Create a room with a Spotify playlist URL — game starts (TEST_MODE uses mock tracks)
// ---------------------------------------------------------------------------

test('room with Spotify playlist URL starts successfully in TEST_MODE', async ({ browser }: { browser: Browser }) => {
  const ctx1: BrowserContext = await browser.newContext();
  const ctx2: BrowserContext = await browser.newContext();
  const p1: Page = await ctx1.newPage();
  const p2: Page = await ctx2.newPage();

  const spotifyUrl = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M';

  try {
    await fillEmailAndName(p1, 'spotify@example.com', 'SpotifyBot');
    const roomCode = await createRoom(p1, 'Spotify Classics');
    await startRound(p1, spotifyUrl);

    // Round should start (TEST_MODE uses mock tracks regardless of URL)
    await expect(p1.locator('[data-testid="round-active"]')).toBeVisible({ timeout: 8_000 });

    // Room appears in lobby with LIVE status
    await p2.goto('/');
    await waitForRooms(p2);

    const card = p2.locator('.room-card', { hasText: roomCode });
    await expect(card).toBeVisible();
    await expect(card.locator('.status-badge')).toHaveText('LIVE');
  } finally {
    await ctx1.close();
    await ctx2.close();
  }
});

// ---------------------------------------------------------------------------
// 5. All rooms from tests 3 & 4 are visible simultaneously in lobby
// ---------------------------------------------------------------------------

test('multiple rooms are all visible in the lobby at the same time', async ({ browser }: { browser: Browser }) => {
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  const roomCodes: string[] = [];

  const rooms = [
    { email: 'multi1@example.com', name: 'Multi1', topic: 'Multi Room A', genre: 'pop' },
    { email: 'multi2@example.com', name: 'Multi2', topic: 'Multi Room B', genre: 'jazz' },
    { email: 'multi3@example.com', name: 'Multi3', topic: 'Multi Room C', genre: 'rock' },
  ];

  try {
    // Create all rooms concurrently
    for (const r of rooms) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      contexts.push(ctx);
      pages.push(page);

      await fillEmailAndName(page, r.email, r.name);
      const code = await createRoom(page, r.topic);
      roomCodes.push(code);
      await startRound(page, r.genre);
    }

    // Observer page checks all rooms are visible
    const observer = await browser.newPage();
    await observer.goto('/');
    await waitForRooms(observer);

    for (let i = 0; i < roomCodes.length; i++) {
      await expect(observer.locator('.room-card', { hasText: roomCodes[i] })).toBeVisible();
    }

    await observer.close();
  } finally {
    for (const ctx of contexts) await ctx.close();
  }
});

// ---------------------------------------------------------------------------
// 6. Leave room → room removed from lobby when no players remain
// ---------------------------------------------------------------------------

test('room disappears from lobby after last player leaves', async ({ browser }: { browser: Browser }) => {
  const ctx1: BrowserContext = await browser.newContext();
  const ctx2: BrowserContext = await browser.newContext();
  const p1: Page = await ctx1.newPage();
  const p2: Page = await ctx2.newPage();

  try {
    await fillEmailAndName(p1, 'alone@example.com', 'LonelyBot');
    const roomCode = await createRoom(p1, 'Lonely Room');

    // Confirm room appears in lobby
    await p2.goto('/');
    await waitForRooms(p2);
    await expect(p2.locator('.room-card', { hasText: roomCode })).toBeVisible();

    // p1 leaves the room
    await p1.click('[data-testid="leave-btn"]');

    // Server has EMPTY_ROOM_TTL_MS=5s in TEST_MODE — poll lobby until room is gone
    await expect(async () => {
      await p2.reload();
      await expect(p2.locator('.room-card', { hasText: roomCode })).not.toBeVisible();
    }).toPass({ timeout: 15_000, intervals: [2_000] });
  } finally {
    await ctx1.close();
    await ctx2.close();
  }
});
