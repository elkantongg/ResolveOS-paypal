import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    // Database tests share one Postgres test database, so files run one at a time.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/resolve_ai_test',
      SESSION_SECRET: 'test-session-secret-at-least-32-characters-long',
      PAYPAL_ENV: 'sandbox',
      FRONTEND_URL: 'http://localhost:5180',
    },
  },
});
