/**
 * Pattern: E2E Testing with Playwright
 *
 * Key principles:
 * - Page Object Model for test organization
 * - axe-core a11y scan as default fixture (every page gets a free a11y check)
 * - Deterministic state: clean temp dir per test, explicit waits only
 * - Network mocking for external APIs
 * - Auth helper for authenticated flows
 * - CWV measurement (opt-in)
 * - Flaky test management: retry, quarantine, no waitForTimeout
 *
 * Testing pyramid position: Unit (many, fast) → Integration (moderate) → E2E (few, slow, critical paths only)
 * Target: 10-15 E2E tests for a typical full-stack app. Max 2 min CI time.
 *
 * Agents: Batman (test strategy), Samwise (a11y), Éowyn (enchantment), Nightwing (regression)
 * Hawkeye (Gauntlet Round 2.5 smoke tests)
 *
 * Framework adaptations:
 *   Next.js: webServer.command = 'next dev -p 3199' (or 'next build && next start')
 *   Express: webServer.command = 'PORT=3199 npx tsx src/server.ts'
 *   Django: webServer.command = 'python manage.py runserver 3199 --settings=project.settings.test'
 *   Rails: webServer.command = 'RAILS_ENV=test bin/rails server -p 3199'
 *
 * === Django Adaptation ===
 *
 *   # playwright.config.ts — same structure, different webServer
 *   webServer: {
 *     command: 'python manage.py runserver 3199 --settings=myapp.settings.test',
 *     port: 3199,
 *     reuseExistingServer: !process.env.CI,
 *   }
 *
 *   # Auth helper: POST to Django login endpoint or use session cookie directly
 *   # Network mocking: same Playwright route.fulfill() — framework doesn't matter
 *   # a11y: same axe-core fixture — it runs in the browser, not the server
 *
 * === Key Rules ===
 *
 *   1. NEVER use waitForTimeout() — it's a flake factory. Use explicit waits:
 *      await page.waitForSelector(), await expect(locator).toBeVisible()
 *   2. NEVER use networkidle — it's non-deterministic. Wait for specific elements.
 *   3. ONE assertion concept per test. Split journeys into focused test cases.
 *   4. Clean state per test. Use beforeEach to reset, not afterAll to teardown.
 *   5. E2E tests are expensive — only test critical user journeys.
 *      Unit/integration tests cover edge cases, validation, and error handling.
 */

import { test as base, expect, type Page, type BrowserContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// ── Types ───────────────────────────────────────────

/** Auth session info returned from login helper. */
interface AuthSession {
  token: string;
  userId: string;
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
  }>;
}

/** Core Web Vitals measurement result. */
interface CWVResult {
  lcp: number | null; // Largest Contentful Paint (ms)
  fid: number | null; // First Input Delay (ms)
  cls: number | null; // Cumulative Layout Shift (score)
  ttfb: number | null; // Time to First Byte (ms)
}

// ── axe-core Fixture ────────────────────────────────
// Every test that uses { page } also gets a free a11y scan helper.
// Import `test` from this file instead of @playwright/test.

/**
 * Known pre-existing a11y violations. Track these for resolution —
 * excluding them prevents false failures while still catching regressions.
 * Remove rules from this list as they're fixed.
 */
const KNOWN_A11Y_EXCLUSIONS: string[] = [
  // 'color-contrast',    // Example: dark theme needs design review
  // 'landmark-one-main', // Example: some pages lack <main>
];

export const test = base.extend<{
  axe: AxeBuilder;
  expectAccessible: (page: Page) => Promise<void>;
}>({
  axe: async ({ page }, use) => {
    await use(new AxeBuilder({ page }));
  },

  expectAccessible: async ({}, use) => {
    await use(async (targetPage: Page) => {
      const results = await new AxeBuilder({ page: targetPage })
        .disableRules(KNOWN_A11Y_EXCLUSIONS)
        .analyze();

      if (results.violations.length > 0) {
        const summary = results.violations
          .map(
            (v) =>
              `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} node${v.nodes.length === 1 ? '' : 's'})`
          )
          .join('\n  ');
        throw new Error(`Accessibility violations:\n  ${summary}`);
      }
    });
  },
});

