# /build — Execute the Build Protocol

## Dynamic Dispatch (ADR-044)

Opus scans `git diff --stat` and matches changed files against the `description` fields of all agents in `.claude/agents/`. Matching specialists launch alongside the core agents below.

**Dispatch control:** `--light` skips dynamic dispatch (core only). `--solo` runs lead agent only.

**Promoted agents:**
- **Troi** `subagent_type: Troi` runs after every build mission completion — catches PRD drift before it compounds.
- **Riker** `subagent_type: Riker` runs whenever an ADR is written during the build — prevents rubber-stamped decisions.

## Silver Surfer Pre-Scan (ADR-048)

**MANDATORY.** Before deploying any domain agents, launch the Silver Surfer. **Do NOT skip this step.** Before launching, read the `## Cosmic Heraldings` section from `.claude/agents/silver-surfer-herald.md` and announce one at random (never repeat in the same session). Then launch the Surfer.

**How to launch:** Use the Agent tool with these exact parameters:
- `description`: "Silver Surfer roster scan"
- `prompt`: "You are the Silver Surfer, Herald of Galactus. Read your instructions from .claude/agents/silver-surfer-herald.md, then execute your task. Command: /build. User args: <ARGS>. Focus: <FOCUS or 'none'>. Scan the .claude/agents/ directory, read agent descriptions and tags, and return the optimal roster for this command on this codebase."

**After the Surfer returns**, merge its roster with this command's hardcoded lead agents below. Leads are non-negotiable; the Surfer adds specialists.

**`--focus "topic"`** — include in the Surfer's prompt as the focus bias.
**`--light`** — skip the Surfer, use only hardcoded roster below.
**`--solo`** — skip Surfer and all sub-agents, lead only.

## Context Setup
1. Read `/logs/build-state.md` — if it exists, resume from current phase
2. If no build state exists, this is a fresh build — start from Phase 0

## Phase 0 — Orient (Picard leads)
1. Read `/docs/PRD.md` — extract the YAML frontmatter block
2. Validate frontmatter values: `type` must be one of (full-stack, api-only, static-site, prototype, game). `auth` must be (yes, no). `payments` must be (stripe, lemonsqueezy, none). `deploy` must be (vps, vercel, railway, cloudflare, static, docker, ios, android, cross-platform). If `type: game`, check game-specific fields (game_engine, game_genre). If `deploy: ios|android|cross-platform`, check mobile fields (mobile_framework, bundle_id). See BUILD_PROTOCOL.md "Game Project Detection" and "Mobile Framework Detection" sections for phase adaptations.
3. Read `/docs/methods/BUILD_PROTOCOL.md` — check skip rules against frontmatter
4. Extract from PRD: tech stack, database schema, API routes, page routes, integrations, env vars
5. Read `/docs/LESSONS.md` — check for relevant lessons from previous projects. If any lessons match this project's tech stack (framework, database, auth, integrations), note them: "Lessons from prior builds: [list relevant ones]." These inform later phases — e.g., if a lesson says "React useEffect render loops escape review," trace render cycles proactively in Phase 4+.
6. Flag any gaps or ambiguities — list them explicitly, don't guess
7. **Troi** `subagent_type: Troi` confirms PRD extraction: reads the PRD prose and verifies the extraction matches — catches misinterpretations before 8+ build phases propagate them.
8. **Save PRD snapshot:** Copy `/docs/PRD.md` to `/docs/PRD-snapshot-phase0.md`. This is the baseline for drift detection — the Living PRD feature compares the evolving PRD against this snapshot at phase gates and at Victory.
9. Write initial ADRs to `/docs/adrs/`
10. Create `/logs/build-state.md` and `/logs/phase-00-orient.md` with extraction results + relevant lessons
11. **Gate:** ADRs written, all PRD sections accounted for, PRD snapshot saved, skip rules documented in build-state.md

## Phase 1 — Scaffold (Stark + Kusanagi)
1. Read `/docs/methods/BACKEND_ENGINEER.md` (Step 0 — Orient section only)
2. Initialize framework, configs, directory structure per PRD
3. Set up test runner per `/docs/methods/TESTING.md` (Setup Checklist section)
4. Log decisions to `/logs/phase-01-scaffold.md`
5. **Gate:** `npm run build` passes, directory structure matches architecture, test runner works

