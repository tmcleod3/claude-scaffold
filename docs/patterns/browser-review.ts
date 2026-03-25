/**
 * Pattern: Browser-Based Agent Review
 *
 * Purpose: Give review agents (Batman, Galadriel, Kenobi, Thanos) browser eyes
 * during ad-hoc review passes. NOT E2E testing (see e2e-test.ts for that).
 *
 * E2E tests vs browser review — separate concerns:
 *   - E2E tests: deterministic, CI, assert pass/fail. Owned by test suites.
 *   - Browser review: exploratory, during /qa /ux /security /gauntlet. Evidence for triage.
 *
 * Three capabilities:
 *   1. Console capture — catch uncaught exceptions and JS errors passively.
 *   2. Behavioral walkthrough — click buttons, fill forms, verify responses.
 *   3. Screenshot evidence — capture viewport state for triage reports.
 *
 * Screenshots: good for triage (blank page? modal open?) and evidence (attach to findings).
 * NOT good for design review. Riker's dissent: "A screenshot tells you what rendered, not
 * whether it looks right. Design review requires a designer's eye, not a pixel grid."
 *
 * Agents: Batman (QA walkthrough), Galadriel (responsive), Kenobi (security),
 *   Hawkeye (Gauntlet smoke), Riker (dissent on screenshot-as-design-review)
 *
 * === Framework Adaptations (baseURL + startup) ===
 *   Next.js:  `next dev -p 3199`, baseURL = 'http://127.0.0.1:3199'
 *   Express:  `PORT=3199 npx tsx src/server.ts`, same baseURL
 *   Django:   `python manage.py runserver 3199 --settings=project.settings.test`
 *   Rails:    `RAILS_ENV=test bin/rails server -p 3199`
 *   All: start the dev server BEFORE calling launchReviewBrowser(). The review
 *   browser connects to a running server — it does NOT manage the lifecycle.
 *
 * Dependencies: playwright (already available if using e2e-test.ts)
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
// Type-only import for axe — actual usage is dynamic import (not all projects have it)
type AxeResults = { violations: Array<{ id: string; impact?: string; description: string; nodes: unknown[] }> };

// ── Types ───────────────────────────────────────────

export interface ConsoleError {
  url: string;
  type: 'uncaught-exception' | 'console-error';
  message: string;
  stack: string | null;
}

export interface PageStateReport {
  route: string;
  title: string;
  headings: string[];
  screenshotPath: string;
  consoleErrors: ConsoleError[];
  a11yViolations: Array<{ id: string; impact: string | undefined; description: string; nodeCount: number }>;
}

export interface ViewportCapture {
  viewport: { width: number; height: number; label: string };
  screenshotPath: string;
  consoleErrors: ConsoleError[];
}

export interface ResponsiveReport { route: string; captures: ViewportCapture[] }

export interface InteractionReport {
  route: string;
  buttons: Array<{ text: string; responded: boolean; error: string | null }>;
  links: Array<{ text: string; href: string | null }>;
  formFields: Array<{ label: string; type: string; acceptedInput: boolean; validationMessage: string | null }>;
}

export interface CookieReport {
  cookies: Array<{ name: string; domain: string; secure: boolean; httpOnly: boolean; sameSite: string; expires: number }>;
  findings: string[];
}

export interface CORSReport {
  url: string;
  allowOrigin: string | null;
  allowCredentials: string | null;
  allowMethods: string | null;
  allowHeaders: string | null;
  findings: string[];
}

export interface CSPViolation { blockedURI: string; violatedDirective: string; originalPolicy: string }

// ── Review Browser Launcher ─────────────────────────
// Network-isolated Chromium. Fixed viewport (1440x900, 1x DPI, light mode).

export async function launchReviewBrowser(baseURL: string): Promise<{
  browser: Browser; context: BrowserContext; page: Page;
}> {
  const browser = await chromium.launch({
    args: [
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', // Block external DNS
      '--disable-extensions',
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    baseURL,
  });
  const page = await context.newPage();
  return { browser, context, page };
}

// ── Console Error Capture ───────────────────────────
// pageerror = uncaught exception (always a finding).
// console.error = filtered for noise (React dev, HMR, extensions).

const CONSOLE_NOISE: RegExp[] = [
  /Download the React DevTools/i, /Warning: ReactDOM/i,
  /Warning: Each child in a list/i, /\[HMR\]/i, /\[vite\]/i,
  /webpack.*hot/i, /chrome-extension:\/\//i, /moz-extension:\/\//i,
  /Failed to load resource.*favicon/i,
];

export function attachConsoleCapture(page: Page): {
  errors: ConsoleError[]; getErrors: () => ConsoleError[];
} {
  const errors: ConsoleError[] = [];
  page.on('pageerror', (error) => {
    errors.push({ url: page.url(), type: 'uncaught-exception', message: error.message, stack: error.stack ?? null });
  });
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (CONSOLE_NOISE.some((p) => p.test(text))) return;
    errors.push({ url: page.url(), type: 'console-error', message: text, stack: null });
  });
  return { errors, getErrors: () => [...errors] };
}

// ── Page State Capture ──────────────────────────────
// Navigate, wait for ready, screenshot, headings, a11y. The workhorse.

export async function capturePageState(
  page: Page, route: string,
  options?: { readySelector?: string; screenshotDir?: string; runA11y?: boolean }
): Promise<PageStateReport> {
  const readySelector = options?.readySelector ?? '[data-ready]';
  const screenshotDir = options?.screenshotDir ?? 'review-captures';
  const runA11y = options?.runA11y ?? true;

  await page.goto(route);
  // Wait for ready selector; fall back to networkidle (lenient for review, not E2E)
  try { await page.waitForSelector(readySelector, { timeout: 3000 }); }
  catch { await page.waitForLoadState('networkidle'); }

  const slug = route.replace(/\//g, '-').replace(/^-/, '') || 'index';
  const screenshotPath = `${screenshotDir}/${slug}.jpg`;
  await page.screenshot({ path: screenshotPath, type: 'jpeg', quality: 80 });

  const title = await page.title();
  const headings = await page.locator('h1, h2, h3').allTextContents();

  // a11y scan — dynamic import so pattern doesn't hard-depend on axe
  let a11yViolations: PageStateReport['a11yViolations'] = [];
  if (runA11y) {
    try {
      const { default: Builder } = await import('@axe-core/playwright');
      const results: AxeResults = await new (Builder as unknown as new (opts: { page: Page }) => { analyze: () => Promise<AxeResults> })({ page }).analyze();
      a11yViolations = results.violations.map((v) => ({
        id: v.id, impact: v.impact, description: v.description, nodeCount: v.nodes.length,
      }));
    } catch { /* axe not installed — skip */ }
  }

  return { route, title, headings, screenshotPath, consoleErrors: [], a11yViolations };
}

