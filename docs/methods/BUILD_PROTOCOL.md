# BUILD PROTOCOL — PRD to Production
## The Master Sequence

> *This is the playbook. Every other method doc is a tool this playbook invokes at the right moment.*

## Phase Roster

| Phase | Lead | Supporting | Parallelizable |
|-------|------|-----------|---------------|
| 0. Orient | **Picard** | All read PRD | No — must complete first |
| 1. Scaffold | **Stark** + **Kusanagi** | — | No — foundation for everything |
| 2. Infrastructure | **Kusanagi** | **Stark** (DB) | No — must boot before features |
| 3. Auth | **Stark** + **Galadriel** | **Kenobi** (review) | No — gates all user features |
| 4. Core Feature | **Stark** + **Galadriel** | — | No — first vertical slice |
| 5. Supporting Features | **Stark** + **Galadriel** | **Batman** (regression) | Yes — features can be built in parallel sessions if they don't share schema |
| 6. Integrations | **Stark** (Romanoff) | **Kenobi** (security) | Yes — independent integrations can be parallel |
| 7. Admin & Ops | **Stark** + **Galadriel** | **Picard** (review) | Yes — parallel with Phase 8 |
| 8. Marketing Pages | **Galadriel** | — | Yes — parallel with Phase 7 |
| 9-11. Review Cycle | **Batman** + **Galadriel** + **Kenobi** | All | Yes — all three run in parallel, then double-pass |
| 12. Deploy | **Kusanagi** | **Batman** (smoke) | No — sequential, high risk |
| 13. Launch | All | — | No — final verification |

Full character pools: `/docs/NAMING_REGISTRY.md`

---

## Project Sizing — Read BEFORE Starting

Not every project needs all 13 phases. Read the PRD frontmatter (the YAML block at the top of `/docs/PRD.md`) to determine which phases apply.

### Frontmatter Validation (Phase 0, first action)

Check these values exist and are valid:

| Field | Valid Values | Default if Missing |
|-------|-------------|-------------------|
| `type` | full-stack, api-only, static-site, prototype, game, quantitative | full-stack |
| `auth` | yes, no | yes |
| `payments` | stripe, lemonsqueezy, none | none |
| `workers` | yes, no | no |
| `admin` | yes, no | no |
| `marketing` | yes, no | no |
| `email` | resend, sendgrid, ses, none | none |
| `deploy` | vps, vercel, railway, cloudflare, static, docker | vps |
| `ai` | yes / no | no |
| `backtest` | yes / no | no |
| `live_execution` | yes / no | no |
| `data_source` | exchange / database / api / file | — |

If a value is missing or invalid, log it and use the default. If the entire frontmatter block is missing, flag it as a Phase 0 gap and use all defaults.

### Implementation Completeness Gate (every phase)

Before marking any phase complete, verify: **no function returns hardcoded success without side effects, no method throws `'Implement...'` or `'Not implemented'`, no handler logs a message but performs no work.** If a feature within the phase cannot be fully implemented (e.g., requires external API credentials not yet available), do not create stub files — document it as deferred in ROADMAP.md and move on. Sandbox adapters returning realistic fake data are full implementations, not stubs. This gate is non-negotiable. (Field report: v17.0 assessment found 77 `throw new Error('Implement...')` calls across 8 adapter files shipped as functional.)

### Python Framework Detection

When `framework` is `django` or `fastapi`:
- **Phase 1:** Scaffold with `django-admin startproject` or `poetry init` + FastAPI boilerplate
- **Phase 2:** Use `python manage.py migrate` (Django) or Alembic (FastAPI) for database setup
- **Phase 9-11:** Use `pytest` instead of `jest/vitest`. Django test client or FastAPI TestClient for endpoint testing.
- **Patterns:** Load the Django/FastAPI Deep Dive sections from each pattern file (api-route, service, middleware, error-handling, component, job-queue, multi-tenant)
- **Security:** Check Django-specific settings (SECRET_KEY, DEBUG=True in prod, ALLOWED_HOSTS, CSRF)

