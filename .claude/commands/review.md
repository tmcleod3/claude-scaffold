# /review — Picard's Code Review

> Pattern compliance, code quality, and maintainability review. Picard-affiliated (Star Trek).

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

## Step 1 — Parallel Analysis
Use the Agent tool to run these in parallel — all are read-only analysis:

**Agent 1 (Spock — Pattern Compliance + Integration Tracing):**
For each file, check against its matching pattern in `/docs/patterns/`:
- API routes follow `api-route.ts` — validate → auth → service → respond
- Services follow `service.ts` — business logic not in routes, ownership checks, typed errors
- Components follow `component.tsx` — all four states, keyboard accessible
- Middleware follows `middleware.ts` — auth, logging, rate limiting
- Error handling follows `error-handling.ts` — consistent types, no leaked internals
- Queues follow `job-queue.ts` — idempotent, retry, dead letter
- Multi-tenant follows `multi-tenant.ts` — workspace scoped, role-based

**INTEGRATION TRACING (mandatory):** When reviewed code generates URLs, references other API endpoints, constructs storage keys, or produces data consumed by other modules — you MUST read the consuming code to verify compatibility. Examples:
- File uploaded with key prefix `avatars/` → read the asset proxy to verify it serves that prefix
- API returns error `{ code: "CONFLICT" }` → read the UI that calls this API to verify it displays the error
- Middleware sets header `x-request-id` → read a sample API route to verify it can access the header
- Service generates a URL → read the route/proxy that handles that URL pattern

**Agent 2 (Seven — Code Quality):**
- Unnecessary complexity (can this be simpler?)
- Dead code, unused imports, unreachable branches
- Duplicated logic that should be extracted
- Inconsistent naming or style
- Missing TypeScript types or `any` usage
- Functions doing too many things (SRP violations)

**Agent 3 (Data — Maintainability + Error Paths + State Flow):**
- Wrong abstractions (over-engineered or under-abstracted)
- Coupling between modules that should be independent
- Missing error handling at system boundaries
- Hardcoded values that should be config
- Missing or misleading comments on non-obvious logic

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
- **Spock** re-checks pattern compliance on modified files
- **Seven** confirms no new complexity or dead code introduced by fixes

If new issues found, fix and re-verify.

## Step 4 — Deliverables
1. Review findings table (in phase log or conversation)
2. Code fixes for Must Fix and Should Fix items
3. Remaining suggestions for user decision

## Handoffs
- Security findings → Kenobi (`/security`)
- UX/a11y findings → Galadriel (`/ux`)
- Architecture concerns → Picard (`/architect`)
- Bug discoveries → Batman (`/qa`)

Log all handoffs to `/logs/handoffs.md`.
