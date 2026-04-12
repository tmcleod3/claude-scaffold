# /review — Picard's Code Review

> Pattern compliance, code quality, and maintainability review. Picard-affiliated (Star Trek).

## Dynamic Dispatch (ADR-044)

Opus scans `git diff --stat` and matches changed files against the `description` fields of all agents in `.claude/agents/`. Matching specialists launch alongside the core agents below.

**Dispatch control:** `--light` skips dynamic dispatch (core only). `--solo` runs lead agent only.

## Silver Surfer Pre-Scan (ADR-048)

**MANDATORY.** Before deploying any domain agents, launch the Silver Surfer as a sub-agent to select the optimal roster for this command. **Do NOT skip this step.**

**How to launch:** Use the Agent tool with these exact parameters:
- `description`: "Silver Surfer roster scan"
- `prompt`: "You are the Silver Surfer, Herald of Galactus. Read your instructions from .claude/agents/silver-surfer-herald.md, then execute your task. Command: /review. User args: <ARGS>. Focus: <FOCUS or 'none'>. Scan the .claude/agents/ directory, read agent descriptions and tags, and return the optimal roster for this command on this codebase."

**After the Surfer returns**, merge its roster with this command's hardcoded lead agents below. Leads are non-negotiable; the Surfer adds specialists.

**`--focus "topic"`** — include in the Surfer's prompt as the focus bias.
**`--light`** — skip the Surfer, use only hardcoded roster below.
**`--solo`** — skip Surfer and all sub-agents, lead only.

## Context Setup
1. Read `/logs/build-state.md` — understand current project state
2. Read the relevant pattern files from `/docs/patterns/` for the code being reviewed
3. Read `/docs/LESSONS.md` — check for review-relevant lessons (integration tracing gaps, render loops, cross-module issues). Flag matches during review.

## Step 0 — Scope
Determine what to review:
- If `$ARGUMENTS` specifies files/directories, review those
- If no arguments, review all changed files since last commit: `git diff --name-only HEAD~1`
- If reviewing a feature branch: `git diff --name-only main...HEAD`

List all files in scope and their types (API route, service, component, middleware, config).

## Agent Deployment Manifest

**Lead:** `subagent_type: Picard` — architecture lens, final arbiter
**Core team (always deployed):**
- `subagent_type: Spock` — pattern compliance + integration tracing
- `subagent_type: Seven` — code quality, dead code, complexity
- `subagent_type: Data` — maintainability, error paths, state flow

**Stark's Marvel team (deployed on backend-heavy reviews):**
- `subagent_type: Rogers` — API design: HTTP semantics, response shapes, REST conventions
- `subagent_type: Banner` — database: query patterns, N+1, missing indexes
- `subagent_type: Strange` — service architecture: separation of concerns, logic placement
- `subagent_type: Barton` — error handling: try/catch completeness, error propagation
- `subagent_type: Romanoff` — security implications (lightweight — flags for Kenobi)
- `subagent_type: Thor` — performance: re-renders, expensive computations, memoization
- `subagent_type: Wanda` — state management: store design, prop drilling, context boundaries
- `subagent_type: T'Challa` — API integration: external service calls, retry logic, fallback

**Cross-domain agents (deployed based on content):**
- `subagent_type: Nightwing` — auth flow end-to-end: signup→verify→login→protected→logout
- `subagent_type: Bilbo` — copy audit: error messages, UI text, API descriptions
- `subagent_type: Troi` — PRD compliance: does the code match what the PRD describes?
- `subagent_type: Constantine` — cursed code: accidental correctness, tautological checks, shadowed vars
- `subagent_type: Samwise` — a11y spot-check: keyboard nav and ARIA

## Step 1 — Parallel Analysis
Use the Agent tool to run these in parallel — all are read-only analysis:

