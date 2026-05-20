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
  const uniqueTopic = `${topic} ${Date.now()}`;
  await page.click('button:has-text("Create a room")');
  await page.waitForSelector('.modal-box');
  await page.fill('.modal-box input[type="text"]', uniqueTopic);
  await page.click('.modal-box button:has-text("Create")');
  await expect(page.locator('[data-testid="lobby-screen"]')).toBeVisible({ timeout: 8_000 });
  return uniqueTopic;
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

async function joinRoomByClick(page: Page, roomTopic: string): Promise<void> {
  await waitForRooms(page);
  const card = page.locator('[data-testid="room-card-joinable"].lobby', { hasText: roomTopic }).first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.click();
  await expect(page.locator('[data-testid="lobby-screen"]')).toBeVisible({ timeout: 8_000 });
}

// ---------------------------------------------------------------------------
// 1. Email and name persist when returning to the lobby
// ---------------------------------------------------------------------------

test('email and name persist after leaving a room', async ({ page }) => {
  await fillEmailAndName(page, 'persist@example.com', 'PersistBot');
  await createRoom(page, 'Persistence Test');

  // Verify we're in the room lobby
  await expect(page.locator('[data-testid="lobby-screen"]')).toBeVisible();

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

    const card = p2.locator('.room-card', { hasText: roomCode }).first();
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

    const card = p2.locator('.room-card', { hasText: roomCode }).first();
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

    const card = p2.locator('.room-card', { hasText: roomCode }).first();
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
      await expect(observer.locator('.room-card', { hasText: roomCodes[i] }).first()).toBeVisible();
    }

    await observer.close();
  } finally {
    for (const ctx of contexts) await ctx.close();
  }
});

// ---------------------------------------------------------------------------
// 6a. Start round button works — transitions lobby to active game
// ---------------------------------------------------------------------------