export { expect };

// ── Page Object Model ───────────────────────────────
// Encapsulate page interaction behind a stable API.
// When selectors change, update the POM — not every test.

export class LoginPage {
  constructor(private page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/login');
  }

  async fillEmail(email: string): Promise<void> {
    await this.page.getByLabel('Email').fill(email);
  }

  async fillPassword(password: string): Promise<void> {
    await this.page.getByLabel('Password').fill(password);
  }

  async submit(): Promise<void> {
    await this.page.getByRole('button', { name: /sign in|log in/i }).click();
  }

  async login(email: string, password: string): Promise<void> {
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.submit();
  }

  async expectError(message: string | RegExp): Promise<void> {
    await expect(this.page.getByRole('alert')).toContainText(message);
  }

  async expectRedirectToDashboard(): Promise<void> {
    await this.page.waitForURL('**/dashboard**');
  }
}

export class DashboardPage {
  constructor(private page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/dashboard');
  }

  async expectLoaded(): Promise<void> {
    // Wait for a specific element, not networkidle
    await expect(this.page.getByRole('heading', { level: 1 })).toBeVisible();
  }

  async expectProjectVisible(name: string): Promise<void> {
    await expect(this.page.getByText(name)).toBeVisible();
  }

  async createProject(name: string): Promise<void> {
    await this.page.getByRole('button', { name: /create|new project/i }).click();
    await this.page.getByLabel('Project name').fill(name);
    await this.page.getByRole('button', { name: /create|save/i }).click();
    // Wait for the project to appear — explicit, not timeout
    await expect(this.page.getByText(name)).toBeVisible();
  }
}

// ── Auth Helper ─────────────────────────────────────
// Login via API (fast), not via UI (slow). Reuse session across tests.
// Store auth state to a file so Playwright can load it without re-logging in.

const AUTH_STATE_PATH = 'e2e/.auth/session.json';

/**
 * Authenticate via API and save session state for reuse.
 * Call once in a setup project, then reuse in test projects.
 *
 * playwright.config.ts:
 *   projects: [
 *     { name: 'setup', testMatch: /auth\.setup\.ts/ },
 *     { name: 'tests', dependencies: ['setup'], use: { storageState: AUTH_STATE_PATH } },
 *   ]
 */
export async function loginViaAPI(
  context: BrowserContext,
  baseURL: string,
  credentials: { email: string; password: string }
): Promise<AuthSession> {
  const response = await context.request.post(`${baseURL}/api/auth/login`, {
    data: credentials,
  });

  if (!response.ok()) {
    throw new Error(`Auth failed: ${response.status()} ${await response.text()}`);
  }

  const body = await response.json();

  // Save browser state (cookies, localStorage) for reuse
  await context.storageState({ path: AUTH_STATE_PATH });

  return {
    token: body.token,
    userId: body.userId,
    cookies: await context.cookies(),
  };
}

/**
 * Auth setup file — run once before all tests.
 *
 * // e2e/auth.setup.ts
 * import { test as setup } from '@playwright/test';
 * import { loginViaAPI } from './fixtures';
 *
 * setup('authenticate', async ({ context, baseURL }) => {
 *   await loginViaAPI(context, baseURL!, {
 *     email: 'test@example.com',
 *     password: 'test-password-123',
 *   });
 * });
 */

// ── Network Mocking ─────────────────────────────────
// Intercept external API calls to make tests deterministic.
// Mock at the network level, not the application level.

/**
 * Mock an external API endpoint.
 *
 * Usage:
 *   await mockAPI(page, 'https://api.stripe.com/v1/charges', {
 *     status: 200,
 *     body: { id: 'ch_123', amount: 1000, status: 'succeeded' },
 *   });
 */
