/**
 * Playwright E2E configuration — VoidForge v18.0 The Proving Ground.
 *
 * Runs Chromium-only against the wizard server on a dedicated test port (3199).
 * Network isolation prevents any external requests from browser tests.
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './wizard/e2e',

  /* Fail the build on CI if test.only was left in the source. */
  forbidOnly: !!process.env.CI,

  /* Retry once — catches flakes without hiding real failures. */
  retries: 1,

  /* List reporter locally, GitHub annotations in CI. */
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: 'http://127.0.0.1:3199',

    /* Network isolation — block all external requests from browser. */
    launchOptions: {
      args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'],
    },

    /* Collect trace on first retry for debugging flakes. */
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Start the wizard server before running tests. */
  webServer: {
    command: 'VOIDFORGE_TEST=1 PORT=3199 npx tsx wizard/server.ts',
    port: 3199,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