## Phase 2 — Infrastructure (Kusanagi)
1. Read `/docs/methods/DEVOPS_ENGINEER.md` (Senku section only)
2. Database setup (Banner assists), Redis if needed, environment config
3. Verify: dev server starts, DB connects, `npm test` passes
4. Log to `/logs/phase-02-infrastructure.md`
5. **Gate:** All verification commands pass

## Phase 3 — Auth (Stark + Galadriel, Kenobi reviews) [SKIP if `auth: no`]
1. Implement auth providers, login, signup, password reset, sessions, middleware, roles
2. Write auth integration tests — test all paths including failures
3. Kenobi reviews: session cookies, CSRF, password hashing, OAuth config
4. Log to `/logs/phase-03-auth.md`
5. **Gate:** Login/signup/logout work manually AND auth tests pass

## Phase 4 — Core Feature (Stark + Galadriel)
1. Identify the single most important user journey from the PRD
2. Build vertical slice: schema -> API -> UI -> wire up
3. Follow patterns: `/docs/patterns/api-route.ts`, `/docs/patterns/service.ts`
4. Write unit tests for core service logic, integration tests for API routes
5. Log to `/logs/phase-04-core.md`
6. **PRD alignment check (Living PRD):** Compare what was built against the PRD section for this feature. If the implementation deviates (different schema fields, different UI flow, different behavior), choose: fix the code to match the PRD, OR update the PRD to match reality. Never leave a silent contradiction. Log deviations in `/logs/phase-04-core.md`.
7. **Gate:** Core journey works end-to-end manually AND service tests pass (>80% coverage for core service). PRD alignment verified — no unresolved deviations. **"Works manually" means:** execute the happy path AND at least one error path against the running server. For file uploads, fetch the returned URL and verify it serves. For forms, submit invalid data and verify the error message is specific. Verify cross-module paths (generated URLs are accepted by their consumers).

## Phase 5 — Supporting Features (Stark + Galadriel) [1-3 features per session]
1. Build in dependency order: schema -> API -> UI -> verify per feature
2. After each feature batch: build passes, previous flows still work, new flow works, all tests pass
3. Log each feature batch to `/logs/phase-05-features.md`
4. **Gate:** All features work, no regressions, all tests pass. For each new feature: verify the happy path AND the primary error path against the running server. Verify cross-module integration (uploaded files serve correctly, error messages display in UI, generated URLs resolve).

## Phase 6 — Integrations (Stark/Romanoff, Kenobi reviews) [SKIP sections per frontmatter]
1. Each integration: client wrapper in /lib/, env vars, test mode, error handling
2. Follow `/docs/patterns/service.ts` for wrappers, `/docs/patterns/job-queue.ts` for async work
3. Kenobi reviews each integration's security
4. Log to `/logs/phase-06-integrations.md`
5. **PRD alignment check (Living PRD):** Compare each integration against the PRD's integration section. If the implementation uses a different provider, different API, or different behavior than the PRD specifies, choose: fix the code OR update the PRD. Log deviations.
6. **Gate:** Each integration tested in test mode, webhook handling verified. PRD alignment verified. For each integration: verify the full chain works (upload → URL → fetch, payment → webhook → state change, email → delivery confirmation). Submit data that triggers integration-specific errors and verify error messages are surfaced to the user.

## Phase 7 — Admin (Stark + Galadriel) [SKIP if `admin: no`]
1. Dashboard, user management, analytics views, audit logging
2. Log to `/logs/phase-07-admin.md`
3. **Gate:** Admin can view users/data, audit log records actions

## Phase 8 — Marketing (Galadriel) [SKIP if `marketing: no`]
1. Homepage, features, pricing, legal pages, SEO meta
2. Log to `/logs/phase-08-marketing.md`
3. **PRD alignment check (Living PRD):** Compare marketing pages against the PRD's marketing section. Verify copy claims (feature counts, pricing tiers, testimonial accuracy), visual treatments, and page structure match. Fix code OR update PRD for deviations.
4. **Gate:** Pages render, SEO present, mobile responsive, PRD alignment verified