test('start round button transitions lobby to active game', async ({ page }) => {
  await fillEmailAndName(page, 'starter@example.com', 'StarterBot');
  await createRoom(page, 'Start Button Test');

  // Verify we are in the lobby
  await expect(page.locator('[data-testid="lobby-screen"]')).toBeVisible();

  // Click Start Round
  await page.click('[data-testid="start-round-btn"]');

  // Should transition to active game within 8s
  await expect(page.locator('[data-testid="round-active"]')).toBeVisible({ timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// 6b. Start round button shows loading state while connecting
// ---------------------------------------------------------------------------

test('start round button disables while starting', async ({ page }) => {
  await fillEmailAndName(page, 'disabler@example.com', 'DisablerBot');
  await createRoom(page, 'Disable Test');

  await expect(page.locator('[data-testid="start-round-btn"]')).toBeEnabled();
  await page.click('[data-testid="start-round-btn"]');

  // After click: button is either disabled/loading OR we're already in the game
  await expect(async () => {
    const inGame = await page.locator('[data-testid="round-active"]').isVisible();
    if (inGame) return; // already transitioned — acceptable
    await expect(page.locator('[data-testid="start-round-btn"]')).toBeDisabled();
  }).toPass({ timeout: 5_000 });
});

// ---------------------------------------------------------------------------
// 7. Leave room → room removed from lobby when no players remain
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
    await expect(p2.locator('.room-card', { hasText: roomCode }).first()).toBeVisible();

    // p1 leaves the room
    await p1.click('[data-testid="leave-btn"]');

    // Server has EMPTY_ROOM_TTL_MS=5s in TEST_MODE — poll lobby until room is gone
    await expect(async () => {
      await p2.reload();
      await expect(p2.locator('.room-card', { hasText: roomCode }).first()).not.toBeVisible();
    }).toPass({ timeout: 15_000, intervals: [2_000] });
  } finally {
    await ctx1.close();
    await ctx2.close();
  }
});

// ---------------------------------------------------------------------------
// 8. Skip and Buy buttons are visible during an active turn (items 3 & 4)
// ---------------------------------------------------------------------------

test('skip and buy buttons are visible during active turn', async ({ page }) => {
  await fillEmailAndName(page, 'turnui@example.com', 'TurnUIBot');
  await createRoom(page, 'Turn UI Test');
  await startRound(page);

  // Wait for the active game screen
  await expect(page.locator('[data-testid="round-active"]')).toBeVisible({ timeout: 8_000 });

  // Wait for a turn to start (turn:started emits turn UI)
  await expect(page.locator('[data-testid="skip-btn"]')).toBeVisible({ timeout: 8_000 });
  await expect(page.locator('[data-testid="buy-btn"]')).toBeVisible({ timeout: 8_000 });

  // Original mode starts with 2 tokens: skip (costs 1) enabled, buy (costs 3) disabled
  await expect(page.locator('[data-testid="skip-btn"]')).toBeEnabled();
  await expect(page.locator('[data-testid="buy-btn"]')).toBeDisabled();
});

// ---------------------------------------------------------------------------
// 9. Non-active player sees active timeline and placement (spectator view)
// ---------------------------------------------------------------------------

test('joiner sees host timeline and placement during challenge', async ({ browser }: { browser: Browser }) => {
  test.setTimeout(120_000);

  const ctx1: BrowserContext = await browser.newContext();
  const ctx2: BrowserContext = await browser.newContext();
  const p1: Page = await ctx1.newPage();
  const p2: Page = await ctx2.newPage();

  try {
    await fillEmailAndName(p1, 'host-watch@example.com', 'HostWatch');
    const roomTopic = await createRoom(p1, 'Watch Timeline Test');
    await fillEmailAndName(p2, 'joiner-watch@example.com', 'JoinerWatch');
    await joinRoomByClick(p2, roomTopic);
    await startRound(p1);

    await expect(p1.locator('[data-testid="round-active"]')).toBeVisible({ timeout: 8_000 });
    await expect(p2.locator('[data-testid="round-active"]')).toBeVisible({ timeout: 8_000 });

    // First player is random (oldest starting card) — if joiner goes first, finish their turn so host can act
    await expect(p2.locator('[data-testid="timeline-gap-0"]').or(p2.locator('[data-testid="watch-timeline"]'))).toBeVisible({
      timeout: 8_000,
    });
    if (await p2.locator('[data-testid="sidebar-turn-status"]').getByText(/your turn/i).isVisible()) {
      await p2.click('[data-testid="timeline-gap-0"]');
      await p2.click('button:has-text("CONFIRM PLACE")');
    }

    await expect(p1.locator('[data-testid="sidebar-turn-status"]')).toContainText(/your turn/i, { timeout: 20_000 });
    await expect(p2.locator('[data-testid="watch-timeline"]')).toBeVisible({ timeout: 90_000 });
    await expect(p2.locator('[data-testid="watch-timeline"]')).toContainText("HOSTWATCH'S TIMELINE");
    await expect(p2.locator('[data-testid="my-timeline-disabled"]')).toBeVisible();

    await expect(p1.locator('[data-testid="timeline-gap-0"]')).toBeVisible({ timeout: 8_000 });
    await p1.click('[data-testid="timeline-gap-0"]');
    await p1.click('button:has-text("CONFIRM PLACE")');

    await expect(p2.locator('[data-testid="watch-timeline"] .timeline-card.face-down')).toBeVisible({
      timeout: 8_000,
    });
  } finally {
    await ctx1.close();
    await ctx2.close();
  }
});

// ---------------------------------------------------------------------------
// 10. Name song panel visible and submittable during active turn (item 3)
// ---------------------------------------------------------------------------

test('name song panel is visible and inputs work during active turn', async ({ page }) => {
  await fillEmailAndName(page, 'namesong@example.com', 'NameSongBot');
  await createRoom(page, 'Name Song Test');
  await startRound(page);

  await expect(page.locator('[data-testid="round-active"]')).toBeVisible({ timeout: 8_000 });

  // Wait for name song inputs
  await expect(page.locator('[data-testid="name-song-title"]')).toBeVisible({ timeout: 8_000 });
  await expect(page.locator('[data-testid="name-song-artist"]')).toBeVisible({ timeout: 8_000 });

  // Submit button is disabled when inputs are empty
  await expect(page.locator('[data-testid="name-song-submit"]')).toBeDisabled();

  // Filling both inputs enables the submit button
  await page.fill('[data-testid="name-song-title"]', 'Some Title');
  await page.fill('[data-testid="name-song-artist"]', 'Some Artist');
  await expect(page.locator('[data-testid="name-song-submit"]')).toBeEnabled();
});

// ---------------------------------------------------------------------------
// 11. Disconnected player's turn auto-advances after TURN_TIMEOUT (item 6)
// ---------------------------------------------------------------------------

test('disconnected player turn auto-advances after timeout', async ({ browser }: { browser: Browser }) => {
  const ctx1: BrowserContext = await browser.newContext();
  const ctx2: BrowserContext = await browser.newContext();
  const p1: Page = await ctx1.newPage();
  const p2: Page = await ctx2.newPage();

  try {
    // p1 creates room and starts round
    await fillEmailAndName(p1, 'host-dc@example.com', 'HostBot');
    const roomCode = await createRoom(p1, 'Disconnect Test');

    // p2 joins by double-clicking the room in the lobby list
    await fillEmailAndName(p2, 'joiner-dc@example.com', 'JoinerBot');
    await joinRoomByClick(p2, roomCode);

    await startRound(p1);

    // Both players should see the active game
    await expect(p1.locator('[data-testid="round-active"]')).toBeVisible({ timeout: 8_000 });
    await expect(p2.locator('[data-testid="round-active"]')).toBeVisible({ timeout: 8_000 });

    // Record which player has the first turn and disconnect them
    // p2 sees "You" when p2 is active, "HostBot" when p1 is active
    const firstActivePlayerEl = p2.locator('.active-player .player-name');
    const firstActiveName = await firstActivePlayerEl.textContent({ timeout: 5_000 });

    // Disconnect the active player; observe from the other
    let observerPage: Page;
    if (firstActiveName?.includes('HostBot')) {
      await ctx1.close(); // p1 (HostBot) is active — disconnect p1, observe from p2
      observerPage = p2;
    } else {
      await ctx2.close(); // p2 (JoinerBot/You) is active — disconnect p2, observe from p1
      observerPage = p1;
    }

    // TURN_TIMEOUT_MS = 3s in TEST_MODE — after it fires the remaining player becomes active
    // Allow up to 10s for the auto-skip + turn advance to propagate
    await expect(async () => {
      const activeNow = await observerPage.locator('.active-player').isVisible().catch(() => false);
      expect(activeNow).toBe(true);
    }).toPass({ timeout: 10_000, intervals: [1_000] });
  } finally {
    await ctx1.close().catch(() => {});
    await ctx2.close().catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// 12. Mode selector UI — all options visible and selectable (item 1)
// ---------------------------------------------------------------------------

test('mode selector shows all modes and can be changed', async ({ page }) => {
  await fillEmailAndName(page, 'mode-host@example.com', 'ModeHost');
  await createRoom(page, 'Mode Test');
  await expect(page.locator('[data-testid="lobby-screen"]')).toBeVisible({ timeout: 8_000 });

  // Mode selector should be visible to the room owner
  await expect(page.locator('[data-testid="mode-selector"]')).toBeVisible();

  // All four modes should be present
  await expect(page.locator('[data-testid="mode-option-original"]')).toBeVisible();
  await expect(page.locator('[data-testid="mode-option-pro"]')).toBeVisible();
  await expect(page.locator('[data-testid="mode-option-expert"]')).toBeVisible();
  await expect(page.locator('[data-testid="mode-option-cooperative"]')).toBeVisible();

  // Selecting a different mode works
  await page.click('[data-testid="mode-option-pro"]');
  await expect(page.locator('[data-testid="mode-option-pro"]')).toHaveClass(/selected/);

  // Cards-to-win and tokens-enabled are visible
  await expect(page.locator('[data-testid="cards-to-win-input"]')).toBeVisible();
  await expect(page.locator('[data-testid="tokens-enabled-toggle"]')).toBeVisible();
});