export async function mockAPI(
  page: Page,
  urlPattern: string | RegExp,
  response: {
    status?: number;
    body: Record<string, unknown>;
    headers?: Record<string, string>;
    delay?: number; // Simulate network latency (ms) — use sparingly
  }
): Promise<void> {
  await page.route(urlPattern, async (route) => {
    if (response.delay) {
      await new Promise((resolve) => setTimeout(resolve, response.delay));
    }
    await route.fulfill({
      status: response.status ?? 200,
      contentType: 'application/json',
      headers: response.headers ?? {},
      body: JSON.stringify(response.body),
    });
  });
}

/**
 * Mock a failing external API.
 *
 * Usage:
 *   await mockAPIError(page, /api\.stripe\.com/, 503, 'Service Unavailable');
 */
export async function mockAPIError(
  page: Page,
  urlPattern: string | RegExp,
  status: number,
  message: string
): Promise<void> {
  await page.route(urlPattern, (route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message } }),
    })
  );
}

/**
 * Abort external requests entirely — simulates network failure.
 *
 * Usage:
 *   await mockNetworkFailure(page, /api\.external\.com/);
 */
export async function mockNetworkFailure(
  page: Page,
  urlPattern: string | RegExp
): Promise<void> {
  await page.route(urlPattern, (route) => route.abort('connectionrefused'));
}

// ── WebSocket Mock ──────────────────────────────────
// Intercept WebSocket connections for real-time feature testing.

/**
 * Mock a WebSocket connection.
 *
 * Usage:
 *   const wsMock = await mockWebSocket(page, 'wss://api.example.com/ws');
 *   wsMock.send({ type: 'message', data: 'hello' });
 *   wsMock.close();
 *
 * Note: Playwright's native WebSocket mocking (page.routeWebSocket) was added
 * in Playwright 1.48. For older versions, use a local WebSocket test server.
 */
export async function mockWebSocket(
  page: Page,
  url: string | RegExp
): Promise<{
  send: (data: Record<string, unknown>) => void;
  close: () => void;
  onMessage: (handler: (data: string) => void) => void;
}> {
  const handlers: Array<(data: string) => void> = [];

  // Playwright 1.48+ — use page.routeWebSocket
  const ws = await page.routeWebSocket(url, (ws) => {
    ws.onMessage((message) => {
      for (const handler of handlers) {
        handler(typeof message === 'string' ? message : message.toString());
      }
    });
  });

  return {
    send: (data) => {
      // Send data from the "server" side to the client
      ws.send(JSON.stringify(data));
    },
    close: () => {
      ws.close();
    },
    onMessage: (handler) => {
      handlers.push(handler);
    },
  };
}

// ── Core Web Vitals Measurement ─────────────────────
// Opt-in CWV measurement for performance-critical pages.
// Not a pass/fail gate by default — use for tracking and regression detection.

/**
 * Measure Core Web Vitals on a page.
 *
 * Usage:
 *   const cwv = await measureCWV(page);
 *   expect(cwv.lcp).toBeLessThan(2500);  // Good LCP threshold
 *   expect(cwv.cls).toBeLessThan(0.1);   // Good CLS threshold
 *
 * Note: FID requires user interaction — use INP (Interaction to Next Paint) for
 * automated measurement. This helper measures LCP, CLS, and TTFB reliably.
 * FID is returned as null unless explicit interaction triggers it.
 */
export async function measureCWV(page: Page): Promise<CWVResult> {
  return await page.evaluate(() => {
    return new Promise<CWVResult>((resolve) => {
      const result: CWVResult = { lcp: null, fid: null, cls: null, ttfb: null };

      // TTFB — available immediately from Navigation Timing API
      const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navEntry) {
        result.ttfb = navEntry.responseStart - navEntry.requestStart;
      }

      // LCP — observe until we get a stable value
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length > 0) {
          result.lcp = entries[entries.length - 1]!.startTime;
        }
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

      // CLS — accumulate layout shift scores
      let clsScore = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const layoutShift = entry as PerformanceEntry & { hadRecentInput: boolean; value: number };
          if (!layoutShift.hadRecentInput) {
            clsScore += layoutShift.value;
          }
        }
        result.cls = clsScore;
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });

      // Collect after a short stabilization period
      setTimeout(() => {
        lcpObserver.disconnect();
        clsObserver.disconnect();
        resolve(result);
      }, 3000);
    });
  });
}

