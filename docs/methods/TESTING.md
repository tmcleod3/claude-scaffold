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

## Setup Checklist

When setting up testing for a new project:

- [ ] Install test runner (`npm i -D vitest` or `jest`)
- [ ] Add test scripts to `package.json`
- [ ] Create `test-utils/` with app setup and factories
- [ ] Configure test database (if applicable)
- [ ] Write first test for the most critical service function
- [ ] Write first integration test for the most important API route
- [ ] Verify `npm test` passes in CI-equivalent conditions
