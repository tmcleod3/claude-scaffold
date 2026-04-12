# /qa — Batman's QA Pass

**AGENT DEPLOYMENT IS MANDATORY.** Step 3 specifies parallel agent launches via the Agent tool. You MUST launch Oracle, Red Hood, Alfred, Deathstroke, Constantine, Cyborg, Raven, Wonder Woman, Batgirl, and Aquaman as separate sub-processes — do NOT shortcut to inline analysis. (Field report #68)

## Dynamic Dispatch (ADR-044)

Opus scans `git diff --stat` and matches changed files against the `description` fields of all agents in `.claude/agents/`. Matching specialists launch alongside the core agents below.

**Dispatch control:** `--light` skips dynamic dispatch (core only). `--solo` runs lead agent only.

**Promoted agent:** **Constantine** `subagent_type: Constantine` runs on every `/qa` final pass — finds code that works by accident.

## Silver Surfer Pre-Scan (ADR-048)

Before agent deployment, the Silver Surfer selects the optimal roster:

Run: `npx thevoidforge herald --command /qa --json`
(Add `--focus "<topic>"` if the user provided `--focus`)

Parse the JSON output. The `roster` array contains agent IDs to deploy alongside this command's lead agents. If the command fails or returns an empty roster, use the hardcoded manifest below.

**`--focus "topic"`** biases the Surfer toward agents matching the topic.
**`--light`** skips the Surfer — uses only hardcoded core roster.
**`--solo`** skips Surfer and all sub-agents — lead only.

## Context Setup
1. Read `/logs/build-state.md` — understand current project state
2. Read `/docs/methods/QA_ENGINEER.md`
3. Read `/docs/methods/TESTING.md` (Testing Pyramid + Running Tests sections)
4. Read `/docs/LESSONS.md` — check for QA-relevant lessons (antipatterns, gotchas, prior misses). Flag matches during analysis.

## Step 0 — Orient
1. Create or update `/docs/qa-prompt.md` with: stack, framework, how to run, how to validate
2. Create `/logs/phase-09-qa-audit.md` (or appropriate phase log)

## Step 1 — Attack Plan
**Green Lantern** `subagent_type: Green Lantern` generates the test matrix first — what inputs x what states x what conditions should be tested. Then assign targets:
- **Oracle** `subagent_type: Oracle` — Static: critical flows, missing awaits, null checks, type mismatches, race conditions.
- **Red Hood** `subagent_type: Red Hood` — Dynamic: empty/huge/unicode inputs, network failures, malformed JSON, rapid clicking.
- **Alfred** `subagent_type: Alfred` — Dependencies: `npm audit`, outdated libs, deprecated APIs, version conflicts.
- **Lucius** `subagent_type: Lucius` — Config: .env completeness, secrets not in git, prod vs dev mismatches.
- **Deathstroke** `subagent_type: Deathstroke` — Adversarial: bypass validations, chain interactions, exploit business logic.
- **Constantine** `subagent_type: Constantine` — Cursed code: unreachable branches, dead state, impossible conditions, accidental correctness.
- **Cyborg** `subagent_type: Cyborg` — Integration: trace full data path across 3+ module boundaries, inconsistent response shapes.
- **Raven** `subagent_type: Raven` — Deep analysis: bugs hidden beneath 3 layers of abstraction, logic correct per function but wrong in composition.
- **Wonder Woman** `subagent_type: Wonder Woman` — Truth: code that says one thing and does another, misleading names, stale docs.

## Step 2 — Baseline
Get the project running. Verify manually: app starts, primary flow works, auth works (if applicable), data persists, error states display.

**Dynamic count check:** Grep for hardcoded numeric claims ("263 agents", "37 patterns", etc.) across all pages and data files. Every count that can change between releases must be computed from the source, not hardcoded. (Field report #298.)

**Cross-array uniqueness audit:** If the codebase uses multiple data arrays for entity categories (e.g., leadAgents + subAgents), verify no entity appears in more than one array. Duplicates inflate totals. (Field report #298.)

## Step 2.5 — Smoke Tests
After build + restart, **Flash** `subagent_type: Flash` parallelizes curl commands against the running server for each new or modified feature:
- **Primary user flow:** Execute via curl/fetch against localhost — verify the end-to-end path works
- **File uploads:** Upload a file, then fetch the returned URL and verify HTTP 200 + correct content-type
- **Form submissions:** Submit valid data (verify 200), then submit invalid/duplicate data (verify error message is specific, not generic)
- **Real-time features:** Trigger the polling/SSE and verify at least one successful response cycle
- **Cross-module paths:** If code writes with key prefix X, verify the serving endpoint accepts prefix X

This catches integration failures that static code review misses. If the server isn't running or can't be tested this way, document what couldn't be smoke-tested.

## Step 3 — Pass 1: Find Bugs (parallel analysis)
Use the Agent tool to run these in parallel — these are read-only analysis tasks:
- **Agent 1** `subagent_type: Oracle` — Scan /src/lib/ and /src/app/ for logic flaws, missing awaits, unsafe assumptions.
- **Agent 2** `subagent_type: Red Hood` — Test all API endpoints with malformed inputs, empty bodies, missing auth.
- **Agent 3** `subagent_type: Alfred` — Run `npm audit`, check package.json for deprecated/vulnerable packages.
- **Agent 4** `subagent_type: Deathstroke` — Adversarial probing: bypass validations, chain unexpected interactions, test authorization boundaries.
- **Agent 5** `subagent_type: Constantine` — Hunt cursed code: dead branches, impossible conditions, accidental correctness, shadowed variables.
- **Agent 6** `subagent_type: Batgirl` — Deep per-module audit: every edge of every form, every boundary of every validation, every regex. Not broad -- *thorough*.
- **Agent 7** `subagent_type: Aquaman` — Deep dive on the hardest/largest module (500+ lines or 10+ functions). Exhaustive testing of one complex area.

Synthesize findings from all agents into a unified list.

**Lucius** `subagent_type: Lucius` reviews config separately (reads .env files -- sensitive, don't delegate to sub-agent).

## Step 3.5 — Automated Tests
Run `npm test`. Analyze failures. Cross-reference with findings from Step 3. **Huntress** `subagent_type: Huntress` identifies flaky/non-deterministic tests — race conditions, timing dependencies, order-dependent assertions. For every bug found, ask: "Can this be caught by an automated test?" If yes, write the test.

## Step 4 — Bug Tracker
Log all findings in this format in the phase log:

| ID | Title | Severity | Confidence | Area | Repro Steps | Root Cause | Fix | Verified | Risk |
|----|-------|----------|------------|------|-------------|-----------|-----|----------|------|

Severity: Critical (security/data loss) > High (broken flow) > Medium (degraded) > Low (cosmetic)

**Confidence scoring is mandatory.** Every finding includes a confidence score (0-100). If confidence is below 60, launch a second agent from a different universe (e.g., if Oracle found it, escalate to Spock or Kenobi) to verify before including. If the second agent disagrees, drop the finding. High-confidence findings (90+) skip re-verification in Step 6.5.

## Step 5 — Fix (small batches)
One batch = fixes for one area or severity level. **Green Arrow** `subagent_type: Green Arrow` narrows vague findings to exact lines and conditions. After each batch:
1. Re-run `npm test`
2. Re-verify affected manual flows
3. Update bug tracker in phase log
4. Add new test for each fix where applicable

## Step 6 — Harden
Normalize error handling (reference `/docs/patterns/error-handling.ts`). Add guardrails. Improve structured logging. **Superman** `subagent_type: Superman` verifies the codebase meets its own stated standards — linting clean, type-safe, naming conventions consistent, no unresolved TODOs.

## Step 6.5 — Pass 2: Re-Verify Fixes
After all fixes are applied, run a verification pass:
- **Nightwing** `subagent_type: Nightwing` re-runs full test suite, reports any new failures
- **Red Hood** `subagent_type: Red Hood` re-probes fixed areas — verify fixes hold under adversarial input
- **Deathstroke** `subagent_type: Deathstroke` re-tests authorization boundaries and business logic exploits that were remediated

If Pass 2 finds new issues, fix and re-verify until clean.

## Step 7 — Regression Checklist
**Nightwing** `subagent_type: Nightwing` builds the checklist. Template:

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

## Arguments
- `--focus "topic"` → Bias Herald toward topic (natural-language, additive)

## Handoffs
- Security findings → Kenobi (`/security`)
- Architecture issues → Picard (`/architect`)
- Infrastructure issues → Kusanagi (`/devops`)
- UX issues → Galadriel (`/ux`)

Log all handoffs to `/logs/handoffs.md`.