/**
 * CWV thresholds per Google's "Good" classification.
 * Use with expect: expect(cwv.lcp).toBeLessThan(CWV_THRESHOLDS.lcp.good)
 */
export const CWV_THRESHOLDS = {
  lcp: { good: 2500, needsImprovement: 4000 },   // ms
  fid: { good: 100, needsImprovement: 300 },      // ms
  cls: { good: 0.1, needsImprovement: 0.25 },     // score
  ttfb: { good: 800, needsImprovement: 1800 },    // ms
} as const;

// ── Flaky Test Annotation ───────────────────────────
// Use the @flaky tag to mark tests with known intermittent failures.
// Quarantined tests run in a separate CI job and don't block the main pipeline.
//
// Protocol:
//   1. Test fails intermittently (3+ times in a week) → add @flaky tag
//   2. Huntress (stability monitor) tracks flake rate
//   3. Quarantined tests run in a separate "flaky" CI job
//   4. Fix the root cause → remove @flaky tag → test returns to main suite
//   5. If unfixable after 2 weeks → rewrite the test or demote to manual
//
// NEVER use @flaky to suppress real bugs. The test must pass consistently
// when the feature works correctly — flakiness comes from test infrastructure,
// timing, or external dependencies, not from product bugs.

/**
 * Mark a test as flaky with a tracking reason.
 *
 * Usage:
 *   test('payment flow completes', {
 *     tag: ['@flaky'],
 *     annotation: { type: 'flaky', description: 'Stripe webhook timing — tracking in #234' },
 *   }, async ({ page }) => { ... });
 *
 * In playwright.config.ts, separate flaky tests into their own project:
 *   projects: [
 *     { name: 'stable', grep: /^(?!.*@flaky)/, retries: 1 },
 *     { name: 'flaky', grep: /@flaky/, retries: 3 },
 *   ]
 */

// ── Example Tests ───────────────────────────────────
// These show the complete pattern for common E2E scenarios.

/*
// ── Example 1: Login flow with Page Object Model ───

import { test, expect } from './fixtures';
import { LoginPage, DashboardPage } from './fixtures';

test.describe('Authentication', () => {
  test('user can log in with valid credentials', async ({ page, expectAccessible }) => {
    const loginPage = new LoginPage(page);
    const dashboard = new DashboardPage(page);

    await loginPage.goto();
    await loginPage.login('user@example.com', 'password123');
    await dashboard.expectLoaded();

    // Every page gets a free a11y check
    await expectAccessible(page);
  });

  test('shows error on invalid credentials', async ({ page, expectAccessible }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.login('user@example.com', 'wrong-password');
    await loginPage.expectError(/invalid credentials/i);

    await expectAccessible(page);
  });
});

// ── Example 2: CRUD flow with network mocking ──────

import { test, expect, mockAPI } from './fixtures';

test.describe('Projects', () => {
  test('creates a project and sees it in the list', async ({ page, expectAccessible }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.createProject('My New Project');
    await dashboard.expectProjectVisible('My New Project');

    await expectAccessible(page);
  });

  test('handles API failure gracefully', async ({ page, expectAccessible }) => {
    // Mock the project creation endpoint to fail
    await mockAPI(page, '**/api/projects', {
      status: 500,
      body: { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } },
    });

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await page.getByRole('button', { name: /create|new project/i }).click();
    await page.getByLabel('Project name').fill('Doomed Project');
    await page.getByRole('button', { name: /create|save/i }).click();

    // Verify error state is shown — not a blank screen
    await expect(page.getByRole('alert')).toBeVisible();

    await expectAccessible(page);
  });
});