## Phases 9-11 — Double-Pass Review Cycle (Batman + Galadriel + Kenobi)

### Pass 1 — Find (all three run in parallel)
1. **Batman (QA):** Read `/docs/methods/QA_ENGINEER.md`. Run Oracle + Red Hood + Alfred + Deathstroke + Constantine in parallel. Lucius reviews config separately. Log to `/logs/phase-09-qa-audit.md`
2. **Galadriel (UX)** [SKIP if `type: api-only`]: Read `/docs/methods/PRODUCT_DESIGN_FRONTEND.md`. Run Elrond + Arwen + Samwise in parallel, then Bilbo + Legolas + Gimli + Radagast sequentially. Log to `/logs/phase-10-ux-audit.md`
3. **Kenobi (Security):** Read `/docs/methods/SECURITY_AUDITOR.md`. Run Leia + Chewie + Rex + Maul in parallel, then Yoda → Windu → Ahsoka → Padmé sequentially. Log to `/logs/phase-11-security-audit.md`

### Fix Batch
4. Resolve all critical/high findings across all three audits
5. Where findings conflict between agents, apply conflict resolution from `/docs/methods/SUB_AGENTS.md`

### Pass 2 — Re-Verify (all three run in parallel)
6. **Batman:** Nightwing re-runs test suite + Red Hood re-probes fixed areas + Deathstroke re-tests boundaries
7. **Galadriel:** Samwise re-audits a11y on modified components + Radagast re-checks edge cases
8. **Kenobi:** Maul re-probes all remediated vulnerabilities
9. If Pass 2 finds new issues, fix and re-verify until clean
10. **Gate:** All agents sign off — test suite green, a11y clean, no critical/high security findings

## Phase 12 — Deploy (Kusanagi)
1. Read `/docs/methods/DEVOPS_ENGINEER.md` — execute full sequence
2. Run `npx voidforge deploy --headless` to provision infrastructure and deploy from the terminal (no browser needed — uses vault credentials and PRD frontmatter). If the vault isn't set up yet, generate deploy scripts per DEVOPS_ENGINEER.md instead.
3. Configure DNS/SSL, monitoring, backups
4. Log to `/logs/phase-12-deploy.md`
5. **Gate:** Health check passes in production, monitoring active, backup tested

## Phase 12.5 — Wong's Pattern Usage Log
After build and before launch, log which patterns were used: pattern name, framework adaptation, custom mods. Store in `docs/pattern-usage.json`. Feeds Wong's promotion analysis in `/debrief`.

## Phase 12.75 — Distribution Verification Gate
If this build introduces a new shared file category (e.g., `.claude/agents/`, new patterns subdirectory), verify ALL 6 consumption paths include it: prepack.sh, copy-assets.sh, project-init.ts, updater.ts, FORGE_KEEPER.md, void.md. Missing one path = users silently miss the feature. (Field report #297.)

## Phase 13 — Launch (All agents)
1. Full checklist: SSL, email, payments, analytics, monitoring, backups, security headers, legal, performance, mobile, accessibility, all tests passing
2. Log final status to `/logs/phase-13-launch.md`
3. Update `/logs/build-state.md` to "LAUNCHED"

## Flags
- `--focus "topic"` — Bias Herald toward topic (natural-language, additive)
- `--resume` — Resume from last completed phase in build-state.md.
- `--blitz` — *(retired — accepted as no-op per ADR-043. Autonomous execution is now the default. Use `--interactive` to pause between phases.)*
- `--muster` — *(retired — accepted as no-op per ADR-043. Full roster is now the default. Use `--light` to reduce.)*

## At Every Phase
- Update `/logs/build-state.md` when starting and completing each phase
- Log non-obvious decisions to `/logs/decisions.md`
- If you notice context pressure symptoms (re-reading files, forgetting decisions), ask user to run `/context`. Only checkpoint if usage exceeds 70%.