// ── Responsive Capture ──────────────────────────────
// Three viewports: mobile (375x812), tablet (768x1024), desktop (1440x900).

const VIEWPORTS = [
  { width: 375, height: 812, label: 'mobile' },
  { width: 768, height: 1024, label: 'tablet' },
  { width: 1440, height: 900, label: 'desktop' },
] as const;

export async function captureResponsiveSet(
  page: Page, route: string, options?: { screenshotDir?: string }
): Promise<ResponsiveReport> {
  const screenshotDir = options?.screenshotDir ?? 'review-captures';
  const captures: ViewportCapture[] = [];
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const capture = attachConsoleCapture(page);
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    const slug = route.replace(/\//g, '-').replace(/^-/, '') || 'index';
    const path = `${screenshotDir}/${slug}-${vp.label}.jpg`;
    await page.screenshot({ path, type: 'jpeg', quality: 80 });
    captures.push({ viewport: { width: vp.width, height: vp.height, label: vp.label }, screenshotPath: path, consoleErrors: capture.getErrors() });
  }
  await page.setViewportSize({ width: 1440, height: 900 }); // Restore default
  return { route, captures };
}

// ── Behavioral Walkthrough ──────────────────────────
// Click everything, fill every form, see what breaks. Exploratory, not deterministic.