// ── Example 3: WebSocket real-time updates ──────────

import { test, expect, mockWebSocket } from './fixtures';

test('receives real-time notifications via WebSocket', async ({ page }) => {
  const ws = await mockWebSocket(page, /\/ws\/notifications/);

  await page.goto('/dashboard');

  // Server pushes a notification
  ws.send({ type: 'notification', title: 'Build complete', level: 'success' });

  // Verify it appears in the UI
  await expect(page.getByText('Build complete')).toBeVisible();

  ws.close();
});

// ── Example 4: CWV measurement (opt-in) ────────────

import { test, expect, measureCWV, CWV_THRESHOLDS } from './fixtures';

test('landing page meets CWV thresholds', async ({ page }) => {
  await page.goto('/');

  const cwv = await measureCWV(page);

  // These are aspirational — adjust thresholds to your project
  if (cwv.lcp !== null) {
    expect(cwv.lcp).toBeLessThan(CWV_THRESHOLDS.lcp.good);
  }
  if (cwv.cls !== null) {
    expect(cwv.cls).toBeLessThan(CWV_THRESHOLDS.cls.good);
  }
  if (cwv.ttfb !== null) {
    expect(cwv.ttfb).toBeLessThan(CWV_THRESHOLDS.ttfb.good);
  }
});
*/

// ── Playwright Config Reference ─────────────────────
// playwright.config.ts — adapt webServer.command to your framework.
//
// import { defineConfig, devices } from '@playwright/test';
//
// export default defineConfig({
//   testDir: './e2e',
//   forbidOnly: !!process.env.CI,
//   retries: 1,
//   reporter: process.env.CI ? 'github' : 'list',
//
//   use: {
//     baseURL: 'http://127.0.0.1:3199',
//     // Network isolation — block external requests in browser
//     launchOptions: {
//       args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'],
//     },
//     trace: 'on-first-retry',
//   },
//
//   projects: [
//     // Auth setup runs first, saves session state
//     { name: 'setup', testMatch: /auth\.setup\.ts/ },
//
//     // Stable tests use saved auth, retry once
//     {
//       name: 'stable',
//       dependencies: ['setup'],
//       use: { storageState: 'e2e/.auth/session.json' },
//       grep: /^(?!.*@flaky)/,
//       retries: 1,
//     },
//
//     // Flaky tests get more retries, don't block the pipeline
//     {
//       name: 'flaky',
//       dependencies: ['setup'],
//       use: { storageState: 'e2e/.auth/session.json' },
//       grep: /@flaky/,
//       retries: 3,
//     },
//   ],
//
//   // Framework-specific webServer commands:
//   webServer: {
//     // Next.js:  command: 'next dev -p 3199',
//     // Express:  command: 'PORT=3199 npx tsx src/server.ts',
//     // Django:   command: 'python manage.py runserver 3199 --settings=project.settings.test',
//     // Rails:    command: 'RAILS_ENV=test bin/rails server -p 3199',
//     command: 'PORT=3199 npx tsx src/server.ts',
//     port: 3199,
//     reuseExistingServer: !process.env.CI,
//     timeout: 30_000,
//   },
// });

// ── Setup Checklist ─────────────────────────────────
// When adding E2E tests to a project:
//
// - [ ] npm i -D @playwright/test @axe-core/playwright
// - [ ] npx playwright install chromium
// - [ ] Create playwright.config.ts (adapt webServer command)
// - [ ] Create e2e/fixtures.ts (copy axe fixture + auth helper from this pattern)
// - [ ] Create e2e/auth.setup.ts (login via API, save session)
// - [ ] Write first smoke test: page loads, no a11y violations
// - [ ] Add to CI: npx playwright test (separate job, max 2 min budget)
// - [ ] Add e2e/.auth/ to .gitignore
// - [ ] Add test-results/ and playwright-report/ to .gitignore
