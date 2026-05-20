import { defineConfig, devices } from '@playwright/test';

// Use a dedicated port for the test server so it never conflicts with a
// developer's local server and always runs with TEST_MODE=true.
const TEST_SERVER_PORT = 3099;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    video: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Use system Chromium if PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH is set,
        // otherwise Playwright downloads its own binary.
        ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
          : {}),
      },
    },
  ],
  webServer: [
    {
      command: 'npm run test:server',
      port: TEST_SERVER_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { TEST_MODE: 'true', PORT: String(TEST_SERVER_PORT) },
    },
    {
      command: 'npm run dev:client',
      port: 5173,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { VITE_SERVER_URL: `http://localhost:${TEST_SERVER_PORT}` },
    },
  ],
});