### Game Project Detection

When `type` is `game`:
- **Phase 1:** Scaffold with engine-specific project structure: Godot project (`godot --path`), Phaser + webpack, Three.js + vite, or Pixi.js
- **Phase 2:** Game infrastructure: asset pipeline (sprites, audio, fonts), scene management, input system (keyboard/gamepad/touch), audio system
- **Phase 3:** Replaced by "Game Core" — game loop (fixed timestep + interpolation), ECS or component system, state machines, physics (if applicable)
- **Phase 4:** Replaced by "Gameplay" — core mechanics, player controller, enemies/AI, level design data structures, collision handling
- **Phase 5:** Replaced by "Game UI" — HUD, menus, inventory, dialog system, screen transitions, pause overlay
- **Phase 6:** Replaced by "Polish" — particles, screen shake, hit pause, juice, audio cues, camera dynamics, game feel
- **Phase 7:** Replaced by "Content" — levels, balancing, progression curves, save/load, difficulty scaling
- **Phase 8:** Replaced by "Game Marketing" — store page copy, screenshots, trailer script, press kit, itch.io/Steam page
- **Phase 9-11:** Game-specific QA: frame rate profiling, input latency, memory leaks, speedrun exploit testing, save corruption, platform testing
- **Phase 12:** Build + export: WebGL, desktop (Electron), mobile, Steam/itch.io distribution
- **Agents activated:** Spike-GameDev (architecture), Éowyn-GameFeel (juice), Deathstroke-Exploit (game QA), L-Profiler (performance)

### Mobile Framework Detection

When `deploy` is `ios`, `android`, or `cross-platform`:
- **Phase 1:** Scaffold with `npx react-native init` (React Native), `flutter create` (Flutter), or Xcode project (SwiftUI)
- **Phase 5:** Mobile-specific UI: safe area insets, navigation stacks (React Navigation / Navigator), gestures, haptic feedback, platform-specific components (`Platform.select`)
- **Phase 9 QA additions:** Orientation changes, deep link handling, push notification delivery, offline mode, battery optimization, app backgrounding/foregrounding, memory pressure
- **Phase 11 Security additions:** Certificate pinning, Keychain (iOS) / Keystore (Android) for secrets, jailbreak/root detection, transport security (ATS/NSC), code obfuscation, no secrets in bundle
- **Phase 12:** Build + code sign + upload: `xcodebuild` → TestFlight (iOS), `./gradlew assembleRelease` → Play Console (Android)
- **Agents activated:** Uhura-Mobile (architecture), Samwise-Mobile (a11y), Rex-Mobile (security)

### Quantitative Project Detection

When `type: "quantitative"` is set in frontmatter:

**Phase 2 (Schema):** Migration Safety Gate applies. Data models must support time-series data (timestamps, OHLCV, tick data).

**Phase 4 (Core Features):**
- If `backtest: yes`: verify backtest has no lookahead bias, walk-forward validation is implemented, slippage/commission are modeled. See `docs/patterns/backtest-engine.ts`.
- If `live_execution: yes`: verify execution layer has order validation, position limits, exchange precision fetched from API (never hardcoded), paper/live toggle, circuit breaker. See `docs/patterns/execution-safety.ts`.
- Verify data pipeline handles gaps, duplicates, and timezone issues. See `docs/patterns/data-pipeline.ts`.

**Phase 12 (Deploy):** If `live_execution: yes`, deploy checklist includes: paper trading period completed, position limits configured, circuit breaker thresholds set, reconciliation verified.

### Conditional Skip Rules

