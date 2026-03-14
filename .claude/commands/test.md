# /test — Batman's Test-Writing Mode

> Different from `/qa` (which finds bugs). `/test` writes and improves tests.

## Context Setup
1. Read `/logs/build-state.md` — understand current project state
2. Read `/docs/methods/QA_ENGINEER.md`
3. Read `/docs/methods/TESTING.md` — testing pyramid, patterns, framework mapping

## Step 0 — Orient (Oracle)
1. Detect: test framework, test runner, test directory structure, existing coverage
2. Run `npm test` to establish baseline — how many tests, how many pass, how many fail
3. Document in phase log: framework, runner, config, current state

## Step 1 — Coverage Analysis (Oracle + Alfred in parallel)
Use the Agent tool to run these in parallel:
- **Agent 1 (Oracle — Gap Analysis):** Scan all source files. For each service, API route, component, and utility, check: does a corresponding test file exist? What paths are tested? What paths are missing?
- **Agent 2 (Alfred — Test Infrastructure):** Review test config, fixtures, factories, mocks, test utilities. Are they well-organized? Is there a test database? Are there shared helpers?

Synthesize into a coverage map:

| Module | Type | Test File | Paths Covered | Paths Missing | Priority |
|--------|------|-----------|---------------|---------------|----------|

Priority: Critical path > User-facing > Internal > Utility

## Step 2 — Test Architecture (Nightwing)
Review existing tests for quality:
- Are tests testing behavior or implementation details?
- Are tests isolated (no test-order dependency)?
- Are assertions specific (not just "doesn't throw")?
- Are test names descriptive ("should reject expired tokens" not "test auth")?
- Is there appropriate use of the testing pyramid (unit > integration > e2e)?

Flag anti-patterns:
- Tests that always pass (testing nothing)
- Tests that test the framework, not the code
- Excessive mocking that hides real bugs
- Tests coupled to implementation details

## Step 3 — Write Missing Tests (Batman leads)
Write tests in priority order from Step 1. For each module:

1. **Unit tests** for pure business logic (services, utils, validators)
   - Happy path + edge cases + error cases
   - Follow patterns from `/docs/methods/TESTING.md`

2. **Integration tests** for API routes
   - Request validation (missing fields, wrong types, unauthorized)
   - Success path with response shape verification
   - Error responses (404, 403, 422, 500)

3. **Component tests** for UI (if applicable)
   - All four states: loading, empty, error, success
   - User interactions (click, type, submit)
   - Keyboard navigation

Work in small batches — write tests for one module, run `npm test`, verify they pass, then move to the next.

## Step 4 — Hardening (Red Hood)
Red Hood writes adversarial tests:
- Boundary values (0, -1, MAX_INT, empty string, null, undefined)
- Unicode and special characters in all string inputs
- Concurrent operations (race conditions, double-submit)
- Large payloads (100MB upload, 10K item list)
- Missing/malformed auth tokens

## Step 5 — Verify Suite
1. Run full test suite: `npm test`
2. All tests pass (fix any that don't)
3. No flaky tests (run suite 3x if suspicious)
4. Tests run in < 60 seconds (flag slow tests)
5. Update `/docs/qa-prompt.md` with new test coverage state

## Deliverables
1. New and improved test files
2. Test utilities/helpers/fixtures (if created)
3. Updated coverage map in phase log
4. List of remaining gaps (backlog)

## Handoffs
- Security test gaps → Kenobi (`/security`)
- UI test gaps → Galadriel (`/ux`)
- Infrastructure test issues → Kusanagi (`/devops`)

Log all handoffs to `/logs/handoffs.md`.