export async function walkInteractiveElements(page: Page): Promise<InteractionReport> {
  const route = page.url();
  const buttons: InteractionReport['buttons'] = [];
  const btnLocators = page.locator('button:visible, [role="button"]:visible, [role="tab"]:visible');
  for (let i = 0; i < await btnLocators.count(); i++) {
    const btn = btnLocators.nth(i);
    const text = ((await btn.textContent()) ?? '[no text]').trim();
    const before = await page.content();
    try {
      await btn.click({ timeout: 2000 });
      await page.waitForTimeout(500); // Brief wait for async response
      buttons.push({ text, responded: (await page.content()) !== before, error: null });
    } catch (err) { buttons.push({ text, responded: false, error: String(err) }); }
  }

  const links: InteractionReport['links'] = [];
  const linkLocators = page.locator('a:visible');
  for (let i = 0; i < await linkLocators.count(); i++) {
    const link = linkLocators.nth(i);
    links.push({ text: ((await link.textContent()) ?? '').trim(), href: await link.getAttribute('href') });
  }

  const formFields: InteractionReport['formFields'] = [];
  const inputs = page.locator('input:visible, textarea:visible, select:visible');
  for (let i = 0; i < await inputs.count(); i++) {
    const input = inputs.nth(i);
    const label = (await input.getAttribute('aria-label')) ?? (await input.getAttribute('placeholder'))
      ?? (await input.getAttribute('name')) ?? '[unlabeled]';
    const type = (await input.getAttribute('type')) ?? 'text';
    try {
      await input.fill('test-review-input');
      await input.blur();
      const msg = await input.evaluate((el) => (el as HTMLInputElement).validationMessage || null);
      formFields.push({ label, type, acceptedInput: true, validationMessage: msg });
    } catch (err) { formFields.push({ label, type, acceptedInput: false, validationMessage: String(err) }); }
  }
  return { route, buttons, links, formFields };
}

// ── Security Inspection ─────────────────────────────
// Kenobi's toolkit: cookies, CORS, CSP. Runtime security inspection.

export async function inspectCookies(context: BrowserContext): Promise<CookieReport> {
  const raw = await context.cookies();
  const findings: string[] = [];
  const cookies = raw.map((c) => {
    if (!c.secure) findings.push(`Cookie "${c.name}" missing Secure flag`);
    if (!c.httpOnly && /sess|token|auth/i.test(c.name)) findings.push(`Session cookie "${c.name}" missing HttpOnly`);
    if (c.sameSite === 'None' && !c.secure) findings.push(`Cookie "${c.name}" SameSite=None without Secure`);
    if (c.expires === -1 && /sess|token|auth/i.test(c.name)) findings.push(`Session cookie "${c.name}" no expiry`);
    return { name: c.name, domain: c.domain, secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite, expires: c.expires };
  });
  return { cookies, findings };
}

export async function captureCORSHeaders(page: Page, apiPattern: string): Promise<CORSReport> {
  const report: CORSReport = { url: apiPattern, allowOrigin: null, allowCredentials: null, allowMethods: null, allowHeaders: null, findings: [] };
  const respPromise = page.waitForResponse((r) => r.url().includes(apiPattern), { timeout: 5000 }).catch(() => null);
  await page.evaluate(async (p) => { try { await fetch(p, { method: 'OPTIONS', mode: 'cors' }); } catch { /* expected */ } }, apiPattern);
  const resp = await respPromise;
  if (resp) {
    const h = resp.headers();
    report.allowOrigin = h['access-control-allow-origin'] ?? null;
    report.allowCredentials = h['access-control-allow-credentials'] ?? null;
    report.allowMethods = h['access-control-allow-methods'] ?? null;
    report.allowHeaders = h['access-control-allow-headers'] ?? null;
  }
  if (report.allowOrigin === '*') report.findings.push('CORS allows all origins (*)');
  if (report.allowOrigin === '*' && report.allowCredentials === 'true') report.findings.push('CRITICAL: Wildcard origin + credentials');
  if (report.allowMethods?.includes('*')) report.findings.push('CORS allows all methods');
  return report;
}

export async function captureCSPViolations(page: Page): Promise<CSPViolation[]> {
  // Inject listener BEFORE navigating — call this, then goto(), then read violations
  await page.addInitScript(() => {
    const v: Array<{ blockedURI: string; violatedDirective: string; originalPolicy: string }> = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      v.push({ blockedURI: e.blockedURI, violatedDirective: e.violatedDirective, originalPolicy: e.originalPolicy });
    });
    Object.defineProperty(window, '__cspViolations', { get: () => v, configurable: true });
  });
  // Read accumulated violations (call after navigation)
  return page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    return (w.__cspViolations as CSPViolation[] | undefined) ?? [];
  });
}
