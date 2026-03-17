# /qa — Batman's QA Pass

## Context Setup
1. Read `/logs/build-state.md` — understand current project state
2. Read `/docs/methods/QA_ENGINEER.md`
3. Read `/docs/methods/TESTING.md` (Testing Pyramid + Running Tests sections)
4. Read `/docs/LESSONS.md` — check for QA-relevant lessons (antipatterns, gotchas, prior misses). Flag matches during analysis.

## Step 0 — Orient
1. Create or update `/docs/qa-prompt.md` with: stack, framework, how to run, how to validate
2. Create `/logs/phase-09-qa-audit.md` (or appropriate phase log)

## Step 1 — Attack Plan
**Green Lantern** generates the test matrix first — what inputs × what states × what conditions should be tested. Then assign targets:
- **Oracle (static):** Critical flows, missing awaits, null checks, type mismatches, race conditions
- **Red Hood (dynamic):** Empty/huge/unicode inputs, network failures, malformed JSON, rapid clicking
- **Alfred (deps):** `npm audit`, outdated libs, deprecated APIs, version conflicts
- **Lucius (config):** .env completeness, secrets not in git, prod vs dev mismatches
- **Deathstroke (adversarial):** Penetration-style probing — bypass validations, chain interactions, exploit business logic
- **Constantine (cursed code):** Unreachable branches, dead state, impossible conditions, logic that works by accident
- **Cyborg (integration):** When 3+ modules connect, trace the full data path across boundaries. Missing imports, inconsistent response shapes, broken cross-module flows.
- **Raven (deep analysis):** Bugs hidden beneath 3 layers of abstraction — follows data through transforms, closures, callbacks. Logic correct per function, wrong in composition.
- **Wonder Woman (truth):** Code that says one thing and does another — misleading names, wrong comments, stale docs, functions that don't match their behavior.

## Step 2 — Baseline
Get the project running. Verify manually: app starts, primary flow works, auth works (if applicable), data persists, error states display.

## Step 2.5 — Smoke Tests (**Flash** speed-runs these)
After build + restart, **Flash** parallelizes curl commands against the running server for each new or modified feature:
- **Primary user flow:** Execute via curl/fetch against localhost — verify the end-to-end path works
- **File uploads:** Upload a file, then fetch the returned URL and verify HTTP 200 + correct content-type
- **Form submissions:** Submit valid data (verify 200), then submit invalid/duplicate data (verify error message is specific, not generic)
- **Real-time features:** Trigger the polling/SSE and verify at least one successful response cycle
- **Cross-module paths:** If code writes with key prefix X, verify the serving endpoint accepts prefix X

This catches integration failures that static code review misses. If the server isn't running or can't be tested this way, document what couldn't be smoke-tested.

## Step 3 — Pass 1: Find Bugs (parallel analysis)
Use the Agent tool to run these in parallel — these are read-only analysis tasks:
- **Agent 1 (Oracle):** Scan /src/lib/ and /src/app/ for logic flaws, missing awaits, unsafe assumptions
- **Agent 2 (Red Hood):** Test all API endpoints with malformed inputs, empty bodies, missing auth
- **Agent 3 (Alfred):** Run `npm audit`, check package.json for deprecated/vulnerable packages
- **Agent 4 (Deathstroke):** Adversarial probing — bypass validations, chain unexpected interactions, test authorization boundaries
- **Agent 5 (Constantine):** Hunt cursed code — dead branches, impossible conditions, accidental correctness, shadowed variables
- **Agent 6 (Batgirl):** Deep per-module audit — every edge of every form, every boundary of every validation, every regex. Not broad — *thorough*.
- **Agent 7 (Aquaman):** Deep dive on the hardest/largest module (500+ lines or 10+ functions). Exhaustive testing of one complex area.

Synthesize findings from all agents into a unified list.

Lucius reviews config separately (reads .env files — sensitive, don't delegate to sub-agent).

## Step 3.5 — Automated Tests
Run `npm test`. Analyze failures. Cross-reference with findings from Step 3. **Huntress** identifies flaky/non-deterministic tests — race conditions, timing dependencies, order-dependent assertions. For every bug found, ask: "Can this be caught by an automated test?" If yes, write the test.

## Step 4 — Bug Tracker
Log all findings in this format in the phase log:

| ID | Title | Severity | Area | Repro Steps | Root Cause | Fix | Verified | Risk |
|----|-------|----------|------|-------------|-----------|-----|----------|------|

Severity: Critical (security/data loss) > High (broken flow) > Medium (degraded) > Low (cosmetic)

## Step 5 — Fix (small batches — **Green Arrow** pinpoints exact lines)
One batch = fixes for one area or severity level. **Green Arrow** narrows vague findings to exact lines and conditions. After each batch:
1. Re-run `npm test`
2. Re-verify affected manual flows
3. Update bug tracker in phase log
4. Add new test for each fix where applicable

## Step 6 — Harden (**Superman** enforces standards)
Normalize error handling (reference `/docs/patterns/error-handling.ts`). Add guardrails. Improve structured logging. **Superman** verifies the codebase meets its own stated standards — linting clean, type-safe, naming conventions consistent, no unresolved TODOs.

## Step 6.5 — Pass 2: Re-Verify Fixes
After all fixes are applied, run a verification pass:
- **Nightwing** re-runs full test suite, reports any new failures
- **Red Hood** re-probes fixed areas — verify fixes hold under adversarial input
- **Deathstroke** re-tests authorization boundaries and business logic exploits that were remediated

If Pass 2 finds new issues, fix and re-verify until clean.

## Step 7 — Regression Checklist
Nightwing builds the checklist. Template:

| # | Flow | Steps | Expected | Status |
|---|------|-------|----------|--------|
| 1 | User signup | Go to /signup, fill form, submit | Account created, redirect to dashboard | Pass |
| 2 | Create project | Click "New Project", fill name, submit | Project appears in list | Pass |

Store in `/docs/qa-prompt.md` under "Regression Checklist" section.

## Step 8 — Deliverables
1. Bug tracker (in phase log)
2. Code fixes + new tests
3. Updated `/docs/qa-prompt.md` with regression checklist
4. Release note summary in phase log

## Handoffs
- Security findings → Kenobi (`/security`)
- Architecture issues → Picard (`/architect`)
- Infrastructure issues → Kusanagi (`/devops`)
- UX issues → Galadriel (`/ux`)

Log all handoffs to `/logs/handoffs.md`.