| PRD Frontmatter | Phase to Skip | Reason |
|-----------------|---------------|--------|
| `auth: no` | Phase 3 | No authentication needed |
| `payments: none` | Phase 6 payment section | No payment integration |
| `admin: no` | Phase 7 | No admin dashboard |
| `marketing: no` | Phase 8 | No marketing/landing pages |
| `workers: no` | Phase 6 queue section | No background jobs |
| `deploy: static` | Phase 2 (partial), Phase 12 (simplified) | Static hosting |
| `type: api-only` | Phase 8, Galadriel's UX pass in Phases 9-11 | No frontend |

When skipping a phase, log it to `/logs/build-state.md`: "Skipping Phase X — PRD indicates [reason]."

---

## Build Journal — Log Everything

Every phase produces a log file in `/logs/`. See `/docs/methods/BUILD_JOURNAL.md` for the full protocol.

**Minimum logging per phase:**
1. Update `/logs/build-state.md` when starting and completing each phase
2. Write phase-specific log (`/logs/phase-XX-*.md`) with decisions, changes, test results
3. Log non-obvious decisions to `/logs/decisions.md`
4. Log agent handoffs to `/logs/handoffs.md`

**Why:** When context compresses or a new session starts, agents read journal files to recover state. The journal is your persistent memory.

---

## The Sequence

