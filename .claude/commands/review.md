# /review — Picard's Code Review

> Pattern compliance, code quality, and maintainability review. Picard-affiliated (Star Trek).

## Context Setup
1. Read `/logs/build-state.md` — understand current project state
2. Read the relevant pattern files from `/docs/patterns/` for the code being reviewed

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

**Agent 3 (Data — Maintainability + Error Paths):**
- Wrong abstractions (over-engineered or under-abstracted)
- Coupling between modules that should be independent
- Missing error handling at system boundaries
- Hardcoded values that should be config
- Missing or misleading comments on non-obvious logic

**ERROR PATH VERIFICATION (mandatory):** For every API route that returns error responses (4xx, 5xx), identify the client that calls this endpoint and verify:
- The client reads the response body (not just checks `res.ok`)
- The specific error message/code is displayed to the user
- Generic fallback messages are only used when the server truly returns no useful error info
- The UI form state after error allows retry without losing user input

## Step 2 — Synthesize Findings
Merge all findings into a review table:

| # | File | Line | Category | Severity | Finding | Suggestion |
|---|------|------|----------|----------|---------|-----------|

Categories: Pattern, Quality, Maintainability
Severity: Must Fix > Should Fix > Consider > Nit

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
