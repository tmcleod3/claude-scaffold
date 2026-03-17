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
| `type` | full-stack, api-only, static-site, prototype | full-stack |
| `auth` | yes, no | yes |
| `payments` | stripe, lemonsqueezy, none | none |
| `workers` | yes, no | no |
| `admin` | yes, no | no |
| `marketing` | yes, no | no |
| `email` | resend, sendgrid, ses, none | none |
| `deploy` | vps, vercel, railway, cloudflare, static, docker | vps |

If a value is missing or invalid, log it and use the default. If the entire frontmatter block is missing, flag it as a Phase 0 gap and use all defaults.

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
8. Produce initial ADRs in `/docs/adrs/`
9. Create `/logs/build-state.md` and `/logs/phase-00-orient.md`
10. If PRD has critical gaps (no schema, no stack, no features defined): **STOP. Flag to user. Do not proceed.**

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
1. Initialize framework, configs, schema, directory structure, types, utils, root layout
2. Set up test runner per `/docs/methods/TESTING.md`
3. Every placeholder references its PRD section
4. **Tailwind v4 projects:** If framework is Next.js and styling is Tailwind, create `postcss.config.mjs` (`export default { plugins: { "@tailwindcss/postcss": {} } }`) and ensure `globals.css` starts with `@import "tailwindcss" source("../.."). Tailwind v4's implicit scanning breaks in deployed environments when non-source files (methodology docs, build logs) are scanned.
5. Log to `/logs/phase-01-scaffold.md`

**Phase 2 — Kusanagi Infrastructure.**
1. Database (Banner assists) -> Redis -> Environment
2. Verify: dev server starts, build passes, lint passes, typecheck passes, `npm test` passes
3. Log to `/logs/phase-02-infrastructure.md`

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
4. Log to `/logs/phase-04-core.md`

### Integration Wiring Check

After building a new service, worker, or pipeline, verify it's connected to the system:
1. Search for `TODO` comments referencing the new feature in existing code
2. Check existing call sites that should consume the new service — are they updated?
3. Verify new workers/jobs are registered in the main entry point (e.g., `workers/index.ts`)
4. Check that new API routes are imported in the router

New infrastructure that isn't wired to consumers is dead code. This check runs at the end of every build mission, not deferred to review. (Field report #33: entire enrichment pipeline was dead code — orchestrator built but never connected to conversation engine.)

**Phase 5 — Supporting Features.**
1. Build in dependency order: schema -> API -> UI -> wire up -> verify
2. One batch = one feature or tightly coupled feature group (max ~200 lines changed per batch)
3. After each batch: build passes, previous flows work, new flow works, all tests pass
4. If a batch breaks a previous flow: revert the batch, isolate the conflict, fix, re-verify (see Rollback below)
5. **Enum/tier consumer sweep:** When adding new enum values (tiers, roles, statuses, categories), grep ALL consumers of that enum. Verify each handles the new value. Prefer centralized config lookups (e.g., `getTierConfig(tier)`) over hardcoded comparisons (`tier === 'PRO' || tier === 'ENTERPRISE'`). This is the #1 source of tier enforcement drift.
6. Log each batch to `/logs/phase-05-features.md`

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
1. Batman executes `/docs/methods/QA_ENGINEER.md` through Step 5 (find + fix). Oracle, Red Hood, Alfred, Deathstroke, Constantine scan in parallel.
2. Galadriel executes `/docs/methods/PRODUCT_DESIGN_FRONTEND.md` through Step 6. Elrond, Arwen, Samwise analyze in parallel.
3. Kenobi executes `/docs/methods/SECURITY_AUDITOR.md` Phase 1-2. Leia, Chewie, Rex, Maul scan in parallel, then Yoda, Windu, Ahsoka, Padmé sequentially.
4. Log findings to `/logs/phase-09-qa-audit.md`, `/logs/phase-10-ux-audit.md`, `/logs/phase-11-security-audit.md`

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
3. Log to `/logs/phase-12-deploy.md`

**Phase 13 — Launch Checklist.**
All flows in production. SSL. Email. Payments. Analytics. Monitoring. Backups. Security headers. Legal. Performance. Mobile. Accessibility. Tests passing. Log final status to `/logs/phase-13-launch.md`.

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