- **Agent 1** `subagent_type: Spock` — Pattern compliance: check each file against its matching pattern in `/docs/patterns/` (api-route, service, component, middleware, error-handling, job-queue, multi-tenant). **INTEGRATION TRACING (mandatory):** When reviewed code generates URLs, references endpoints, constructs storage keys, or produces data consumed by other modules — read the consuming code to verify compatibility.
- **Agent 2** `subagent_type: Seven` — Code quality: unnecessary complexity, dead code, unused imports, duplicated logic, inconsistent naming, missing types/`any` usage, SRP violations.
- **Agent 3** `subagent_type: Data` — Maintainability + error paths + state flow: wrong abstractions, module coupling, missing boundary error handling, hardcoded values, misleading comments.
- **Agent 4** `subagent_type: Rogers` + `banner-database` + `strange-service-arch` — Backend review (if backend code in scope): REST conventions, response shapes, N+1 queries, indexes, separation of concerns.
- **Agent 5** `subagent_type: Nightwing` + `constantine-cursed-code` — Cross-domain (if auth or complex logic in scope): auth flow tracing, accidental correctness detection.
- **Agent 6** `subagent_type: Bilbo` + `troi-prd-compliance` — Copy + PRD (if UI or user-facing code in scope): clear error messages, PRD compliance verification.

**ROUTE COLLISION CHECK (mandatory for web apps):** When a new router/route file is added, list ALL registered routes (method + path) across ALL routers. Check for duplicate method+path combinations. Frameworks like FastAPI silently shadow duplicate routes — the first registered wins.

**REACT STATE FLOW ANALYSIS (mandatory for React projects):**
For every `useEffect` in new/modified components:
1. List what store values it reads (dependency array)
2. List what store actions it calls (effect body)
3. Check: does any action trigger a store update that changes a value in the dependency array? If yes → infinite render loop.
4. Check: does the effect call `.focus()` or other DOM methods that should only run once? If yes → needs a ref guard.
5. If a component has 3+ `useEffect` hooks with store dependencies, flag for manual render-cycle review.

**ERROR PATH VERIFICATION (mandatory):** For every API route that returns error responses (4xx, 5xx), identify the client that calls this endpoint and verify:
- The client reads the response body (not just checks `res.ok`)
- The specific error message/code is displayed to the user
- Generic fallback messages are only used when the server truly returns no useful error info
- The UI form state after error allows retry without losing user input

## Step 1.5 — Conflict Detection
After parallel analysis completes, scan findings from all agents for conflicts:
- **Same code, different verdicts:** Spock says "pattern violation" but Data says "intentional trade-off"
- **Severity disagreements:** Seven says "Must Fix" but Spock says "Consider"
- **Contradictory fixes:** One agent's fix would break another agent's recommendation

For each conflict, trigger the debate protocol (see SUB_AGENTS.md "Agent Debate Protocol"): Agent A states finding → Agent B responds → Agent A rebuts → Arbiter (Picard) decides. 3 exchanges max. Log the debate transcript as an ADR. The winning position becomes the canonical finding in Step 2. Do NOT list both opinions — resolve them.

## Step 2 — Synthesize Findings
Merge all findings into a review table (conflicts already resolved via Step 1.5):

| # | File | Line | Category | Severity | Confidence | Finding | Suggestion |
|---|------|------|----------|----------|------------|---------|-----------|

Categories: Pattern, Quality, Maintainability
Severity: Must Fix > Should Fix > Consider > Nit

**Confidence scoring is mandatory.** Every finding includes a confidence score (0-100). If confidence is below 60, escalate to a second agent from a different universe (e.g., if Spock found it, escalate to Oracle or Stark) to verify before including. If the second agent disagrees, drop the finding. High-confidence findings (90+) skip re-verification in Step 3.5.

## Step 3 — Fix (small batches)
Fix "Must Fix" and "Should Fix" items. After each batch:
1. Re-run `npm test`
2. Verify the fix didn't change behavior
3. Update review table status

"Consider" and "Nit" items are presented to the user for decision.

## Step 3.5 — Re-Verify Fixes
After fixes are applied:
- **Spock** `subagent_type: Spock` re-checks pattern compliance on modified files
- **Seven** `subagent_type: Seven` confirms no new complexity or dead code introduced by fixes

If new issues found, fix and re-verify.

## Step 4 — Deliverables
1. Review findings table (in phase log or conversation)
2. Code fixes for Must Fix and Should Fix items
3. Remaining suggestions for user decision

## Arguments
- `--focus "topic"` → Bias Herald toward topic (natural-language, additive)

## Handoffs
- Security findings → Kenobi (`/security`)
- UX/a11y findings → Galadriel (`/ux`)
- Architecture concerns → Picard (`/architect`)
- Bug discoveries → Batman (`/qa`)

Log all handoffs to `/logs/handoffs.md`.
