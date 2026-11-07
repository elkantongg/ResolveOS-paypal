import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests. They run the real server and web app on their own ports and database, with the
 * MOCK PayPal adapter and the deterministic demo negotiator, so they are repeatable and never call
 * PayPal or an AI provider. (Real sandbox payments are tested by hand: see README "Manual sandbox test".)
 *
 * Uses the locally installed Google Chrome (channel: 'chrome'), so no browser download is needed.
 */
const API_PORT = 5101;
const WEB_PORT = 5190;
const WEB = `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], channel: 'chrome', baseURL: WEB, viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure', video: 'off' },
  webServer: [
    {
      command: 'pnpm --filter server exec tsx src/db/reset.ts --yes && pnpm --filter server exec tsx src/index.ts',
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: 'test',
        DATABASE_URL: process.env.E2E_DATABASE_URL ?? 'postgres://localhost:5432/resolve_ai_e2e',
        SESSION_SECRET: 'e2e-session-secret-at-least-32-characters',
        BACKEND_PORT: String(API_PORT),
        FRONTEND_URL: WEB,
        PAYPAL_ADAPTER: 'mock',
        AI_MODE: 'demo',
      },
    },
    {
      command: 'pnpm --filter web exec vite',
      url: WEB,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { WEB_PORT: String(WEB_PORT), API_TARGET: `http://localhost:${API_PORT}` },
    },
  ],
});