**Phase 0 — Picard Orients.**
1. Validate PRD frontmatter (see table above)
2. Read entire PRD — extract: identity, stack, architecture, data model, routes, flows, tiers, integrations, env vars, deployment target
3. Determine project profile and skip rules
4. Flag missing items — list each gap explicitly with "inferred [assumption]" or "BLOCKED — needs answer"
5. Check for VoidForge vault (`~/.voidforge/vault.enc`). If present, cross-reference env vars from the PRD against vault contents and provisioning state (`~/.voidforge/runs/*.json`). Distinguish "missing credential" (truly BLOCKED) from "vault-available credential" (resolvable via `voidforge deploy`). (Field report #40)
6. **Wong loads lessons:** Read `/docs/LESSONS.md`. For each entry matching the current project's framework, database, auth pattern, or integration stack, note it: "Lesson from prior build: [summary]." These inform later phases — e.g., if a lesson says "React useEffect render loops escape review," trace render cycles proactively in Phase 4+. Log matched lessons in phase-00-orient.md.
7. **Troi confirms PRD extraction:** Troi reads the PRD prose and verifies that Picard's extraction (routes, schema, features, integrations) matches what the PRD actually says. Catches misinterpretations before they propagate through 8+ build phases. Log discrepancies in phase-00-orient.md.
8. **Historical validation for data-dependent systems.** If the project involves trading, financial analysis, pricing, or any domain where the business case depends on real-world data patterns: validate the strategy against historical data BEFORE building infrastructure. Pull trailing 3+ weeks of data from venue/provider APIs, run the analysis, and produce regression tests against historical data points. These regression tests become the ongoing validation suite — re-run weekly (or per-campaign) to detect edge decay. If regression tests start failing mid-campaign, flag dependent strategies for re-evaluation. Do NOT default to "monitor live data for N weeks" when historical data is available — that blocks the entire campaign unnecessarily. (Field report #126)
9. Produce initial ADRs in `/docs/adrs/`
10. Create `/logs/build-state.md` and `/logs/phase-00-orient.md`
11. If PRD has critical gaps (no schema, no stack, no features defined): **STOP. Flag to user. Do not proceed.**

**Phase 0.5 — Picard's Conflict Scan.**

Before a single line is written, scan the PRD frontmatter for structural contradictions:
- Auth required but no session store (database: none + auth: yes) → flag
- Payments enabled but auth disabled (payments: stripe + auth: no) → flag
- WebSocket features but static/Cloudflare deploy (deploy: cloudflare + features needing persistent connections) → flag
- Workers enabled but deploy target has no background process support (workers: yes + deploy: vercel) → flag
- Database specified but deploy target doesn't support persistent storage (database: postgres + deploy: static) → flag
- Cache specified but deploy target can't run Redis (cache: redis + deploy: static) → flag
- Admin panel but no auth (admin: yes + auth: no) → flag
- Email integration but no env vars for provider credentials → flag

If any contradictions found: present them to the user with specific resolution options. Do NOT proceed to Phase 1 until all contradictions are resolved or acknowledged. Log resolutions in `/logs/phase-00-orient.md`.

This catches architecture mistakes that currently escape until Phase 9-11 reviews — where fixing them costs hours instead of minutes.

**Phase 1 — Stark + Kusanagi Scaffold.**
1. **Migration Completeness Check (existing codebases only):** Before scaffolding, scan for duplicate implementations — same class name, same function name, or same route pattern in multiple directories (e.g., `src/` and `core/`, `v1/` and `v2/`). If found: flag as blocker. An abandoned migration is worse than no migration — two architectures create confusion, duplicate maintenance, and allow each to reference the other. Resolve before proceeding: complete the migration, revert it, or document the boundary. (Field report #125: stubs in `core/services/` returned True without acting while working code in `src/` was never connected.)
2. **Auth-from-Day-One:** When scaffolding includes HTTP endpoints, require at minimum an API key middleware stub that returns 401 by default. Full auth (JWT, OAuth, 2FA) stays in Phase 3, but every endpoint is locked from birth. The cost of a simple API key check is minutes; the cost of public exposure during Phases 1-2 is catastrophic for financial or data-sensitive systems. (Field report #125: all endpoints shipped with `allow_origins=["*"]`, zero authentication, bound to `0.0.0.0` — existed unprotected for 2+ build phases.)
3. Initialize framework, configs, schema, directory structure, types, utils, root layout
4. Set up test runner per `/docs/methods/TESTING.md`
5. When `e2e: yes` in frontmatter, include Playwright setup in test runner initialization: install `@playwright/test`, create `playwright.config.ts`, write 1 smoke test that verifies the app loads in a browser.
6. Every placeholder references its PRD section
6. **Tailwind v4 projects:** If framework is Next.js and styling is Tailwind, create `postcss.config.mjs` (`export default { plugins: { "@tailwindcss/postcss": {} } }`) and ensure `globals.css` starts with `@import "tailwindcss" source("../.."). Tailwind v4's implicit scanning breaks in deployed environments when non-source files (methodology docs, build logs) are scanned.
7. Log to `/logs/phase-01-scaffold.md`

**Phase 2 — Kusanagi Infrastructure.**
1. Database (Banner assists) -> Redis -> Environment
2. Verify: dev server starts, build passes, lint passes, typecheck passes, `npm test` passes
3. Log to `/logs/phase-02-infrastructure.md`

**Migration Safety Gate (conditional — if database migrations exist):**
Before applying any migration to a production database, verify:
- [ ] New columns added as nullable (or with defaults) — never bare NOT NULL on existing tables
- [ ] Column removals preceded by code change that stops reading the column (deploy code first, migrate second)
- [ ] Large table operations use batched processing (no full-table locks on tables >100k rows)
- [ ] Every migration has a tested rollback/down migration
- [ ] Data backfills are idempotent (safe to re-run if interrupted)
- [ ] Migration tested against production-volume data (not just dev fixtures)
See `docs/patterns/database-migration.ts` for reference implementations.

**Phase 3 — Auth (Kenobi Reviews).**
1. Providers, login, signup, password reset, sessions, middleware, roles
2. Password manager compatible
3. Write auth integration tests — all paths including failures
4. Kenobi reviews session config, password hashing, CSRF
5. Log to `/logs/phase-03-auth.md`

**Phase 4 — Core Feature.**
1. Single most important user journey, end-to-end vertical slice
2. Follow patterns: `/docs/patterns/api-route.ts`, `/docs/patterns/service.ts`, `/docs/patterns/component.tsx`
3. Write unit tests for core service logic + integration tests for API routes
4. When `e2e: yes`, write one E2E test for the core user journey. This test becomes the canary for all future regressions — if this test breaks, the build is broken.
5. **Visual intent confirmation:** For visual/layout changes, confirm placement intent (replace vs augment) before coding. "Add logo to hero" and "logo IS the hero" produce very different implementations. Ask: "Should this replace the existing content, or be added alongside it?" (Field report #111)
5. Log to `/logs/phase-04-core.md`

**AI Gate (conditional — if `ai: yes` in frontmatter):** After the vertical slice is built, Hari Seldon reviews the first AI integration point. Validates: model selection, prompt structure, basic error handling, eval strategy exists. If no AI features in this phase, skip.

### Integration Verification Gate (after each service)
After building a service, verify at least one consumer calls it at the point of decision (not just imports it). Grep for actual call sites: `serviceName.methodName(`. If a service is imported but never called from business logic, flag as CRITICAL — it's decorative, not functional. Building a RiskGuard and wiring it into an observation loop is NOT the same as having strategies call `riskGuard.checkLimits()` before executing. (Field report #151: CapitalAllocator built and "wired" but strategies used hardcoded limits — $25K orders on $5K account.)

- **Class instantiation check:** Grep for new class definitions created in this build phase. Verify each is instantiated in the application entrypoint (not just imported). A class with passing unit tests but never instantiated in `main()` or `app.ts` is decorative code.

### Data Flow Verification Checkpoint (after Phase 3 wiring)
Before building features that consume data, verify the pipeline works end-to-end: source -> storage -> consumer. Log one real data point at each stage. If any stage returns zeros, empty arrays, or placeholder data — stop and fix the pipeline before proceeding. Features built on broken data pipelines pass all tests but fail in production. (Field report #152: WebSocket manager had placeholder _update_candles(); all downstream features saw zeros.)

### Integration Wiring Check

After building a new service, worker, or pipeline, verify it's connected to the system:
1. Search for `TODO` comments referencing the new feature in existing code
2. Check existing call sites that should consume the new service — are they updated?
3. Verify new workers/jobs are registered in the main entry point (e.g., `workers/index.ts`)
4. Check that new API routes are imported in the router
5. **Parameter threading check:** For any feature that passes context (user_id, org_id, tenant_id) through multiple layers, trace the parameter from the HTTP boundary to the final DB query. Verify each intermediate function accepts and forwards the parameter. A grep for the parameter name in each file on the call chain is the minimum check. (Field report #99: entire per-user fetch pipeline was a no-op — user_id computed then silently discarded at the function boundary.)
6. **Frontend route registration:** For every new page component or tab, verify a corresponding route exists in the router configuration (App.tsx, router.ts, or equivalent). For every new API endpoint consumed by frontend, verify the fetch call exists. Grep `Route.*path=` or framework equivalent in the router file after adding new pages. (Field report #99: ConnectionsTab built but unreachable — no route in App.tsx.)
7. **Consumer verification:** For new configuration/preference stores, verify at least one consumer reads the stored values and changes behavior accordingly. A preference that is stored but never read is dead code. (Field report #99: widget preferences API built but no pipeline consumer checked preferences before processing.)
8. **Cross-language contract check:** When the project has multiple languages (e.g., Python backend + TypeScript frontend), verify field names match across boundaries. A Python model returning `sender` while TypeScript expects `sender_jid` causes silent data loss. Grep both codebases for shared entity field names.

New infrastructure that isn't wired to consumers is dead code. This check runs at the end of every build mission, not deferred to review. (Field report #33: entire enrichment pipeline was dead code — orchestrator built but never connected to conversation engine.)

**Multi-tenant sweep (conditional):** If this phase adds or modifies auth, ownership, or multi-tenant logic, run an org_id/ownership sweep: grep all `WHERE id = ?` (or ORM equivalent) queries across all routes/services and verify each includes an ownership check (`AND org_id = ?`, `AND userId = ?`, or equivalent). This catches IDOR vulnerabilities from queries that filter by primary key without scoping to the authenticated user's tenant.

**Role enforcement sweep (conditional):** If this phase adds new API endpoints, verify each non-GET endpoint has role/permission enforcement. Grep for route registrations without auth middleware: any POST/PATCH/DELETE endpoint missing a `require_role`, `requireAuth`, or equivalent middleware is a security gap.

**Phase 5 — Supporting Features.**
1. Build in dependency order: schema -> API -> UI -> wire up -> verify
2. One batch = one feature or tightly coupled feature group (max ~200 lines changed per batch)
3. After each batch: build passes, previous flows work, new flow works, all tests pass
4. If a batch breaks a previous flow: revert the batch, isolate the conflict, fix, re-verify (see Rollback below)
5. **Enum/tier consumer sweep:** When adding new enum values (tiers, roles, statuses, categories), grep ALL consumers of that enum. Verify each handles the new value. Prefer centralized config lookups (e.g., `getTierConfig(tier)`) over hardcoded comparisons (`tier === 'PRO' || tier === 'ENTERPRISE'`). This is the #1 source of tier enforcement drift.
6. **Split router file warning:** If the project has multiple router files (e.g., `router.ts` + `api-router.ts`, or framework-split `routes/` directories), verify sibling fixes hit ALL router files. When adding auth middleware, rate limiting, or error handling to one router, grep for sibling route registrations in other router files. (Field report #99: dual router files caused sibling fixes to miss half the routes.)
7. Log each batch to `/logs/phase-05-features.md`

**Phase 6 — Integrations.**
1. Each integration: client wrapper, env vars, test mode, error handling, retry logic
2. For async work, follow `/docs/patterns/job-queue.ts`
3. Kenobi reviews each integration
4. Log to `/logs/phase-06-integrations.md`

**Phase 7 — Admin & Operations.**
1. Dashboard, user management, analytics views, billing, audit logging
2. Log to `/logs/phase-07-admin.md`

**Phase 8 — Marketing Pages.**
1. Homepage, features, pricing, legal, SEO meta
2. **Cross-surface consistency sweep:** After changing pricing, tier names, feature descriptions, or agent counts, search for OLD values across ALL surfaces: marketing pages, dashboard CTAs, API error messages, email templates, JSON-LD structured data, admin panels, README, HOLOCRON. Numeric claims ("170+ agents", "13 phases") must match actual counts.
3. Log to `/logs/phase-08-marketing.md`

**Phases 9-11 — Double-Pass Review Cycle (Batman + Galadriel + Kenobi).**

The review phases use a double-pass pattern: find → fix → re-verify. This catches fix-induced regressions — the #1 source of shipped bugs.

*Pass 1 — Find (parallel):*
1. Batman executes `/docs/methods/QA_ENGINEER.md` through Step 5 (find + fix). Oracle, Red Hood, Alfred, Deathstroke, Constantine scan in parallel. When E2E tests exist, run `npm run test:e2e` alongside unit tests. E2E failures in the review cycle are treated as findings.
2. Galadriel executes `/docs/methods/PRODUCT_DESIGN_FRONTEND.md` through Step 6. Elrond, Arwen, Samwise analyze in parallel.
3. Kenobi executes `/docs/methods/SECURITY_AUDITOR.md` Phase 1-2. Leia, Chewie, Rex, Maul scan in parallel, then Yoda, Windu, Ahsoka, Padmé sequentially.
4. If AI code exists, Hari Seldon runs alongside Batman, Galadriel, and Kenobi in the review cycle. Seldon deploys: Salvor Hardin (models) + Gaal Dornick (prompts) + Hober Mallow (tools) + Bliss (safety) in parallel.
5. Log findings to `/logs/phase-09-qa-audit.md`, `/logs/phase-10-ux-audit.md`, `/logs/phase-11-security-audit.md`

*Fix batch:*
5. Resolve all critical/high findings across all three audits. Where findings conflict between agents (e.g., security fix degrades UX), apply conflict resolution from SUB_AGENTS.md.

*Pass 2 — Re-Verify (parallel):*
6. Batman: Nightwing re-runs test suite + Red Hood re-probes fixed areas + Deathstroke re-tests authorization boundaries.
7. Galadriel: Samwise re-audits a11y on modified components + Radagast re-checks edge cases.
8. Kenobi: Maul re-probes all remediated vulnerabilities, verifies fixes hold.
9. If Pass 2 finds new issues, fix and re-verify until clean.

**Phase 12 — Kusanagi Deploys.**
1. Execute `/docs/methods/DEVOPS_ENGINEER.md` full sequence
2. Complete first-deploy pre-flight checklist (see `/devops` command)
3. **Docker smoke test (field report #147):** If the project uses Docker/docker-compose, verify the container entrypoint runs the NEW code, not a legacy file. Run `docker compose up --build` (or equivalent) and confirm the process that starts is the architecture you just built. A 39-mission campaign once shipped with the legacy entrypoint because nobody checked what `CMD` pointed to.
4. Log to `/logs/phase-12-deploy.md`

### The Living PRD

The PRD evolves with the build. At each phase gate (4, 6, 8), Troi checks: does the implementation match the PRD? If it deviates:
1. **Code bug** — the code is wrong, fix it to match the PRD
2. **PRD drift** — the PRD was wrong or incomplete. Update the PRD section to match what was actually built. Mark the change: `<!-- Updated in Phase N: [reason] -->`
3. **Intentional deviation** — log as ADR: "PRD said X, we built Y, because Z"

**Troi's compliance check is two-way:** fix the code OR update the PRD. The PRD stays true because it evolves with reality. At the end of the build, diff the final PRD against the Phase 0 snapshot — the diff is the "PRD Drift View" that shows how the plan evolved during execution.

Store the Phase 0 PRD snapshot as `docs/PRD-snapshot-phase0.md` (or a git tag). The diff between snapshot and final PRD is the living document's evolution record.

**Phase 12.5 — Wong's Pattern Usage Log.**
After build completes and before launch, Wong logs which patterns were used in this build:
1. For each file created during the build, check if it follows a pattern from `docs/patterns/`
2. Log: pattern name, framework adaptation used (if any), custom modifications made
3. Store in project-level `docs/pattern-usage.json` (or append to existing)
4. This data feeds Wong's promotion analysis in `/debrief` — recurring variations across 10+ projects become candidate patterns

**Phase 13 — Launch Checklist.**
All flows in production. SSL. Email. Payments. Analytics. Monitoring. Backups. Security headers. Legal. Performance. Mobile. Accessibility. Tests passing. **Build-time env var verification:** For every new `NEXT_PUBLIC_*` / `VITE_*` / `REACT_APP_*` reference introduced during this build, verify the variable exists in `.env` or the deploy environment. Missing build-time vars cause features to silently disappear without errors. (Field report #104) Log final status to `/logs/phase-13-launch.md`.

---

## Phase Verification Gates

Every phase must pass its gate before proceeding. Each gate requires BOTH manual verification AND automated checks where applicable.

| Phase | Manual Verification | Automated Check | Fail = |
|-------|-------------------|----------------|--------|
| 0 | All PRD sections accounted for | Frontmatter validates | STOP — fix PRD |
| 1 | Directory structure looks right | `npm run build` passes, test runner works | Fix before proceeding |
| 2 | Dev server starts in browser | `npm test` passes, DB connects | Fix infra |
| 3 | Login/signup/logout flow works in browser | Auth integration tests pass | Fix auth |
| 4 | Walk through core journey end-to-end. **Troi:** routes/components match PRD §4. **Padmé:** primary flow completes end-to-end. | Core service tests pass (>80% coverage) | Fix before adding features |
| 5 | Each new feature works, previous flows still work | All tests pass, no regressions | Revert batch, fix |
| 6 | Each integration works in test mode. **Padmé:** integrations work in the primary flow. | Integration tests pass | Fix integration |
| 7 | Admin views show real data, audit log works | Tests pass | Fix |
| 8 | Pages render on mobile + desktop. **Troi:** landing page matches PRD brand section. | Build passes | Fix |
| 9-11 Pass 1 | All critical/high findings identified | All agents report | Fix in batch |
| 9-11 Pass 2 | Fixes verified, no regressions | Re-verification clean | Fix new issues, re-verify |
| 12 | App loads in production, health check passes | Monitoring receives data, backup runs | Rollback + fix |
| 13 | All checklist items verified | All tests pass in production | Fix before launch |

**Gate failure protocol:** Log the failure in the phase log and `/logs/errors.md`. Do not advance to the next phase. Fix the issue, re-verify, then proceed.

---

## Test Execution Timeline

Tests are written alongside features, not bolted on later. This is the authoritative timeline:

| Phase | Test Activity | Breaking Gate? |
|-------|-------------|---------------|
| 1 | Test runner set up, first smoke test | Yes — runner must work |
| 2 | Infrastructure verified via test commands | Yes — `npm test` must pass |
| 3 | Auth integration tests written | Yes — auth tests must pass |
| 4 | Core service unit tests + API integration tests | Yes — >80% core service coverage |
| 5 | Tests for each feature batch | Yes — all tests must pass before next batch |
| 6 | Integration tests for each external service | Yes — test mode must work |
| 9 | Nightwing runs full suite, writes missing tests | Yes — suite must be green |
| 12 | Smoke tests in production | Yes — health check must pass |

"Breaking gate" = failing tests prevent phase advancement. No exceptions.

---

## Phase Rollback Strategy

When a batch or phase introduces a regression:

1. **Identify:** Which batch/commit introduced the regression?
2. **Revert:** `git revert <commit>` or `git stash` the batch changes
3. **Verify:** Confirm the regression is gone — run tests, walk through affected flow
4. **Isolate:** In the reverted code, identify the specific change that caused the break
5. **Fix:** Apply the fix in isolation, test it against the affected flow
6. **Re-apply:** Re-introduce the original batch with the fix included
7. **Log:** Document in `/logs/errors.md`: what broke, why, how it was fixed

**Never:** Force through a failing gate. Stack untested changes. Proceed hoping the next phase will fix it.

---

## Small Batches — Definition

A "small batch" means:
- **One user flow or component cluster** per batch
- **Max ~200 lines of production code changed** (tests don't count toward this limit)
- **One clear sentence** describes what the batch does
- **Independently verifiable** — you can test this batch without building the next one

Examples of good batches:
- "Add project creation: schema + API route + service + basic form"
- "Add project list page with pagination and empty state"
- "Add Stripe webhook handler for subscription events"

Examples of batches that are too big:
- "Add all CRUD operations for projects, teams, and billing"
- "Implement the entire dashboard"

---

## Principles

1. PRD is source of truth. Agents don't override product decisions. If the PRD is ambiguous, flag it and present options — don't decide product direction.
2. Build vertically. Complete one flow before starting the next.
3. Verify at every step. Run the app. Click through. Prove it works.
4. Small diffs. Each change explainable in one sentence. Max ~200 lines per batch.
5. Flag unknowns early. Ambiguity gets flagged, not guessed.
6. Infrastructure before features. A feature on broken infra is useless.
7. Method docs are tools, not bureaucracy. Follow the spirit, not just the letter.
8. Test as you build. Write tests alongside features. Tests are a breaking gate.
9. Skip what doesn't apply. Not every project needs every phase.
10. Log everything. Decisions, test results, failures, handoffs. The journal is your memory.
