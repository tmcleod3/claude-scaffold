# TESTING PROTOCOL
## Lead Agent: **Batman** · Sub-agent: **Nightwing** (Regression Guardian)

> *"The test suite is your silent guardian."*

## Purpose

Automated tests catch regressions that manual checklists miss. Manual verification catches UX and integration issues that automated tests miss. Use both. Neither replaces the other.

## Testing Pyramid

```
         /  E2E  \          ← Few: critical user journeys only
        / Integration \      ← Some: API routes, service interactions
       /    Unit Tests   \   ← Many: business logic, utils, transforms
```

## Framework-to-Test-Runner Mapping

| Framework | Unit Tests | Integration Tests | E2E | Assertion |
|-----------|-----------|------------------|-----|-----------|
| Next.js / Node | vitest or jest | vitest + supertest | Playwright | expect (vitest/jest) |
| Express | vitest or jest | vitest + supertest | Playwright | expect (vitest/jest) |
| Django | pytest | pytest + Django test client | Playwright | assert (pytest) |
| Rails | RSpec or Minitest | RSpec + request specs | Playwright | expect (RSpec) |
| Go | testing (stdlib) | testing + httptest | Playwright | testify |
| Spring Boot | JUnit 5 | JUnit 5 + MockMvc | Playwright | AssertJ |

Adapt the patterns below to your stack's test runner. The principles (test behavior not implementation, deterministic, co-located) are universal.

## When to Write Which

| Code Type | Test Type | Tool | Coverage Target |
|-----------|-----------|------|----------------|
| Pure functions, utils, transforms | Unit | vitest / jest | High — these are cheap to test |
| Service layer (business logic) | Unit | vitest / jest | High — core value lives here |
| API routes | Integration | vitest / supertest | All routes — validate input/output contracts |
| Database queries | Integration | vitest + test DB | Complex queries, edge cases |
| Auth flows | Integration | vitest / supertest | All auth paths including failures |
| Full user journeys | E2E / Manual | Playwright or manual | Top 3-5 critical paths only |
| UI components | Manual | Browser | Visual, interaction, responsive, a11y |
| Edge cases, broken states | Manual | Browser | Red Hood's domain — break it on purpose |

## Unit Test Rules

1. Test behavior, not implementation. Assert outcomes, not internals.
2. One assertion concept per test. Name describes what's being verified.
3. No mocking unless the dependency is external (API, DB, filesystem).
4. Use factories for test data, not raw objects scattered across files.
5. Tests must be deterministic — no time-dependent, order-dependent, or network-dependent tests.

### Pattern

```typescript
// services/__tests__/billing.test.ts
import { describe, it, expect } from 'vitest'
import { calculateProration } from '../billing'

describe('calculateProration', () => {
  it('returns zero when upgrade happens on billing date', () => {
    const result = calculateProration({
      currentPlan: 'basic',
      newPlan: 'pro',
      billingDate: new Date('2026-03-01'),
      upgradeDate: new Date('2026-03-01'),
    })
    expect(result.amount).toBe(0)
  })

  it('prorates proportionally for mid-cycle upgrade', () => {
    const result = calculateProration({
      currentPlan: 'basic',
      newPlan: 'pro',
      billingDate: new Date('2026-03-01'),
      upgradeDate: new Date('2026-03-15'),
    })
    expect(result.amount).toBeGreaterThan(0)
    expect(result.daysRemaining).toBe(16)
  })
})
```

## Integration Test Rules

1. Use a real test database (SQLite in-memory or Docker Postgres).
2. Reset state between tests (transactions or truncation).
3. Test the full request/response cycle for API routes.
4. Validate response shape, status codes, and error formats.
5. Test auth: authenticated, unauthenticated, wrong role, wrong owner.
6. **Validation constraint smoke test:** For each model with validation constraints (Pydantic `Field`, Zod schema, Joi, class-validator decorators), write at least one test that sends invalid input and verifies rejection. Frameworks may silently ignore constraints on incompatible types (e.g., Pydantic v2 ignores `max_length` on dict). The test catches this. (Field report #99: `max_length=50` on a dict field was silently ignored — no size validation occurred.)
7. **Route integration test mandate:** For each API route, at least one test must exercise the full HTTP → handler → service → response path. Unit tests on service functions are not sufficient — they miss middleware, auth guards, request parsing, and response formatting. A route with no integration test is an untested route. (Field report #119: zero integration tests across 278 unit tests — route-level regressions were invisible.)

### Pattern

```typescript
// api/__tests__/projects.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestApp, createTestUser } from '../test-utils'

describe('POST /api/projects', () => {
  let app: TestApp
  let user: TestUser

  beforeEach(async () => {
    app = await createTestApp()
    user = await createTestUser(app)
  })

  it('creates project for authenticated user', async () => {
    const res = await app.post('/api/projects')
      .auth(user.token)
      .send({ name: 'Test Project' })

    expect(res.status).toBe(201)
    expect(res.body.project.name).toBe('Test Project')
    expect(res.body.project.ownerId).toBe(user.id)
  })

  it('rejects unauthenticated request', async () => {
    const res = await app.post('/api/projects')
      .send({ name: 'Test Project' })

    expect(res.status).toBe(401)
  })

  it('validates input', async () => {
    const res = await app.post('/api/projects')
      .auth(user.token)
      .send({ name: '' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})
```

## E2E Testing

E2E tests sit at the top of the testing pyramid. They're slow, expensive, and brittle compared to unit tests — but they catch integration failures that nothing else can. A unit test verifies that `calculateTotal()` returns the right number; an E2E test verifies that the user can actually complete a purchase.

### Where E2E Fits

```
         /  E2E  \          ← 10-15 tests. Critical user journeys ONLY.
        / Integration \      ← API routes, service interactions, auth flows
       /    Unit Tests   \   ← Business logic, utils, transforms, edge cases
```

**Write E2E when:**
- Testing critical user journeys (signup, purchase, core workflow)
- Verifying a11y across real page compositions (axe-core in browser)
- Testing cross-component flows where integration tests can't reach (navigation, redirects, auth state persistence)
- Validating real browser behavior (CSP headers, cookie handling, responsive layout)

**Write unit/integration instead when:**
- Testing business logic, calculations, or data transforms
- Testing API input validation and error handling
- Testing edge cases and boundary conditions
- Testing isolated component behavior

### Performance Budget

| Metric | Limit | Action if Exceeded |
|--------|-------|--------------------|
| Total CI time | 2 minutes | Shard tests across workers |
| Test count | 50 | Shard or prune — you're testing too many paths |
| Single test duration | 30 seconds | Split into smaller focused tests |
| Retry rate | < 5% per week | Fix or quarantine flaky tests |

Sharding in CI (when you hit 50+ tests):
```yaml
# GitHub Actions example
strategy:
  matrix:
    shard: [1/3, 2/3, 3/3]
steps:
  - run: npx playwright test --shard=${{ matrix.shard }}
```

### Flaky Test Protocol

Flaky tests erode trust in the test suite. Huntress (stability monitor) tracks flake rates.

1. **Detection:** Test fails intermittently — passes on retry but fails on fresh runs
2. **Annotation:** After 3 flakes in a week, add `@flaky` tag with a tracking issue
3. **Quarantine:** Flaky tests run in a separate CI job (`grep: /@flaky/`) with 3 retries
4. **Investigation:** Root-cause the flakiness — usually timing, external state, or test ordering
5. **Resolution:** Fix within 2 weeks or rewrite. If unfixable, demote to manual verification
6. **Return:** Remove `@flaky` tag — test returns to the stable suite

```typescript
// Annotating a flaky test
test('payment webhook processes correctly', {
  tag: ['@flaky'],
  annotation: { type: 'flaky', description: 'Webhook timing race — tracking in #234' },
}, async ({ page }) => {
  // test body
});
```

**Rules:**
- NEVER use `@flaky` to suppress real bugs
- NEVER use `page.waitForTimeout()` — it's the #1 cause of flakiness
- NEVER use `waitForLoadState('networkidle')` — it's non-deterministic
- ALWAYS use explicit waits: `await expect(locator).toBeVisible()`

### Framework-to-Test-Runner Mapping (E2E Column)

| Framework | Unit | Integration | E2E Runner | E2E Start Command |
|-----------|------|-------------|------------|-------------------|
| Next.js / Node | vitest or jest | vitest + supertest | Playwright | `next dev -p 3199` |
| Express | vitest or jest | vitest + supertest | Playwright | `PORT=3199 npx tsx src/server.ts` |
| Django | pytest | pytest + Django client | Playwright | `python manage.py runserver 3199` |
| Rails | RSpec / Minitest | RSpec + request specs | Playwright | `RAILS_ENV=test bin/rails server -p 3199` |
| Go | testing (stdlib) | testing + httptest | Playwright | `PORT=3199 go run ./cmd/server` |
| Spring Boot | JUnit 5 | JUnit 5 + MockMvc | Playwright | `./gradlew bootRun --args='--server.port=3199'` |

### PRD Frontmatter

Add `e2e: yes | no` to PRD frontmatter. Defaults:
- `yes` — full-stack, static-site (has pages to test)
- `no` — api-only, prototype (no browser UI, or too early)

The Build Protocol reads this flag to decide whether Phase 10 (E2E tests) runs.

### E2E Test File Conventions

```
e2e/
  fixtures.ts             ← axe-core fixture, auth helper, network mocks
  auth.setup.ts           ← Login via API, save session state
  smoke.test.ts           ← Page loads, no crashes, a11y clean
  auth.test.ts            ← Login/logout/session persistence
  [feature].test.ts       ← One file per critical journey
  page-objects/
    login.page.ts         ← Page Object Model classes
    dashboard.page.ts
  .auth/
    session.json          ← Saved auth state (gitignored)
```

### Reference Pattern

See `/docs/patterns/e2e-test.ts` for the complete reference implementation:
- Page Object Model example
- axe-core a11y fixture
- Auth helper (login via API, reuse session)
- Network mock (intercept external API calls)
- WebSocket mock
- CWV measurement helper
- Flaky test annotation pattern
- Framework-specific Playwright config

## Testing Anti-Patterns

**No hardcoded dates:** Never use hardcoded dates in tests. Use relative datetime (e.g., `new Date(Date.now() - 86400000)` for 'yesterday'). A test with `expect(date).toBe('2026-03-15')` becomes a time bomb that fails when the date passes.

**Mock signature verification:** When mocking external dependencies, verify the mocked methods exist on the real class. A mock that defines `sendMessage()` when the real SDK uses `send_message()` creates false confidence — tests pass but the integration fails. Pattern: `expect(Object.keys(mock)).toEqual(expect.arrayContaining(Object.keys(realInstance)))`.

## What NOT to Test Automatically

- Visual appearance (manual — Arwen's domain)
- "Does this feel right?" UX flows (manual — Elrond's domain)
- Performance under real conditions (manual — Fury/Gimli's domain)
- Third-party service behavior (mock it, don't call it)
- Implementation details that could change without affecting behavior

## Test File Conventions

```
src/
  services/
    billing.ts
    __tests__/
      billing.test.ts         ← Unit tests co-located
  api/
    projects/
      route.ts
    __tests__/
      projects.test.ts        ← Integration tests co-located
  test-utils/
    index.ts                  ← Shared factories, helpers, test app setup
```

## Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Watch mode during development
npm run test:watch

# Coverage report
npm run test:coverage
```

## Regression Strategy

Automated tests are the **first line** of regression defense. The manual regression checklist in `/docs/qa-prompt.md` is the **second line** — it catches integration and UX regressions that tests can't.

When Nightwing adds a regression checklist item, also ask: "Can this be an automated test?" If yes, write the test AND add the checklist item. The test runs on every change; the checklist runs on QA passes.

## Relationship to QA_ENGINEER.md

Batman's QA protocol now includes automated testing as Step 3.5 (between "Find Bugs" and "Bug Tracker"). The sequence:

1. Oracle scans statically
2. Red Hood breaks dynamically
3. Alfred reviews dependencies
4. Lucius reviews config
5. **Nightwing runs the test suite and reports failures**
6. All findings go into the bug tracker
7. Fixes include new tests to prevent regression

### Test Schema vs. Production Schema
Verify test fixtures (conftest, factories, seed files) create ALL tables from the migration runner. Compare table lists between the test DB setup and the production schema — any table present in migrations but missing from test fixtures is a gap that causes silent test failures. This is especially critical when using a hardcoded migration list instead of the actual migration runner.
(Field report #21: conftest missed tables from later migrations — ALTER TABLE on non-existent table was silently caught.)

### Database Fixtures — Use the Production Schema

Always use the test framework's shared database fixture (e.g., conftest `db` fixture) for store and service tests. It applies the full production schema + all migrations.

Do NOT create custom DDL in test files — it drifts from the real schema (missing NOT NULL constraints, columns added by later migrations, different defaults). If you need tables the shared fixture doesn't have, add them AFTER the fixture yields — don't replace it.

Custom DDL causes test DB schema mismatches that require 2-3 fix-and-retry cycles per occurrence. (Field report #31)

## Setup Checklist

When setting up testing for a new project:

- [ ] Install test runner (`npm i -D vitest` or `jest`)
- [ ] Add test scripts to `package.json`
- [ ] Create `test-utils/` with app setup and factories
- [ ] Configure test database (if applicable)
- [ ] Write first test for the most critical service function
- [ ] Write first integration test for the most important API route
- [ ] Verify `npm test` passes in CI-equivalent conditions
- [ ] **E2E (if PRD `e2e: yes`):** Install Playwright (`npm i -D @playwright/test @axe-core/playwright`)
- [ ] **E2E:** Install browser (`npx playwright install chromium`)
- [ ] **E2E:** Create `playwright.config.ts` with framework-appropriate `webServer.command`
- [ ] **E2E:** Create `e2e/fixtures.ts` with axe-core fixture and auth helper
- [ ] **E2E:** Write first smoke test — page loads, no a11y violations
- [ ] **E2E:** Add `e2e/.auth/`, `test-results/`, `playwright-report/` to `.gitignore`
- [ ] **E2E:** Verify `npx playwright test` passes in CI-equivalent conditions (< 2 min)
