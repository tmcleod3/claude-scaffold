# VoidForge Roadmap

> The plan for the plan-maker.

**Current:** v23.4.1 (2026-04-12)
**Next:** v23.5 — The Herald (intelligent agent dispatch: Haiku pre-scan selects optimal roster from 263 agents per command)
**Status:** v23.3 complete (Campaigns 34+35). Test coverage + file splitting done.
**1340 tests**, 9 universes, 263 agents, 28 slash commands, 37 code patterns.

---

## v23.5 — The Herald

*"One does not simply walk into Mordor. Unless the Herald has already assembled the fellowship." — Boromir, probably*

**Depends on: v23.4 complete. Campaign 37. ADR-047.**

**The problem:** Every command has a hardcoded agent manifest — `/review` always calls 5 agents, `/qa` always calls 7, regardless of what the codebase contains. Dynamic dispatch (ADR-044) adds agents based on git diff, but that's reactive. A financial app gets the same `/review` as a game. Users want more agents debating to reach the best answer in fewer prompts.

**The solution:** A Haiku pre-scan ("The Herald") runs before every major command, reads the codebase + command + user intent, and selects the optimal roster from all 263 agents. One cheap LLM call (~$0.001, <2s) replaces hardcoded manifests with intelligent curation.

**Missions (7):**

### Mission 1: Herald Core — The Pre-Scan Engine
- Create `packages/voidforge/wizard/lib/herald.ts` — the Haiku dispatch engine
- Input: command name, user args, codebase file tree, PRD frontmatter, git diff summary, full agent registry (263 names + descriptions)
- Output: JSON roster of agent IDs + reasoning
- Haiku call via the Anthropic SDK (already in the codebase as `lib/anthropic.ts`)
- Bias toward inclusion: over-select rather than under-select
- Estimated: ~150 lines

### Mission 2: Agent Registry Loader
- Create `packages/voidforge/wizard/lib/agent-registry.ts` — reads all `.claude/agents/*.md` files, extracts YAML frontmatter (name, description, model, tags), returns structured array
- Cache the registry in memory (263 files don't change mid-session)
- Add optional `tags` field to agent YAML frontmatter schema
- Estimated: ~80 lines

### Mission 3: Tag Enrichment (40 key agents)
- Add `tags: [...]` to the YAML frontmatter of the 40 most cross-domain agents
- Focus on agents whose expertise spans universes (Worf=security+architecture, Tuvok=security+intelligence, Dockson=financial+devops, etc.)
- Tags supplement descriptions for faster Herald matching
- Estimated: 40 files, ~2 lines each

### Mission 4: Wire Herald Into 14 Commands
- Modify each command's Step 0 to call the Herald before agent deployment
- Commands: `/review`, `/qa`, `/security`, `/ux`, `/architect`, `/build`, `/assemble`, `/gauntlet`, `/campaign`, `/test`, `/devops`, `/deploy`, `/ai`, `/assess`
- Herald's roster merges with (never replaces) the command's lead agents
- `--light` skips Herald, `--solo` skips Herald + all sub-agents
- Estimated: 14 command files, ~10 lines each

### Mission 5: --focus Flag Implementation
- Add `--focus "topic"` flag to all 14 Herald-enabled commands
- Passed to Herald as a bias signal — weights matching agents higher
- Natural language: `--focus "security"`, `--focus "financial accuracy"`, `--focus "mobile UX"`
- Update CLAUDE.md flag taxonomy and command tables
- Estimated: ~30 lines in herald.ts + 14 command file updates

### Mission 6: Tests
- Unit tests for herald.ts: mock Haiku response, verify roster merging, test --focus bias, test --light bypass
- Unit tests for agent-registry.ts: mock filesystem, verify YAML parsing, test caching
- Integration test: run Herald against actual agent files, verify output shape
- Estimated: ~40 tests

### Mission 7: Victory Gauntlet
- Full test suite (1336+ tests must pass)
- Run `/review --focus "security"` on the VoidForge codebase itself — verify Herald selects security-heavy roster
- Run `/qa` on VoidForge — verify Herald selects test-relevant agents
- Verify `--light` still bypasses Herald cleanly
- Verify `--solo` still works
- Update HOLOCRON.md with Herald documentation

**Execution order:** M1 + M2 (parallel) → M3 → M4 + M5 (parallel) → M6 → M7

---

## v23.4 — The Remediation

*"The first duty of every officer is to the truth." — Picard*

**Depends on: v23.3 complete. Campaign 36. ADR-046.**

**The problem:** A combined architecture + UX audit of all 21 wizard UI files found 25 issues: 3 critical (broken API endpoints in standalone dashboards), 4 high (WCAG a11y violations), 8 medium (stale content, UX gaps), and 10 low/info. The wizard UI has accumulated debt over 100+ versions — the server evolved but the UI copy and client JS didn't follow.

**Missions (6):**

### Mission 1: Critical API Fixes (danger-room.js, war-room.js)
- Standalone danger-room.html and war-room.html already show deprecation banners directing users to project.html
- Replace the standalone pages' JS with a redirect to the project dashboard (no more legacy API calls)
- Remove the legacy endpoint shims from danger-room.ts and war-room.ts (the ones blocked in remote/LAN mode anyway)
- Keep the HTML/JS files but gut the fetch logic — show a "Redirecting to project dashboard..." message then navigate
- Verify: project.html dashboard tabs (Danger Room, War Room) still work correctly via project-scoped endpoints
- Estimated: ~100 lines changed

### Mission 2: Retired Flag Cleanup (--blitz in 5 locations)
- Remove `--blitz` from lobby.js (2 locations: auto commands)
- Remove `--blitz` from project.html (2 locations: campaign instructions)
- Remove `--blitz` from danger-room.html (1 location: quick reference)
- Replace all with just `/campaign` (default is now autonomous per ADR-043)
- Also remove dead `auto` URL parameter code in lobby.js (set but never consumed)
- Estimated: ~15 lines changed

### Mission 3: WCAG Compliance (4 high-severity a11y fixes)
- **Step 3 validation:** Add visible text error messages below required fields, set `aria-invalid="true"`, add `aria-describedby` linking to error text
- **PRD tabs (app.js):** Add ArrowLeft/ArrowRight/Home/End keyboard handlers matching project.js pattern. Set roving tabindex.
- **Deploy wizard navigation:** Add consistent footer nav matching setup wizard pattern
- **Step 7 heading:** Move `aria-labelledby` to a heading visible during creating state
- Estimated: ~80 lines changed

### Mission 4: Content Accuracy (stale counts, dead links, copy fixes)
- CLAUDE.md: "35 reference implementations" → "37 reference implementations"
- ROADMAP.md header: already fixed in this version
- index.html: "Step 1 of 5" → match what JS sets (or empty)
- danger-room.html: Fix dead GitHub anchor (#grow → remove or fix)
- danger-room.html: `/cultivation install` → `npx voidforge install cultivation` (browser context)
- danger-room-prophecy.js, war-room-prophecy.js: Fix stale endpoint comments
- Estimated: ~20 lines changed

### Mission 5: UX Improvements (8 medium-severity fixes)
- **Blueprint dismiss:** Add dismiss/close button on Blueprint Detected banner (app.js)
- **Lobby error vs empty:** Track fetch success/failure, show different states for "no projects" vs "server unavailable"
- **Tower CDN retry:** Add retry button when xterm.js CDN fails
- **showStatus consistency:** Unify function signature across app.js, tower.js, deploy.js
- **Tower responsive:** Add flex-wrap and overflow handling for header actions on narrow viewports
- **Login guidance:** Add "forgot password" help text explaining how to reset (delete auth config)
- **Lobby header mobile:** Add overflow handling for action buttons on narrow viewports
- **Import modal Escape:** Move Escape handling into trapFocus for consistency
- Estimated: ~120 lines changed

### Mission 6: Victory Gauntlet
- Full test suite (1340+ tests must pass)
- TypeScript clean (0 errors)
- Cross-page navigation audit: verify every page has a path back to lobby
- Tab keyboard navigation audit: verify all tab instances use arrow keys
- Form validation audit: verify all required fields have text error messages
- Stale count audit: grep for hardcoded numeric claims, verify against source
- Run /qa + /ux focused on the wizard UI files

**Execution order:** M1 → M2 → M3 → M4 + M5 (parallel) → M6

---

## v22.0 — The Scope (COMPLETE — needs hardening patches)

*"A captain doesn't monitor the fleet from inside one ship."*

**Architecture: ADR-040 + ADR-041 (Muster amendments). Campaign 28. Depends on: v21.0 complete.**

**The problem:** The Danger Room, War Room, and Cultivation financial system assume the wizard lives inside the project. Dashboard reads from the npm package directory (broken). Financial logs write to `~/.voidforge/treasury/` globally (multi-project collision). WebSocket broadcasts globally (cross-project data leakage). The UI has Danger Room in the global nav instead of per-project. 19 dashboard endpoints have zero project access control.

**The fix:** Everything becomes project-scoped. Router upgraded to support URL params. API routes gain project ID (`/api/projects/:id/danger-room/...`). Financial paths move from global to `project/cultivation/treasury/`. WebSocket scoped via subscription rooms. Lobby shows aggregated KPIs, drill-down enters project dashboard with Danger Room, War Room, Tower, Deploy.

**Muster review (2026-04-08/09):** 17 agents across 3 waves. 6 CRITICAL, 8 HIGH findings. Plan revised from 6→7 missions. Key changes: M0 added for infrastructure prerequisites, M2↔M3 reordered (writes before reads), router upgrade moved to M0, financial migration changed to clean break (no copy), `ProjectContext` type replaces individual `projectDir` params. See ADR-041 for full findings.

**Missions (7):**

### Mission 0: Infrastructure Prerequisites [NEW — UNBLOCK ALL]
- **Router upgrade**: Add `:id` param matching to `router.ts` (~30 lines). One URL migration, not two. (Riker: "Two URL migrations is more work and risk than one router change.")
- **TREASURY_DIR consolidation**: 4 separate definitions (financial-transaction.ts, financial-vault.ts, totp.ts, treasury-backup.ts) → single `getTreasuryDir(projectDir?)` function. Keep vault path global (decouple from treasury dir).
- **Extract inline treasury reader**: danger-room.ts lines 167-348 (180 lines) duplicates financial-core.ts → extract shared `readTreasurySummary(treasuryDir)` function.
- **Add `projectId` to JSONL writes**: All `appendToLog` calls in heartbeat.ts must include `projectId`. Without this, per-project migration is impossible and future aggregation breaks. (Spock/Dockson CRITICAL finding.)
- **Fix LAN WebSocket auth**: `server.ts` WebSocket upgrade only checks auth in `isRemoteMode()`. Must be `isRemoteMode() || isLanMode()`. (Kenobi/Maul CRITICAL finding.)
- **Define `ProjectContext` type**: New `wizard/lib/project-scope.ts` with `ProjectContext` interface (id, name, directory, derived paths for logsDir, treasuryDir, spendLog, revenueLog, etc.) and `resolveProject()` middleware. (Spock/Tuvok design.)
- **Fix Deep Current routes**: danger-room.ts lines 400,408 use broken `PROJECT_ROOT` for Deep Current API endpoints. (Constantine finding.)

### Mission 1: Dashboard Data + Access Control
- Refactor all 10 functions in `dashboard-data.ts` to accept `ProjectContext` (replaces individual `projectDir` param)
- Remove `PROJECT_ROOT` constant and `LOGS_DIR` module-level constant (resolves to npm package — broken)
- All 13 danger-room + 7 war-room routes call `resolveProject()` from project-scope.ts
- Each route: parse `:id` from URL → resolve to `ProjectContext` → pass to data functions
- `checkProjectAccess()` wired into every route via `resolveProject()` (404 for invalid/unauthorized)
- `readContextStats()` stays global (user-scoped Claude session stats)
- Write unit tests for all 10 dashboard-data.ts functions (currently zero coverage — Constantine/Batman finding)

### Mission 2: Daemon State Per-Project [was M3 — WRITES BEFORE READS]
- Add `configurePaths(projectDir)` to daemon-process.ts — overrides module-level constants before daemon starts
- heartbeat.ts receives `projectDir` at startup via CLI arg (`voidforge heartbeat start --project-dir=/path`)
- **Dual-daemon guard**: New daemon checks global PID at `~/.voidforge/run/heartbeat.pid` AND refuses to start if a global daemon is alive for the same project. (La Forge CRITICAL finding.)
- daemon-core.ts re-exports become functions of `projectDir`
- daemon-aggregator.ts already correct (connects per-project sockets at `project/cultivation/heartbeat.sock`)
- Update 4 files importing from daemon-core.ts: heartbeat.ts, extensions.ts, treasury-heartbeat.ts, danger-room.ts

### Mission 3: Financial Path Isolation [was M2 — AFTER daemon writes]
- `TREASURY_DIR`, `SPEND_LOG`, `REVENUE_LOG` become functions of `projectDir` (consolidated in M0)
- Paths move from `~/.voidforge/treasury/` to `project/cultivation/treasury/`
- **Treasury summary file**: Daemon maintains `treasury-summary.json` with running totals (spend, revenue, net, ROAS, budget). Dashboard reads this O(1) file instead of scanning O(n) JSONL. (Torres P0 bottleneck.)
- Update reconciliation.ts — reads per-project spend/revenue logs
- Daemon sets 0700 permissions on `cultivation/treasury/` at startup (Kenobi M2 finding)
- **Migration CLI**: `voidforge migrate treasury --project=<id>` — archive global `~/.voidforge/treasury/` → `~/.voidforge/treasury-pre-v22/`. Per-project logs start fresh with genesis hash ('0'). No copy — clean break. (Spock/Riker: "Copying creates false provenance. Archive the global log. Start per-project logs clean.")
- **No fallback to global paths** — if per-project treasury doesn't exist, return zeroes. (Deathstroke: "Any fallback-to-global defeats financial isolation.")
- Update safety-tiers.ts to read budget from per-project path

### Mission 4: UI — Project-Scoped Navigation
- **Lobby**: Enhance with DaemonAggregator KPIs (online/offline count, combined ROAS) filtered by `getProjectsForUser()`. Strip `projectPath` from non-admin responses. (Kenobi/Deathstroke finding.)
- **"Resume last project"**: Store last-visited project ID in `localStorage`, show quick-access link in Lobby header. (Galadriel: "Users with a single active project should not re-select every time.")
- **Project Dashboard**: Single `project.html` with client-side tab switching (not separate HTML files):
  - Overview tab: build state, git status, version (from M1 dashboard functions)
  - Tower tab: terminal (already project-scoped, preserves all 5 query params)
  - Danger Room tab: health, campaigns, heartbeat (from M1 routes)
  - War Room tab: campaign proposals
  - Deploy tab: deploy target, health check, drift detection
- **Breadcrumb**: `Lobby > ProjectName > [active tab]`. Logo click returns to Lobby. (Galadriel design.)
- **Keyboard nav**: `role="tablist"`, `aria-selected`, ArrowLeft/ArrowRight between tabs, `aria-controls`/`aria-labelledby`. (Galadriel: reuse existing Danger Room tab keyboard pattern.)
- **Empty states**: Each tab gets an actionable empty state (e.g., "No campaign data. Run `/campaign --blitz` to begin." with Engage button).
- Danger Room button moves from Lobby top-nav into project dashboard tabs

### Mission 5: WebSocket Isolation + Route Finalization
- **WebSocket subscription rooms** (Kusanagi Option B): Single WSS, client sends `{ type: 'subscribe', projectId }` after connect. Server tags WebSocket with `projectId`. `broadcast(data, projectId?)` only sends to matching subscribers.
- **WebSocket auth**: Project access validated on upgrade via URL query param (`/ws/danger-room?project=<id>`) or path (`/ws/projects/:id/danger-room`). `resolveProject()` before `handleUpgrade()`.
- **Remove old global paths**: Delete `/ws/danger-room` and `/ws/war-room` handlers. Add test that old paths return 404. (Deathstroke/Maul HIGH finding: "Global path must be removed, not supplemented.")
- **Agent activity scoping**: Per-project file watchers (lazy-init on subscribe, teardown on last unsubscribe). Activity broadcast includes `projectId`. (Maul M4 finding.)
- Routes already at `/api/projects/:id/danger-room/*` from M0+M1 router upgrade — no re-migration needed
- Freeze endpoint: Read daemon token from `project/cultivation/heartbeat.token`. `checkProjectAccess()` before contacting daemon socket. (Deathstroke: cross-project freeze bypass.)

### Mission 6: Victory Gauntlet
- Integration test: create project → install cultivation → start daemon → view Danger Room → verify per-project data
- **Cross-project isolation test**: 2 projects, verify no data leakage via API or WebSocket (Deathstroke attack scenarios)
- **WebSocket isolation test**: 2 projects, verify no cross-talk; verify old global paths return 404
- **Dual-daemon guard test**: Attempt to start per-project daemon while global daemon runs → must refuse
- **Treasury clean break test**: Archive global → per-project starts fresh → verify genesis hash chain
- **DaemonAggregator filtering test**: Viewer of Project A cannot see Project B's data, paths, or spend
- Full Victory Gauntlet on complete v22.0

**Execution order:** M0 → M1 → M2 → M3 → M4 → M5 → M6 (strictly sequential — writes before reads, no parallelism between M2/M3)

**Global vault stays global** — credentials are user-scoped (one Stripe account across projects). Per-project vault encryption deferred to v22.1 (Kenobi's HKDF proposal).

**Dissent preserved (Stark):** Financial data staying global (user's ad spend spans projects) was a viable alternative. If multi-project users report data confusion post-v22.0, revisit with project-as-filter-view on global data rather than per-project files.

---

## v22.0.x — The Scope Hardening

*"The first duty of every Starfleet officer is to the truth." — Picard*

**Architecture: ADR-041. Campaign 29. Depends on: v22.0 complete.**

**The problem:** Post-v22.0 Muster review (17 agents, 3 waves) found 14 findings the campaign missed. 4 CRITICAL blockers must be fixed before npm publish. The core architecture (routing, access control, financial paths, UI) is sound — these are integration gaps, not design flaws.

**Muster source:** `/logs/assessment.md` (2026-04-09), ADR-041 agent table.

**Missions (10, in 4 priority tiers):**

### P0-A: RBAC Bypass on Freeze Endpoint [CRITICAL — security]
- `ROUTE_ROLES` in server.ts uses old path prefix `/api/danger-room/freeze` → deployer
- New path `/api/projects/:id/danger-room/freeze` doesn't match → any authenticated user can freeze
- Freeze handler calls `resolveProject()` which returns `resolved.role` but **never checks it**
- **Fix:** Add deployer role check in freeze handler: `if (resolved.role !== 'deployer' && resolved.role !== 'admin')` → 404
- **Also:** Add ROUTE_ROLES entries for new `/api/projects/` path prefixes (future-proofing)
- Source: Tuvok + Deathstroke (Wave 2-3)

### P0-B: Old UI Uses Legacy API Paths [CRITICAL — breakage]
- `danger-room.js` and `war-room.js` fetch from `/api/danger-room/*` (old paths)
- Routes moved to `/api/projects/:id/danger-room/*` in M1 — old paths return 404
- E2E tests in `danger-room.test.ts` also use old URL patterns
- **Fix:** Register backward-compatible routes at old paths that proxy to the new project-scoped handlers. Old routes use `?project=<id>` query param or the first registered project as default. This preserves the standalone Danger Room/War Room pages while the new project dashboard is the primary UI.
- Source: Constantine (Wave 3)

### P0-C: prepack-patterns.sh Overwrites Financial Functions [CRITICAL — build]
- `prepack-patterns.sh` copies `docs/patterns/financial-transaction.ts` → `wizard/lib/patterns/financial-transaction.ts`
- The wizard version has `getTreasuryDir()`, `getSpendLog()`, `getRevenueLog()`, `getPendingOps()`, `getBudgetsFile()` that the docs/ version does NOT
- Running `npm run prepack` wipes these functions → breaks financial-core.ts, treasury-reader.ts, heartbeat.ts
- **Fix:** Sync docs/patterns/financial-transaction.ts with the wizard version (add the getTreasuryDir functions to the canonical pattern source). This makes prepack safe.
- Source: Constantine (Wave 3)

### P1-A: Daemon CLI Wiring [CRITICAL — functionality]
- `configurePaths()`, `setDaemonProjectDir()`, `setDaemonProjectId()` exported but never called
- CLI `voidforge heartbeat start` doesn't parse `--project-dir` argument
- Per-project daemons silently write to global `~/.voidforge/` paths
- **Fix:** Add `--project-dir <path>` flag to heartbeat start command in `voidforge.ts`. On receipt: call `configurePaths(projectDir)`, `setDaemonProjectDir(projectDir)`, look up project in registry for `setDaemonProjectId(project.id)`
- Source: Picard + Assessment (RC-1)

### P1-B: Remove Old WebSocket Paths [HIGH — data leakage]
- `/ws/danger-room` and `/ws/war-room` still active in server.ts upgrade handler
- Clients on old paths receive broadcasts without project filtering
- **Fix:** Remove old path handlers. Add new handlers at `/ws/projects/:id/danger-room` that extract project ID from URL, validate access, pass projectId to `handleUpgrade()`
- Source: Kenobi + Kusanagi (Wave 1)

### P1-C: Remove Token Fallback in Freeze [HIGH — trust model]
- Freeze endpoint falls back to global `TOKEN_FILE` when per-project token is missing
- Fragile trust model — global token should not authenticate against per-project sockets
- **Fix:** Remove fallback. If per-project token missing, return 503 "Heartbeat daemon not configured for this project"
- Source: Batman + Deathstroke (Wave 1-3)

### P2-A: Unit Tests for New Modules [HIGH — safety net]
- Zero test coverage on `dashboard-data.ts` (10 functions), `project-scope.ts`, `treasury-reader.ts`, router param matching
- **Fix:** Write unit tests with mocked filesystem. Test: valid project, missing project, unauthorized, empty ID, stale directory
- Source: Batman + Constantine (Wave 1-3)

### P2-B: Treasury Migration CLI [HIGH — migration]
- No `voidforge migrate treasury --project=<id>` command exists
- Existing users with global treasury data at `~/.voidforge/treasury/` can't migrate
- **Fix:** Add CLI command: stop daemon check, archive global → `treasury-pre-v22/`, per-project logs start fresh (genesis hash), write migration manifest
- Source: Dockson (pre-build Muster Wave 2)

### P2-C: Treasury Summary File [HIGH — performance]
- Heartbeat endpoint scans entire JSONL files O(n) per 30-second poll
- **Fix:** Daemon writes `treasury-summary.json` with running totals after each financial operation. Dashboard reads this O(1) file. JSONL remains the authoritative append-only log.
- Source: Torres (pre-build Muster Wave 2)

### P3: Minor Hardening [LOW — polish]
- Add skip-to-content link in project.html (Galadriel)
- Add heading hierarchy in project dashboard panels (Galadriel)
- Add `maxPayload` option on WebSocket server (Kusanagi)
- Add filesystem existence check in resolveProject() — return 404 for stale registry entries (Batman)
- Add catch around Deep Current JSON parse (Stark)

**Execution order:** P0-A → P0-B → P0-C → P1-A → P1-B → P1-C → P2-A → P2-B → P2-C → P3

**P0 (3 missions) are SHIP BLOCKERS.** P1 should ship with v22.0.0. P2-P3 can be v22.0.1-v22.0.3.

---

## v22.1 — The Migration ✓

*"The needs of the many outweigh the needs of the few." — Spock*

**Status: COMPLETE (Campaign 30 — 3/3 missions, 45 tests)**

**The problem:** v22.0 moved financial paths per-project but left no migration tooling. Existing users with global treasury data at `~/.voidforge/treasury/` see empty dashboards. The heartbeat endpoint scans entire JSONL files O(n) on every poll — a scalability cliff for mature projects.

**Missions (3):**

### Mission 1: Treasury Migration CLI
- New command: `voidforge migrate treasury --project=<id>`
- Pre-flight: verify daemon stopped, project registered, cultivation installed
- Archive global `~/.voidforge/treasury/` → `~/.voidforge/treasury-pre-v22/`
- Per-project logs start with genesis hash (`'0'`) — clean break, no copy (ADR-041 decision)
- Write migration manifest: `cultivation/treasury/.migrated` with timestamp, source hash, file count
- Set 0700 permissions on `cultivation/treasury/`
- Validation: verify hash chain integrity on new files, compare entry counts

### Mission 2: Treasury Summary File (Torres P0)
- Daemon writes `cultivation/treasury/treasury-summary.json` after each financial operation
- Contents: running totals (totalSpendCents, totalRevenueCents, net, roas, budgetRemaining, timestamp)
- Dashboard reads this O(1) file instead of scanning O(n) JSONL logs
- JSONL remains the authoritative append-only log — summary is a read cache
- `readTreasurySummary()` in `treasury-reader.ts` checks for summary file first, falls back to JSONL scan
- Heartbeat endpoint response time: O(n) → O(1)

### Mission 3: Per-Project Vault Encryption (Kenobi's HKDF)
- Derive per-project encryption keys from the global vault password using HKDF
- Each project's `cultivation/treasury/vault.enc` encrypted with a project-specific key
- Global vault stays global for cross-project credentials (API keys shared across projects)
- Per-project vault for project-specific secrets (campaign configs, platform tokens scoped to one project)
- Key derivation: `HKDF(masterKey, projectId, 'voidforge-project-vault')` → 256-bit key

**Execution order:** M1 → M2 → M3 (sequential — migration before performance, vault last)

---

## v22.2 — The Polish ✓

*"It's not enough that we do our best; sometimes we must do what is required." — Picard*

**Status: COMPLETE (Campaign 31 — 7/7 missions)**

**The problem:** v22.0 shipped the architecture, v22.0.x fixed the bugs, v22.1 handles migration. v22.2 closes the experience gaps — what a new user encounters on day 1, what legacy code should be deprecated, and what the /portfolio command needs to work with per-project data.

**Missions (7):**

### Mission 1: First-Run Experience
- Wizard detects "empty project" (no logs/, no cultivation/, no campaign-state.md)
- Project dashboard Overview tab shows guided onboarding instead of empty panels:
  - "Write your PRD" → link to `/prd` command
  - "Run your first build" → link to `/campaign --blitz`
  - "Install Cultivation" → link to extension installer
- Danger Room tab empty state enhanced with step-by-step next actions
- Lobby empty state for zero-project wizard: "Import a project or create one"

### Mission 2: Portfolio Command Update
- `/portfolio` reads from per-project treasury paths (currently reads global paths deprecated in v22.0)
- `DaemonAggregator.getStatus()` filtered by `getProjectsForUser()` at the API layer
- Portfolio dashboard shows per-project spend/revenue breakdown with drill-down
- Cross-project aggregation uses aggregator totals (already correct)

### Mission 3: Legacy Route Deprecation
- Add `Deprecation: true` header + `Sunset: 2026-07-01` header on all 19 legacy shim routes
- Log deprecation warnings: `console.warn('Deprecated: /api/danger-room/* → /api/projects/:id/danger-room/*')`
- Add deprecation notice to old danger-room.html and war-room.html pages
- Plan removal in v23.0 (3-month sunset period)

### Mission 4: Growth Tutorial Prerequisites
- Each growth tutorial (/grow, /cultivation, /treasury, /google-ads, /google-ads-kongo) gets a "Prerequisites" section
- Lists exact accounts and API keys needed before starting
- Cold-start flow: "Don't have a Google Ads account yet? Here's how to get one"
- Danger Room growth panels show "Setup required: [list of missing keys]" instead of blank

### Mission 5: Website Accuracy Pass
- Pattern pages: financial-transaction and daemon-process get v22.0 additions (prompt already written)
- Forge Labs: clarify Danger Room is a wizard feature, not standalone
- Agent count: update to "263 named agents" (accurate) or keep "260+" (rounded)
- Add test count (696) to stats where appropriate
- Verify all tutorials reflect npm install path (no scaffold refs)

### Mission 6: Dynamic Agent Dispatch (ADR-042)
- **Cross-domain spot-checks**: When a command's agents find code in another domain (e.g., `/review` finds auth code), auto-deploy a spot-check agent (Kenobi) instead of logging a handoff
- **Content-driven selection**: Commands scan `git diff` and add agents based on what's in the code — schema changes deploy Spock, API changes deploy Kim, statistical code deploys Vin
- **Promote high-value agents**: Troi (PRD compliance) → every `/build` completion. Riker (trade-offs) → every ADR. Vin (stats) → any math code. Worf (security implications) → any auth code. Torres (performance) → any DB/API code. Constantine (cursed code) → every `/qa` final pass.
- Update 8+ method docs with "Cross-Domain Triggers" sections
- Update 8+ command files with content-scanning preamble
- No runtime code changes — purely methodology

### Mission 7: Max by Default — Invert Flag Taxonomy (ADR-043)
- **Default is now maximum quality**: autonomous execution + full agent roster + all review passes
- **Retire opt-in flags**: `--blitz` (now default), `--muster` (now default), `--infinity` (now default)
- **New opt-out flags**: `--light` (standard agents only), `--interactive` (human pauses), `--solo` (lead agent only)
- `--fast` unchanged (already opt-out)
- `--blitz` and `--muster` still accepted silently (backward compat — they're no-ops)
- Update CLAUDE.md Flag Taxonomy tables (Tier 1-3)
- Update all 28 command files (arguments section)
- Update MUSTER.md, CAMPAIGN.md, GAUNTLET.md, ASSEMBLER.md
- No runtime code changes — purely methodology

**Execution order:** M1 → M2 → M3 → M4 → M5 → M6 → M7 (M4+M5 parallel, M6+M7 parallel)

---

## v23.3 — The Splitting

*"There is a way to be good again." — Tanjiro*

**Depends on: v23.2 complete. Campaign 35.**

**The problem:** 40 files exceed the project's ~300-line standard. treasury-heartbeat.ts is 1,444 lines (4.8x limit), heartbeat.ts is 1,051 (3.5x), projects.ts is 769, aws-vps.ts is 663. These are the hardest files to review, test, and modify. Splitting them reduces cognitive load and enables targeted testing.

**Missions (6):**

### Mission 1: Split treasury-heartbeat.ts (1,444 → 4 modules)
- Extract treasury job definitions into `treasury-jobs.ts`
- Extract treasury JSONL reader/writer into `treasury-io.ts`
- Extract treasury summary computation into `treasury-summary.ts`
- Retain `treasury-heartbeat.ts` as the orchestrator (~300 lines)
- Move existing tests, add new tests for extracted modules

### Mission 2: Split heartbeat.ts (1,051 → 3 modules)
- Extract daemon startup/shutdown into `heartbeat-lifecycle.ts`
- Extract job scheduling into `heartbeat-scheduler.ts`
- Retain `heartbeat.ts` as the main loop (~350 lines)
- Preserve the 45 existing heartbeat tests

### Mission 3: Split API routes (projects.ts 769, provision.ts 642)
- `projects.ts` → split by resource (project CRUD vs dashboard data vs portfolio)
- `provision.ts` → split by phase (validate, provision, status polling)
- Each resulting file under 300 lines

### Mission 4: Split provisioners (aws-vps 663, railway 454, cloudflare 344)
- `aws-vps.ts` → split into `aws-ec2.ts`, `aws-rds.ts`, `aws-config.ts`
- `railway.ts` → split into `railway-deploy.ts`, `railway-config.ts`
- Each under 300 lines

### Mission 5: Split financial campaigns (google 560, tiktok 478, meta 413)
- Each campaign adapter → split into `{platform}-api.ts` (raw API) + `{platform}-campaign.ts` (orchestration)
- Shared patterns extracted to `campaign-common.ts`

### Mission 6: Victory Gauntlet
- Verify all extracted modules maintain the same exports
- Run full test suite (must stay at 741+ passing)
- Verify no file in wizard/ exceeds 400 lines (relaxed threshold for entry points)
- Run `/review` on the refactored modules

**Execution order:** M1 → M2 → M3 + M4 + M5 (parallel) → M6

---

## v23.2 — The Coverage

*"I'm not the QA engineer this codebase deserves. I'm the one it needs." — Batman*

**Depends on: v23.1 complete. Campaign 34.**

**The problem:** 112 of 165 source files (68%) have zero test coverage. This includes all 12 API route handlers, the main server entry point, all 13 provisioners, all 13 financial modules, and the 1,444-line treasury-heartbeat.ts. 741 tests pass, but they cover only 32% of modules. The untested code is the code users actually hit — HTTP endpoints, deploy pipelines, financial operations. 17 orphaned files (3,003 lines) ship in dist/ as dead code.

**Missions (8):**

### Mission 1: Dead Code Purge (17 orphaned files, 3,003 lines)
- Delete 13 orphaned lib/ files: natural-language-deploy.ts, desktop-notify.ts, anomaly-detection.ts, correlation-engine.ts, build-analytics.ts, service-install.ts, asset-scanner.ts, image-gen.ts, route-optimizer.ts + 4 codegen/ files (seed-gen, erd-gen, openapi-gen, prisma-types)
- **Triage 5 orphans with tests** (daemon-aggregator, project-vault, autonomy-controller, treasury-backup, platform-planner): are these planned features or disconnected code? Wire in or delete.
- Remove corresponding test files for deleted modules
- Verify: `npm run build` still clean, test count adjusts

### Mission 2: Test API Routes (12 files, 4,103 lines)
- Write unit tests for all 12 API route handlers: auth, blueprint, cloud-providers, credentials, deploy, prd, project, projects, provision, terminal, users, war-room
- Pattern: mock request/response, verify status codes, verify service calls, verify error handling
- Target: 3-5 tests per route handler (happy path, auth failure, validation error, not found)
- Estimated: ~60 new tests

### Mission 3: Test Server Core (server.ts 435 + router.ts 79)
- Test server startup, middleware chain, CORS/CSRF, auth enforcement, WebSocket upgrade
- Test router param matching, exact-match fast path, wildcard handling
- Target: ~20 new tests

### Mission 4: Test Provisioners (13 files, 2,504 lines)
- Test each provisioner: aws-vps, railway, vercel, cloudflare, static-s3, docker, self-deploy
- Test provisioner scripts: provision-vps, deploy-vps, dockerfile, docker-compose, caddyfile, ecosystem-config, rollback-vps
- Mock external APIs (AWS SDK, Railway API, Vercel API, Cloudflare API)
- Target: ~40 new tests

### Mission 5: Test Financial Modules (13 files, 3,621 lines)
- Test campaign adapters: google-campaign, meta-campaign, tiktok-campaign, sandbox-campaign
- Test billing adapters: google-billing, meta-billing (tiktok-billing already tested)
- Test stablecoin adapters: circle, mercury
- Test support modules: adapter-factory, reporting, funding-auto, registry
- Mock external APIs (Google Ads, Meta Marketing, TikTok, Circle, Mercury)
- Target: ~50 new tests

### Mission 6: Test High-Risk lib/ Modules (15 files, ~4,000 lines)
- treasury-heartbeat.ts (1,444 lines — the biggest untested file)
- deep-current.ts, site-scanner.ts, headless-deploy.ts, project-registry.ts
- ssh-deploy.ts, treasury-reader.ts, experiment.ts, gap-analysis.ts
- env-validator.ts, ci-generator.ts, agent-memory.ts, provision-manifest.ts
- Target: ~40 new tests

### Mission 7: Test Remaining Modules + DNS
- dns/cloudflare-dns.ts, dns/cloudflare-registrar.ts
- dashboard-ws.ts, health-monitor.ts, health-poller.ts, cost-estimator.ts, cost-tracker.ts
- lib/adapters/ (sandbox-bank.ts, index.ts, types.ts)
- sentry-generator.ts, anthropic.ts, deploy-coordinator.ts, deploy-log.ts
- Target: ~30 new tests

### Mission 8: Victory Gauntlet
- Run full test suite: target 741 + ~240 = ~980 tests
- Verify 0 TypeScript errors
- Run `/qa` focused on test quality (no assertion-free tests, no tautological expects)
- Coverage report: target >80% of source modules have at least 1 test file
- Run `/review` on new test files

**Execution order:** M1 → M2 + M3 (parallel) → M4 + M5 (parallel) → M6 + M7 (parallel) → M8

---

## v23.1 — The Injection

*"There's always another secret." — Kelsier*

**Depends on: v23.0 complete. Architecture: ADR-045. Campaign 33.**

**The problem:** v23.0 materialized 263 agents but their definitions contain only 3-12% of the operational knowledge in the method docs. 25+ hard-won lessons from LESSONS.md and 4 learnings from LEARNINGS.md are absent from every agent definition. Six breaks exist in the knowledge flow: agents aren't distributed via init/update/void code paths, /debrief doesn't target agent definitions, and scaffold users have no migration path. VoidForge's recursive knowledge loop — build → debrief → learn → inject → build better — is broken at the injection step.

**Missions (7):**

### Mission 1: Distribution Fix (Break 1)
- Fix `project-init.ts` — add `.claude/agents` to `copyMethodology()` **(DONE in v23.0 assessment)**
- Fix `updater.ts` — add `.claude/agents` to `dirs` array **(DONE in v23.0 assessment)**
- Fix `FORGE_KEEPER.md` — add `.claude/agents/*` to shared file list **(DONE in v23.0 assessment)**
- Fix `void.md` — add `.claude/agents/*` to shared file checklist **(DONE in v23.0 assessment)**
- Verify: `npx voidforge init` creates project with agents, `npx voidforge update` syncs agents

### Mission 2: Lead Agent Knowledge Injection (20 agents)
- For each of the 20 lead agents, cross-reference against:
  - The lead's method doc (full operational rules, mandatory gates, field-report checks)
  - `docs/LEARNINGS.md` (4 entries, tag-matched to agents)
  - `docs/LESSONS.md` (25+ entries, most tagged with agent names)
- Inject `## Operational Learnings` section: the critical 20% — specific thresholds, grep patterns, mandatory gates, named gotchas
- Add `## Required Context` footer pointing to method doc + learnings files
- Target: ~80-150 lines per lead (up from ~50)

### Mission 3: Key Sub-Agent Knowledge Injection (~40 agents)
- Identify sub-agents with section-specific checks in parent method docs:
  - Constantine (cursed code patterns, `const`/`let` audit, stub detection greps)
  - Nightwing (regression checklist template, auth flow E2E mandate)
  - Barton (mandatory smoke test gate, React render cycle check)
  - Yoda (bcrypt >= 12, `timingSafeEqual()`, OAuth checklist)
  - Deathstroke (query-param state trust, Sibling Verification Protocol)
  - Ahsoka (auth chain tracing mandate)
  - Maul (runtime exploitation mandate)
  - Troi (CLAUDE.md contract verification)
  - Eowyn (10-question enchantment review protocol)
  - Spock (statistical code math review, data mutation parity)
  - All other sub-agents with field-report-specific checks
- Inject their parent section's specific checks into `## Operational Learnings`
- Add `## Required Context` footer to all 263 agents (bulk operation)
- Target: ~60-80 lines for key sub-agents

### Mission 4: Debrief Pipeline Update (Break 2 + Break 3)
- Update `FIELD_MEDIC.md` Step 2.5b: Wong's promotion now targets agent definitions alongside method docs
- Update `.claude/commands/debrief.md`: Nog's solution proposals check if findings are agent-relevant
- Update `.claude/agents/bashir-field-medic.md`: scope includes `.claude/agents/` as output target
- Update `.claude/agents/wong-documentation.md`: promotion scope includes agent definitions
- Verify: run a mock /debrief scenario and confirm agent definition is proposed as update target

### Mission 5: Scaffold Migration (Break 4)
- On scaffold branch: update `void.md` to replace all 7 "scaffold" references with "main"
- On scaffold branch: update `DEPRECATION.md` with complete migration instructions including `.voidforge` marker
- On scaffold branch: update `README.md`, `CLAUDE.md`, `CHANGELOG.md` with deprecation banners
- Archive branches created: `archive/scaffold`, `archive/core`
- **Scaffold branch kept alive as tombstone** — void.md points to main, serves as redirect for users who haven't updated. Do NOT delete. Remove only when npm stats show zero scaffold fetches for 90 days.
- Verify: scaffold user running `/void` successfully pulls from main

### Mission 6: Vault + Global Lessons (Break 5 + Break 6)
- Update `/vault` to include "Agent Definition Recommendations" section when findings suggest agent updates
- Implement `~/.voidforge/lessons-global.json` schema and write path in Wong's promotion (or defer with explicit ADR noting it's unimplemented)
- Verify: vault captures agent-relevant learnings for next session

### Mission 7: Victory Gauntlet
- Verify all 6 breaks are closed
- Spot-check 10 agent definitions: do they contain operational learnings from their method docs?
- Verify /debrief proposes agent updates for agent-relevant findings
- Verify /void syncs agents
- Verify `npx voidforge init` and `npx voidforge update` include agents
- Full consistency check: all 263 agents have `## Required Context` sections
- Verify scaffold migration path works

**Execution order:** M1 (already done) → M2 + M3 (parallel) → M4 → M5 → M6 → M7

---

## v23.0 — The Materialization

*"Make it so." — Picard*

**Depends on: v22.2 complete. Architecture: ADR-044. Campaign 32.**

**The problem:** VoidForge's 263 named agents exist only as text in methodology docs. Every invocation recreates character prompts inline. No model routing (everything runs on Opus). No tool restrictions (every agent can edit files). No dynamic dispatch (static tables in command files). Claude Code's native subagent system (`.claude/agents/*.md`) solves all of this — but the agents need to be materialized as subagent definitions.

**Missions (8):**

### Mission 1: Agent Classification
- Parse `docs/NAMING_REGISTRY.md` — extract all 263 agents with name, universe, role, lens
- Classify each into tier: Lead (~18, Opus), Specialist (~200, Sonnet), Scout (~40, Haiku)
- Classify each by tool access: Builder (full), Reviewer (read+bash), Scout (read-only), Adversarial (read+bash)
- Produce classification manifest: `docs/AGENT_CLASSIFICATION.md`
- Review with Riker: are tier assignments correct? Challenge edge cases.

### Mission 2: Lead Agent Definitions (18 agents)
- Generate `.claude/agents/{name}.md` for all 18 lead agents
- Model: `inherit` (Opus from main session)
- Tools: Full (leads need to write fixes, ADRs, logs)
- System prompts: character identity, domain expertise, behavioral lens, output format
- Agents: Picard, Batman, Galadriel, Kenobi, Kusanagi, Stark, Sisko, Thanos, Fury, Coulson, Kelsier, Dockson, Tuvok, Seldon, Chani, Bombadil, Celebrimbor, Bashir

### Mission 3: Star Trek Specialist Definitions (~40 agents)
- Generate `.claude/agents/` files for all Star Trek universe specialists
- Model: `sonnet` — focused prompt compensates, faster in parallel
- Tools: Read, Grep, Glob, Bash (reviewer access)
- Agents: Spock, Uhura, Worf, Scotty, Kim, Torres, La Forge, Data, Crusher, Archer, Riker, Troi, Janeway, Seven, O'Brien, Pike, Sulu, Chapel, Neelix, Odo, Kira, Dax, Bashir (specialist mode), Tuvok (specialist mode), etc.

### Mission 4: Marvel + DC Specialist Definitions (~60 agents)
- Generate `.claude/agents/` files for Marvel and DC universe specialists
- Marvel: Stark (specialist), Romanoff, Banner, Rogers, Barton, Fury (specialist), Wong, Strange, etc.
- DC: Oracle, Red Hood, Alfred, Deathstroke, Constantine, Nightwing, Lucius, Batgirl, Cyborg, Raven, Flash, etc.
- Same Sonnet + reviewer tools pattern

### Mission 5: Remaining Universe Definitions (~140 agents)
- Star Wars: Leia, Chewie, Rex, Ahsoka, Maul, Yoda, Windu, Padme, Qui-Gon, etc.
- Tolkien: Elrond, Arwen, Samwise, Bilbo, Legolas, Gimli, Radagast, Eowyn, Faramir, etc.
- Dune: Chani (specialist), Stilgar, Thufir, Duncan, Jessica, etc.
- Anime: Senku, Levi, Spike, L, Bulma, Holo, Valkyrie, etc.
- Cosmere: Steris, Vin, Szeth, Breeze, Wax, Ham, etc.
- Foundation: Gaal, Salvor, Demerzel, Eto, etc.
- Scout-tier agents (Haiku): file finders, classifiers, quick lookups

### Mission 6: Command File Migration (28 commands)
- Replace inline "You are Picard..." prompts with `subagent_type: picard-architecture`
- Replace ADR-042 static tables with "Dynamic Dispatch" sections
- Add `--light` / `--solo` dispatch control documentation
- Update all 28 command files to reference subagent types
- Remove now-redundant "Cross-Domain Triggers" sections from method docs

### Mission 7: Methodology Doc Updates
- Update `SUB_AGENTS.md` — new dispatch model, model tiering, tool restrictions
- Update `MUSTER.md` — Muster now launches named subagent types, not inline prompts
- Update `GAUNTLET.md` — Gauntlet agents reference subagent types
- Update `CAMPAIGN.md` — dynamic dispatch section
- Update `CLAUDE.md` — document `.claude/agents/` in Distribution section
- Remove ADR-042 "Cross-Domain Triggers" sections from 3 method docs (replaced by descriptions)

### Mission 8: Package + Distribution
- Update `packages/methodology/` prepack script to include `.claude/agents/`
- Verify `npx voidforge init` installs agent definitions into new projects
- Verify `npx voidforge update` syncs agent definition changes
- Test: run `/review` on a real codebase, verify Opus dispatches specialists via descriptions
- Test: run `/gauntlet --light` vs default, verify agent count differs

**Execution order:** M1 → M2 → M3+M4+M5 (parallel) → M6 → M7 → M8

---

## v21.1 — The Shipyard (COMPLETE)

*"A ship in harbor is safe, but that's not what ships are built for."*

**Architecture: ADR-039. Campaign 27: 3 missions, --blitz --muster.**

**Shipped 2026-04-08.** Build pipeline (tsc→dist/), CI/CD (GitHub Actions publish.yml), branch deprecation (scaffold/core). Published `thevoidforge@21.0.0` to npm. 12 patch releases (v21.0.1–v21.0.17) fixing LAN mode, auth, CWD assumptions, WebSocket origin validation, methodology bundling.

**Architecture: ADR-039. Depends on: v21.0 complete.**

**The problem:** v21.0 built the monorepo structure and all features, but can't ship to npm. The CLI uses tsx (dev-only runtime), no build pipeline exists, pattern imports cross package boundaries, scaffold/core branches still exist, and 4 heartbeat hash chain calls are broken.

**The fix:** Build pipeline (tsc → dist/), CI/CD for npm publish, branch deprecation, and type error fixes. After this version, `npx voidforge init` works from npm.

**Missions (4):**

### Mission 1: Branch Deprecation
No code dependencies — ships immediately. Independent of build pipeline.
- On scaffold: add DEPRECATION.md, update README/CLAUDE.md/CHANGELOG with deprecation notices
- On core: same deprecation notices
- On main: remove scaffold/core references from README, CLAUDE.md Release Tiers, FORGE_KEEPER.md sync, void.md fetch target
- ~~30-day timer: delete scaffold/core on 2026-05-08~~ **REVISED:** Scaffold branch kept alive as tombstone redirect (void.md → main). Delete only when npm stats show zero scaffold fetches for 90 days. Archive branches created.
- Core branch: delete after archive/core is confirmed

### Mission 2: Build Pipeline + Type Fixes
The core unblock — make `tsc` compile clean and produce a publishable dist/.
- Fix `packages/voidforge/tsconfig.json`: rootDir → ".", remove external pattern includes
- Add `build` and `prepack` scripts to package.json
- Change bin entry: `./dist/scripts/voidforge.js`, files field: `["dist/"]`
- Decouple wizard from docs/patterns/ imports (copy 9 pattern files into wizard/lib/patterns/ at prepack)
- Fix 6 type errors:
  - heartbeat.ts lines 368, 393, 475, 551: add `prevHash` to `appendToLog` calls (add `getLastLogHash()` helper)
  - adapter-factory.ts: 'snap' not in AdPlatform union
  - project-init.ts:219: ProjectInput missing optional fields
- Add hash chain integrity tests
- Verify: `npm run build && node dist/scripts/voidforge.js version` works

### Mission 3: CI/CD Pipeline
Depends on M2 (working build). Also blocked on npm account (user infrastructure).
- Create `.github/workflows/publish.yml` — npm publish on git tag (`v*`)
- Update `.github/workflows/validate-branches.yml` for monorepo structure
- Publish both packages: `voidforge` and `@voidforge/methodology`
- Pipeline: checkout → install → typecheck → test → build → publish
- Requires: npm account with `NPM_TOKEN` secret in GitHub

### Mission 4: Integration Verification + Victory Gauntlet
Depends on M2+M3. Final gate before v21.1 release.
- Test `npx voidforge init` from clean npm install (requires published package)
- Test `npx voidforge migrate` on mock v20.x project
- Test daemon socket communication (integration tests)
- Test job import path in heartbeat daemon context
- Victory Gauntlet on complete v21.1

**BLOCKED:**
- npm account creation (infrastructure — user must do) — blocks M3+M4
- NPM_TOKEN secret in GitHub repo settings — blocks M3

---

## v21.0 — The Extraction (COMPLETE)

*"The wizard is an application for launching and managing projects. It is not part of a project."*

**Source: `/docs/PRD-wizard-extraction.md`. Architecture: ADR-038. Campaign 26: 8 missions, --blitz --muster.**

**Shipped 2026-04-08.** Monorepo conversion, CLI router (12 commands), .voidforge marker, project creation, extension system, update mechanisms, daemon aggregator, v20.x migration. 618→675 tests. 10 commits including Gauntlet checkpoint + Victory Gauntlet fix. Debriefs: #283-#291.

---

## v20.2 — Graceful Tier Degradation

*"Scaffold users deserve real value, not silent failures."*

**Source: `/docs/PRD-graceful-degradation.md`. Architecture: ADR-037.**

**The gap:** Full-tier commands (/cultivation, /grow) silently fail on scaffold/core. A phantom wizard/ directory bypasses the tier gate. No messaging tells users that Phases 1-3 work without wizard. --audit-only stops at Phase 1 when Phase 3 is also pure methodology.

**6 requirements:**
1. Fix tier gate sentinel: `wizard/server.ts` not `wizard/` (6 command files)
2. /grow methodology-only fallback: clear message at Phase 3/4 boundary
3. --audit-only expansion: Phases 1-3 (not just Phase 1)
4. /cultivation install graceful skip: report skipped steps, don't fail
5. Phantom directory cleanup: add wizard/ to scaffold/core .gitignore
6. GROWTH_STRATEGIST.md scaffold section: document what works without wizard

---

## v20.1 — Kongo Engine Integration

*"Every campaign gets a landing page. Every page gets tested."*

**Source: `/docs/PRD-kongo-integration.md`. Architecture: ADR-036. Campaign: 8 missions.**

**What this does:** Integrates Kongo Engine (first-party, same owner) as VoidForge's landing page system for /cultivation and /grow. Every ad campaign gets a dedicated, A/B-tested Kongo landing page. Conversion tracking feeds back into seed content optimization. The heartbeat daemon manages the feedback loop autonomously.

**The gap:** /grow manages ad campaigns but has zero capability to generate, vary, or track landing pages. All campaigns point at the same generic page. This is a conversion leak validated by 14-agent Muster.

**8 missions (COMPLETE):**
1. KongoClient foundation (types, HTTP client, page CRUD) — 36 tests
2. Campaign + variant management (CRUD, AI generation, rotation) — 22 tests
3. Analytics + webhooks (growth signal computation, HMAC verification) — 27 tests
4. /cultivation install integration (API key provisioning, vault storage) — 13 tests
5. /grow Phase 3.5 — seed extraction from PRD — 12 tests
6. Heartbeat daemon jobs (kongo-signal, kongo-seed, kongo-webhook) — 8 tests
7. GTM Content Engine codification (3-phase activation, integration classification)
8. Pattern + documentation (kongo-integration.ts, CLAUDE.md, HOLOCRON.md)

**Key PRD adjustments:** No Kongo-side API work needed — existing Kongo API covers all requirements. OAuth replaced with manual API key entry (Kongo uses ke_live_ keys). Growth signal computed client-side from analytics data instead of hypothetical endpoint. Total: 10 modules, 119 tests, ~4200 lines.

**Infinity Gauntlet (10 rounds, 2 passes): PASSED.** 3 Critical + 10 High + 14 Medium findings fixed. Remaining items tracked below.

**v20.1.1 — Gauntlet follow-up (unfixed findings):**

Integration wiring (High — deferred, requires daemon changes):
- [ ] Wire `registerKongoJobs()` into `heartbeat.ts` `startHeartbeat()` — conditional on vault key
- [ ] Decide webhook ingress architecture: HTTP listener on daemon, tunnel, or polling-only

Code quality (Medium):
- [ ] Move `setRotation()` from `variants.ts` to `campaigns.ts` (module boundary violation)
- [ ] Remove unused types: `BatchGenerateRequest`, `ConversionEvent`, `ConversionEventType`
- [ ] Add barrel file `wizard/lib/kongo/index.ts` with public API surface
- [ ] Extract duplicate `sleep()` helper from `client.ts` + `pages.ts` to shared util
- [ ] Extract duplicate `createMockClient()` from 6 test files to shared test helper
- [ ] Add `KongoClientErrorCode` union (`NETWORK_ERROR`, `TIMEOUT`, `UNKNOWN`, `GENERATION_FAILED`) — replace `| string` escape hatch
- [ ] Add structured logging to `KongoJobContext.logger` (action, campaignId, level fields)
- [ ] Add circuit breaker to `signalPoll` — skip polls after N consecutive failures

Seed extraction (Medium):
- [ ] Document YAML parser limitation (flat key:value only, no nested objects) in Phase 3.5 docs
- [ ] Strip markdown formatting from extracted headlines (`**bold**`, `[link](url)`)
- [ ] Replace hardcoded fallback value props with warning log when PRD lacks Features section
- [ ] Validate `ctaUrl` against PRD frontmatter `url` field instead of defaulting to `#signup`

Validation (Low):
- [ ] Validate API key minimum length beyond `ke_live_` prefix (e.g., 16+ chars after prefix)
- [ ] Validate webhook secret format (non-empty, no control chars, 32-128 chars)
- [ ] Validate `baseUrl` starts with `https://` and matches `*.kongo.io` (SSRF prevention)
- [ ] Validate API key has no CRLF/null bytes (defense-in-depth, Node.js already blocks)
- [ ] Add explicit hex validation for webhook `v1=` hash before `Buffer.from`
- [ ] Add `awaitPage` polling backoff (start 3s, cap 30s) to reduce request waste on long generations
- [ ] Log warning when `batchGetCampaignStatuses` hits 20-page truncation limit

Test gaps (Low):
- [ ] Add boundary tests for batch size 1 and 50, variant count 1 and 20
- [ ] Add test for client timeout event (`req.on('timeout')`)
- [ ] Add deterministic analytics test (exact confidence value, not multi-match)
- [ ] Verify `VariantDetail` extra fields (`views`, `cvr`, `weight` etc.) exist in real Kongo API responses

Documentation (Low):
- [ ] Verify `CampaignDetail` extra fields (`accessGate`, `metadata`, `sourceRules`, `updatedAt`) against real API
- [ ] Verify `PageTemplate` casing — `'PITCH'` vs kebab-case siblings — against real API
- [ ] Verify unpublish endpoint: `DELETE /publish` (code) vs `POST /unpublish` (PRD) — which is correct?
- [ ] Verify rotation strategy values: `'equal'` (types.ts) vs `'even'` (PRD) — which does the real API use?

---

## v20.0 — CLI Distribution

*"One command to start the forge."*

**What this does:** `npx voidforge init` — installable CLI that provisions a new project with VoidForge methodology. Replaces `git clone --branch scaffold`.

---

## v19.5.0 — The Blueprint Path

*"You've done the thinking. The forge does the building."*

**Source: `/docs/RFC-blueprint-path.md`. Campaign: 6 missions, 0 stubs.**

**What this does:** Adds the missing fourth entry path to VoidForge. Users with pre-written PRDs (from Claude chat, consultants, or previous iterations) can skip Sisko's interview and go straight to validation → provisioning → campaign. New `/blueprint` command orchestrates Picard (validate) → Wong (discover docs) → Boromir (challenge) → Kusanagi (provision) → Sisko (build). Wizard auto-detects existing PRDs and offers the shortcut.

**The gap:** Today, users with complete specs must either: (1) endure the wizard interview saying "skip, I have a PRD" at every step, (2) use scaffold and lose provisioners, or (3) manually replace the generated PRD afterwards. None are clean.

**ALL 6 MISSIONS BUILDABLE.** Frontmatter parser exists (`wizard/lib/frontmatter.ts`). Provisioning pipeline proven (6 providers). Boromir exists in `/prd --challenge`. Wizard UI is a modular state machine (`wizard/ui/app.js`). Infrastructure is ready — the blueprint-specific logic needs to be wired together.

### Mission 1 — Document Discovery + CLAUDE.md Merge

| Aspect | Detail |
|--------|--------|
| **Objective** | Reusable document discovery module + safe CLAUDE.md merge utility |
| **New files** | `wizard/lib/document-discovery.ts` — scan for supporting docs (OPERATIONS.md, ADR/, reference/, PROJECT-DIRECTIVES.md) |
| | `wizard/lib/claude-merge.ts` — append project directives to CLAUDE.md (never replace, idempotent) |
| **Tests** | `wizard/__tests__/document-discovery.test.ts` — 8+ tests |
| **Prereqs** | None (foundation) |
| **Effort** | ~300 lines + 8 tests |

**Discovery convention:** `docs/PRD.md` (required), `docs/PROJECT-DIRECTIVES.md` or `docs/PROJECT-CLAUDE.md` (optional), `docs/OPERATIONS.md` (optional), `docs/ADR/*.md` (optional), `docs/reference/*` (optional).

### Mission 2 — Enhanced PRD Validation

| Aspect | Detail |
|--------|--------|
| **Objective** | Expand frontmatter schema + structural validation (Troi compliance) |
| **Modified** | `wizard/lib/frontmatter.ts` — nested `stack` and `deploy` objects per RFC spec |
| **New files** | `wizard/lib/prd-validator.ts` — structural checks (sections present, cross-refs valid) |
| **Tests** | `wizard/__tests__/prd-validator.test.ts` — 12+ tests |
| **Prereqs** | None (independent of M1) |
| **Effort** | ~400 lines + 12 tests |

**Validation rules:** Required fields (name, stack.runtime, stack.framework, deploy.target). Structural checks (OVERVIEW section, feature sections, DATA MODELS if database set, DEPLOYMENT if deploy set). Warnings not blockers — user can proceed.

### Mission 3 — `/blueprint` Command + `/prd --import`

| Aspect | Detail |
|--------|--------|
| **Objective** | New slash command + import flag on existing /prd |
| **New files** | `.claude/commands/blueprint.md` — orchestrates validate → discover → merge → conflict-scan → challenge → provision → campaign handoff |
| **Modified** | `.claude/commands/prd.md` — add `--import path/to/PRD.md` flag |
| **Prereqs** | Missions 1-2 (discovery + validation) |
| **Effort** | ~200 lines |

**`/blueprint` flow:** (1) Picard validates frontmatter, (2) Troi checks structure, (3) Wong discovers supporting docs, (4) Wong merges project directives into CLAUDE.md, (5) Picard runs conflict scan, (6) Boromir challenges (if `--challenge`), (7) Kusanagi provisions (unless `--no-provision`), (8) Hand off to `/campaign`.

### Mission 4 — Wizard Auto-Detection + Tutorial Hub

| Aspect | Detail |
|--------|--------|
| **Objective** | Wizard detects existing PRD, offers blueprint shortcut. Tutorial hub updated. |
| **Modified** | `wizard/ui/app.js` — fork point after Step 3 detecting `docs/PRD.md` |
| | `wizard/ui/index.html` — tutorial hub 4-card layout (Wizard, Blueprint, Scaffold, Import) |
| **New files** | `wizard/api/blueprint.ts` — API endpoint for blueprint validation from wizard UI |
| **Tests** | E2E test for wizard blueprint detection flow |
| **Prereqs** | Mission 3 (command exists) |
| **Effort** | ~400 lines |

### Mission 5 — PRD Template + Documentation

| Aspect | Detail |
|--------|--------|
| **Objective** | Reference template, command docs, tutorial page, HOLOCRON update |
| **New files** | `docs/templates/PRD-TEMPLATE.md` — complete frontmatter field reference with examples |
| **Modified** | `CLAUDE.md` — add `/blueprint` to Slash Commands table (28th command) |
| | `HOLOCRON.md` — add Blueprint Path section |
| **Prereqs** | Missions 1-4 complete |
| **Effort** | ~300 lines documentation |

### Mission 6 — Victory Gauntlet + Release

| Aspect | Detail |
|--------|--------|
| **Objective** | Full 5-round Gauntlet, version bump, branch sync |
| **Version** | v19.5.0 (MINOR — new command, new entry path) |
| **Branch sync** | main → scaffold → core (shared methodology files) |
| **Effort** | 1 session |

### Architecture

```
New files:
  wizard/lib/document-discovery.ts    # Wong's doc scanner
  wizard/lib/claude-merge.ts          # Safe CLAUDE.md append
  wizard/lib/prd-validator.ts         # Troi's structural checks
  wizard/api/blueprint.ts             # Wizard UI API endpoint
  .claude/commands/blueprint.md       # The slash command
  docs/templates/PRD-TEMPLATE.md      # Frontmatter reference

Modified files:
  wizard/lib/frontmatter.ts           # Expanded schema
  wizard/ui/app.js                    # Auto-detection fork point
  wizard/ui/index.html                # Tutorial hub cards
  .claude/commands/prd.md             # --import flag
  CLAUDE.md                           # Command table (28th entry)
  HOLOCRON.md                         # Blueprint Path docs
```

**Dependency chain:** M1 + M2 (parallel) → M3 → M4 → M5 → M6. Missions 1 and 2 can be parallelized — discovery and validation are independent.

### What Changes at the End

| Before (v19.4) | After (v19.5) |
|----------------|---------------|
| 3 entry paths (Wizard, Scaffold, Import) | 4 entry paths (+Blueprint) |
| Pre-written PRDs require manual setup | `/blueprint` validates + provisions automatically |
| No supporting doc discovery | Wong scans for OPERATIONS.md, ADR/, reference/ |
| CLAUDE.md merge is manual and error-prone | Automatic append with idempotency |
| 27 slash commands | 28 slash commands |
| No PRD template reference | `docs/templates/PRD-TEMPLATE.md` with all fields |

---

## v19.4.0 — The Last Mile

*"Cultivation can plan everything. Monitor everything. Fund everything. Now it executes campaigns."*

**Designed by: Dax + Pike (Muster-planned). Campaign: 5 missions, 0 stubs.**

**What this does:** Wires the final 5 heartbeat daemon stubs (VG-R1-006) to real ad platform adapters. Creates campaign CRUD adapters for Google Ads, Meta Marketing, and TikTok Marketing APIs. Completes the Cultivation execution layer: `/grow` can now create, pause, resume, and budget campaigns autonomously through the daemon. Danger Room shows live campaign metrics. Freeze pauses all active campaigns across all platforms.

**The gap (v19.3 assessment):** Billing adapters exist (invoice/debit reads). Stablecoin adapters exist (off-ramp ops). Campaign adapters (create/pause/resume/budget/creative) DO NOT exist — the 5 heartbeat handlers return 501 because there's nothing to call. This campaign builds the adapters AND wires them.

**ALL 5 MISSIONS BUILDABLE.** AdPlatformAdapter interface fully defined in `docs/patterns/ad-platform-adapter.ts` (lines 167-190). Adapter factory pattern proven (billing + stablecoin use it). Campaign state machine tested. Same `node:https` pattern as existing billing adapters. Sandbox adapter provides full pipeline demo without API keys.

### Mission 1 — Campaign Adapter Foundation

| Aspect | Detail |
|--------|--------|
| **Objective** | Interface extraction + sandbox adapter + factory extension |
| **New files** | `wizard/lib/financial/campaign/base.ts` — AdPlatformAdapter types extracted from pattern |
| | `wizard/lib/financial/campaign/sandbox-campaign.ts` — full lifecycle with realistic fake metrics |
| **Modified** | `wizard/lib/financial/adapter-factory.ts` — add `getCampaignAdapter(platform, vaultKey)` |
| **Tests** | `wizard/__tests__/sandbox-campaign.test.ts` — 10+ tests |
| **Prereqs** | None (foundation) |
| **Effort** | ~500 lines + 10 tests |

**Sandbox adapter details:** Realistic fake data covering full lifecycle (create → pending_review → active → paused → resumed → completed). Fake metrics: CTR 1.2-3.8%, CPC $0.45-$2.10, ROAS 1.5-4.2x. Idempotency key tracking. Same interface as real adapters — swap by changing vault config.

### Mission 2 — Platform Campaign Adapters (Google + Meta + TikTok)

| Aspect | Detail |
|--------|--------|
| **Objective** | Campaign CRUD for all 3 platforms via `node:https` |
| **New files** | `wizard/lib/financial/campaign/google-campaign.ts` — Google Ads API v17 |
| | `wizard/lib/financial/campaign/meta-campaign.ts` — Meta Marketing API v19.0 |
| | `wizard/lib/financial/campaign/tiktok-campaign.ts` — TikTok Marketing API v1.3 |
| **Tests** | `wizard/__tests__/campaign-adapters.test.ts` — 15+ tests with API response fixtures |
| **Prereqs** | Mission 1 (interface + factory) |
| **Effort** | ~1,200 lines + 15 tests |

**Per adapter:** `createCampaign`, `pauseCampaign`, `resumeCampaign`, `updateBudget`, `updateCreative`, `getSpend`, `getPerformance`, `getInsights`. Platform-specific rate limiting (Google: 15,000 ops/day, Meta: 200 calls/hr/account, TikTok: 10 calls/sec). Error normalization to `PlatformError`. Idempotency keys on all write operations per ADR-3.

### Mission 3 — Heartbeat Handler Wiring

| Aspect | Detail |
|--------|--------|
| **Objective** | Wire all 5 VG-R1-006 stub handlers to real adapters |
| **Modified** | `wizard/lib/heartbeat.ts` — replace 5 stub handlers with full implementations |
| **Tests** | `wizard/__tests__/heartbeat-handlers.test.ts` — 12+ tests |
| **Prereqs** | Missions 1-2 (adapters exist) |
| **Effort** | ~400 lines + 12 tests |

**Handler wiring (complete data flow):**

```
handleCampaignLaunch(body):
  validate body (CampaignConfig schema)
  → classifyTier(body.dailyBudget) — safety check
  → factory.getCampaignAdapter(body.platform, vaultKey)
  → adapter.createCampaign(config)
  → stateMachine.transition(id, 'creating' → 'active')
  → append to campaign log
  → return { ok, campaignId, externalId }

handleCampaignPause(id):
  load campaign state
  → factory.getCampaignAdapter(campaign.platform, vaultKey)
  → adapter.pauseCampaign(campaign.externalId)
  → stateMachine.transition(id, 'paused')
  → log event

handleCampaignResume(id):
  load campaign state
  → adapter.resumeCampaign(campaign.externalId)
  → stateMachine.transition(id, 'active')
  → log event

handleBudgetChange(body):
  validate { campaignId, newBudgetCents }
  → classifyTier(newBudgetCents) — safety check
  → adapter.updateBudget(externalId, newBudgetCents)
  → update campaign state
  → log event

handleCampaignCreative(id, body):
  load campaign
  → adapter.updateCreative(externalId, creative)
  → log event

handleFreeze (ENHANCED):
  get all campaigns where status === 'active'
  → for each: adapter.pauseCampaign(externalId)
  → for each: stateMachine.transition('suspended')
  → daemonState = 'frozen'
  → log freeze event with campaign count

handleUnfreeze (ENHANCED):
  check: all circuit breakers clear?
  → get campaigns where status === 'suspended'
  → for each eligible: adapter.resumeCampaign(externalId)
  → for each: stateMachine.transition('active')
  → daemonState = 'healthy'
  → log unfreeze event
```

### Mission 4 — Status Polling + Danger Room Integration

| Aspect | Detail |
|--------|--------|
| **Objective** | Live campaign status sync + dashboard wiring |
| **Modified** | `wizard/lib/heartbeat.ts` — new `campaign-status-check` scheduled job |
| | `wizard/lib/treasury-heartbeat.ts` — campaign spend feeds runway forecast |
| | `wizard/api/danger-room.ts` — Campaigns tab real adapter data |
| | `wizard/ui/danger-room.js` — campaign table renders live metrics |
| **Tests** | `wizard/__tests__/campaign-polling.test.ts` — 8+ tests |
| **Prereqs** | Mission 3 (handlers wired) |
| **Effort** | ~400 lines + 8 tests |

**Campaign status job:** Every 5 minutes, poll each active campaign's status from the platform adapter. Detect platform-side changes (approved → active, rejected, budget exhausted, policy violation). Map to state machine transitions. On adapter failure: retry once → circuit breaker → degraded state.

**Danger Room integration:** Campaigns tab shows real-time: platform, status, daily budget, spend today, CTR, CPC, ROAS, actions (pause/resume/edit). Freeze button in header pauses ALL active campaigns across ALL platforms via enhanced handleFreeze.

### Mission 5 — Victory Gauntlet + Release

| Aspect | Detail |
|--------|--------|
| **Objective** | Full 5-round Gauntlet, version bump, branch sync |
| **Version** | v19.4.0 (MINOR — new campaign adapter category, new heartbeat jobs) |
| **Branch sync** | main → scaffold → core (shared methodology files) |
| **Effort** | 1 session |

### Architecture

**New directory: `wizard/lib/financial/campaign/`**
```
wizard/lib/financial/campaign/
  base.ts                 # AdPlatformAdapter interface + types
  sandbox-campaign.ts     # Full lifecycle with fake metrics
  google-campaign.ts      # Google Ads API v17 via node:https
  meta-campaign.ts        # Meta Marketing API v19.0 via node:https
  tiktok-campaign.ts      # TikTok Marketing API v1.3 via node:https
```

**Adapter strategy:** Same as billing adapters (v19.0) — implement against documented REST APIs using `node:https`. Zero new dependencies. Sandbox adapter provides full pipeline demo without API keys. Real adapters activate when credentials exist in financial vault.

**Dependency chain:** M1 (interface) → M2 (adapters) → M3 (wiring) → M4 (integration) → M5 (release). Linear — each mission builds on the previous.

### What Changes at the End

| Before (v19.3) | After (v19.4) |
|----------------|---------------|
| 5 daemon handlers return 501 | All handlers call real adapters |
| `/grow` plans but can't execute | `/grow` creates campaigns autonomously |
| Danger Room shows empty campaigns | Live metrics: CTR, CPC, ROAS per campaign |
| Freeze updates daemon state only | Freeze pauses ALL campaigns on ALL platforms |
| Sandbox mode: financial ops only | Sandbox mode: full campaign lifecycle demo |

---

## v19.3.0 — The Field Surgeon

*"Bashir examines the patient. 22 field reports triaged. The methodology heals."*

**What this did:** Inbox triage of 22 field reports (14 informational closed, 8 triaged with 13 fixes). Full /assess (findings: 18→6, all Critical/High resolved). /assemble --muster remediation (5 patterns documented, 8 identity headers, confidence scoring dedup, Crossfire caught 3 issues).

---

## v19.0 — The Funding Rail

*"Cultivation does not pay Google or Meta in crypto. It converts approved stablecoin balances into compliant fiat rails, then keeps your ad billing systems funded, monitored, and reconciled."*

**Designed by: Full Muster. PRD: `/docs/Stablecoin Ads.md` (785 lines)**

**What this does:** Adds a first-class stablecoin-funded treasury rail to Cultivation: USDC → Circle off-ramp → Mercury bank → Google/Meta billing. Two new adapter categories (StablecoinTreasuryAdapter, AdBillingAdapter), 8 new heartbeat daemon jobs, 3 new patterns, extended treasury/cultivation/grow commands, and Danger Room dashboard updates.

**ALL 16 MISSIONS BUILDABLE.** Adapters implemented via `node:https` against documented REST APIs (same pattern as Stripe adapter in v17.0). Sandbox adapters provide full pipeline demo. Real API accounts needed for live testing only, not for implementation. No stubs. No blocks.

### Phase 0 — Architecture and Docs (3 missions)

| # | Mission | Type | Effort |
|---|---------|------|--------|
| 1 | Patterns: `stablecoin-adapter.ts`, `ad-billing-adapter.ts`, `funding-plan.ts` | Pattern | 2 |
| 2 | Method docs: TREASURY.md, HEARTBEAT.md, GROWTH_STRATEGIST.md + command docs | Methodology | 2 |
| 3 | Data models + directory structure: `wizard/lib/financial/` with interfaces, enums, registries, treasury planner, funding policy engine | Code + Tests | 2 |

### Phase 1 — Provider + Billing Adapters (4 missions)

| # | Mission | Type | Effort |
|---|---------|------|--------|
| 4 | Circle adapter: connect, verify, get balances, list transfers, initiate off-ramp — via `node:https` against Circle API docs. Sandbox stablecoin adapter for demo pipeline. | Code + Tests | 2.5 |
| 5 | Mercury balance adapter: balance reads, transaction listing — via `node:https` against Mercury API docs. Sandbox bank adapter already exists (v17.0). | Code + Tests | 2 |
| 6 | Google/Meta billing adapters: billing mode detection, capability classification (FULLY_FUNDABLE / MONITORED_ONLY / UNSUPPORTED), invoice reads — via `node:https` against documented APIs | Code + Tests | 2.5 |
| 7 | Danger Room extensions: Growth (runway, funding risk), Treasury (stablecoin balance, pending transfers, freeze state), Campaigns (billing capability per platform), Heartbeat (provider sync, pending ops) | Code | 2 |

### Phase 2 — Treasury Operations (5 missions)

| # | Mission | Type | Effort |
|---|---------|------|--------|
| 8 | Treasury planner: runway forecasting, funding plan generation, buffer maintenance, just-in-time vs maintain-buffer modes | Code + Tests | 2.5 |
| 9 | Off-ramp lifecycle: initiate via Circle adapter, poll status, idempotency keys, WAL entries, settlement detection | Code + Tests | 3 |
| 10 | Heartbeat new jobs: 8 scheduled jobs wired to adapters (sandbox when no keys, real when configured) — balance check, off-ramp poll, settlement monitor, invoice scan, runway forecast, reconciliation, stale detector | Code + Tests | 3 |
| 11 | Reconciliation extension: provider → bank → platform three-way matching, variance detection, threshold classification, freeze triggers | Code + Tests | 2.5 |
| 12 | Freeze/unfreeze + circuit breakers: 6 automatic freeze triggers (PRD S13.2), manual approval gates (PRD S13.3), TOTP on unfreeze, treasury API routes (/balances, /funding-status, /freeze, /unfreeze, /simulate) | Code + Tests | 2 |

### Phase 3 — Policy + Reporting (3 missions)

| # | Mission | Type | Effort |
|---|---------|------|--------|
| 13 | Funding policy engine: 7 deterministic rules (PRD S15), auto-off-ramp for buffer maintenance, daily cap enforcement, invoice priority logic | Code + Tests | 2.5 |
| 14 | Platform-specific funding planner: Google invoice settlement lifecycle, Meta debit protection buffer, portfolio-aware rebalancing recommendations | Code + Tests | 2.5 |
| 15 | Reporting + export: daily treasury report (markdown + JSON), monthly ledger for tax/accounting, per-platform reliability report, `/treasury --simulate-funding` | Code + Tests | 2 |

### Release

| # | Mission | Type | Effort |
|---|---------|------|--------|
| 16 | Version bump + Victory Gauntlet + branch sync | Release | 1.5 |

**Version bump:** MAJOR (v19.0.0) — new adapter categories, new financial directory, new heartbeat jobs, new patterns, new treasury commands.

### Architecture (Muster-designed)

**New directory: `wizard/lib/financial/`**
```
wizard/lib/financial/
  stablecoin/
    base.ts               # Interfaces + types
    circle.ts             # Real implementation via node:https
    sandbox-stablecoin.ts # Sandbox with realistic fake data (full implementation)
  billing/
    base.ts               # Interfaces + types
    google-billing.ts     # Real implementation via node:https
    meta-billing.ts       # Real implementation via node:https
  treasury-planner.ts     # Pure logic: runway forecasting, funding plans
  funding-policy.ts       # Pure logic: 7 deterministic rules
  reconciliation-engine.ts # Pure logic: three-way matching
```

**Adapter strategy:** Same as Stripe (v17.0) — implement against documented REST APIs using `node:https`. Zero new dependencies. Sandbox adapter provides full pipeline demo without API keys. Real adapters activate when user configures credentials via `/cultivation install`. Tests use response fixtures.

**Bridge adapter:** Deferred to v19.1 (secondary off-ramp path per PRD S9).

### Security (Kenobi-verified)

All existing security infrastructure extends cleanly:
- Financial vault (scrypt, AES-256-GCM) for new credentials
- TOTP on all write operations (off-ramp, invoice settlement, unfreeze)
- WAL with idempotency keys for all financial mutations
- Hash-chained append-only logs for audit trail
- Single-writer (Heartbeat daemon only)
- Circuit breakers: 6 automatic freeze triggers
- Manual approval gates: first live off-ramp, first invoice settlement, first FULLY_FUNDABLE activation

### v19.1 — The Live Wire

*"Architecture without wiring is a blueprint. Wiring without intelligence is plumbing. Intelligence means it works when you plug in real keys."*

**Designed by: Full Muster audit of v19.0. Riker's honest assessment: 55% production-ready. This version fixes the other 45%.**

**The problem:** v19.0 built the architecture, pure logic, and API adapters. But the daemon wiring layer hard-codes sandbox adapters in 3 places, billing jobs are no-ops, bank balance is never populated, auto-approved funding plans are never executed, and 2 of 6 circuit breakers can't fire. Plugging in real Circle/Mercury keys today results in a system that polls a sandbox and writes plans nobody reads.

**The fix:** 6 missions that wire everything end-to-end so real credentials produce real operations.

#### Mission 1 — Adapter Factory + Mercury Wiring (CRITICAL)

1. **Adapter factory:** Create `wizard/lib/financial/adapter-factory.ts` — reads `funding-config.json.enc` from vault, returns the correct adapter (CircleAdapter vs SandboxStablecoinAdapter, MercuryBankAdapter vs SandboxBankAdapter) based on configured provider. Replace all 3 hard-coded `SandboxStablecoinAdapter` instantiations in `treasury-heartbeat.ts` with factory calls.
2. **Mercury wiring:** Job 3 (`bank-settlement-monitor`) calls `MercuryBankAdapter.getBalance()` via the factory and writes `bankBalanceCents` to treasury state. Runway calculations now use real bank data.

#### Mission 2 — Billing Jobs + Obligation Pipeline (HIGH)

1. **Google invoice job:** Job 4 reads Google Ads credentials from vault, instantiates `GoogleBillingAdapter`, calls `readInvoices()`, stores results in treasury state. Updates `pendingObligationsCents`.
2. **Meta debit job:** Job 5 reads Meta credentials from vault, instantiates `MetaBillingAdapter`, calls `readExpectedDebits()`, stores results. Updates `pendingObligationsCents`.
3. **Wire `pendingObligationsCents`:** Replace the `0 as Cents` TODO in runway-forecast job with actual sum from invoice/debit data.
4. **Wire CB-4/CB-5:** Call `evaluateBillingBreakers()` at the end of billing jobs.

#### Mission 3 — Auto-Funding Execution (HIGH)

1. **Plan executor:** New job or extension of runway-forecast — reads APPROVED plans from `funding-plans.jsonl`, calls `adapter.initiateOfframp()` via factory, transitions plan to PENDING_SETTLEMENT, writes WAL entry.
2. **Plan lifecycle completion:** When offramp-status-poll detects a completed transfer, find the matching plan and transition to SETTLED.
3. **WAL recovery:** On daemon startup, read `pending-ops.jsonl`, check status of any pending transfers, complete or fail them.

#### Mission 4 — Bug Fixes + Hardening

1. **Circle `listCompletedTransfers` stable IDs:** Use Circle's external payout ID (not random UUID) as the transfer record ID. Cache historical transfers to prevent ID regeneration.
2. **Sandbox `getTransferStatus` for unknown IDs:** Return `status: 'failed'` with error message instead of `status: 'completed'` with 0 amount.
3. **WAL rotation:** Add rotation to `pending-ops.jsonl` (same pattern as audit-log 7-rotation).

#### Mission 5 — Pure Logic Tests (6 modules)

1. `funding-policy.test.ts` — all 7 rules with allow/deny/freeze scenarios
2. `reconciliation-engine.test.ts` — 3-way matching, variance classification, freeze trigger
3. `funding-auto.test.ts` — policy + planner integration, auto-approve/deny scenarios
4. `platform-planner.test.ts` — Google settlement priority, Meta debit buffer, rebalancing
5. `reporting.test.ts` — daily report format, monthly ledger structure, simulation trajectory
6. `sandbox-stablecoin.test.ts` — lifecycle (pending→processing→completed), balance deduction, cancellation

#### Mission 6 — Version Bump + Victory Gauntlet

1. Version bump to v19.1.0
2. Victory Gauntlet with Hawkeye browser smoke test
3. Push all 3 branches

### Campaign Structure

| # | Mission | Type | Effort |
|---|---------|------|--------|
| 1 | Adapter factory + Mercury wiring | Code | 2 |
| 2 | Billing jobs + obligation pipeline + CB-4/CB-5 | Code | 2 |
| 3 | Auto-funding execution + WAL recovery | Code | 2 |
| 4 | Bug fixes + hardening | Code | 1 |
| 5 | Pure logic tests (6 modules) | Tests | 2 |
| 6 | Version bump + Victory Gauntlet | Release | 1 |

**Version bump:** MINOR (v19.1.0) — production wiring, no new features or breaking changes.

**After v19.1:** Plugging in real Circle + Mercury API keys should produce a system that automatically monitors stablecoin balances, forecasts runway, triggers off-ramps when the buffer is low, monitors bank settlement, tracks Google invoices and Meta debits, reconciles daily, and freezes autonomously when something goes wrong.

### v19.2 — The Wider Net

*"TikTok is 6% of global ad spend and growing 25% YoY. If Cultivation talks to Google and Meta but not TikTok, it's missing the fastest-growing channel."*

**Designed by: Full Muster. Riker's assessment: Bridge deferred (0 users need it), LinkedIn deferred (niche B2B). TikTok is the clear next target. Then v20.0 CLI immediately.**

| # | Mission | Type | Effort |
|---|---------|------|--------|
| 1 | Widen AdPlatform type + billing factory extensibility | Code | 1 |
| 2 | TikTok billing adapter: spend monitoring, capability classification, billing mode detection | Code + Tests | 2 |
| 3 | Version bump + push all branches | Release | 1 |

**Version bump:** MINOR (v19.2.0).

**Deferred:**
- Bridge stablecoin adapter → v19.3+ (secondary per PRD, slot reserved in registry)
- LinkedIn billing → v19.3+ (niche B2B, build when a user needs it)

### After v19.2

| Version | Direction |
|---------|-----------|
| **v20.0** | CLI Distribution — `npx voidforge init` global installer (highest strategic priority) |
| **v19.3+** | Bridge adapter, LinkedIn billing, Snap billing (on demand) |

---

## v18.2 — The Dogfood

*"Eat what you cook."*

**The gap:** v18.0 added E2E infrastructure. v18.1 added browser intelligence methodology (console capture, behavioral walkthrough, security inspection). Neither has been exercised against VoidForge's own wizard pages. We teach these capabilities but haven't used them ourselves.

**What this does:** Start the wizard server. Launch the review browser. Run the full `browser-review.ts` protocol against all 7 pages. Find what's broken. Fix it. Write E2E tests that encode the fixes as regression gates.

### Mission 1 — Console Error Sweep + Behavioral Walkthrough

Start the wizard server with `VOIDFORGE_TEST=1`. For each of the 7 pages:

1. Navigate to the page
2. Attach console error capture — log every `pageerror` and `console.error`
3. Click every interactive element (buttons, tabs, links, modals)
4. Fill every form field with test data
5. Tab through the page, verify focus order
6. Screenshot any page that has console errors or non-responsive elements

**Output:** A findings list of real console errors + non-functional UI elements in VoidForge's own wizard.

### Mission 2 — Security Inspection

Run the security helpers from `browser-review.ts` on VoidForge:

1. `inspectCookies()` — check session cookies for HttpOnly/Secure/SameSite
2. `captureCORSHeaders()` — verify API responses don't have wildcard CORS
3. `captureCSPViolations()` — monitor for CSP violations during page loads
4. Auth redirect test — navigate to protected pages without session, verify redirect behavior

### Mission 3 — Fix All Findings

Fix every console error, non-functional element, security gap, and a11y violation found in Missions 1-2. Write E2E tests that verify the fixes.

### Mission 4 — Version Bump + Push

Update version files, push all 3 branches.

### Campaign Structure

| # | Mission | Type | Effort |
|---|---------|------|--------|
| 1 | Console sweep + behavioral walkthrough | Test + findings | 1.5 |
| 2 | Security inspection | Test + findings | 1 |
| 3 | Fix all findings + regression tests | Code + tests | 2 |
| 4 | Version bump + push | Release | 0.5 |

**Version bump:** PATCH (v18.2.0) — bug fixes found by dogfooding, no new features.

---

## v18.1 — The Eyes

*"Agents can now INTERACT with the product and take receipts. The interacting is the capability. The programmatic assertions are the eyes. Screenshots are the memory."*

**Designed by: Full Muster (2 waves, 8+ agents). Riker's dissent preserved and adopted.**

**What this is:** Agents use Playwright to interact with running applications during review passes (`/qa`, `/ux`, `/security`, `/gauntlet`). Console error capture, behavioral walkthroughs, cookie inspection, and screenshots as debug artifacts when something fails.

**What this is NOT:** Screenshot-based design review. Claude cannot reliably judge "is this spacing correct" from a screenshot (Wave 3, Riker). The real eyes are programmatic assertions (`toBeVisible()`, `toHaveCSS()`, `toHaveAttribute()`, axe-core). Screenshots are proof-of-life and failure evidence, not the primary review mechanism.

### Three Capabilities

**1. Console Error Capture (highest value, lowest noise)**

During any agent review of a running app, `page.on('pageerror')` and `page.on('console', 'error')` are attached. Any uncaught exception during normal navigation is an automatic High finding. Error-level console output from application code (not browser extensions, not React dev warnings) is flagged.

**Integration:** QA_ENGINEER.md (Batman Step 3.6), GAUNTLET.md (Hawkeye R2.5), SECURITY_AUDITOR.md (CSP violation capture).

**2. Behavioral Walkthrough (agents click, not just assert)**

Agents navigate the product like users: click buttons, fill forms, open modals, submit, and verify the response. This already works via Playwright page objects (v18.0). v18.1 adds the protocol to method docs so agents do it consistently:
- Click every interactive element on primary routes, verify something visible changes
- Fill every form with valid and invalid data, verify validation and success states
- Open every modal, verify keyboard dismissibility (Escape) and focus trapping
- Force error states via `page.route()` interception, verify error UX is helpful

**Integration:** PRODUCT_DESIGN_FRONTEND.md (Galadriel Step 1.5 walkthrough), QA_ENGINEER.md (Batman error state gallery), SECURITY_AUDITOR.md (Kenobi auth redirect testing, cookie inspection).

**3. Screenshots as Evidence (not as review)**

When an agent finds an issue via programmatic assertion or console error, a screenshot is taken as evidence. Screenshots are session-local (temp dir, JPEG 80%, 1x DPI, cleaned up after review). They are NOT committed, NOT compared across runs, NOT used as the primary detection mechanism. They prove what the agent saw when the bug occurred.

Additionally: a "proof of life" screenshot of every primary route as a binary gate — "page renders correctly" or "page is broken." This is triage, not review.

**Integration:** All review commands as evidence capture. GAUNTLET.md R2.5 proof-of-life gallery.

### Blockers Resolved in Design (Wave 3)

| Blocker | Solution |
|---|---|
| Server startup timing race | HTTP health check URL (not TCP port), ready signal wait before any navigation |
| Console error false positives | Error-level only, allowlist for known noise (React dev, HMR), `--disable-extensions` |
| Cross-platform screenshot variance | Fixed viewport/media/DPI, never compare cross-environment, session-local only |
| Complex page state prerequisites | Visual coverage map per project, `seed-visual-state.ts` helper, documented gaps |

### Mission Plan (5 missions)

| # | Mission | Type | Effort |
|---|---------|------|--------|
| 1 | `browser-review.ts` pattern — review browser launcher, console capture, screenshot helper, cookie/header inspection, behavioral walkthrough protocol | Pattern | 2 |
| 2 | QA_ENGINEER.md — Batman Step 3.6 "Browser Forensic Review" (console sweep, error state gallery, form torture, network failure) | Methodology | 1.5 |
| 3 | PRODUCT_DESIGN_FRONTEND.md — Galadriel browser walkthrough protocol, Samwise browser a11y (tab walkthrough, media emulation), responsive proof-of-life | Methodology | 1.5 |
| 4 | SECURITY_AUDITOR.md + GAUNTLET.md — Kenobi browser security checks (CORS, CSP, cookies, auth redirects), Hawkeye R2.5 proof-of-life gallery + console capture | Methodology | 1.5 |
| 5 | Version bump + Victory Gauntlet | Release | 1 |

**Version bump:** MINOR (v18.1.0) — new capability within existing infrastructure, no new dependencies.

### After v18.1

| Version | Direction |
|---|---|
| **v19.0** | CLI Distribution — `npx voidforge init` global installer |
| **v17.4+** | Platform Adapters — as developer accounts become available |

---

## v17.3 — The Muster

*"The beacons are lit! Gondor calls for aid!"*

**Two changes:** (1) The `--muster` flag — deploy every viable agent across all 9 universes for a single task. (2) Flag nomenclature standardization — fix 8 inconsistencies so flags work the same way across every command.

### Part 1: The Muster Protocol (`--muster`)

When `--muster` is passed, instead of the standard agent roster for a command, every agent that has relevant expertise for the specific task gets deployed in 3 waves:

- **Wave 1 (5-8 agents):** Domain leads + strongest cross-cutting experts
- **Wave 2 (5-10 agents):** Supporting experts from each relevant universe
- **Wave 3 (3-5 agents):** Adversarial/challenge agents (Deathstroke, Maul, The Mule, Constantine)

Each agent gets the task brief and returns findings in standard format. A synthesis step (Théoden + Gandalf) deduplicates, resolves conflicts, and presents a unified recommendation with dissenting opinions preserved.

**Applies to:** `/campaign --muster`, `/architect --muster`, `/build --muster`, `/gauntlet --muster` (synonym for `--infinity`)

**Intensity spectrum:** `--fast` < standard < `--infinity`/`--muster`

**New file:** `docs/methods/MUSTER.md` — reusable protocol for any command that wants the full roster.

### Part 2: Flag Nomenclature Standardization

**8 inconsistencies to fix:**

#### Fix 1: `--quick` → `--fast` (Gauntlet)
`/gauntlet --quick` means "skip last 2 rounds." `/assemble --fast` means "skip last 2 phases." Same concept, different names. Rename `--quick` to `--fast` across Gauntlet. Keep `--quick` as a deprecated alias for one version.

#### Fix 2: `--plan` standardized
Add `--plan` to `/architect` and `/grow`. Any command that can plan without executing should accept it. Currently only `/campaign` has it.

#### Fix 3: `--status` always a flag, never a subcommand
Currently mixed: `/cultivation status` (subcommand) vs `/treasury --status` (flag). Standardize: always `--status`. Keep subcommand form as alias.

#### Fix 4: `--dry-run` where it matters
Add `--dry-run` to: `/treasury --launch`, `/grow` (Phase 4), `/git`. Show what would happen before doing it.

#### Fix 5: `--blitz` on more commands
Add `--blitz` to `/assemble` and `/build`. The concept (autonomous, no human pauses) applies beyond campaigns.

#### Fix 6: `--resume` completeness
Add `--resume` to `/build` (it has resumable state via build-state.md but no explicit flag).

#### Fix 7: `--muster` as Tier 3 intensity
Add `--muster` as the maximum-agent flag. Sits above `--infinity` (which is Gauntlet-specific) as a universal "everyone in the room" flag.

#### Fix 8: Document the flag taxonomy
Add a "Flags" section to CLAUDE.md documenting the 3 tiers:
- **Tier 1 (Universal):** `--resume`, `--plan`, `--fast`, `--dry-run`, `--status`, `--blitz`
- **Tier 2 (Scope):** `--security-only`, `--ux-only`, `--qa-only`
- **Tier 3 (Intensity):** `--fast` (reduced) < standard < `--muster` (maximum)

### Campaign Structure (5 missions)

| # | Mission | Type | Effort |
|---|---------|------|--------|
| 1 | Write `docs/methods/MUSTER.md` — the Muster Protocol | Methodology | 1 |
| 2 | Flag nomenclature: rename `--quick` → `--fast`, add `--plan`/`--blitz` to more commands | Methodology | 1.5 |
| 3 | Add `--muster` flag to `/architect`, `/campaign`, `/build`, `/gauntlet` commands | Commands | 1 |
| 4 | CLAUDE.md flag taxonomy + HOLOCRON flag reference section | Docs | 1 |
| 5 | Version bump + Victory Gauntlet | Release | 1 |

**Version bump:** MINOR (v17.3.0) — new flag, new method doc, no breaking changes (deprecated aliases preserved).

---

## v18.0 — The Proving Ground

*"The Gauntlet tests the code. The Proving Ground tests the product."*

**Designed by: Full Muster (3-wave, 20+ agents across 6 universes)**

**Breaking change:** Two new capabilities: (1) Playwright browser automation as a first-class test dependency, (2) browser-based verification integrated into the methodology — `/qa`, `/ux`, `/security`, and `/gauntlet` can now interact with running applications, not just read code. This changes how VoidForge reviews every project it builds.

**Origin:** Deferred since v16.1 (3 versions). The methodology teaches E2E testing but doesn't practice it. VoidForge's 7 HTML pages break silently. More broadly: all review commands read code but never see the rendered site. v18.0 gives VoidForge eyes.

### Two Deliverables

**Deliverable 1 — Methodology: browser verification as a fundamental capability**
Every project VoidForge builds can now have agents verify the running application:

| Command | Before v18.0 (reads code) | After v18.0 (sees the site) |
|---|---|---|
| `/qa` | Batman reads test files, checks edge cases in code | Batman launches the app, clicks through flows, runs axe-core a11y |
| `/ux` | Galadriel reads HTML/CSS, checks ARIA in source | Galadriel opens pages, navigates with keyboard, checks rendered contrast |
| `/gauntlet` R2.5 | Hawkeye runs `curl` against endpoints | Hawkeye opens a browser, walks the full user journey |
| `/security` | Kenobi reads auth middleware | Kenobi tests CORS headers, cookie attributes, redirect behavior in a real browser |
| `/test` | Batman writes unit tests | Batman writes E2E tests alongside unit tests for user-facing features |
| `/build` Phase 9-11 | Review cycle reads the diff | Review cycle includes browser verification when `e2e: yes` |

**Deliverable 2 — VoidForge's own E2E tests**
Apply the methodology to VoidForge itself: 10-15 focused E2E tests for the 7 wizard pages.

### Architecture (Muster-Informed)

**5 blockers resolved in design:**

| Blocker | Solution |
|---|---|
| E2E flakiness | Explicit retry policy (1 retry), Huntress quarantine protocol, deterministic server state (clean temp dir per test), explicit waits only (no `waitForTimeout`) |
| CI job blocking | Separate E2E CI job, parallel with unit tests, does NOT block on flake (informational for first 2 versions, then enforced) |
| Secret exfiltration via page.evaluate() | Network isolation (`--host-resolver-rules="MAP * 127.0.0.1"`), minimal env for test server process |
| CI env secrets accessible | E2E job runs without deployment secrets (separate GitHub Actions job, no `secrets: inherit`) |
| 400MB browser binary | Install Chromium only (`npx playwright install chromium`), cache in CI via `actions/cache` |

**Key design decisions (from Muster):**

- **axe-core integrated** (Samwise): `@axe-core/playwright` (~200KB) added alongside Playwright. Every page E2E test includes a free a11y scan. Automates 60-70% of Samwise's current manual checks.
- **CWV optional** (Torres): `measureWebVitals(page)` helper available but not mandatory. Projects opt in via `performance: true` in frontmatter.
- **No visual regression** (Nightwing): Screenshot comparison too fragile across platforms. Use `toHaveCSS()` for critical layout assertions instead.
- **No Lighthouse in CI** (Torres): Too heavy (500MB + 15-20s per page), too noisy. CWV measurement covers 80% of value at 1% of cost.
- **10-15 tests, not 30+** (Riker): Focus on a11y assertions + interaction contracts. The Gauntlet handles edge cases better than automated tests.
- **PTY gap documented** (Constantine): Terminal E2E tests verify UI only (node-pty mocked). The hardest feature is not E2E-testable in CI. Separate `test:e2e:local` for developers with node-pty.
- **Test mode server** (Constantine): `VOIDFORGE_TEST=1` flag disables rate limiting and accepts static TOTP, while still exercising real auth flow.
- **Non-browser projects excluded** (Constantine): E2E applies to `type: full-stack` and `type: static-site` only. API-only projects use integration tests as their top-of-pyramid.

### PRD Frontmatter Addition

```yaml
e2e: yes                    # Activates browser testing in /build, /qa, /gauntlet
e2e_framework: playwright   # playwright | cypress (default: playwright)
```

### Mission Plan (8 missions)

#### Mission 1 — E2E Infrastructure + Security Hardening

1. Add `@playwright/test` + `@axe-core/playwright` as dev dependencies
2. Create `playwright.config.ts` with: Chromium only, network isolation, random port, test mode env
3. Create test helpers: server start/stop with health check wait, auth helper with test-mode TOTP, axe-core fixture
4. Add `npm run test:e2e` and `npm run test:e2e:local` scripts
5. Add separate E2E CI job to `validate-branches.yml` with browser caching
6. Add `VOIDFORGE_TEST=1` mode to server.ts (rate limit bypass, static TOTP)
7. Write 1 smoke test: server starts, lobby page loads, axe-core passes
8. Design flake management: retry policy, quarantine protocol in test config

#### Mission 2 — `e2e-test.ts` Pattern File + TESTING.md Update

1. New pattern: `docs/patterns/e2e-test.ts` — Page Object Model, axe-core fixture, CWV helper, network mock, WebSocket mock, auth helper, flaky test annotation
2. TESTING.md update: E2E tier in testing pyramid, performance budget (2min max, 50-test shard threshold), flaky test protocol (Huntress), framework-specific E2E setup
3. PRD template: add `e2e: yes | no` field with defaults by project type

#### Mission 3 — Method Doc Integration (QA, UX, Security, Gauntlet, Build)

1. **QA_ENGINEER.md**: Batman's protocol gets browser verification steps, Huntress flaky test monitoring, E2E as third regression defense line
2. **PRODUCT_DESIGN_FRONTEND.md**: Samwise gets browser a11y checks (axe-core, focus order, ARIA live regions, reduced motion). Éowyn gets E2E enchantment verification. Gimli gets CWV from test suite.
3. **GAUNTLET.md**: Round 2.5 Hawkeye upgrade from curl to Playwright. Troi Council round gets browser-based PRD compliance verification with screenshots.
4. **BUILD_PROTOCOL.md**: Phases 1 (scaffold), 4 (core feature), 9-11 (review) get E2E integration points
5. **SECURITY_AUDITOR.md**: Kenobi gets browser-based checks (CORS, CSP, cookie attributes, auth flow bypass)
6. **DEVOPS_ENGINEER.md**: Separate E2E CI job architecture, browser caching strategy

#### Mission 4 — Lobby + Login + Setup Wizard E2E

1. **Lobby**: Page load, empty state, project cards, import modal (keyboard nav, Escape closes), axe-core scan
2. **Login**: Form render, validation, TOTP field, auth flow (test mode), redirect, error states, axe-core
3. **Setup Wizard**: 3-act flow, vault password creation, focus trap in modals, axe-core per act

#### Mission 5 — Danger Room + Growth Tabs E2E

1. **Tab navigation**: All tabs clickable, content switches, axe-core per tab
2. **Growth/Campaigns/Treasury/Heartbeat tabs**: KPI render, empty states, data with sandbox files
3. **WebSocket activity feed**: Mock WebSocket, verify ticker updates

#### Mission 6 — Deploy + Tower + War Room E2E

1. **Deploy wizard**: Target selection, provision UI (SSE mocked)
2. **Tower**: Terminal UI loads (node-pty mocked), session creation UI, axe-core
3. **War Room**: Page load, tab verification, axe-core

#### Mission 7 — VoidForge Dogfood Verification

1. Run the full E2E suite with `npm run test:e2e`
2. Run axe-core across all 7 pages — fix any a11y violations found
3. Verify CWV measurements are within thresholds
4. Document the PTY gap and `test:e2e:local` for developers

#### Mission 8 — Version Bump + Victory Gauntlet

1. Version bump to v18.0.0
2. CHANGELOG, VERSION.md, package.json
3. Victory Gauntlet (now with Hawkeye running Playwright in Round 2.5)
4. Push all 3 branches

### Campaign Structure

| # | Mission | Type | Effort |
|---|---------|------|--------|
| 1 | E2E infrastructure + security hardening | Infra | 2 |
| 2 | e2e-test.ts pattern + TESTING.md | Pattern + methodology | 1.5 |
| 3 | Method doc integration (6 docs) | Methodology | 2 |
| 4 | Lobby + Login + Setup Wizard E2E | Tests | 2 |
| 5 | Danger Room + Growth Tabs E2E | Tests | 1.5 |
| 6 | Deploy + Tower + War Room E2E | Tests | 1.5 |
| 7 | Dogfood verification + a11y fixes | Tests + fixes | 1 |
| 8 | Version bump + Victory Gauntlet | Release | 1.5 |

**Version bump:** MAJOR (v18.0.0) — new dependencies (Playwright, axe-core), CI pipeline restructured, methodology capability added (browser verification).

### Dependencies (justified per CLAUDE.md)

| Package | Size | Justification |
|---|---|---|
| `@playwright/test` | ~5MB (npm) + ~250MB (Chromium binary, cached) | Core v18.0 deliverable: browser automation for E2E testing |
| `@axe-core/playwright` | ~200KB | Automates 60-70% of Samwise's manual a11y checks. Unconditional — a11y is not optional per CLAUDE.md. |

### Known Gaps (documented, not deferred as stubs)

- **PTY terminal**: E2E tests verify UI only, not data flow. `test:e2e:local` available for developers with node-pty.
- **Non-browser projects**: E2E pattern applies to `type: full-stack` and `type: static-site` only. API-only, CLI, mobile, and game projects use integration tests as top-of-pyramid.
- **Visual regression**: Deferred. `toHaveCSS()` assertions cover critical layout; screenshot comparison revisited if VoidForge adds a design system.

### After v18.0

| Version | Direction |
|---------|-----------|
| **v19.0** | CLI Distribution — `npx voidforge init` global installer |
| **v17.4+** | Platform Adapters — as developer accounts become available |

### After v18.0

| Version | Direction |
|---------|-----------|
| **v19.0** | CLI Distribution — `npx voidforge init` global installer |
| **v17.3+** | Platform Adapters — as developer accounts become available |

---

## v17.2 — The Security Test Pass

*"Trust, but verify." — Picard*

**Origin:** v17.1 reassessment gate identified 7 security-critical modules (1,362 lines) with zero test coverage: totp, tower-rate-limit, tower-session, user-manager, compliance, treasury-backup, autonomy-controller. These handle auth, rate limiting, RBAC, 2FA, encrypted backups, and autonomous execution controls.

### Mission 1 — Security Module Tests (P0)

Write tests for all 7 security-critical modules:
1. `totp.test.ts` — TOTP generation, verification, replay protection, clock drift
2. `tower-session.test.ts` — Session creation, validation, expiry, IP binding
3. `tower-rate-limit.test.ts` — Per-IP rate limiting, window reset
4. `user-manager.test.ts` — RBAC: create, invite, roles, removal
5. `compliance.test.ts` — Privacy/email/platform ToS checks
6. `treasury-backup.test.ts` — Encrypted backup create, restore, pruning
7. `autonomy-controller.test.ts` — Circuit breakers, kill switch, tier controls

### Mission 2 — TS Error Fix + Version Bump

1. Fix the 2 remaining TypeScript errors (test mock types)
2. Verify `tsc --noEmit` = 0 errors
3. Version bump, changelog, push all branches

**Version bump:** PATCH (v17.2.0) — tests only, no feature changes.

---

## v17.1 — The Gauntlet Cleanup

*"Polish before expansion."*

**Origin:** Victory Gauntlet Round 1 flagged 6 Medium findings, TypeScript compilation warnings, and test coverage gaps. These don't block functionality but erode confidence. Fix them before building anything new.

### Mission 1 — Security + Edge Case Fixes

1. **Timing-safe vault password comparison** (`heartbeat.ts:72-76`) — Replace length-gated `timingSafeEqual` with HMAC comparison (hash both inputs to fixed-length before comparing). Currently leaks password length via timing.
2. **Negative amountCents validation** (`heartbeat.ts readTreasurySummary()` + `danger-room.ts`) — Clamp or reject negative values in spend/revenue log parsing. Negative spend produces nonsensical ROAS and inflated net.
3. **Inverted date range handling** (`sandbox.ts`, `sandbox-bank.ts`) — Throw or return empty when `end < start` instead of silently treating as 1 day.
4. **IPv6 proxy shutdown** (`server.ts`) — Store the `ipv6Proxy` reference and close it in the shutdown handler.

### Mission 2 — TypeScript Strict Compliance

1. **Fix 31 pattern file compilation warnings** — `docs/patterns/ad-platform-adapter.ts`, `revenue-source-adapter.ts`, `financial-transaction.ts`. These are the canonical type definitions consumed by the wizard; they should compile cleanly.
2. **Add `npm run typecheck` to CI** (`.github/workflows/validate-branches.yml`) — `tsc --noEmit` on main branch push/PR. This prevents the type drift that caused 76 errors to accumulate undetected.

### Mission 3 — Test Coverage Expansion

1. **`wizard/__tests__/stripe-adapter.test.ts`** — Test against response fixtures (mock `node:https` requests). Cover: connect, getTransactions, getBalance, error handling for non-JSON responses.
2. **`wizard/__tests__/heartbeat.test.ts`** — Test: readCampaigns, readTreasurySummary, buildStateSnapshot (mock filesystem). Don't test the full daemon lifecycle (that needs integration tests).
3. **`wizard/__tests__/audit-log.test.ts`** — Test 7-rotation scheme: write past threshold, verify .1-.7 cascade.
4. **Sandbox module-level Map** — Move campaigns Map to instance scope in `sandbox.ts` to prevent state leaks between tests.

### Mission 4 — ADRs + Reassessment

1. Write 3 ADRs from v17.0 decisions:
   - **ADR-032: No Stubs Doctrine** — Why stubs were removed, the policy, enforcement points
   - **ADR-033: Sandbox Demo Pipeline** — Why sandbox adapters instead of mocks, how they relate to real adapters
   - **ADR-034: Raw HTTPS for External APIs** — Why node:https instead of Stripe SDK (zero-dependency constraint)
2. **Run `/assess`** on the cleaned-up codebase — a fresh assessment to see where VoidForge stands after v17.0 + v17.1. This produces the decision point for what comes next.

### Campaign Structure

| # | Mission | Type | Effort |
|---|---------|------|--------|
| 1 | Security + edge case fixes | Code | 1 |
| 2 | TypeScript strict compliance | Code + CI | 1 |
| 3 | Test coverage expansion | Tests | 1.5 |
| 4 | ADRs + reassessment | Docs + assess | 1 |

**Version bump:** MINOR (v17.1.0) — new tests, new ADRs, no breaking changes.

### After v17.1: The Reassessment Gate

v17.1 Mission 4 produces a fresh `/assess` report. That report determines what v18.0 is. Possible outcomes:

| Assessment Result | Next Version |
|---|---|
| Clean bill of health | v18.0 is a new feature (E2E, marketplace, CLI distribution) |
| New findings from pattern/type fixes | v17.2 to resolve before expanding |
| Platform adapter accounts available | v17.2 implements real adapters (Google Ads, Meta, etc.) |

**The rule: don't plan v18.0 until the assessment says the foundation is solid.** This prevents the pattern that led to v17.0 — building 5 versions of features on top of stubs.

---

## v17.0 — The Complete Implementation

*"No more stubs. No more lies."*

**Breaking change:** The No Stubs Doctrine — a fundamental behavioral policy change. VoidForge will never again ship stub code that returns fake success, throws "not implemented", or exists as an empty interface placeholder. If a feature is scoped, it is fully implemented. If it's not ready, no file is committed. This policy is enforced across all method docs, build protocol phases, and review commands.

**Origin:** Pre-build assessment (2026-03-24) found 8 adapter stubs with 77 `throw new Error('Implement...')` calls, a freeze endpoint returning fake success, an AWS validation stub, and hollow heartbeat daemon handlers — all shipped as if functional. The Cultivation Growth Engine was architecturally complete but externally non-functional. This version eliminates every stub and makes Cultivation work end-to-end.

### Track 1: The No Stubs Doctrine (Methodology)

**The policy:**
- Never ship a function that returns hardcoded success without side effects
- Never ship a `throw new Error('Implement...')` placeholder
- Never ship a handler that logs a message but performs no work
- If a feature isn't ready to implement: don't create the file. Document it as "planned" in the ROADMAP with explicit scope. No code artifact.
- `/architect` ADRs must include implementation scope: "fully implemented" vs "deferred (no stub code)"
- `/campaign` Dax must flag existing stubs as mandatory remediation before new feature work
- `/gauntlet` RC-STUB is a first-class root cause category (auto-High severity)
- `/assess` stub detection is a primary assessment target

**Files modified:**
- `CLAUDE.md` — Coding Standards: add No Stubs rule
- `docs/methods/BUILD_PROTOCOL.md` — Implementation completeness gate per phase
- `docs/methods/CAMPAIGN.md` — Dax stub detection in Step 1
- `docs/methods/SYSTEMS_ARCHITECT.md` — ADR implementation scope requirement
- `docs/methods/GAUNTLET.md` — RC-STUB root cause category
- `.claude/commands/assess.md` — Formalize stub detection
- `docs/methods/GROWTH_STRATEGIST.md` — Remove "implement later" language
- `docs/LESSONS.md` — Cross-project lesson

### Track 2: Security Remediation (P0 + P1)

**P0 — Fix Now:**
1. `wizard/lib/tower-auth.ts` — Fix `getClientIp()`: use `parts[0].trim()` (leftmost X-Forwarded-For entry, not rightmost). All rate limiting and session IP binding is currently broken in remote mode — every user maps to `127.0.0.1`.
2. `wizard/server.ts` — Implement dual loopback binding (`127.0.0.1` + `::1`) in local mode per PRD §9.20.1. Currently binds to `::` (IPv6 wildcard), exposing financial vault data to LAN.
3. `wizard/api/credentials.ts` — Replace `req.socket.remoteAddress` with `getClientIp(req)` for vault unlock rate limiting. Currently all users behind proxy share one rate limit bucket.
4. `wizard/lib/tower-rate-limit.ts` — Remove duplicate dead `getClientIp()` export.

**P1 — Stub Elimination:**
5. `wizard/api/danger-room.ts` — Wire `/freeze` endpoint to daemon Unix socket. Return `{ ok: false, error: 'Daemon not running' }` when daemon is down instead of fake success.
6. `wizard/api/cloud-providers.ts` — `validateAws()`: call `STS.GetCallerIdentity()` (SDK already a dependency). No more format-only stub.
7. `wizard/api/auth.ts` — Remove outer `hasUsers()` TOCTOU race. Rely on `createUser()`'s serialized check.

**P2 — Storage Hardening:**
8. `wizard/lib/audit-log.ts` — 7-rotation scheme or date-based naming (currently single `.1` rotation loses financial audit trail).
9. `wizard/lib/tower-auth.ts` — Backup-before-write for `auth.json` (currently no backup; corruption = remote lockout).
10. `wizard/server.ts` — Register `/api/server/status` via `addRoute()` for auth middleware coverage.
11. `wizard/lib/treasury-backup.ts` — File size limit (100MB) before memory read.

### Track 3: Cultivation Activation

**Mission 5 — Sandbox Adapter Layer:**
- New `wizard/lib/adapters/sandbox.ts` — Full `AdPlatformSetup` + `AdPlatformAdapter` + `RevenueSourceAdapter` implementation with realistic fake data. Every method returns valid-shaped data. No throws. This IS a full implementation for a sandbox platform.
- New `wizard/lib/adapters/sandbox-bank.ts` — Sandbox bank adapter with realistic transactions/balances.
- Wire `wizard/lib/heartbeat.ts` handlers — `readCampaigns()` reads campaign state files. `readTreasurySummary()` reads treasury files. All 8 scheduled jobs call real adapter logic. No more hollow handlers.
- Update `wizard/lib/adapters/index.ts` — Sandbox in PLATFORM_REGISTRY with `sandbox: true` flag.

**Mission 6 — Stripe Revenue Adapter:**
- New `wizard/lib/adapters/stripe.ts` — Real implementation via `node:https` (zero new dependencies):
  - `connect()` → `GET /v1/account` (verify key, return account name)
  - `getTransactions()` → `GET /v1/charges` with date range
  - `getBalance()` → `GET /v1/balance`
  - `detectCurrency()` → account default currency
- Tests against response fixtures (not live API in CI).

**Mission 7 — Danger Room Growth Tabs:**
- Add 4 growth tabs to `wizard/ui/danger-room.html`: #growth, #campaigns, #treasury, #heartbeat
- Tab rendering in `wizard/ui/danger-room.js`: KPI cards, campaign table, vault status, daemon status
- Expand `/api/danger-room/heartbeat` to return campaign + treasury data.

**Mission 8 — Cultivation Test Coverage:**
- New tests: financial-vault, TOTP, reconciliation, campaign-state-machine, sandbox-adapter, stripe-adapter.

**Mission 9 — Stub Cleanup (Doctrine Enforcement):**
- Delete all 6 ad platform adapter stub files (meta.ts, google.ts, tiktok.ts, linkedin.ts, twitter.ts, reddit.ts) and 2 bank adapter stubs (mercury.ts, brex.ts).
- Update `adapters/index.ts` to list available (sandbox, stripe) vs planned (meta, google, etc.).
- No file with `throw new Error('Implement...')` may exist after this mission.

### Campaign Structure (10 missions)

| # | Mission | Track | Type | Effort |
|---|---------|-------|------|--------|
| 1 | The No Stubs Doctrine | Methodology | Method docs + CLAUDE.md | 1.5 |
| 2 | P0 Security Fixes | Security | Code (tower-auth, server, credentials) | 1 |
| 3 | P1 Stub Elimination | Security | Code (danger-room, cloud-providers, auth) | 1 |
| 4 | Storage Hardening | Security | Code (audit-log, tower-auth, treasury-backup) | 1 |
| 5 | Sandbox Adapter Layer | Cultivation | Code (new adapters, heartbeat wiring) | 2 |
| 6 | Stripe Revenue Adapter | Cultivation | Code (new adapter, real API) | 1.5 |
| 7 | Danger Room Growth Tabs | Cultivation | Code + UI (dashboard wiring) | 1.5 |
| 8 | Cultivation Test Coverage | Cultivation | Tests (6 new test files) | 1.5 |
| 9 | Stub Cleanup | Doctrine | Code (delete stubs, update registry) | 0.5 |
| 10 | Docs + Victory Gauntlet | All | PRD, ROADMAP, VERSION, CHANGELOG + Gauntlet | 2 |

**Version bump:** MAJOR (v17.0.0) — behavioral policy change (No Stubs Doctrine).

### BLOCKED (deferred to v17.1+)

| Item | Reason | Unblocked By |
|------|--------|--------------|
| Google Ads adapter | Requires MCC + developer token | User creates developer account |
| Meta Marketing adapter | Requires Business Manager app review | User creates developer account |
| TikTok/LinkedIn/Twitter/Reddit adapters | Require platform developer accounts | User creates accounts |
| Mercury/Brex bank adapters | Require business banking accounts with API access | User has accounts |
| Paddle revenue adapter | Requires Paddle account | User creates account |

These will ship as fully-implemented adapters in v17.1+ when developer accounts are available. Per the No Stubs Doctrine, no stub code will be committed — only real implementations when real testing is possible.

---

## v16.1 — The Hardened Methodology

*Gaps identified during the v15.0→v16.0 mega-session. Real problems, not speculative features.*

### Database Migration Safety

**The gap:** No agent reviews migration file safety. A migration that adds `NOT NULL` without a default, drops a column a running server reads, or full-table-scans 10M rows during peak traffic — nobody catches it.

**The fix:**
- Migration safety checklist in BUILD_PROTOCOL.md Phase 2 (Schema): backward compatibility, rollback plan, data volume awareness, zero-downtime compatibility
- Picard's `/architect` Step 1 (Spock schema review) adds migration review
- New pattern file: `database-migration.ts` — safe migration patterns with rollback, online DDL for large tables, data backfill with batching

### Dependency Health Check

**The gap:** VoidForge builds projects and walks away. When the user returns months later, dependencies are stale, SDKs have deprecation warnings, Node.js version might be EOL.

**The fix:**
- Add dependency health check to `/assess` (Picard's pre-build assessment): `npm outdated`, major version flags, Node.js EOL check, deprecation pattern scan
- Add to `/campaign` Step 0 (Kira's recon): "If project untouched >30 days, run dependency health check first"

### Load Testing Guidance

**The gap:** Torres reviews performance architecture theoretically. Nobody proves it with real traffic.

**The fix:**
- Load testing section in DEVOPS_ENGINEER.md: when to load test, tools (k6, Artillery), what to measure (p95, error rate, pool saturation)
- `/deploy` pre-launch checklist: "If production launch with >100 req/s expected, load test first"

### Data Pipeline / Quantitative Patterns

**The gap:** VoidForge has no patterns for data pipelines, backtesting, or quantitative application development. Users building trading bots, data products, or ML-adjacent applications have no reference implementations for ETL, feature engineering, walk-forward validation, or execution safety.

**The fix — 3 new pattern files:**

**`data-pipeline.ts`** — ETL pattern with:
- Source → Transform → Load with validation at each stage
- Checkpoint/resume for long-running pipelines
- Idempotent processing (safe to re-run)
- Data quality checks (null rates, range validation, freshness)
- Schema evolution handling
- Batch vs streaming modes
- Adaptations: Node.js streams, Python pandas/polars, SQL-based

**`backtest-engine.ts`** — Walk-forward backtesting with:
- No-lookahead enforcement (data only available at decision time)
- Slippage and commission modeling
- Walk-forward validation (train on window A, test on window B, slide)
- Survivorship bias prevention
- Metric collection (Sharpe, max drawdown, win rate, profit factor)
- Equity curve generation
- Out-of-sample vs in-sample separation
- Adaptations: Python (backtrader/vectorbt patterns), TypeScript

**`execution-safety.ts`** — Trading/financial execution with:
- Order validation (size limits, price bounds, rate limits per exchange/API)
- Position management (max exposure, stop-loss enforcement, portfolio limits)
- Exchange/API precision handling (tick size, lot size, min notional — fetch from API, never hardcode)
- Paper trading → live trading toggle (same code path, different execution layer)
- Reconciliation (order fill verification against exchange/API response)
- Circuit breaker on repeated failures
- Audit trail for every order/action
- Adaptations: Crypto exchanges (CCXT), stock brokers, any financial API

**PRD frontmatter additions:**
```yaml
type: "quantitative"     # New type alongside full-stack, api-only, static-site, prototype, game
data_source: "exchange"  # exchange | database | api | file
backtest: yes           # Activates backtest review in build protocol
live_execution: yes     # Activates execution safety review
```

**Build protocol addition:** When `type: "quantitative"` detected, Phase 4 (Core Features) includes:
- "Verify backtest has no lookahead bias"
- "Verify execution layer has safety limits"
- "Verify data pipeline handles gaps and duplicates"
- "Verify exchange precision fetched from API, not hardcoded"

**Seldon integration:** Bayta Darell (evaluation) naturally extends to backtest validation — "Is your backtest methodology sound?" maps to "Is your AI eval methodology sound?" Same agent, different domain data.

### E2E Testing (Playwright)

**The gap:** 91 unit tests. Zero end-to-end tests. 7 HTML pages with JavaScript that can break silently. The Gauntlet catches UI issues via manual review but not on every commit.

**The fix:**
- Add Playwright as dev dependency
- 3-5 E2E tests: setup flow, login flow, project import, terminal launch, deploy scan
- `npm run test:e2e` script
- Gauntlet Round 2.5 smoke test calls E2E automatically

### Scaffold/Core Branch CI

**The gap:** Two of three distribution tiers have never been independently validated. "The files exist" ≠ "the experience works."

**The fix:**
- `.github/workflows/validate-branches.yml`: checkout each branch, verify CLAUDE.md references resolve, verify command files exist, verify doc paths exist
- Runs on push to any branch
- VoidForge generates CI for others but has none for itself (the meta-irony)

### Campaign Structure (estimated 7 missions)

| # | Mission | Type | Effort |
|---|---------|------|--------|
| 1 | Database migration safety (BUILD_PROTOCOL + pattern) | Methodology + pattern | 1 |
| 2 | Dependency health check (/assess + /campaign) | Methodology | 0.5 |
| 3 | Load testing guidance (DEVOPS_ENGINEER) | Methodology | 0.5 |
| 4 | Data pipeline pattern (`data-pipeline.ts`) | Pattern | 1 |
| 5 | Backtest + execution safety patterns | Pattern | 1.5 |
| 6 | E2E testing (Playwright setup + tests) | Code | 2 |
| 7 | Branch CI validation | Process | 1 |

**Version bump:** MINOR (v16.1.0) — new patterns, new methodology sections, new tests. No breaking changes.

---

## v16.0 — The Psychohistorians (AI Intelligence Layer)

*"Violence is the last refuge of the incompetent." — Salvor Hardin*

**The problem:** Modern applications increasingly include an AI/LLM intelligence layer — model-powered decision-making that replaces or augments traditional business logic (routing, classification, generation, orchestration, tool-use). No VoidForge agent currently owns this domain. Batman tests code but not AI behavior. Kenobi audits security but not prompt injection. Picard reviews architecture but not orchestration patterns. The AI layer falls through the cracks.

**The solution:** A dedicated agent domain — the **Foundation universe (Isaac Asimov)** — owning everything about the AI intelligence layer: model selection, prompt engineering, tool-use schemas, orchestration patterns, failure modes, token economics, evaluation, safety, versioning, and observability.

### The Metaphor

Psychohistory IS predictive AI. Hari Seldon created a system that predicts outcomes from data patterns, adapts when reality deviates (Seldon Crises), and maintains a "Plan" across centuries. The Foundation universe maps perfectly:

| Foundation Concept | AI Intelligence Concept |
|---|---|
| Psychohistory | The predictive model — statistical patterns → decisions |
| The Seldon Plan | The system prompt / orchestration strategy |
| Seldon Crises | AI failure modes — when reality deviates from the model |
| The Mule | Adversarial inputs — something the model can't predict |
| The Second Foundation | The evaluation layer — secretly monitoring and correcting |
| The Encyclopedia | The training data / knowledge base / RAG corpus |
| Terminus | Production — where AI decisions have real consequences |
| Trantor | The infrastructure — massive scale, single point of failure |

### Lead Agent: Hari Seldon — AI Intelligence Architect

*"The fall is inevitable. The recovery can be guided."*

**Domain ownership:** All AI/LLM-powered decision-making within a VoidForge-built application. Model selection, prompt engineering, tool-use schemas, orchestration patterns, failure modes, token optimization, evaluation, AI safety, model versioning, and LLM observability.

**Behavioral directives:**
1. **Predictive, not reactive.** Identify AI failure modes before they manifest.
2. **Measure everything.** If you can't measure whether AI output is correct, you can't ship it.
3. **The right model for the job.** Opus for reasoning, Sonnet for speed, Haiku for classification.
4. **Prompts are code.** Versioned, tested, reviewed with the same rigor as source code.
5. **Trust, but verify.** AI outputs are suggestions until validated.
6. **Defense in depth.** Prompt injection is the new SQL injection. Guard inputs, outputs, and the system prompt.
7. **Graceful degradation.** When the model fails, the application must still function.

### Sub-Agent Roster (12 agents)

| # | Agent | Name | Universe | Role |
|---|---|---|---|---|
| 1 | Model Selector | **Salvor Hardin** | Foundation | Right model for the task, cost-performance, latency budgets |
| 2 | Prompt Architect | **Gaal Dornick** | Foundation | Prompt structure, guardrails, few-shot strategy, testability |
| 3 | Tool Schema Validator | **Hober Mallow** | Foundation | Function definitions, parameter types, tool descriptions |
| 4 | Orchestration Reviewer | **Bel Riose** | Foundation | Chains, agent loops, workflows, reliability, bounded iteration |
| 5 | Failure Mode Analyst | **The Mule** | Foundation | Hallucination, refusal, timeout, context overflow, adversarial |
| 6 | Token Economist | **Ducem Barr** | Foundation | Token tracking, caching, batching, cost optimization |
| 7 | Eval Specialist | **Bayta Darell** | Foundation | Golden datasets, A/B testing, regression detection, scoring |
| 8 | Safety Guardian | **Bliss** | Foundation (Gaia) | Prompt injection, PII, content filtering, alignment |
| 9 | Versioning Specialist | **R. Daneel Olivaw** | Foundation/Robots | Model migration, prompt versioning, behavior regression |
| 10 | Observability Engineer | **Dors Venabili** | Foundation | Traces, decision audit trails, quality dashboards |
| 11 | Context Engineer | **Janov Pelorat** | Foundation | RAG pipelines, embeddings, retrieval, chunking, context windows |
| 12 | Output Validator | **Wanda Seldon** | Foundation | Schema validation, parse-failure retry, structured output |

### New Command: `/ai` — Seldon's Intelligence Audit

Standalone command + integrated into existing commands:

| Command | Integration Point |
|---------|------------------|
| `/build` | Phase 4+ when AI features detected (frontmatter `ai: yes`) |
| `/campaign` | Missions with AI features get Seldon review |
| `/gauntlet` | 7th Stone: **Wisdom** — full AI audit in Rounds 2-5 |
| `/assemble` | Phase 6.5 after integrations, before admin/ops |
| `/security` | Bliss handoff from Kenobi for AI safety |
| `/qa` | Bayta handoff from Batman for AI behavior testing |
| `/prd` | New AI Architecture section + frontmatter fields |
| `/review` | Seldon's team reviews AI code alongside Picard |

### New Pattern Files (6)

| Pattern | File | Purpose |
|---------|------|---------|
| AI Orchestrator | `ai-orchestrator.ts` | Agent loop, tool use, retry, circuit breaker, fallback |
| AI Classifier | `ai-classifier.ts` | Classification with confidence thresholds, human fallback |
| AI Router | `ai-router.ts` | Intent-based routing with fallback chains |
| Prompt Template | `prompt-template.ts` | Versioned prompts with variable injection, testing |
| AI Eval | `ai-eval.ts` | Golden datasets, scoring functions, regression detection |
| Tool Schema | `ai-tool-schema.ts` | Type-safe tool definitions with provider adapters |

### New Method Doc: `AI_INTELLIGENCE.md`

5-phase protocol:
1. **Phase 0 — AI Surface Map:** Find all LLM integration points
2. **Phase 1 — Parallel Audits:** Salvor Hardin (models) + Gaal Dornick (prompts) + Hober Mallow (tools) + Bliss (safety)
3. **Phase 2 — Sequential Audits:** Bel Riose (orchestration) → The Mule (failures) → Ducem Barr (cost) → Bayta Darell (evals) → Dors Venabili (observability)
4. **Phase 3 — Remediate:** Fix all Critical + High findings
5. **Phase 4 — Re-Verify:** The Mule + Wanda Seldon re-probe fixed areas

### New PRD Frontmatter

```yaml
ai: yes                           # Activates Seldon's review across all commands
ai_provider: "anthropic"          # anthropic | openai | local | multi
ai_models: ["claude-sonnet-4-6"]  # Models used in the application
ai_features: ["classification", "generation", "tool-use", "routing"]
```

### Campaign Structure (estimated 5-6 missions)

| Mission | What Gets Built |
|---------|----------------|
| 1 | Foundation universe in NAMING_REGISTRY.md, agent definitions, `/ai` command file |
| 2 | `AI_INTELLIGENCE.md` method doc — full 5-phase protocol |
| 3 | 6 new pattern files (`ai-orchestrator.ts` through `ai-tool-schema.ts`) |
| 4 | Integration points — modify `/build`, `/gauntlet`, `/assemble`, `/campaign`, `/security`, `/qa`, `/review`, `/prd` |
| 5 | PRD frontmatter + CLAUDE.md updates + HOLOCRON.md AI section |
| 6 | Victory Gauntlet |

**Breaking changes:** New universe (9th), new lead agent (18th), new command (26th). Version: **MAJOR (v16.0)**.

---

## v4.0 — The Reliability Release

*What breaks most often for users today.*

### Pre-deploy build step
Every platform deploy assumes `dist/` exists. If the user hasn't built, they get a confusing error after infrastructure is already provisioned. Add a framework-aware build step (`npm run build`, `python manage.py collectstatic`, `bundle exec rails assets:precompile`) before any upload/push. Detect the build output directory from the framework (`dist/`, `out/`, `.next/`, `build/`, `public/`).

### GitHub Actions CI/CD generation
Users get auto-deploy on push via platform webhooks, but no test-on-PR, no lint-on-push. Generate `.github/workflows/ci.yml` (test + lint on PR) and `.github/workflows/deploy.yml` (deploy on merge to main) as part of the GitHub pre-step. Framework-aware: Node runs `npm test`, Django runs `pytest`, Rails runs `rspec`.

### Environment validation
Generate a startup validation script that checks all required env vars exist before the app boots. Read from the generated `.env` template — any key with a placeholder value (`# pending`, empty) triggers a clear error at startup instead of a cryptic runtime crash.

### Railway API migration
Replace deprecated `pluginCreate` GraphQL mutation with Railway's current template service API. Database and Redis provisioning is silently failing for new Railway accounts.

### Credential scoping per provisioner
The full vault is passed to every provisioner via `ctx.credentials`. Scope it so each provisioner only receives the keys it needs. Currently only cleanup credentials are scoped (v3.8.0 fix) — extend to the provisioning phase.

---

## v4.1 — The Observability Release

*What happens after deploy is a black box.*

### Post-deploy health monitoring
After the initial health check passes, generate a simple cron-based uptime monitor for VPS (`curl` every 5 minutes, alert on failure). For platform targets, add monitoring dashboard links to the Done screen (Vercel Analytics, Railway Metrics, Cloudflare Analytics).

### Error tracking integration
Add Sentry as an optional integration in the Gandalf wizard. If enabled, generate the Sentry SDK initialization code, configure source maps, and inject the DSN as an env var. Non-fatal — works without it.

### Structured deploy logs
Store deploy results to `~/.voidforge/deploys/` with timestamps, targets, URLs, and resource IDs. Users can run `voidforge deploys` to see their deploy history. Haku's Done screen links to the log.

### Cost estimation
Before AWS provisioning, estimate the monthly cost based on instance type, RDS, and ElastiCache choices. Display in the Haku confirm screen. Rough but useful: "Estimated: ~$45/month (t3.micro + db.t3.micro + cache.t3.micro)."

---

## v4.2 — The DX Release

*Developer ergonomics that save 10 minutes per session.*

### Type generation from schema
After Prisma schema changes, auto-run `npx prisma generate` and generate a barrel export (`types/index.ts`). Components and services import from one place.

### API documentation generation
Generate OpenAPI/Swagger spec from Express/Next.js routes. Write to `docs/api.yaml`. Optionally serve Swagger UI at `/api/docs` in development.

### Database ERD generation
Auto-generate a Mermaid entity-relationship diagram from the Prisma schema. Write to `docs/schema.md`. Picard references it during architecture reviews.

### Integration templates
Pre-built client wrappers for common services:
- **Stripe** — checkout session, webhook handler, customer portal
- **Resend** — transactional email with templates
- **S3** — file upload with signed URLs
- **Sentry** — error tracking initialization

Selected via PRD frontmatter (`payments: stripe`, `email: resend`). Generated during Phase 6 (Integrations).

### Database seeding
Generate `seed.ts` with factory functions for all schema models. Used by tests and local development. Run via `npm run seed`.

---

## v4.3 — The Resilience Pack (opt-in, integrated into Gandalf)

*From "it works" to "it stays working." Now an opt-in feature pack in Gandalf's Act 3 operations menu — not a standalone release.*

**Status:** Reclassified. Originally a standalone version, now integrated as the "Resilience Pack" card in the v7.1 wizard redesign. Users choose which features they want during project setup. All features are also addable after creation via `/campaign --plan add resilience`.

### Deploy Resilience (opt-in toggles)
- **Multi-environment** — generate `.env.development`, `.env.staging`, `.env.production`. Platform deploys scope env vars per environment.
- **Preview deployments** — for Vercel and Cloudflare Pages, configure PR preview deploys automatically. PR comments via GitHub API.
- **Auto-rollback** — one-click rollback via platform API (Vercel/Railway/Cloudflare). Surface in Avengers Tower rollback panel.
- **Migration automation** — run `prisma migrate deploy` (or framework equivalent) as part of deploy. For VPS, before symlink swap.
- **Backup automation** — daily `pg_dump` to S3 for VPS+RDS. Platform-native backups documented for Railway/D1. S3 versioning for static.

### Runtime Resilience (opt-in toggles)
- **Health check endpoint** — generates `/api/health` checking DB, Redis, disk. Framework-aware.
- **Graceful shutdown** — `SIGTERM` → drain connections → close DB → exit. Critical for zero-downtime platform deploys.
- **Error boundaries** — React error boundaries for frontend, global exception handler for backend.
- **Rate limiting** — basic rate limiter on auth endpoints. Per-IP counter middleware.
- **Dead letter queue** — for projects with `workers: yes`. Failed jobs to DLQ instead of silent drops.

### PRD Frontmatter
```yaml
resilience:
  multi-env: yes | no
  preview-deploys: yes | no
  rollback: yes | no
  migrations: auto | manual | no
  backups: daily | weekly | no
  health-check: yes | no
  graceful-shutdown: yes | no
  error-boundaries: yes | no  # only if framework has UI
  rate-limiting: yes | no
  dead-letter-queue: yes | no  # only if workers: yes
```

Smart defaults based on deploy target and framework — Vercel gets preview deploys on by default, static sites skip backups, API-only projects skip error boundaries.

---

## v4.4 — The Imagination Release

*The forge creates images. The forge learns from its users.*

### `/imagine` command — Celebrimbor's Image Generation
New slash command and agent for AI image generation. Celebrimbor (Tolkien — greatest elven smith) reads the PRD for visual asset requirements (illustrations, portraits, OG images, hero art), derives a style prompt from the brand section, and generates images via OpenAI's image API. Manages an asset manifest for regeneration and auditing. Provider-abstracted (OpenAI default, extensible to Replicate/others).

Sub-agents: Nori (asset scanner), Ori (prompt engineer), Dori (integration checker) — dwarves from The Hobbit.

Command: `/imagine` (not `/forge` — avoids collision with VoidForge/Bombadil naming). Flags: `--scan`, `--asset "name"`, `--regen "name"`, `--style "override"`, `--provider model`.

### Wizard integration — OpenAI API key in Gandalf
Add OpenAI API key as an optional credential in Gandalf's Step 2 (Cloud Providers). Same vault, same AES-256-GCM encryption, same UX. Key name: `openai-api-key`. If not provided in wizard, `/imagine` prompts on first use. Non-blocking — projects work fine without it.

### Pipeline integration
- `/assemble` Phase 2b: Celebrimbor generates assets after build, before review
- `/build` Phase 8 (Marketing): Celebrimbor runs if PRD has visual asset requirements
- `/campaign` Step 1: Dax classifies image requirements as "Asset — via /imagine" instead of BLOCKED
- Galadriel verifies generated images match brand during `/ux` pass

### Files to create
- `.claude/commands/imagine.md` — slash command
- `docs/methods/FORGE_ARTIST.md` — Celebrimbor's method doc
- `wizard/lib/image-gen.ts` — provider abstraction + generation
- `wizard/lib/asset-scanner.ts` — PRD parsing for image requirements
- Update: `NAMING_REGISTRY.md`, `CLAUDE.md`, `HOLOCRON.md`, `wizard/ui/app.js`

### `/debrief` command — Bashir's Field Reports
New slash command for post-session analysis and upstream feedback. Bashir (Star Trek DS9 — chief medical officer, diagnostician) reads the session's build logs, assemble state, campaign state, and git history, then produces a structured post-mortem that identifies methodology gaps and proposes fixes in VoidForge's own language.

The key innovation: the report can be **submitted as a GitHub issue** on the VoidForge upstream repo (`tmcleod3/voidforge`), labeled `field-report`. Users become contributors just by running `/debrief --submit` after a rough session. Upstream maintainers get structured, actionable feedback written in VoidForge's agent/command vocabulary.

Sub-agents: Ezri (session timeline reconstruction — joined Trill, multiple lifetimes of perspective), O'Brien (root cause investigation — "the bloody EPS conduits again"), Nog (solution proposals within VoidForge's framework — first Ferengi in Starfleet, creative and resourceful), Jake (report writing — Sisko's son, aspiring journalist).

Command: `/debrief`. Flags: `--submit` (create GitHub issue), `--campaign` (analyze full campaign), `--session` (just this session), `--dry-run` (generate without submitting).

**The feedback loop:**
- `/void` (Bombadil) pulls updates DOWN from upstream
- `/debrief` (Bashir) pushes learnings BACK UP to upstream
- When `/void` next runs, Bombadil can note: "Your field report was incorporated into v4.5"

**Privacy:** Reports contain timeline, root causes, and proposed fixes — NOT source code, credentials, or personal data. User reviews and approves every word before submission.

**Integration:**
- `/campaign` Step 6: After victory, Sisko offers debrief
- `/assemble` completion: If 3+ Must Fix items found, Fury suggests debrief
- Standalone: run `/debrief` anytime after a session with interesting findings

### Files to create
- `.claude/commands/debrief.md` — slash command
- `docs/methods/FIELD_MEDIC.md` — Bashir's method doc
- Update: `NAMING_REGISTRY.md`, `CLAUDE.md`, `HOLOCRON.md`

---

## v4.5 — The Seamless Release

*From Gandalf to live URL without leaving Claude Code.*

### PRD-driven credential collection
Gandalf currently collects cloud provider credentials (AWS, Vercel, etc.) in Step 2. But project-specific API keys (WhatsApp, Mapbox, Google Places, Resend, etc.) must be manually added to `.env` later. After the PRD is pasted in Step 4, Gandalf should parse the env var section, identify which keys are needed, and present a dynamic credential form (Step 4.5). All keys stored in the vault with the same AES-256-GCM encryption. Grouped by urgency: required for build, required for deploy, optional enrichment sources.

New API endpoint: `POST /api/prd/env-requirements` — parses PRD content and returns structured list of required credentials with labels, placeholders, and help text. New Gandalf step between PRD and deploy target selection.

### Headless deploy mode (`--headless`)
Haku is a browser wizard. But `/build` Phase 12 already says "Kusanagi provisions and deploys." The vault has the credentials. The PRD has the target. There's no reason to context-switch to a browser. Add `npx voidforge deploy --headless` that runs the same provisioner code but outputs progress to terminal (stdout) instead of SSE to a browser. Phase 12 of `/build` calls this directly.

New file: `wizard/lib/headless-deploy.ts` — terminal output adapter that wraps the provisioner dispatch. Modified: `scripts/voidforge.ts` to accept `--headless` flag, `.claude/commands/build.md` Phase 12 to reference headless deploy.

### PostgreSQL extension support
The VPS provisioner generates `provision.sh` but doesn't handle PostgreSQL extensions. PRDs that use PostGIS or pg_trgm (common for geospatial apps) need extension packages installed and `CREATE EXTENSION` run. Parse extensions from Prisma schema's `extensions = [postgis, pg_trgm]` line during the deploy scan step. Generate the appropriate `apt-get install` and `psql CREATE EXTENSION` commands.

Modified: `wizard/lib/provisioners/scripts/provision-vps.ts`, `wizard/api/deploy.ts`.

---

## v4.6 — The Feedback Release

*The forge learns from every battle it fights.*

Clears the field report backlog (GitHub issues #1, #2, #3). Most findings from the marketing site and Union Station field reports were already fixed in v4.4.0 (Phase 2.5 smoke tests, route collision checks, React render cycle tracing, usability walkthrough in /ux, requirement classification in /campaign, Troi compliance). Four outstanding items remain.

### `/debrief --inbox` — Bashir reads incoming field reports
Completes the feedback loop. When run on the main VoidForge repo, Bashir fetches open GitHub issues labeled `field-report`, triages each one (accept / wontfix / duplicate / needs-info), and optionally applies the fixes. This is the inverse of `--submit`: downstream projects push learnings up, `--inbox` pulls them in.

Flow: `gh issue list --label field-report --state open` → read each issue body → extract severity, root causes, proposed fixes → present inbox summary → user selects issue to triage → Bashir classifies each fix → applies accepted changes → comments on issue with triage results → closes if fully addressed.

Modified: `.claude/commands/debrief.md` (add `--inbox` argument handling), `docs/methods/FIELD_MEDIC.md` (add Inbox Mode section with triage protocol).

### `/imagine` retry logic
DALL-E 3 returns 500 errors on ~15% of requests (field report #1). Add 3 attempts with exponential backoff (1s, 3s, 9s) to the image generation pipeline. Log retry attempts. Only fail after all 3 attempts exhausted.

Modified: `wizard/lib/image-gen.ts`.

### Global CSS conflict check
Galadriel's UX review should check for specificity conflicts between global CSS (globals.css, base styles) and component-level styles (Tailwind utilities, CSS modules). When a component uses `overflow-auto` but globals.css has `.parent { overflow: hidden }`, the global wins. Add to Step 1.5 (Usability Review): "For each component with layout/overflow/position utilities, grep globals.css for conflicting rules on parent selectors."

Modified: `docs/methods/PRODUCT_DESIGN_FRONTEND.md`.

### Automated count cross-referencing in QA
Marketing sites, landing pages, and docs often claim specific numbers ("170+ agents", "13 phases", "7 patterns"). Batman should grep for numeric claims and cross-reference against the actual data source. Add to Step 3: "For marketing/docs pages, grep for number + noun patterns (e.g., '\\d+ agents'). Cross-reference each against the data source (agents.length, phase count, pattern count). Flag mismatches."

Modified: `docs/methods/QA_ENGINEER.md`.

### Estimated effort
~120 lines across 4 files. 1 session.

---

## v5.0 — The Intelligence Release

*VoidForge gets smarter with use.*

### Lessons integration
After every `/assemble` run, auto-extract learnings (what broke, what patterns emerged, what was slow) and append to `LESSONS.md`. Feed lessons back into future builds — if a pattern caused bugs in project A, flag it when seen in project B.

### Build analytics
Track build metrics across projects: phase durations, finding counts, fix-to-finding ratios, most common security issues. Surface trends: "Your projects consistently fail on auth edge cases — consider adding the auth integration test template."

### Smart scoping
`/campaign` currently scopes missions by PRD section order. Teach Dax to scope by complexity and risk — build the hardest features first (when energy is high), save polishing for later.

### Template marketplace
Curated project starters (SaaS, API, marketing site, admin dashboard) with pre-filled PRDs, pre-configured integrations, and pre-written seed data. `voidforge init --template saas` gets you 80% of the way before `/build` even starts.

---

## v5.5 — Avengers Tower Local

*Gandalf builds Avengers Tower. You never leave the browser.*

The insight: instead of reimplementing Claude Code's capabilities via the Anthropic API (custom tool executor, custom agentic loop), embed a real terminal in the browser. The user gets actual Claude Code — full tool access, 1M context window, interactive conversation — running inside an xterm.js terminal connected to the VoidForge server via WebSocket. After Gandalf creates the project (Steps 1-6), the UI transitions to Avengers Tower: a browser terminal that auto-launches Claude Code in the project directory. The user types `/build` or `/campaign` and the real 13-phase protocol executes. No terminal app needed. No context switch. And the terminal stays open after deploy — you can SSH into production, push hotfixes, run `/qa`, run `/debrief`, all from the same browser tab.

### PTY Manager (`wizard/lib/pty-manager.ts`)
Server-side component that spawns real pseudo-terminal processes using `node-pty` (the same library VS Code, Gitpod, and GitHub Codespaces use). Each PTY is a real shell (`zsh` or `bash`) with full capabilities. Manages multiple sessions per project (Claude Code in one tab, SSH in another, shell in a third). Auto-injects initial commands (`cd /path/to/project && claude`) when a session starts.

Key behaviors:
- Spawn shells as current user (no privilege escalation in local mode)
- Max 5 concurrent PTY sessions (configurable)
- Idle timeout: 30 minutes (configurable), then session is killed
- Session resurrection: if the browser disconnects and reconnects within 60 seconds, reattach to the existing PTY (don't lose work)
- Clean shutdown: on server stop, SIGHUP all PTY children

### WebSocket endpoint (`wizard/api/terminal.ts`)
Bridges browser ↔ PTY. Bidirectional: keystrokes from xterm.js → PTY stdin, PTY stdout → xterm.js render. Requires vault password to establish connection (prevents unauthorized terminal access even in local mode). Binary frames for efficiency. Handles resize events (terminal dimension changes flow through to PTY).

### Browser terminal UI (`wizard/ui/tower.html` + `wizard/ui/tower.js`)
Uses xterm.js (the standard browser terminal renderer — same as VS Code web, Gitpod, Railway console). Renders full ANSI color, cursor positioning, scrollback. Fits to container with `xterm-addon-fit`. Clickable URLs with `xterm-addon-web-links`. Tabbed interface: multiple terminals per project. Tab bar shows session type: `[Claude Code] [SSH: prod] [Shell] [+ New]`.

### Navigation flow
After Gandalf Step 6 (Review) → Step 7 (Create Project) → **Step 8: Avengers Tower**. The wizard header changes from "Gandalf — VoidForge Setup" to "Avengers Tower — [Project Name]". The progress bar is replaced by a phase status indicator (for builds in progress). Back navigation goes to The Lobby (in v6.0+) or Gandalf (single-project mode). The Gandalf wizard and Avengers Tower share the same Express server, same port, same vault session.

### Security (local mode)
Local Avengers Tower binds to `localhost:3141`. No external exposure. The threat model is the same as Claude Code itself: physical access to the machine. Mitigations:
- WebSocket requires vault password to establish PTY connection (prevents rogue browser tabs from opening terminals)
- PTY idle timeout: 30 min default, configurable
- Max 5 concurrent terminal sessions (prevent resource exhaustion)
- Terminal output sanitization: xterm.js renders raw bytes, which is safe for display, but if terminal output is ever reflected into HTML (e.g., build status sidebar), it must be escaped to prevent XSS
- `node-pty` spawns shells as the current user (never root, never a different user)

### New dependencies
- `node-pty` (~2MB native module) — spawns real PTY processes. Used by VS Code, Hyper, every Electron terminal.
- `xterm.js` (~200KB client) — browser terminal renderer. Used by VS Code web, Gitpod, GitHub Codespaces.
- `xterm-addon-fit` (~5KB) — auto-resize terminal to container.
- `xterm-addon-web-links` (~3KB) — clickable URLs in terminal output.

### Files to create
- `wizard/lib/pty-manager.ts` (~200 lines) — PTY lifecycle management
- `wizard/api/terminal.ts` (~100 lines) — WebSocket ↔ PTY bridge
- `wizard/ui/tower.html` (~100 lines) — terminal page
- `wizard/ui/tower.js` (~300 lines) — xterm.js setup, tab management, WebSocket client
- Update: `wizard/server.ts` (WebSocket upgrade handling), `wizard/ui/app.js` (transition to Avengers Tower after project creation), `scripts/voidforge.ts` (serve tower.html)

### Estimated effort
~850 lines (including security), 2-3 sessions.

---

## v6.0 — Avengers Tower Multi

*Every project gets a room. The Lobby shows them all.*

Avengers Tower expands from a single-project terminal to a multi-project operations console. The landing page becomes The Lobby: a dashboard showing all VoidForge projects with status, health, deploy URL, and quick actions. Each project is a "room" you click into — opening the full terminal workspace for that project.

### Project Registry (`wizard/lib/project-registry.ts`)
Simple JSON file at `~/.voidforge/projects.json`. Each entry:
```json
{
  "id": "uuid",
  "name": "Dialog Travel",
  "directory": "/home/forge/projects/dialog-travel",
  "deployTarget": "vps",
  "deployUrl": "https://dialog.travel",
  "sshHost": "ec2-52-1-2-3.compute-1.amazonaws.com",
  "framework": "next.js",
  "database": "postgres",
  "createdAt": "2026-03-15",
  "lastBuildPhase": 13,
  "lastDeployAt": "2026-03-15T18:30:00Z",
  "healthCheckUrl": "https://dialog.travel/api/health",
  "monthlyCost": 47
}
```

No database — VoidForge stays zero-dep for core. Registry auto-populated when Gandalf creates a project. Updated when builds complete and deploys succeed. File permissions: `0600` (owner read/write only).

### The Lobby (`wizard/ui/lobby.html` + `wizard/ui/lobby.js`)
Dashboard landing page. Cards for each project showing: name, status (building/deployed/errored), deploy URL (clickable), framework badge, deploy target badge, estimated monthly cost, health indicator (green/yellow/red), last activity timestamp. Quick actions per card: Open Room, SSH (if VPS), Logs, Deploy. Bottom bar: "The Penthouse" — vault credential count, total projects, aggregate monthly cost, links to Manage Vault and Deploy History.

"+ New Project" button launches Gandalf wizard. On completion, returns to The Lobby with the new project card.

### Import Existing Project
"+ Import Project" button in The Lobby for projects that were built with VoidForge before v6.0, or built on the scaffold/core branches without the wizard, or created on a different machine. The import flow:

1. User provides the project directory path (text input or paste)
2. VoidForge scans the directory — reuses the same scan logic from `wizard/api/deploy.ts`:
   - Checks for `CLAUDE.md` (confirms it's a VoidForge project)
   - Reads project name from `CLAUDE.md`
   - Reads `docs/PRD.md` frontmatter (framework, database, deploy target, cache)
   - Reads `.env` (deploy URL, hostname)
   - Auto-detects framework from `package.json` / `requirements.txt` / `Gemfile`
   - Reads `logs/build-state.md` (build progress, last phase)
   - Detects PostgreSQL extensions from Prisma schema
3. Presents a confirmation card: "Found: [Name] ([framework], [deploy target]). Add to Avengers Tower?"
4. On confirm, project is added to `projects.json` with all discovered metadata
5. Card appears in The Lobby — user can open a terminal immediately

Validation: directory must exist, must contain `CLAUDE.md`, must not already be in the registry (check by directory path). If the project has a deploy history in `~/.voidforge/deploys/`, the import links those deploy records to the project.

New API endpoint: `POST /api/projects/import` — accepts `{ directory: string }`, runs the scan, adds to registry, returns the project card data. Path validation: absolute path required, no `..` segments (same as all other directory-accepting endpoints).

### Health Poller (`wizard/lib/health-poller.ts`)
Background service that pings each project's health check URL every 5 minutes. Updates project registry with last health status and timestamp. Runs only when the server is active. Non-blocking — uses `fetch` with 5-second timeout. Health states: `healthy` (200 OK), `degraded` (non-200 but responding), `down` (timeout or connection refused), `unchecked` (no health URL configured).

### Multi-terminal per project
Each project room supports N terminal sessions (default max 5). Tabs show session type and can be renamed. Sessions persist across page navigation (go to The Lobby, come back, terminals are still running). Closing a terminal tab sends SIGHUP to the PTY. Creating "SSH: production" tab auto-runs `ssh user@host` using the SSH key from the vault (key never reaches the browser — server executes the SSH connection through the PTY).

### Shared vault awareness
The vault is already global (not per-project) — AWS, GitHub, Cloudflare credentials work across all projects. Gandalf's Step 4b (PRD-driven credentials) stores project-specific keys with `env:` prefix in the vault (e.g., `env:WHATSAPP_ACCESS_TOKEN`). When creating a second project that uses the same service (e.g., two projects both need Resend), the credential form pre-fills from the vault.

### Security (multi-project)
- Project directory isolation: each PTY session is scoped to its project directory. The shell starts with `cd /path/to/project`. The user CAN navigate out (it's a real shell), but initial scope is correct.
- Project registry file permissions: `0600` (owner only)
- Health poller uses GET requests only (read-only, no credentials in polling)
- Per-project session limits (prevent one project from consuming all PTY slots)
- Terminal sessions namespaced by project ID in the PTY manager

### Files to create
- `wizard/lib/project-registry.ts` (~150 lines) — CRUD for projects.json
- `wizard/api/projects.ts` (~150 lines) — REST endpoints for project list, status, health, import
- `wizard/ui/lobby.html` (~100 lines) — The Lobby dashboard
- `wizard/ui/lobby.js` (~250 lines) — project cards, health indicators, navigation
- `wizard/lib/health-poller.ts` (~100 lines) — background health checks
- Update: `wizard/server.ts` (route lobby.html as landing), `wizard/api/project.ts` (register project on creation), `wizard/ui/tower.js` (back-to-lobby navigation)

### Estimated effort
~950 lines (including security + import), 2-3 sessions.

---

## v6.5 — Avengers Tower Remote

*Access your forge from anywhere. Phone, iPad, hotel business center, a friend's laptop.*

Deploy VoidForge itself on a remote server. Access Avengers Tower through a public URL behind serious authentication. The server becomes your build machine, production host, operations console, and development environment — all accessible from any browser. You could build and deploy an entire application from your phone in an Uber.

### The architecture

```
Your device (just a browser)
  → https://forge.yourdomain.com (HTTPS + WSS)
    → Caddy (reverse proxy, auto-TLS, auth layer)
      → VoidForge Server (:3141)
        → Wizard API (Gandalf), PTY Manager, Vault, Provisioners
        → Claude Code (installed on this server, runs in PTY sessions)
        → All projects live at /home/forge/projects/
      → Also proxies deployed apps:
        → dialog.travel → Dialog Travel (port 3000)
        → api.widgets.co → Widget API (port 3001)
```

One VPS (t3.medium recommended, $30/mo) serves as your build server, production host for VPS-targeted projects, and operations console for platform-targeted projects (Vercel, Railway, Cloudflare — managed via terminal).

### Threat model — what's behind the door

Remote Avengers Tower exposes the following over the internet:
- Anthropic API key (AI access, billed to the user)
- AWS credentials (can provision EC2, RDS, S3 — significant cost exposure)
- GitHub token (push to any repo, delete branches)
- Cloudflare token (modify DNS for all domains)
- All project-specific API keys (WhatsApp, Mapbox, Google Places, Stripe, etc.)
- SSH access to every production server via stored keys
- Source code for every project
- Database credentials for every deployed project
- A live terminal that can execute ANY command as the server user
- The ability to deploy code to production at will

**This is root access to the user's entire digital infrastructure, exposed over HTTPS. Security is not a feature — it is the prerequisite.**

### Security architecture — five layers (all mandatory for remote mode)

**Layer 1: Network — minimize exposure**

Caddy configuration with IP allowlist (optional but strongly recommended) and rate limiting:
```
forge.yourdomain.com {
    @blocked not remote_ip <user-ip>/32 <vpn-cidr>/24
    respond @blocked 403

    rate_limit {
        zone forge_login {
            key {remote_host}
            events 5
            window 1m
        }
    }

    reverse_proxy localhost:3141
}
```

IP allowlist is the strongest single defense. If the user is always on a VPN, this alone blocks 99.9% of attacks. But IPs change, VPNs fail, and mobile access is a real use case — so all other layers are still required.

**Layer 2: Authentication — multi-factor, time-limited**

NOT Caddy basic auth. A proper login flow served by the VoidForge server:

Step 1 — Username + password. Bcrypt-hashed, stored in `~/.voidforge/auth.json`. Rate-limited: 5 attempts per minute per IP. Lockout: 30 minutes after 10 consecutive failures. No username enumeration (same response for invalid user and wrong password).

Step 2 — TOTP 2FA. Mandatory for remote mode, optional for local. Standard TOTP (RFC 6238) — compatible with Google Authenticator, 1Password, Authy. Secret stored encrypted in vault. Codes rotate every 30 seconds. Why TOTP and not SMS/email: works offline, no external dependencies, no SIM swap risk. The user is technical enough to use VoidForge — they can install an authenticator app.

Step 3 — Session token issued. HttpOnly + Secure + SameSite=Strict cookie. TTL: 8 hours (configurable). Stored in server memory only (never written to disk). One active session at a time (new login invalidates previous session). Session invalidated on: explicit logout, timeout, IP change (configurable — can be disabled for mobile), manual revoke via admin endpoint.

Every HTTP request checks: session valid? Every WebSocket upgrade checks: session valid? Failed checks return 401 and redirect to login.

**Layer 3: Vault — separate encryption from access**

Two-password architecture. The login password gets you into Avengers Tower (dashboard, terminals, project list). The vault password decrypts credentials. These are DIFFERENT passwords.

Why: if someone compromises the login (session hijack, XSS, shoulder surfing), they can see the dashboard and interact with terminals where Claude Code is already running, but they CANNOT:
- Read API keys or tokens
- SSH into production (SSH keys are in the vault)
- Deploy to new infrastructure (provisioners need vault credentials)
- Create new projects (Gandalf needs vault for credential storage)
- View or edit stored credentials

The vault password is NEVER stored on disk or in the session. It's held in server memory only while actively needed, then cleared. The user re-enters it for sensitive operations:
- First deploy of a session
- SSH to production
- Viewing or editing credentials in the vault
- Creating a new project
- Any provisioner operation

Vault auto-locks after 15 minutes of inactivity. Lock event logged to audit trail.

**Layer 4: Terminal sandboxing — limit blast radius**

Even after full authentication, terminal sessions are constrained:
- PTY processes run as a dedicated non-root user (`forge-user`, created during VoidForge server setup)
- Each session starts `cd`'d into the project directory
- Resource limits: max CPU time, max memory, max file descriptors per PTY
- Command audit log: every command entered into any terminal is logged (timestamp, project, session ID, command text) to `~/.voidforge/audit.log`
- Idle timeout: 30 minutes default, then session is killed
- Max sessions per project: 5. Max total sessions across all projects: 20.
- SSH to production is proxied: the browser connects to the VoidForge server's PTY, the server's PTY runs the SSH command with the key from disk. The SSH private key NEVER reaches the browser. The server acts as a jump host.

Dangerous commands (`rm -rf /`, `git push --force`, `DROP TABLE`, `shutdown`) are not blocked by VoidForge (the user is a developer, they may need these), but they ARE logged to the audit trail for review.

**Layer 5: Audit trail — know everything that happened**

Append-only log at `~/.voidforge/audit.log`. JSON lines format, machine-parseable. Every action logged:
- Login attempts (success and failure, with IP, user-agent)
- Session creation and destruction (with IP, duration)
- Vault unlock and lock events (which user, how long unlocked)
- Terminal session start and end (project, session type, duration)
- SSH connections initiated (from which project, to which host)
- Deploy commands executed (target, project, result)
- Credential access (which vault key was read, by which action)
- Project creation and deletion
- File modifications via wizard API (not via terminal — terminal commands are logged separately)
- Health check failures (which project, which URL, what status)

Log rotation: daily, 90-day retention, compressed archives. Alert on failed login attempts: if a Resend API key is in the vault, send email notification after 3 failed logins from an unknown IP.

### Self-deploy provisioner

New provisioner that deploys VoidForge itself to a VPS. The user runs `npx voidforge deploy --self` which:
1. Provisions a VPS (EC2 or manual SSH target)
2. Installs Node.js, Git, Claude Code, VoidForge
3. Configures Caddy with HTTPS for the forge domain
4. Sets up the `forge-user` system account
5. Generates initial auth credentials (username + bcrypt password, TOTP secret)
6. Shows QR code for TOTP setup
7. Starts VoidForge as a PM2-managed service
8. Reports the public URL

### Files to create
- `wizard/lib/tower-auth.ts` (~300 lines) — login flow, session management, TOTP verification, rate limiting, lockout
- `wizard/api/auth.ts` (~150 lines) — login/logout/session endpoints
- `wizard/ui/login.html` + `wizard/ui/login.js` (~150 lines) — login page with password + TOTP fields
- `wizard/lib/audit-log.ts` (~100 lines) — append-only JSON lines logger
- `wizard/lib/provisioners/self-deploy.ts` (~200 lines) — VoidForge self-deploy provisioner
- Caddy config template for remote mode (~50 lines)
- Update: `wizard/server.ts` (auth middleware, session checks), `wizard/lib/pty-manager.ts` (sandboxing, audit integration), `scripts/voidforge.ts` (`--self` flag)

### Estimated effort
~1,200 lines (security is the majority), 3-4 sessions.

---

## v7.0 — The Penthouse

*Multi-user, multi-project, coordinated operations.*

Avengers Tower becomes a team tool. Multiple users, role-based access, per-project permissions, coordinated deploys across linked services, and a rollback dashboard. The Penthouse is where the team manages their fleet.

### Role-based access
Three roles: `admin` (full access — create projects, manage users, deploy, access vault), `deployer` (can build and deploy assigned projects, cannot manage vault or users), `viewer` (read-only — can see dashboards, logs, health, but cannot execute commands or deploy).

User management stored in `~/.voidforge/users.json`. Each user: username, bcrypt password hash, TOTP secret (encrypted in vault), role, project access list, created timestamp, last login. Admin can create/remove users via The Lobby settings.

### Per-project access control
Each project in the registry has an `access` field: list of usernames with their role for that project. Admin has implicit access to all projects. A deployer might have access to "Dialog Travel" but not "Widget API". A viewer can see all projects in The Lobby but only open rooms they have access to.

### Monorepo / linked services
Projects can be linked (via `linkedProjects` field in registry). Linked projects appear as sub-cards in The Lobby. Coordinated deploys: when deploying "Dialog Travel — API", the system checks if "Dialog Travel — Workers" and "Dialog Travel — Web" also need redeployment (shared schema change, shared dependency update). Deploy order is configurable. Coordinated deploys require vault unlock + explicit confirmation for each service ("Deploy API first, then Workers, then Web? [Confirm all / Step through]").

### Rollback dashboard
Deploy history per project, visible in the project room. Each deploy entry: timestamp, git commit, deploy target, success/failure, URL. One-click rollback to any previous version. For VPS: symlink swap to previous release directory. For platforms: Vercel/Railway/Cloudflare API rollback. Rollback requires deployer role + vault unlock.

### Cost tracker
Aggregate monthly cost across all projects. Per-project breakdown. AWS billing API integration (optional — requires additional IAM permissions). For non-AWS targets: manual cost entry or platform API queries. Displayed in The Lobby footer and per-project room sidebar. Alerts when cost exceeds configurable threshold.

### Agent memory (cross-project learning)
Agents that remember across projects. After each build, key learnings are extracted and stored in `~/.voidforge/lessons.json`. When starting a new build, relevant lessons are loaded into the methodology context. "Last time you built a Next.js app with Stripe, Phase 6 failed because webhook signatures weren't verified in test mode. Adding that check proactively." Wong guards the knowledge. The Sanctum grows.

### Security (multi-user)
- Role enforcement on every API endpoint and WebSocket connection
- Per-project access checks before PTY session creation
- Coordinated deploys require vault unlock + confirmation prompt per service
- Cross-project credential access logged separately in audit trail
- User management actions (create, delete, role change) require admin role + vault unlock
- Session isolation: users cannot see each other's terminal sessions
- Shared team vault with per-user encryption keys (stretch goal — complex key management)

### Files to create
- `wizard/lib/user-manager.ts` (~200 lines) — user CRUD, role checks
- `wizard/api/users.ts` (~150 lines) — user management endpoints
- `wizard/lib/deploy-coordinator.ts` (~200 lines) — linked service deploy orchestration
- `wizard/ui/rollback.js` (~150 lines) — deploy history and rollback UI
- `wizard/lib/cost-tracker.ts` (~150 lines) — cost aggregation and alerts
- `wizard/lib/agent-memory.ts` (~150 lines) — cross-project lesson storage and retrieval
- Update: all auth and session code for role enforcement, PTY manager for user isolation, The Lobby for role-filtered views

### Estimated effort
~1,400 lines (including security), 3-4 sessions.

---

## v7.1 — The Redesign

*The wizard becomes a conversation.*

Gandalf's setup wizard is restructured from a 7-step linear form into a three-act conversation: identity, vision, operations. The simple/advanced toggle is eliminated — replaced by an operations menu where every user picks what they need.

### Act 1 — "Secure Your Forge" (2 steps)
Vault password alone on the first screen — clean, focused, one field. API key on the second screen. The forge is lit.

### Act 2 — "Describe Your Vision" (2 steps + conditional)
Project name + directory. Then PRD (generate/paste/skip). If PRD has env vars, collect credentials. The project is taking shape.

### Act 3 — "Equip Your Project" (1 menu screen)
A single screen with expandable cards — not a sequence of steps. Five cards: Deploy Target, Cloud Credentials (contextual), Domain & Hostname, The Resilience Pack (v4.3 features as opt-in toggles), Monitoring. Each card expands in-place. Smart defaults from PRD frontmatter. "Skip All" for lean setup.

### Éowyn's Enchantment Notes
- First screen: mostly empty, dark, one glowing input. The forge lighting moment.
- Project name: header updates live as user types — the project is already becoming real.
- PRD generation: text streams like it's being written by hand, not loaded from a server.
- Operations menu: cards feel like choosing equipment before an adventure.
- Creation moment: brief animation of project structure appearing, then terminal fills screen. You're home.

### Files to modify
- `wizard/ui/index.html` — restructure into 3 acts, add operations menu
- `wizard/ui/app.js` — remove simple/advanced, add card expand/collapse, smart defaults
- `wizard/ui/styles.css` — act transitions, card animations, enchantment styling

### Estimated effort
~400 lines changed (mostly restructuring existing code), 1-2 sessions.

---

## v7.6 — The Vault Pipeline

*Credentials flow from vault to project without provisioning.*

The missing link between "Gandalf collected my API keys" and "my project can use them." Currently, vault credentials only reach `.env` during full provisioning (Haku deploy). But many projects need env vars for local development, testing, or non-VPS deploy targets. This release adds a standalone vault-to-env pipeline.

### `voidforge deploy --env-only` Flag

Run the deploy wizard's env-writing step without provisioning infrastructure:
```bash
npx voidforge deploy --env-only
```

Reads the PRD frontmatter, identifies required env vars, pulls matching values from the vault, and writes them to `.env`. No AWS, no GitHub, no DNS — just the env file. This is the "I just want my API keys in .env" command.

**What changes:** `scripts/voidforge.ts` gains `--env-only` flag. `wizard/lib/headless-deploy.ts` gains an env-only code path that calls `vaultGet()` for each PRD-referenced key and appends to `.env` via `appendEnvSection()`.

### Standalone Vault Reader (`scripts/vault-read.ts`)

A zero-dependency script that reads a single key from the vault:
```bash
npx tsx scripts/vault-read.ts --key "env:WHATSAPP_ACCESS_TOKEN"
```

Useful for CI/CD scripts, custom deploy flows, and debugging. Prompts for vault password (or reads from env var `VOIDFORGE_VAULT_PASSWORD` for non-interactive use).

**What changes:** New file `scripts/vault-read.ts` (~50 lines). Imports directly from `wizard/lib/vault.ts`.

### Campaign Vault Integration

Kira's Step 0 already checks vault status (v7.5.1). This release adds: if Dax classifies env vars as "vault-available but not in .env," Sisko auto-runs `deploy --env-only` before the first mission. No manual step needed.

**What changes:** `docs/methods/CAMPAIGN.md` Step 0.5 (new), `.claude/commands/campaign.md` Step 0.5.

### Bolt-ons (from architecture review)

**Stale PTY session cleanup (tech debt #12).** Tower `init()` checks if the auto-created session actually connected. If "Session ended" appears within 2 seconds, auto-close and retry once. After 2 failures: "Terminal failed to start. The VoidForge server may need to restart." with a Lobby link. ~30 lines.

**Node.js `engines` field.** Add `"engines": { "node": ">=20.0.0 <25.0.0" }` to package.json. Prevents the v7.2→v7.3 crisis (node-pty ABI break on Node v24) from recurring silently. Update when node-pty ships Node 25 support. ~1 line.

**Fallback model ID update.** Tech debt #6: replace `claude-sonnet-4-5-20241022` with `claude-sonnet-4-6` in the model resolution fallback. ~1 line.

### Estimated effort
1 session. ~200 lines of new code + methodology doc updates.

---

## v7.7 — The Housekeeping

*Catch the docs up to reality. Fix the runtime papercuts.*

The architecture docs are stuck at v2.7.0 while the system is at v7.5+. Avengers Tower, RBAC, Thumper, the ws/node-pty migration, three-act wizard — none of it is documented in ARCHITECTURE.md. This release closes the gap and addresses the two highest-impact runtime bugs.

### Architecture Doc Refresh

Bring ARCHITECTURE.md, FAILURE_MODES.md, and SCALING.md from v2.7.0 to v7.7.0:

- **ARCHITECTURE.md:** Add Avengers Tower (Lobby, Penthouse, Tower), Thumper, RBAC, three-act wizard, ws/node-pty dependencies, WebSocket subsystem, project registry, PTY manager, multi-user session isolation.
- **FAILURE_MODES.md:** Add WebSocket connection failures (IPv6/IPv4, ws upgrade), PTY session failures (node-pty ABI, stale sessions, MAX_SESSIONS), Tower crash modes (vault lock on restart, cache invalidation), Thumper failure modes (bot token invalid, webhook timeout).
- **SCALING.md:** Update Tier 2 to reflect the multi-project registry and Penthouse features that already shipped in v7.0. Note that Avengers Tower's PTY sessions are the new practical ceiling (MAX_SESSIONS=5).

### Server Auto-Restart (tech debt #11)

Native module updates (`npm install` for node-pty/ws) change the `.node` binary on disk, but the running process keeps the old binary in memory. The server must be manually killed and restarted. Users see "Session ended" with no explanation.

Fix: On each request to the Lobby, compare mtime of `node_modules/**/**.node` files against a startup snapshot. If changed, show banner: "VoidForge updated — restart required. [Restart Now]". The restart button calls a server endpoint that executes graceful shutdown (kill PTY sessions, close WebSocket connections, 2s drain) then `process.execve()` to replace the process in-place.

**What changes:** `wizard/server.ts` gains startup mtime snapshot + comparison endpoint. `wizard/ui/lobby.js` gains restart banner. ~100 lines.

### Node.js Version Testing Note

Add `COMPATIBILITY.md` to `docs/` documenting: tested Node.js versions, known ABI-breaking changes (v24 node-pty incident), and the `engines` field policy. When upgrading the `engines` range, this doc is the checklist.

### Estimated effort
1-2 sessions. Doc rewrites + ~100 lines server code + 1 new doc.

---

## v8.0 — The Hive Mind

*VoidForge remembers, predicts, and generates.*

The first release where VoidForge learns from experience. Three features that compound: agents read past lessons before reviewing, Phase 0 catches structural contradictions before building, and a new command generates production-ready PRDs from conversation.

**Ship order:** These three features are independent. If scope pressure hits, ship in this order:
1. **Agent Memory** (foundation — v8.1 and v8.2 depend on it)
2. **Conflict Prediction** (highest time-savings per line of methodology)
3. **Auto-PRD** (highest user-facing value but not a dependency for anything else)

### Agent Memory — Active Lessons Read-Back

`docs/LESSONS.md` exists but is passive — agents never read it. Activate the feedback loop: during Phase 0 Orient, Wong loads lessons matching the current project's framework and domain. During reviews, agents check lessons tagged to their domain and flag matching patterns.

**What changes:** Phase 0 in BUILD_PROTOCOL.md gains a "Wong loads relevant lessons" step. Review commands (/qa, /security, /ux, /review) gain a directive: "Before analysis, check LESSONS.md for entries in your domain. Flag matches." The existing `wizard/lib/agent-memory.ts` (getRelevantLessons) provides the query mechanism for the wizard tier.

**Why first:** Agent Memory is the foundation — everything in v8.x reads from it.

### Conflict Prediction — Phase 0.5 Architecture Scan

Before a single line is written, Picard runs a lightweight contradiction scan on the PRD frontmatter:
- Auth required but no session store → flag
- Payments enabled but auth disabled → flag
- WebSocket features but static/Cloudflare deploy → flag
- Workers enabled but deploy target has no background process support → flag
- Database specified but deploy target doesn't support persistent storage → flag

10-15 common contradictions, checked in seconds. Catches the architecture mistakes that currently escape until Phase 9-11 reviews — where fixing them costs hours instead of minutes.

**What changes:** BUILD_PROTOCOL.md Step 0.5 (new). SYSTEMS_ARCHITECT.md gains a "Conflict Checklist" section. `.claude/commands/architect.md` gains a pre-analysis step.

### Auto-PRD Generation — `/prd` Command

The PRD is VoidForge's highest-friction input. Users who aren't good at writing PRDs produce bad builds. A new `/prd` command where Sisko conducts a structured interview:

1. "What are you building?" → name, one-liner, audience
2. "What stack?" → framework, database, deploy target (Sisko proposes defaults)
3. "What features?" → core flow, supporting features, integrations
4. "What does it look like?" → brand personality, key screens
5. "How does it ship?" → launch sequence, success metrics

Each act drafts that PRD section, shows it for confirmation. Output: complete `docs/PRD.md` with valid frontmatter. The existing wizard PRD generation (Step 4, SSE stream via Anthropic API) provides the backend; this adds a CLI-native path.

**New files:** `.claude/commands/prd.md`, update CLAUDE.md and HOLOCRON.md.

### Estimated effort
3-4 sessions total. All methodology doc changes + 1 new command file.

---

## v8.1 — The Deep Roster

*107 agents with names but no jobs. Time to put the full roster to work.*

VoidForge has 170+ named characters across 7 universes, but only ~63 have protocol tasks. The remaining ~107 are pool names with no defined role. This release activates the deep roster in two phases — high-impact agents first, then the full bench.

### Phase 1 — Core Protocol Integration (10 agents)

**Troi (Star Trek) — PRD Compliance, expanded from Gauntlet-only to per-phase:**
- `/build` Phase 0: after Orient, Troi confirms extraction matches PRD prose
- `/build` Phase 4: after core features, Troi checks routes/components match PRD Section 4
- `/build` Phase 8: after marketing, Troi checks landing page matches PRD brand section
- `/campaign` per-mission: Troi spot-checks the PRD sections that mission targeted
- `/architect --plan`: Troi validates the plan covers all PRD requirements

**Padmé (Star Wars) — Functional Verification, expanded from Gauntlet-only to build gates:**
- `/build` Phase 4 gate: "Can a user complete the primary flow end-to-end?"
- `/build` Phase 6 gate: "Do the integrations work in the primary flow?"
- `/assemble` Phase 2.5: functional verification alongside Hawkeye's endpoint checks
- `/campaign` per-mission: if mission touches user flows, Padmé verifies the affected flow

**Celeborn (Tolkien) — Design System Governance (NEW — currently unused):**
- `/ux` Step 2: parallel agent — consistent spacing tokens, typography scale, color palette, component naming
- `/build` Phase 5: after UI components, design system compliance check
- `/gauntlet` Round 2: part of Galadriel's team

**Worf (Star Trek) — Security Implications of Architecture:**
- `/architect` Step 1: runs parallel with Spock and Uhura — flags schema/design decisions with security implications
- "This schema stores PII in the same table as public data — separate."

**Riker (Star Trek) — Decision Review:**
- `/architect` Step 5 (ADRs): reviews Picard's decisions — "Number One, does this hold up?"
- Second opinion on trade-offs before ADRs are finalized

**Cyborg (DC) — System Integration Testing:**
- `/qa` Step 1: when multiple services/modules connect, Cyborg traces the full path across boundaries
- Activated when project has 3+ API files or cross-module data flows

**Wonder Woman (DC) — Truth Detector:**
- `/review` Step 1: finds where code says one thing and does another — misleading names, wrong comments, stale docs

**Raven (DC) — Deep Static Analysis:**
- `/qa` Step 1: bugs hidden beneath 3 layers of abstraction — follows data through transforms
- `/gauntlet` Round 1: deep analysis during discovery

**Valkyrie (Marvel) — Disaster Recovery:**
- `/devops`: backup verification, restore testing, failover procedures

**Torres (Star Trek) — Performance Architecture:**
- `/architect` Step 3: identifies N+1 queries, missing indexes, connection pool sizing in design phase (before code)

**What changes:** BUILD_PROTOCOL.md, CAMPAIGN.md, SYSTEMS_ARCHITECT.md, PRODUCT_DESIGN_FRONTEND.md, QA_ENGINEER.md, SECURITY_AUDITOR.md, DEVOPS_ENGINEER.md, ASSEMBLER.md + paired command files. NAMING_REGISTRY.md updated with protocol assignments for each activated agent.

### Phase 2 — Extended Roster (40+ agents)

**Extended DC roster for `/qa`:**
- Flash (rapid smoke tests), Batgirl (detail audit), Green Arrow (precision targeting), Huntress (flaky test hunter), Aquaman (deep dive testing), Superman (standard enforcement), Green Lantern (test scenario construction), Martian Manhunter (cross-environment testing)

**Extended Star Wars roster for `/security`:**
- Qui-Gon (subtle vulnerabilities), Han (first-strike scanner), Anakin (dark-side exploitation), Bo-Katan (perimeter defense), Din Djarin (bug bounty hunter), Bail Organa (governance/compliance), Cassian (threat modeling/recon), Sabine (unconventional attack vectors)

**Extended Tolkien roster for `/ux`:**
- Aragorn (UX leadership), Faramir (quality-over-glory check), Pippin (edge case discovery), Boromir (hubris/overengineering check), Haldir (boundary/transition guard), Glorfindel (hardest rendering challenges), Frodo (dedicated to the hardest UX task), Merry (pair review with Pippin)

**Extended Anime roster for `/devops`:**
- Vegeta (monitoring), Trunks (migrations/rollback), Mikasa (critical system protection), Erwin (capacity planning), Mustang (cleanup scripts), Olivier (infra hardening), Hughes (logging/observability), Calcifer (daemon management), Duo (teardown/decommission)

**Extended Marvel roster for `/build`:**
- T'Challa (craft/elegance review), Wanda (state management), Strange (service architecture during auth), Thor (queue/worker review)

**Extended Star Trek roster for `/architect`:**
- Janeway (novel architectures), Tuvok (security architecture), Crusher (system health diagnostics), Archer (greenfield architecture), Kim (API design), Pike (bold mission planning in `/campaign`)

**What changes:** Same files as Phase 1, plus each agent gets a one-line task definition in the relevant protocol step. Agents are activated conditionally — not every agent runs on every project. Trigger conditions defined per agent (e.g., "Cyborg activates when project has 3+ API files").

### Estimated effort
Phase 1: 2-3 sessions (10 agents across 8 method docs + 8 command files).
Phase 2: 2-3 sessions (40+ agents, but each is a one-line addition to existing protocol steps).

---

## v8.2 — The Evolution (was v8.1)

*The methodology improves itself. With permission.*

### Self-Improving Methodology

When 3+ entries in `docs/LESSONS.md` share the same category and target the same method doc, Wong auto-drafts a method doc update: a specific new checklist item, rule, or pattern based on the lesson cluster. Presented for user approval — never auto-applied.

For upstream: `/debrief --submit` includes the proposed method doc change in the GitHub issue body. `/debrief --inbox` processes these proposals.

**What changes:** FIELD_MEDIC.md gains a "Promotion Analysis" step. `/debrief` command gains promotion logic. LESSONS.md format unchanged (already has "Promoted to" field).

### Agent Specialization — Custom Sub-Agents

Users can create project-specific sub-agents that carry domain knowledge. A `docs/CUSTOM_AGENTS.md` file defines specialists:

```markdown
### Jarvis-Tailwind
**Universe:** Marvel | **Reports to:** Galadriel
**Domain:** Tailwind CSS v4 configuration, PostCSS, source() directive
**Behavioral directives:** Always check for v3→v4 migration issues. Verify @config path.
**Reference docs:** tailwindcss.com/docs/upgrade-guide
```

Custom agents run alongside built-in agents, not instead of them. Names must not collide with the naming registry.

**What changes:** SUB_AGENTS.md gains "Custom Agent" section. NAMING_REGISTRY.md gains collision check rule. New template file: `docs/CUSTOM_AGENTS.md`.

### Estimated effort
2-3 sessions. Methodology doc changes + 1 new template.

---

## v8.3 — The Autonomy (was v8.2)

*Supervised autonomy with safety rails.*

### Autonomous Campaigns — `/campaign --autonomous`

Sisko executes missions without waiting for confirmation at every brief. Guardrails:
1. Git checkpoint (`git tag campaign-mission-N-start`) before each mission
2. If `/assemble` produces Critical findings that can't be auto-fixed → rollback to tag, pause for human
3. Maximum 5 consecutive autonomous missions before mandatory human checkpoint
4. Victory Gauntlet ALWAYS requires human confirmation
5. Post-mission summary logged but not presented interactively

**Why after v8.0-v8.2:** Autonomous campaigns are safer when Agent Memory catches known pitfalls, the Deep Roster catches more issues per review, and Conflict Prediction catches structural problems before they propagate through 10 unattended missions.

**What changes:** CAMPAIGN.md gains `--autonomous` section with guardrails. `.claude/commands/campaign.md` gains flag handling.

### Estimated effort
1-2 sessions. Command + method doc changes.

---

## v9.0 — The Field-Tested Forge

*Codify everything we learned into hardened methodology.*

### Campaign Missions

**Mission 1 — Meta-Workflow Documentation**

Document how to use VoidForge to develop VoidForge. Deliverables:
- New `docs/META_WORKFLOW.md` (~200 lines):
  - How campaign-on-self works (methodology changes as missions)
  - Anti-patterns discovered: context pressure false alarms, reduced pipeline skipping review, `const` reassignment in strict mode, `globSync` API availability
  - The feedback loop: field reports → `/debrief --inbox` → methodology fixes → better field reports
  - When to blitz vs autonomous vs manual
  - Version table: which campaigns shipped which versions
- Update `HOLOCRON.md`: add META_WORKFLOW.md reference
- Update `CLAUDE.md` Docs Reference table: add META_WORKFLOW.md row

**Mission 2 — Pattern Evolution Data Collection**

Add the data collection side for Wong's promotion analysis. Deliverables:
- Update `docs/methods/BUILD_PROTOCOL.md` Phase 12: add pattern-usage logging step — after build completes, log which patterns were used, which framework adaptations applied, which custom mods made
- Update `docs/methods/FIELD_MEDIC.md`: add pattern-evolution check in promotion analysis — when pattern-usage data exists, check for recurring variations
- Update `.claude/commands/build.md`: add Phase 12 pattern logging instruction
- Update `.claude/commands/debrief.md`: add pattern-evolution check instruction

**Bolt-on from field report #62:**
- Update `docs/methods/FORGE_ARTIST.md` Step 0: persist OpenAI API key to `.env.local` on first use, not just shell env. Prevents key loss between sessions.

### Estimated effort
1-2 sessions. 2 missions.

---

## v9.1 — The Multi-Language Forge (Python)

*"From nothing, everything" — in any language.*

### Campaign Missions

**Mission 1 — Core Pattern Adaptations (4 patterns)**

Add full Django + FastAPI deep-dive sections to the 4 most critical patterns:
- `docs/patterns/api-route.ts` → Django REST Framework ViewSets + FastAPI path operations (~80 lines each)
- `docs/patterns/service.ts` → Django services layer + FastAPI repository pattern (~60 lines each)
- `docs/patterns/middleware.ts` → Django middleware + FastAPI dependency injection (~60 lines each)
- `docs/patterns/error-handling.ts` → Django exception handler + FastAPI HTTPException (~50 lines each)

**Mission 2 — Supporting Pattern Adaptations (4 patterns)**

- `docs/patterns/component.tsx` → Django templates + HTMX / Jinja2 + HTMX (~60 lines each)
- `docs/patterns/job-queue.ts` → Celery tasks + Django-Q / ARQ with FastAPI (~60 lines each)
- `docs/patterns/multi-tenant.ts` → Django-tenants + FastAPI Depends() scoping (~50 lines each)
- `docs/patterns/third-party-script.ts` → Python equivalent (script loading, initialization) (~40 lines)

**Mission 3 — Build Protocol Python Path**

- Update `docs/methods/BUILD_PROTOCOL.md`: Phase 0 detects `framework: django|fastapi`, Phase 1 scaffolds with `django-admin startproject` / `poetry init`, Phase 9-11 use `pytest`
- Update `.claude/commands/build.md`: Python-specific phase instructions
- Update `docs/methods/TESTING.md`: pytest setup, Django test client, FastAPI TestClient
- Update `docs/methods/QA_ENGINEER.md`: Python-specific attack vectors (Django ORM injection, Pydantic validation bypass)
- Update `docs/methods/SECURITY_AUDITOR.md`: Python-specific checks (Django settings, SECRET_KEY, DEBUG=True, ALLOWED_HOSTS)

### Estimated effort
2-3 sessions. 3 missions.

---

## v9.2 — The Mobile Forge

*Ship to pockets, not just browsers.*

VoidForge builds web apps. This release adds iOS and Android as deploy targets — from PRD to App Store.

### New Deploy Targets

| Target | Framework | Build | Distribution |
|--------|-----------|-------|-------------|
| `ios` | React Native or SwiftUI | Xcode CLI (`xcodebuild`) | TestFlight → App Store Connect |
| `android` | React Native or Kotlin | Gradle (`./gradlew assembleRelease`) | Google Play Console (internal track) |
| `cross-platform` | React Native or Flutter | Both pipelines | TestFlight + Play Console |

### PRD Frontmatter

```yaml
deploy: "ios"           # ios | android | cross-platform
mobile_framework: ""    # react-native | flutter | swiftui | kotlin
app_store_id: ""        # Apple Team ID (for code signing)
bundle_id: ""           # com.yourcompany.appname
```

### What Changes

**New provisioner:** `wizard/lib/provisioners/mobile.ts` — handles code signing, build configuration, and store submission. No infrastructure to provision (unlike VPS) — the "provisioning" is build + sign + upload.

**Build protocol adaptation:**
- Phase 1: scaffold with `npx react-native init` or `flutter create` or Xcode project
- Phase 5: mobile-specific UI patterns (safe area, navigation stacks, gestures, haptics)
- Phase 9: mobile QA additions (orientation, deep links, push notifications, offline mode, battery)
- Phase 11: mobile security additions (certificate pinning, secure storage, jailbreak detection, obfuscation)
- Phase 12: build + sign + upload to TestFlight/Play Console

**New patterns:**
- `mobile-screen.tsx` — React Native screen pattern (navigation, safe area, platform-specific behavior)
- `mobile-service.ts` — Offline-first data pattern (local SQLite + sync, conflict resolution)

**New agents (conditional — activate when `deploy: ios|android|cross-platform`):**
- **Uhura-Mobile** (Star Trek) → Reports to Picard. Mobile architecture: navigation stacks, deep linking, universal links, app lifecycle.
- **Samwise-Mobile** (Tolkien) → Reports to Galadriel. Mobile a11y: VoiceOver, TalkBack, Dynamic Type, reduced motion, touch targets (44pt minimum).
- **Rex-Mobile** (Star Wars) → Reports to Kenobi. Mobile security: certificate pinning, Keychain/Keystore, jailbreak detection, transport security.

### Campaign Missions

**Mission 1 — Mobile Methodology (methodology-only, no wizard code)**
- Update `docs/methods/BUILD_PROTOCOL.md`: mobile-specific phase adaptations (Phases 1, 5, 9, 11, 12)
- Update `.claude/commands/build.md`: mobile detection from `deploy: ios|android|cross-platform`
- Update `docs/methods/QA_ENGINEER.md`: mobile QA additions (orientation, deep links, push, offline, battery)
- Update `docs/methods/SECURITY_AUDITOR.md`: mobile security additions (cert pinning, secure storage, jailbreak)
- Update `docs/methods/PRODUCT_DESIGN_FRONTEND.md`: mobile UX additions (safe area, gestures, haptics)
- Add 3 custom agents to `docs/CUSTOM_AGENTS.md`: Uhura-Mobile, Samwise-Mobile, Rex-Mobile
- Update `docs/PRD.md` template: add mobile frontmatter fields

**Mission 2 — Mobile Patterns (new pattern files)**
- Create `docs/patterns/mobile-screen.tsx` (~150 lines): React Native screen with navigation, safe area, platform branching, loading/error/empty states, keyboard avoidance
- Create `docs/patterns/mobile-service.ts` (~150 lines): offline-first data pattern with local SQLite, sync queue, conflict resolution, optimistic UI
- Update `docs/patterns/README.md`: add mobile pattern descriptions

**Mission 3 — Mobile Provisioner (wizard code — main branch only)**
- Create `wizard/lib/provisioners/mobile.ts` (~200 lines): code signing config, build invocation, TestFlight/Play Console upload
- Update `scripts/voidforge.ts`: add `deploy: ios|android|cross-platform` to headless deploy
- Update `wizard/lib/headless-deploy.ts`: mobile provisioner registration
- Update `docs/ARCHITECTURE.md`: add mobile provisioner to system diagram

### Estimated effort
3-4 sessions. 3 missions.

---

## v9.3 — The Game Forge

*From nothing, everything — including worlds.*

VoidForge builds applications. This release adds game development as a project type — from PRD to playable build.

### New Project Type

```yaml
type: "game"            # full-stack | api-only | static-site | prototype | game
game_engine: ""         # unity | godot | phaser | three.js | pixi
game_genre: ""          # platformer | rpg | puzzle | simulation | fps
deploy: "web"           # web (WebGL/HTML5) | steam | itch | mobile
```

### What Changes

**Build protocol adaptation for `type: game`:**
- Phase 1: scaffold with engine-specific project structure (Godot project, Unity project, Phaser/webpack)
- Phase 2: game infrastructure (asset pipeline, scene management, input system, audio system)
- Phase 3: replaced by "Game Core" — game loop, ECS or component system, state machines, physics
- Phase 4: replaced by "Gameplay" — core mechanics, player controller, enemies/AI, level design data
- Phase 5: replaced by "Game UI" — HUD, menus, inventory, dialog system, transitions
- Phase 6: replaced by "Polish" — particles, screen shake, juice, audio cues, game feel
- Phase 7: replaced by "Content" — levels, balancing, progression, save/load
- Phase 8: replaced by "Game Marketing" — store page, screenshots, trailer script, press kit
- Phase 9-11: game-specific QA (frame rate profiling, input latency, memory leaks, platform testing)
- Phase 12: build + export (WebGL, desktop, mobile)

**New patterns:**
- `game-loop.ts` — Core game loop pattern (fixed timestep, interpolation, pause/resume)
- `game-state.ts` — State machine pattern (menu → playing → paused → game-over, with transition hooks)
- `game-entity.ts` — Entity component system or scene-tree pattern (depending on engine)

**New agents (conditional — activate when `type: game`):**
- **Spike-GameDev** (Anime) → Reports to Kusanagi. Game architecture: frame budgets, memory pools, object pooling, asset streaming.
- **Éowyn-GameFeel** (Tolkien) → Reports to Galadriel. Game juice: screen shake, hit pause, particle bursts, camera dynamics, audio cues. The enchantment pass, but for games.
- **Deathstroke-Exploit** (DC) → Reports to Batman. Game QA: speedrun exploits, out-of-bounds, sequence breaks, economy exploits, save corruption.
- **L-Profiler** (Anime) → Reports to Kusanagi. Performance profiling: frame time analysis, draw call optimization, garbage collection pressure, loading time budgets.

### Campaign Missions

**Mission 1 — Game Build Protocol (methodology adaptation)**
- Update `docs/methods/BUILD_PROTOCOL.md`: add `type: game` conditional path with all 12 phase adaptations (game core, gameplay, game UI, polish, content, game marketing)
- Update `.claude/commands/build.md`: game detection from `type: game`, engine-specific scaffolding instructions
- Update `docs/PRD.md` template: add game frontmatter fields (game_engine, game_genre)
- Update `docs/methods/SYSTEMS_ARCHITECT.md`: add game architecture section (ECS, scene graph, game loop patterns, asset pipeline architecture)

**Mission 2 — Game Patterns (new pattern files)**
- Create `docs/patterns/game-loop.ts` (~120 lines): fixed timestep with interpolation, pause/resume, frame budget tracking
- Create `docs/patterns/game-state.ts` (~120 lines): hierarchical state machine (menu → playing → paused → game-over) with transition hooks and history
- Create `docs/patterns/game-entity.ts` (~120 lines): ECS pattern (entities, components, systems) with pooling and lifecycle
- Update `docs/patterns/README.md`: add game pattern descriptions

**Mission 3 — Game Review Methodology**
- Update `docs/methods/QA_ENGINEER.md`: game QA additions (frame rate profiling, input latency, memory leaks, speedrun exploits, out-of-bounds, save corruption)
- Update `docs/methods/SECURITY_AUDITOR.md`: game security (anti-cheat, save file tampering, network protocol validation for multiplayer)
- Update `docs/methods/PRODUCT_DESIGN_FRONTEND.md`: game UX (game feel, juice, screen shake, controller support, accessibility options menu)
- Update `docs/methods/DEVOPS_ENGINEER.md`: game DevOps (build pipelines for WebGL/Steam/itch.io, asset optimization, platform-specific builds)
- Add 4 custom agents to `docs/CUSTOM_AGENTS.md`: Spike-GameDev, Éowyn-GameFeel, Deathstroke-Exploit, L-Profiler

**Mission 4 — Game Distribution (wizard code — main branch only)**
- Engine-specific scaffolding scripts (Godot, Phaser/webpack, Three.js)
- Build + export automation for WebGL, desktop, mobile targets
- Steam/itch.io distribution support in headless deploy

### Estimated effort
4-5 sessions. 4 missions.

---

## v10.0 — The Danger Room + The Frontier

*The Danger Room is the surface. The Frontier features are what it displays.*

**Ship order:** Build the Danger Room dashboard FIRST (it's the platform). Then add Frontier features one at a time — each one gets a new panel on the dashboard.

### 1. Agent Confidence Scoring

Each agent reports a confidence score (0-100) on their findings. Low-confidence findings (<60) get escalated to a second agent from a different universe instead of being presented as definitive. Reduces false positives. High-confidence findings (>90) skip re-verification in Pass 2. The system learns which agents are reliable in which domains.

### 2. Agent Debates

When two agents disagree on a finding (Kenobi says "security risk," Stark says "by design"), instead of listing both opinions, run a structured debate. Each agent makes their case with evidence from the codebase. Picard or the user arbitrates. The debate transcript is logged as an ADR. Better decisions come from argued positions than from listed bullet points. The debate format: Agent A states finding → Agent B responds → Agent A rebuts → Arbiter decides. 3 exchanges max.

### 3. Adversarial PRD Review (`/prd --challenge`)

Before building, an agent argues AGAINST the PRD. "This feature will be expensive to maintain." "This integration has a 40% chance of API deprecation." "Your schema doesn't support the multi-tenant use case you mentioned in Section 7." Forces the user to defend their choices before committing 8 phases of build time. Cheaper than discovering design flaws in Phase 9.

### 4. Natural Language Deploy

Instead of YAML frontmatter, describe deployment in prose: "I want this running on a $20/month server with a custom domain, automatic SSL, and daily backups." The system figures out the deploy target (VPS), instance type (t3.small), DNS provider (Cloudflare), backup schedule (pg_dump daily to S3), and generates the frontmatter. `/prd` already does this for features — extend it to infrastructure.

### 5. The Danger Room Dashboard — THE CENTERPIECE

**This is not just one of ten ideas. It is the surface that makes every other idea visible.** Agent debates, confidence scores, build archaeology, the living PRD, the prophecy graph — they all need somewhere to live. The Danger Room is the connective tissue. Promote to its own version (v9.5 or v10.0 foundation) and build it BEFORE the other v10.0 features so they have a surface to render on.

**Architecture:** New tab in Avengers Tower Lobby (`/war-room.html`). Real-time updates via WebSocket (same `ws` infrastructure as Tower terminals). Data fed by Hill (phase tracking) and Jarvis (status summaries). Vanilla JS frontend — no framework, same as the rest of the wizard UI.

**Core Panels (from existing system data):**

| Panel | Data Source | What It Shows |
|-------|-----------|---------------|
| **Campaign Timeline** | campaign-state.md | Horizontal timeline of missions: completed (green), active (yellow), pending (gray), blocked (red). Click to expand details. |
| **Phase Pipeline** | assemble-state.md | 13-phase vertical pipeline with status badges. Active phase pulses. Failed phases show error. |
| **Active Agents** | Agent tool invocations | Grid of agent avatars currently running. Universe color-coded (Tolkien=gold, Marvel=red, DC=blue, etc.). |
| **Finding Scoreboard** | Phase logs | Real-time counters: Critical / High / Medium / Low. Grouped by domain (QA, Security, UX, Architecture, DevOps). |
| **Context Gauge** | `/context` output | Circular gauge showing token usage: green (<50%), yellow (50-70%), red (>70%). Updates per phase. |
| **PRD Coverage** | Prophecy Board | PRD sections as a checklist: complete, in-progress, blocked, not started. Percentage bar. |
| **Test Suite** | `npm test` output | Pass / Fail / Skip counts. Flaky test list (Huntress). Last run timestamp. |
| **Deploy Status** | deploy-log.json | Last deploy: URL, timestamp, target, health check status. Green dot = live. |
| **Version & Branch** | VERSION.md + git | Current version, branch, last commit. Sync status across main/scaffold/core. |
| **Cost Tracker** | Holo's data | Monthly cost per project. Budget alerts. |

**v10.0 Feature Panels (added as each feature ships):**

| Panel | Feature | What It Shows |
|-------|---------|---------------|
| **Confidence Heat Map** | Agent Confidence (#1) | Grid of findings color-coded by confidence score. Low-confidence findings pulsate. Click to see which agent escalated to whom. |
| **Debate Arena** | Agent Debates (#2) | Live and archived debates. Two agent avatars face each other. Transcript scrolls. Verdict badge (pending/resolved). Click to read full debate. |
| **PRD Challenge Log** | Adversarial PRD (#3) | Which PRD claims were challenged, which survived, which were modified. Risk flags. |
| **Infra Config** | Natural Language Deploy (#4) | Generated infrastructure config with cost estimate. "Approve" button. Diff against current. |
| **Bug Trace Timeline** | Build Archaeology (#6) | Click a production bug → visual timeline tracing it back through phases, agents, commits. Animated path through the pipeline. |
| **Global Lessons** | Cross-Project Memory (#7) | Lesson cards from all projects. Frequency badges. "This pattern broke in 3 of 5 projects." |
| **Experiment Dashboard** | A/B Testing (#8) | Active experiments. Side-by-side agent accuracy charts. Context cost comparison. |
| **Prophecy Graph** | Prophecy Visualizer (#9) | Interactive dependency graph. Nodes = PRD sections. Edges = dependencies. Color = status. Click to drill into missions and findings. |
| **PRD Drift View** | Living PRD (#10) | Side-by-side diff: original PRD vs current. Drift score. Highlighted evolution points. |

**Layout:** Responsive grid. Main area shows the active context (campaign timeline during campaign, phase pipeline during assemble, finding scoreboard during gauntlet). Sidebar shows persistent panels (context gauge, version, deploy status). Bottom ticker shows agent activity feed ("Maul probing /api/auth... Nightwing running test suite... Constantine found cursed code in utils.ts").

**Data Layer:** All panels read from existing files (campaign-state.md, assemble-state.md, phase logs, VERSION.md, deploy-log.json) via REST endpoints + WebSocket push for real-time updates. No new data storage — the Danger Room is a VIEW layer over existing state.

### 6. Build Archaeology

When debugging a production issue, trace it back through the build protocol. "This bug was introduced in Phase 4 (commit abc123), escaped QA in Phase 9 because Constantine's cursed-code check doesn't cover this pattern, and wasn't caught by the Gauntlet because Round 4 Crossfire focused on the wrong module." Post-mortem archaeology with actionable fixes to the methodology.

### 7. Cross-Project Agent Memory

When starting a new project, Wong queries lessons from ALL previous projects stored in `~/.voidforge/lessons-global.json` — not just the current project's `docs/LESSONS.md`. "You've built 3 Next.js apps with Stripe. Here's what broke every time: webhook signature verification in test mode, price ID mismatch between environments, and checkout session expiry." The global memory is opt-in and privacy-respecting (no source code, only lesson summaries).

### 8. Methodology A/B Testing

Run two versions of a methodology step on the same codebase and compare results. "Does the 17-agent QA pass find more real bugs than the 7-agent version? At what context cost?" Track true-positive rates per agent, per project type. Over time, tune the methodology based on data, not intuition. Wong manages the experiments; results feed into promotion analysis.

### 9. The Prophecy Visualizer

Render the campaign's Prophecy Board as a visual dependency graph in the browser. Nodes are PRD sections; edges are dependencies. Completed nodes are green, in-progress yellow, blocked red. Click a node to see which missions touched it, what agents reviewed it, and what findings remain. Sisko's war table, visualized.

### 10. The Living PRD

The PRD is currently static — read at Phase 0, checked at the end by Troi. Make it a living document that evolves with the build. Phase 4 reveals the schema needs a field the PRD didn't mention? The PRD's data model section updates. Feature gets BLOCKED? PRD marks it inline. Gauntlet finds the implementation deviates from the PRD? The user chooses: fix the code OR update the PRD. Troi's compliance check becomes a two-way sync, not a one-way audit. The PRD stays true because it evolves with reality instead of fossilizing at Phase 0.

### Campaign Missions

**Mission 1 — Danger Room Foundation (wizard code + methodology)**
- Create `wizard/ui/war-room.html` + `wizard/ui/war-room.js` + `wizard/ui/war-room.css`
- Core layout: responsive grid, main area + sidebar + bottom ticker
- 5 panels from existing data: Campaign Timeline, Phase Pipeline, Finding Scoreboard, Context Gauge, Version & Branch
- WebSocket integration for real-time updates (reuse Tower ws infrastructure)
- REST endpoints for reading campaign-state.md, assemble-state.md, phase logs
- Add Danger Room tab to Lobby navigation
- Update `docs/ARCHITECTURE.md`: add Danger Room to system diagram

**Mission 2 — Danger Room Extended Panels**
- 5 more panels: Active Agents (universe-colored avatars), PRD Coverage, Test Suite status, Deploy Status, Cost Tracker
- Agent activity ticker (bottom bar): parse agent tool invocations into "Maul probing /api/auth..." feed
- Hill + Jarvis data feed: phase completion timestamps, status summaries piped to Danger Room

**Mission 3 — Agent Confidence Scoring (#1)**
- Update all agent protocol sections: add confidence score (0-100) to finding format
- Update `docs/methods/GAUNTLET.md`: low-confidence findings (<60) escalated to second agent
- Create Confidence Heat Map panel for Danger Room
- Update finding log format across all method docs

**Mission 4 — Agent Debates (#2)**
- Update `docs/methods/SUB_AGENTS.md`: add Debate Protocol (Agent A states → Agent B responds → Agent A rebuts → Arbiter decides, 3 exchanges max)
- Update `docs/methods/ASSEMBLER.md`: when review agents disagree, trigger debate instead of listing both
- Create Debate Arena panel for Danger Room (live transcripts, verdict badges)
- Log debates as ADRs

**Mission 5 — Adversarial PRD Review (#3)**
- Create `.claude/commands/prd-challenge.md` or add `--challenge` flag to `/prd` command
- Update `docs/methods/CAMPAIGN.md`: optional PRD challenge before first mission
- Create PRD Challenge Log panel for Danger Room
- Define the adversarial agent (Boromir-PRD? "One does not simply ship this feature")

**Mission 6 — Natural Language Deploy (#4)**
- Update `/prd` command Act 5: deploy section accepts prose description
- Create infra-resolver logic: prose → frontmatter mapping (instance type, DNS, backup schedule)
- Create Infra Config panel for Danger Room (generated config, cost estimate, approve button)
- Update `docs/methods/DEVOPS_ENGINEER.md`: natural language deploy section

**Mission 7 — Build Archaeology (#6)**
- Create `/archaeology` command or `--trace` flag on `/debrief`
- Data model: link production bugs → git commits → build phases → agent findings
- Create Bug Trace Timeline panel for Danger Room (animated path through pipeline)
- Update `docs/methods/FIELD_MEDIC.md`: archaeology mode in debrief

**Mission 8 — Cross-Project Memory (#7)**
- Create `~/.voidforge/lessons-global.json` schema
- Update Wong's promotion analysis: after each debrief, write lesson summary to global store
- Update Phase 0 Orient: Wong loads global lessons matching current framework/domain
- Create Global Lessons panel for Danger Room (frequency badges, cross-project patterns)

**Mission 9 — Methodology A/B Testing (#8)**
- Create experiment framework: define experiment (agent count, protocol variant), run both, compare
- Track true-positive rates per agent per project type
- Create Experiment Dashboard panel for Danger Room (side-by-side accuracy charts)
- Update `docs/methods/FIELD_MEDIC.md`: experiment analysis in debrief

**Mission 10 — Prophecy Visualizer (#9)**
- Create interactive dependency graph renderer (vanilla JS + canvas or SVG)
- Parse campaign-state.md into node/edge graph
- Create Prophecy Graph panel for Danger Room (clickable nodes, color-coded status)
- Drill-down: click node → show missions, findings, agent reviews

**Mission 11 — The Living PRD (#10)**
- Update BUILD_PROTOCOL.md: Phase 4/6/8 gates include PRD update step when implementation deviates
- Update Troi's compliance check: two-way sync (fix code OR update PRD)
- Create PRD Drift View panel for Danger Room (side-by-side diff, drift score)
- Store Phase 0 PRD snapshot for diff comparison

### Estimated effort
8-12 sessions. 11 missions. The Danger Room foundation (Missions 1-2) ships first; frontier features (Missions 3-11) add panels incrementally.

---

---

## Remaining v10.x Work

*What was claimed as shipped but needs real implementation. Field report #76.*

### v10.1 — Danger Room Data Feeds + Feature Enforcement

**Mission 1 — Danger Room WebSocket handler + data feeds**
- Add `/ws/war-room` WebSocket upgrade handler in `wizard/server.ts` (alongside existing `/ws/terminal`)
- Connect campaign-state.md parsing to `/api/war-room/campaign` endpoint (return mission list with statuses)
- Connect assemble-state.md to `/api/war-room/build` (return phase pipeline with statuses)
- Parse phase logs for finding counts → `/api/war-room/findings`
- Read deploy-log.json → `/api/war-room/deploy`
- Emit real-time agent activity events via WebSocket when agents are launched

**Mission 2 — Confidence Scoring enforcement**
- Update `.claude/commands/gauntlet.md`: finding format MUST include `[CONFIDENCE: XX]`
- Update `.claude/commands/qa.md`, `security.md`, `ux.md`, `review.md`: all findings require confidence score
- Add low-confidence escalation instructions to each command: "If confidence <60, launch a second agent from a different universe to verify"

**Mission 3 — Agent Debates enforcement**
- Update `.claude/commands/assemble.md`: when parallel review agents produce conflicting findings, trigger debate protocol (not just list both)
- Update `.claude/commands/review.md`: add conflict detection step after parallel analysis

**Mission 4 — Living PRD enforcement**
- Update `.claude/commands/build.md`: Phase 4/6/8 gates must include "check: does implementation match PRD? If not, fix code OR update PRD"
- Store Phase 0 snapshot: add instruction to save `docs/PRD-snapshot-phase0.md` at Phase 0

### v10.2 — Unbuilt Features

**Mission 5 — Natural Language Deploy**
- Build prose → frontmatter resolver in `wizard/lib/natural-language-deploy.ts`
- Parse: "I want a $20/month server with SSL" → `deploy: vps, instance_type: t3.small, hostname: ...`
- Integrate into `/prd` Act 5 or as standalone command

**Mission 6 — Methodology A/B Testing**
- Design experiment schema: `~/.voidforge/experiments.json`
- Track per-agent true-positive rates across projects
- Build experiment runner that runs protocol variant A and B on same code, compares results
- Add Experiment Dashboard panel to Danger Room

**Mission 7 — Prophecy Visualizer**
- Build dependency graph renderer (SVG or canvas) in `wizard/ui/war-room-prophecy.js`
- Parse campaign-state.md into node/edge graph
- Clickable nodes → drill into mission details, findings, agent reviews
- Color-coded: green (complete), yellow (active), red (blocked), gray (pending)

### Estimated effort
v10.1: 2-3 sessions (4 missions — data feeds + 3 enforcement missions)
v10.2: 3-4 sessions (3 missions — all require real implementation code)

---

## v11.0 — The Consciousness (Cosmere Growth Universe)

*"There's always another secret." — Kelsier*

**The thesis:** VoidForge has the build/review/deploy pipeline. v11.0 adds the growth/marketing/money pipeline. The 8th universe (Cosmere — Brandon Sanderson) brings 18 agents led by Kelsier, the 15th Council member.

**Inspired by:** Polsia (autonomous AI business operations, $2M ARR), Paperclip (open-source zero-human company orchestration).

### The 8th Universe: The Cosmere

| Agent | Character | Source | Role |
|-------|-----------|--------|------|
| **Kelsier** | The Survivor | Mistborn | **Lead** — Growth strategy, campaign orchestration |
| **Vin** | Mistborn Ascendant | Mistborn | Analytics — attribution, metrics, pattern detection |
| **Shallan** | Lightweaver | Stormlight | Content & creative — copy, brand, visual identity |
| **Hoid** | Wit | Cosmere-wide | Copywriting — the storyteller with the perfect words |
| **Kaladin** | Windrunner | Stormlight | Organic growth — community, word-of-mouth, trust |
| **Dalinar** | The Blackthorn | Stormlight | Positioning — competitive analysis, market strategy |
| **Navani** | Scholar-Queen | Stormlight | Technical SEO — schema, CWV, structured data |
| **Raoden** | Prince of Elantris | Elantris | Conversion optimization — fixes broken funnels |
| **Sarene** | Princess of Teod | Elantris | Outreach — cold email, influencer, co-marketing |
| **Wax** | Allomantic Lawman | Mistborn Era 2 | Paid ads — targeting, campaigns, ROAS |
| **Wayne** | Master of Disguise | Mistborn Era 2 | A/B testing — tries every variation |
| **Steris** | The Planner | Mistborn Era 2 | Budget & forecasting — contingency plans |
| **Dockson** | The Bookkeeper | Mistborn | Treasury — bank connections, payments, spend execution |
| **Breeze** | The Soother | Mistborn | Platform relations — API credentials, platform ToS |
| **Lift** | Edgedancer | Stormlight | Social media — fast, irreverent, audience voice |
| **Szeth** | Truthless | Stormlight | Compliance — GDPR, CAN-SPAM, ad policies |
| **Adolin** | Highprince | Stormlight | Brand ambassador — launches, PR, charm |
| **Marsh** | The Inquisitor | Mistborn | Competitive intel — deep monitoring of competitors |

### `/grow` Command — 6-Phase Growth Protocol

Phase 1 — Reconnaissance (Kelsier + Vin + Marsh): Product audit, site audit, competitive analysis → Growth Brief
Phase 2 — Foundation (Navani + Raoden): Technical SEO, conversion optimization, analytics setup
Phase 3 — Content (Shallan + Hoid): Blog, changelog, case studies, social content, visual assets
Phase 4 — Distribution: Organic (Kaladin, Lift, Adolin) + Paid (Wax, Wayne, Steris) + Outreach (Sarene)
Phase 5 — Compliance (Szeth): GDPR, CAN-SPAM, platform ToS, privacy, ad creative compliance
Phase 6 — Measure & Iterate (Vin + Kelsier): Track, identify, report, loop

### The Treasury — `/treasury` Command

Dockson manages real money. Revenue ingest (Stripe, Paddle, Mercury/Brex) → budget allocation → spend execution → reconciliation.

Safety tiers: <$25/day auto-approve, $25-100 agent approval (Dockson + Steris), >$100 human confirm, >$500 hard stop. `/treasury --freeze` kills all automated spending. Immutable spend log.

### Ad Platform Integration

Meta, Google Ads, TikTok, LinkedIn, Twitter/X, Reddit (paid). Product Hunt, Hacker News (organic launches). Wax creates → Wayne A/B tests → Vin measures → optimize or kill.

### Site Optimization (Navani's Pipeline)

`/grow --seo`: Core Web Vitals, technical SEO (sitemap, robots, JSON-LD, OG), page speed, conversion optimization (Raoden).

### Implementation Phases

> **Full specification:** See `PRD-VOIDFORGE.md` Section 9 for complete user flows, schemas, integration specs, security model, and compliance framework.

| Version | Codename | Focus | PRD Reference | Effort |
|---------|----------|-------|---------------|--------|
| v11.0 | The Consciousness | Cosmere universe (18 agents) + `/grow` Phases 1-3 + financial vault + TOTP + safety tier schema + Danger Room Growth tab (read-only) | §9.2, §9.3 (Ph 1-3), §9.11, §9.16 (ADR-2), §9.19 | 3-4 sessions |
| v11.1 | The Treasury | `/treasury` + revenue ingest (read-only) + reconciliation + heartbeat daemon (monitoring only) + Treasury tab in Danger Room | §9.4, §9.7, §9.9, §9.16 (ADR-1/3/5), §9.19 | 2-3 sessions |
| v11.2 | The Distribution | Ad platform adapters + spend execution (protected by v11.0/v11.1 safety) + `/grow` Phase 4 + Ad Campaigns tab in Danger Room | §9.3 (Ph 4), §9.5, §9.10, §9.17, §9.19 | 2-3 sessions |
| v11.3 | The Heartbeat | `/portfolio` + anomaly detection + backup + cross-project financials + service install + Heartbeat tab in Danger Room | §9.7, §9.8, §9.16 (ADR-6), §9.17, §9.19 | 2-3 sessions |

**Phase ordering principle (ADR-2):** Safety before agency. Observability before execution.

### Required Deliverables per Phase

**v11.0 deliverables:**
- 18 agent definitions in `docs/NAMING_REGISTRY.md` ✓ (added)
- Method doc: `docs/methods/GROWTH_STRATEGIST.md`
- Command: `.claude/commands/grow.md`
- Command: `.claude/commands/cultivation.md` (install command)
- Pattern: `docs/patterns/ad-platform-adapter.ts` (split interface: AdPlatformSetup + AdPlatformAdapter per §9.19.10)
- Pattern: `docs/patterns/financial-transaction.ts` (branded Cents type, hash-chained append log)
- Financial vault (separate from infra vault, AES-256-GCM, Argon2id key derivation)
- TOTP setup (secret in system keychain per ADR-4)
- Safety tier schema + budget flags + campaign creation rate limits (§9.19.14)
- Danger Room tab/view navigation system (prerequisite for growth tabs)
- Danger Room Growth tab (read-only, placeholder data)
- Financial CSS color tokens (§9.15.3)
- Growth tab WebSocket event types
- Danger Room WebSocket reconnection logic (§9.19.9)

**v11.1 deliverables:**
- Method doc: `docs/methods/TREASURY.md`
- Method doc: `docs/methods/HEARTBEAT.md`
- Command: `.claude/commands/treasury.md`
- Pattern: `docs/patterns/daemon-process.ts` (PID, signals, sleep/wake, log rotation)
- Pattern: `docs/patterns/revenue-source-adapter.ts`
- Pattern: `docs/patterns/oauth-token-lifecycle.ts`
- Stripe + Paddle revenue adapters (read-only, polling)
- Heartbeat daemon with single-writer architecture (ADR-1, Unix domain socket)
- Write-ahead log for pending operations (ADR-3)
- Spend-log + revenue-log (append-only, hash-chained)
- Reconciliation engine (two-pass: preliminary + final)
- Treasury panel in Danger Room
- Currency enforcement (USD-only per ADR-6)

**v11.2 deliverables:**
- Meta + Google adapters (full CRUD + reporting)
- TikTok, LinkedIn, Twitter/X, Reddit adapters
- Pattern: `docs/patterns/outbound-rate-limiter.ts`
- Spend execution pipeline (budget lock, idempotency keys)
- Campaign state machine (8 states, event-sourced transitions)
- Ad Campaigns panel in Danger Room
- Lift social content generation, Sarene outreach, Wayne A/B testing
- Szeth compliance framework

**v11.3 deliverables:**
- Command: `.claude/commands/portfolio.md`
- Mercury/Brex bank adapters
- `/portfolio` command with cross-project financials
- Anomaly detection (spend spikes, traffic drops, conversion changes)
- Automatic daily backup (treasury + growth state → ~/.voidforge/backups/, encrypted per §9.19.13)
- `launchd`/`systemd`/Task Scheduler install scripts (heartbeat + wizard server per §9.19.2)
- Heartbeat tab in Danger Room
- Desktop notifications (macOS/Linux)
- Daemon session token auto-rotation (§9.19.15)

---

## v12.0 — The Deep Current (Autonomous Campaign Intelligence)

*"Logic is the beginning of wisdom, not the end." — Tuvok*

**The thesis:** VoidForge v1-v11 requires a human to decide what to build/grow next. v12 removes that requirement. The Deep Current reads the project, its history, its analytics, its competitive landscape, and autonomously designs the next campaign. The human monitors the dashboard and adjusts course — or walks away entirely.

**The 9th universe expansion:** Voyager crew (Star Trek) — the ship that operated autonomously in the Delta Quadrant for 7 years without Starfleet Command. 5 new agent roles: Tuvok (strategic intelligence), Seven (optimization), Chakotay (cross-pipeline bridge), Paris (route planning), Torres (site scanning).

**Inspired by:** The convergence of build pipeline (Sisko), growth pipeline (Kelsier), financial pipeline (Dockson), and learning pipeline (Bashir). Currently these are separate workflows requiring human orchestration. The Deep Current connects them into a single autonomous loop: SENSE → ANALYZE → PROPOSE → [GATE] → EXECUTE → LEARN.

### Core Architecture

**The Deep Current Loop:**
1. **SENSE** — Torres scans the deployed site (Lighthouse, meta tags, health). Vin reads analytics. Marsh scans competitors. Dockson reads revenue. Wong reads lessons. Kira reads operational state.
2. **ANALYZE** — Seven runs gap analysis across 5 dimensions: feature completeness, quality, performance, growth readiness, revenue potential. Scores each 0-100.
3. **PROPOSE** — Tuvok generates a campaign proposal: missions, expected impact, risk assessment, alternatives considered, autonomy recommendation.
4. **[GATE]** — Tier 1: human approves. Tier 2: auto-execute after 24h delay (human can veto). Tier 3: immediate execution.
5. **EXECUTE** — Sisko runs the campaign. Fury assembles. Coulson commits. Thanos reviews.
6. **LEARN** — Bashir debriefs. Tuvok scores predictions against actual outcomes. Chakotay updates the correlation model (which product changes drive which growth outcomes).

**The Cold Start Problem (solved):**
- User provides one paragraph: "What problem are you solving? For whom?"
- Seven researches the competitive landscape (Marsh scans)
- Tuvok generates a draft PRD (using /prd internally)
- User reviews and approves
- Paris computes the first campaign

**Autonomy Tiers:**
- **Tier 1 (Advisor):** System proposes campaigns. Human decides. Default.
- **Tier 2 (Supervised):** System executes after 24h delay. Human can veto. Max 5 missions per campaign.
- **Tier 3 (Full Autonomy):** System executes immediately. Circuit breakers for safety. 30-day mandatory human sync.

**New command:** `/current` — Tuvok's Deep Current command (scan, analyze, propose, set tier, intake, history, stop, status).

### Security Architecture (Worf + Tuvok)

**Hard limits (non-negotiable):**
- PRD modification requires human approval (hash checkpoint)
- Campaign creation requires vault password (no programmatic bypass)
- Methodology changes require human approval
- Production deployment requires human promotion (autonomous → staging only)
- Budget ceiling modifiable only with vault + TOTP
- 30-day mandatory strategic sync (system pauses if overdue)

**Strategic drift defense:**
- Strategic intent document (read-only to system): "This product is X, NOT Y"
- Drift score after every 5 autonomous actions (Troi compares current state to intent)
- Drift > 30% → pause and escalate

**Feedback loop circuit breakers:**
- Lesson decay: 50% weight at 90 days, 25% at 180 days
- 10-15% exploration budget (prevents collapsing into local optimum)
- Minimum sample enforcement (500 impressions, 3 days, 95% confidence)
- Circular dependency detection in Kelsier's recommendations

**Aggregate spend controls:**
- Single hard ceiling on total daily autonomous spend (set by human, immutable by system)
- Monotonically increasing spend lockout (7 consecutive days → human review)
- Minimum ROAS enforcement (< 1.0x for 7 days → freeze all autonomous campaigns)

### Implementation Phases

| Version | Codename | Focus | Effort |
|---------|----------|-------|--------|
| v12.0 | The Scanner | Cold start intake, site scan (Torres), situation model, `/current --scan`, `/current --intake` | 2-3 sessions |
| v12.1 | The Analyst | Gap analysis (Seven), campaign proposal generation, `/current` full loop, Tier 1 advisory mode | 2-3 sessions |
| v12.2 | The Bridge | Chakotay's correlation engine, cross-pipeline data flow, prediction tracking, LEARN step | 2-3 sessions |
| v12.3 | The Navigator | Paris's route optimization, Tier 2 supervised autonomy, auto-execute with delay, Danger Room Deep Current tab | 2-3 sessions |
| v12.4 | The Autonomy | Tier 3 full autonomy, circuit breakers, kill switch, deploy freeze windows, 30-day human checkpoint | 2-3 sessions |

**Ordering principle:** Same as v11.0 — safety before agency. Tier 1 ships first (prove good recommendations). Tier 3 ships last (earn the right to act independently).

### Danger Room Integration

New tab: **Deep Current** — situation model (5-dimension radar), active proposal with launch/modify/reject, campaign history with prediction accuracy, signal feed, correlation map, autonomy status with emergency stop.

### Deliverables per Phase

**v12.0:**
- `/current` command (scan, intake modes)
- `docs/methods/DEEP_CURRENT.md` (Tuvok's method doc)
- Torres's site scanner (Lighthouse-lite via HTTP checks)
- Situation model (`/logs/deep-current/situation.json`)
- 5 agent definitions in naming registry (Tuvok, Seven, Chakotay, Paris, Torres — Voyager pool)

**v12.1:**
- Seven's gap analysis engine (5-dimension scoring)
- Campaign proposal generator
- `/current` full loop (scan → analyze → propose)
- Tier 1 advisory mode in Danger Room

**v12.2:**
- Chakotay's correlation engine (event log + before/after comparison)
- Cross-pipeline data flow (Vin → Chakotay, Bashir → Chakotay)
- Prediction tracking (proposed vs actual impact)

**v12.3:**
- Paris's route optimization (ROI-weighted campaign ordering)
- Tier 2 supervised autonomy (24h delay, veto mechanism)
- Danger Room Deep Current tab (6 panels)

**v12.4:**
- Tier 3 full autonomy
- Circuit breakers (drift scoring, feedback loop detection, spend lockout)
- Kill switch (`/current --stop`)
- Deploy freeze windows
- 30-day mandatory strategic sync enforcement

---

## v12.5 — The Full Roster (Agent Utilization Overhaul)

*"190+ agents on the bench, 6 on the field."*

**The problem:** Command files name only lead agents. The method docs have deep rosters (12+ agents per domain), but the command files — which is what Claude Code actually reads at runtime — often only mention the lead by name. Result: Claude deploys 3-6 perspectives per command when 20-30 are available. The remaining 200+ agents are defined but never invoked.

**Evidence from field reports:** The recurring pattern across #99, #103, #104, #108, #111, #114, #115 is that issues are caught late (by Gauntlet or user) that should have been caught earlier by a named agent who was never called. Auth flow bugs (#115) would have been caught if Nightwing's auth flow end-to-end test was in the `/build` command, not just the method doc.

**The fix:** Update every command file to explicitly name the sub-agents it should deploy, matching the roster defined in the method doc.

### Verified Audit (deep scan of command files vs method docs + registry)

**247 agents in the naming registry. Here's where they actually get called:**

| Command | In Command File | In Method Doc | Gap | Priority |
|---------|----------------|---------------|-----|----------|
| `/architect` | 15 (Picard + full ST bridge) | 16 (adds Pike) | Pike missing from command | Low — already strong |
| `/ux` | 17 (Galadriel + full Tolkien) | 17 | **NONE — fully wired** | N/A |
| `/qa` | 15 (Batman + full DC) | 15 | **NONE — fully wired** | N/A |
| `/security` | 17 (Kenobi + full SW) | 17 | **NONE — fully wired** | N/A |
| `/build` | ~35 (multi-universe) | ~35 | **NONE — fully wired** | N/A |
| `/gauntlet` | 41 (largest roster) | ~60 (Infinity mode) | 19 agents in Infinity but not standard | Medium |
| `/debrief` | 7 (Bashir + DS9 + Wong) | 7 | **NONE — fully wired** | N/A |
| `/grow` | 17 (full Cosmere) | 17 | **NONE — fully wired** | N/A |
| `/current` | 8 (Voyager + Vin + Marsh) | 8 | **NONE — fully wired** | N/A |
| `/campaign` | 9 (Sisko + DS9 + Fury + Thanos + Troi + Pike) | 9 | **NONE — actually well-wired** | N/A |
| `/review` | 12 | 20+ (Stark's full team) | **8 missing:** Rogers, Banner, Strange, Barton, Thor, Romanoff, Wanda, T'Challa | **HIGH** |
| `/assemble` | 21 | 35+ (should invoke all review teams) | **14 missing** from review/QA/UX sub-teams | **HIGH** |
| `/devops` | 6 | 16 (Kusanagi's full anime team) | **10 missing:** L, Valkyrie, Vegeta, Trunks, Mikasa, Erwin, Mustang, Olivier, Hughes, Calcifer, Duo | **HIGH** |
| `/treasury` | 3 | 6+ (Dockson + Steris, Vin, Szeth, Breeze) | **3 missing** | Medium |

### The Real Gaps (corrected from initial estimate)

The initial estimate was wrong on several commands. `/ux`, `/qa`, `/security`, `/debrief`, `/grow`, `/current`, and `/campaign` are actually **fully wired** — the command files already name their complete rosters. The problem is concentrated in **3 commands**:

1. **`/review`** — 12 agents instead of 20+. Stark flies with Picard, Spock, Seven, Oracle, Batman but NOT his own Marvel team (Rogers, Banner, Strange, Barton, Thor, Romanoff, Wanda, T'Challa). This is the biggest gap — code review misses backend service patterns (Strange), API design (Rogers), security implications (Romanoff), and performance (Thor).

2. **`/assemble`** — 21 agents but doesn't name the full sub-teams it invokes. When `/assemble` calls `/review`, it should get Stark's full team. When it calls `/ux`, it should get Galadriel's full team. Currently it names the leads but not the sub-agents.

3. **`/devops`** — 6 agents named (Kusanagi, Senku, Levi, Spike, Bulma, Holo) but 10+ more in the method doc (L, Valkyrie, Vegeta, Trunks, Mikasa, Erwin, Mustang, Olivier, Hughes, Calcifer, Duo). The extended anime roster handles monitoring (L), disaster recovery (Valkyrie), scaling (Vegeta), migration (Trunks), and more.

### Cross-Domain Agents (the hidden roster)

**The question you're really asking:** Do agents cross domain boundaries? Should Bilbo (copy) show up in `/review` when API error messages are wrong? Should Éowyn (enchantment) appear in `/build` to add delight during construction?

**Current cross-domain assignments:**
- Bilbo shows up in `/ux` (copy audit) and `/build` (copy review) — already cross-domain
- Éowyn shows up in `/ux` (enchantment) and `/gauntlet` (final enchantment pass) — already cross-domain
- Samwise shows up in `/ux` (a11y), `/gauntlet` (final a11y), and `/assemble` — 3 commands
- Nightwing shows up in `/qa`, `/gauntlet`, `/assemble`, `/build` — 4 commands
- Seven shows up in `/review`, `/assemble`, `/current` — 3 commands

**Missing cross-domain that would catch field report bugs:**
- **Nightwing** should be in `/review` — auth flow end-to-end testing (#115) is a review concern, not just QA
- **Bilbo** should be in `/review` — error message copy is caught by Bilbo but he's only in `/ux`
- **Éowyn** should be in `/build` Phase 10 (polish) — enchantment during construction, not just review
- **Samwise** should be in `/build` Phase 10 — a11y during construction, not deferred to `/ux`
- **Troi** should be in `/review` — PRD compliance is often a review-time catch
- **Constantine** should be in `/review` — cursed code is a code review concern, not just QA

### Updated Deliverables

1. **`/review` command** — Add Stark's full Marvel team + cross-domain agents (Nightwing, Bilbo, Troi, Constantine). Goes from 12 → ~20 agents.
2. **`/assemble` command** — When invoking sub-commands, explicitly name the full rosters. Goes from 21 → ~35 agents named.
3. **`/devops` command** — Add the full anime extended roster. Goes from 6 → ~16 agents.
4. **`/treasury` command** — Add Steris, Vin, Szeth, Breeze. Goes from 3 → ~7 agents.
5. **`/architect` command** — Add Pike (already in method doc, missing from command). Minor fix.
6. **`/gauntlet` Infinity mode** — Verify all 60+ agents in the Infinity roster are named in the command file, not just the method doc.
7. **Cross-domain manifest** — Document which agents appear in multiple commands and why (a "who helps where" reference).

### Effort
1-2 sessions. Methodology-only. The actual edits are small — adding agent names to existing command file sections. The audit above is the hard part (done).

---

## v13.0 — The Living Dashboard

*"Not localhost. Not the public internet. Not static. Not guessing. A dashboard that sees what you see."*

**The vision:** Transform the Danger Room from a static file-parsing dashboard into a live, real-time operations center — with proper information architecture, private network access, and a UX that serves solo developers, team leads, and remote operators equally well.

**Source:** Field reports #126-131, architectural review (Spock + La Forge + Data), first real-world usage on ZeroTier.

### Campaign Missions

Build in this order — each phase is one `/campaign` mission. Dependencies are strict.

---

#### Phase 0: Consolidation (prerequisite — unlocks everything else)

**Problem:** `danger-room.ts` and `war-room.ts` are near-identical (800+ lines duplicated across 4 files). Every subsequent change must be applied 4 times. This must be resolved before any feature work.

**Deliverables:**
1. Extract `wizard/lib/dashboard-data.ts` — shared parsers (`parseCampaignState`, `parseBuildState`, `parseFindings`, `readDeployLog`, `readVersion`)
2. Extract `wizard/lib/dashboard-ws.ts` — WebSocket infrastructure factory (WSS setup, heartbeat, broadcast, upgrade, close)
3. Extract `wizard/lib/http-helpers.ts` — `sendJson()` (duplicated 13 times) + `readFileOrNull()`
4. Extract `wizard/ui/dashboard-shared.js` — shared render functions (`renderGauge`, `renderTimeline`, etc.)
5. Slim `danger-room.ts` and `war-room.ts` to thin wrappers importing shared code
6. **Fix all 3 broken parsers during consolidation:**
   - `parseCampaignState()` — rewrite regex for actual format. Cross-reference CAMPAIGN.md's Prophecy Board template against real campaign-state.md files to determine canonical format. Normalize status vocabulary (`**DONE**` → `COMPLETE`). Extend return type to include `blockedBy` and `debrief` fields.
   - `parseBuildState()` — add trim/clean step to remove capture artifacts
   - `parseFindings()` — read `build-state.md` "Known Issues" first, fall back to regex. Add defensive logging: warn if no missions found in non-empty file.
7. **Implement panel registry pattern:**
   ```typescript
   interface DashboardPanel {
     id: string;
     endpoint: string;
     fetch: () => Promise<unknown>;
     pollTier: 'fast' | 'slow';
   }
   ```
   New panels become single object declarations. Route registration, poll orchestration, and WebSocket broadcast are generic over the panel list.
8. **Implement tiered polling:**
   - Fast (5s): context, agent activity, tests (during active runs)
   - Slow (60s): version, deploy, campaign, build, findings

**Acceptance criteria:**
- [ ] Zero duplicated parser/render code between danger-room and war-room
- [ ] `sendJson` and `readFileOrNull` exist in exactly one place
- [ ] All 3 parsers produce correct output against real log files
- [ ] Adding a new panel requires touching exactly 1 file (panel declaration)

---

#### Phase 1: Information Architecture + UX Review (Galadriel — full bridge)

**Problem:** The Danger Room was built feature-by-feature from field reports. No holistic information architecture was designed. Data types are mixed — system metrics, campaign progress, live agent activity, and historical findings all share the same flat grid with no hierarchy. For diverse users (solo dev, team lead, remote operator), the dashboard must communicate what matters NOW vs what's historical context.

**Deliverables — Full `/ux` review with all agents:**

1. **Data classification** — every panel classified into one of three tiers:
   - **Tier 1: Live Feed** (real-time, changes per-second) — context gauge, agent ticker, cost tracker. These demand immediate attention. Visual treatment: prominent position, animated indicators, distinct background.
   - **Tier 2: Campaign State** (changes per-mission, ~30min cycles) — mission timeline, phase pipeline, findings scoreboard, PRD coverage. These track progress. Visual treatment: structured cards with progress indicators.
   - **Tier 3: System Status** (changes rarely, background monitoring) — version, deploy status, git status, infrastructure, health. These are reference data. Visual treatment: compact status bar or collapsible section.

2. **Layout redesign for the Ops tab:**
   ```
   ┌─────────────────────────────────────────────────────────┐
   │ HEADER: Project name, version, model badge, cost        │
   ├────────────────────┬────────────────────────────────────┤
   │ CONTEXT GAUGE      │ AGENT ACTIVITY TICKER (live feed)  │
   │ (circular, large)  │ Scrolling: "Picard scanning..."   │
   │                    │ "Batman probing edge cases..."     │
   ├────────────────────┴────────────────────────────────────┤
   │ CAMPAIGN PROGRESS                                       │
   │ Mission timeline (horizontal) + Phase pipeline (vertical)│
   │ Findings scoreboard (severity badges, open count only)  │
   ├─────────────────────────┬──────────────────────────────┤
   │ SYSTEM STATUS (compact)  │ DEPLOY / DRIFT DETECTOR     │
   │ Git: main ✓ 2 ahead     │ Build: abc123 = HEAD ✓      │
   │ Disk: 45% | Mem: 2.1GB  │ Health: 200 OK (12ms)       │
   │ PM2: online (3 procs)   │ Last deploy: 2h ago         │
   └─────────────────────────┴──────────────────────────────┘
   ```

3. **Responsive considerations** — the dashboard will be used on:
   - Full desktop (primary) — full grid layout
   - iPad/tablet on desk while coding — two-column layout, larger touch targets
   - Phone glance via ZeroTier — single column, most critical info only (context %, active agent, findings count)

4. **Accessibility audit** — keyboard navigation between panels, ARIA labels on all gauges and status indicators, color-blind-safe severity indicators (not just red/yellow/green — add icons/patterns), screen reader announcements for agent ticker updates.

5. **Cultivation tab review** — same information hierarchy principles applied to Growth, Treasury, Campaigns, Heartbeat, and Deep Current tabs. Ensure the day-0 onboarding flow (v14.0) has a clear visual home.

6. **Empty states and onboarding** — every panel needs a meaningful empty state that guides the user toward activation:
   - Context gauge "—%" → "Set up Status Line to see live context" (with link to docs)
   - Agent ticker "Sisko standing by..." → "Run /assemble or /campaign to see live agent activity"
   - Tests panel "No test data" → "Run tests to see results here"
   - Each empty state is an onboarding moment, not a dead end.

**Acceptance criteria:**
- [ ] Every panel classified into Live Feed / Campaign State / System Status
- [ ] Layout wireframes for desktop, tablet, and phone
- [ ] Accessibility audit covers keyboard nav, ARIA, color-blind safety
- [ ] Cultivation tabs have consistent hierarchy with Ops tabs
- [ ] All empty states have actionable guidance

---

#### Phase 2: LAN Mode

**Problem:** Two access modes (local/remote) with nothing in between.

**Three-Tier Access Model:**

| Tier | Flag | Bind | Auth | Use Case |
|------|------|------|------|----------|
| Local | (default) | `::` | None | Solo dev, same machine |
| Private | `--lan` | `0.0.0.0` | Optional password | ZeroTier / Tailscale / WireGuard / LAN |
| Public | `--remote` | `0.0.0.0` | 5-layer (Caddy+TOTP+vault) | VPS/EC2 with public domain |

**`--lan` mode behavior:** Binds `0.0.0.0`, optional password (no TOTP/Caddy/vault), light audit trail, 24h session TTL, soft rate limiting (20/min).

**Private IP validation (from architectural review):** Use numeric octet parsing (not string prefix matching — SECURITY_AUDITOR.md explicitly warns against this). Include:
- RFC 1918: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
- CGNAT/Tailscale: `100.64.0.0/10` (RFC 6598)
- IPv6 ULA: `fd00::/8` (ZeroTier, WireGuard)
Extract into shared `wizard/lib/network.ts` → `isPrivateOrigin()` (consolidates existing duplicate implementations in `health-poller.ts` and `site-scanner.ts`).

**Acceptance criteria:**
- [ ] `--lan` flag binds `0.0.0.0` with optional password
- [ ] WebSocket origin validation accepts RFC 1918 + CGNAT + IPv6 ULA
- [ ] `/dangerroom` command displays correct URL for all three modes
- [ ] `isPrivateOrigin()` passes tests for Tailscale (100.x), ZeroTier (10.x + fd00::), WireGuard (10.x)

---

#### Phase 3: Status Line Bridge

**Architecture:**
```
Claude Code → Status Line script (stdin JSON) → ~/.voidforge/context-stats-{session}.json → wizard server → gauge + cost
```

**Key design decisions (from architectural review):**
- **Atomic writes:** Write to `.tmp`, fsync, rename — same pattern as `tower-auth.ts` (lines 257-269). Prevents corrupt JSON from partial writes.
- **Per-session files:** Write to `context-stats-{session_id}.json`, not a shared file. Prevents concurrent write corruption from multiple Claude Code sessions. Wizard reads all matching files, displays the most recently updated one.
- **Staleness:** Backend returns `null` if `updated_at` > 60 seconds old. Gauge reverts to "—%".
- **Shared data source:** Context gauge AND cost display both read from the same file. Status Line JSON includes `context_window.used_percentage` + `cost.total_cost_usd` + `model.display_name`. One bridge, two consumers.
- **Cost display needs `renderCost()` function** — this is a new function + fetch target + refresh wiring, not just "wire to context-stats" (deeper gap than originally noted).

**Methodology update:** `docs/methods/CONTEXT_MANAGEMENT.md` — once gauge is wired, agents should check the dashboard instead of asking users to run `/context`.

**Acceptance criteria:**
- [ ] Context gauge shows live percentage during active session
- [ ] Gauge reverts to "—%" within 60s of session ending
- [ ] Cost display shows cumulative session cost
- [ ] Two concurrent Claude Code sessions don't corrupt each other's data
- [ ] `CONTEXT_MANAGEMENT.md` references passive gauge monitoring

---

#### Phase 4: Agent Ticker (methodology-driven, not hook-driven)

**Approach change (from architectural review):** The original plan used a PostToolUse hook, but hooks can't extract agent identity from tool input — they only receive tool name and result. **New approach:** methodology-driven logging. Add to CAMPAIGN.md, ASSEMBLER.md, and GAUNTLET.md: "When dispatching an agent via the Agent tool, append `{ agent, task, timestamp }` to `logs/agent-activity.jsonl` before the tool call."

**Reliability (from failure analysis):**
- **Hybrid watch + poll:** Use `fs.watch` for immediate notification, poll `fs.stat` every 3s as fallback. `fs.watch` is unreliable on Linux/Docker/NFS and can miss rapid writes on macOS.
- **Tail-only reads:** On change events, seek to last known position and read only new lines. Never re-parse the entire file.
- **Session truncation:** Truncate `agent-activity.jsonl` at campaign/gauntlet start. Historical agent activity from previous sessions is not meaningful for the live ticker. Cap at 1MB / ~10K lines with rotation.
- **Debouncing:** Buffer WebSocket broadcasts to max 1 per second during rapid agent dispatches (e.g., `/gauntlet` launching 30+ agents).

**Acceptance criteria:**
- [ ] Ticker shows live agent names during /assemble, /campaign, /gauntlet
- [ ] Ticker doesn't stall when fs.watch misses events (poll fallback works)
- [ ] JSONL file rotates at 1MB, doesn't grow unbounded
- [ ] CAMPAIGN.md, ASSEMBLER.md, GAUNTLET.md include JSONL write step

---

#### Phase 5: New Panels + Config

**Tests panel:** Define data contract first — `{ passed: number, failed: number, total: number, duration_ms: number, last_run: string, failures: Array<{ name, message }> }`. Endpoint reads `test-results.json` (written by test runner hook or manual `npm test -- --json > test-results.json`).

**4 project-specific panels** (health, infrastructure, git status, deploy drift):
- All implemented via the panel registry from Phase 0
- Each is a single `DashboardPanel` declaration (~20-40 lines)
- Project-specific panels enabled via `wizard/danger-room.config.json`:
  ```json
  {
    "health_endpoint": "http://localhost:3000/api/health",
    "pm2_process": "kongo-web",
    "panels": ["health", "infrastructure", "git-status", "deploy-drift"]
  }
  ```
- Use `child_process.execFile` (not `exec`) for command-based panels with timeout + output cap. Prevents shell injection.

**Acceptance criteria:**
- [ ] Tests panel renders pass/fail/total from structured JSON
- [ ] Health panel shows green/red status from configured endpoint
- [ ] Git status panel shows branch, uncommitted count, ahead/behind
- [ ] Deploy drift detector shows IN SYNC or DRIFT DETECTED
- [ ] `danger-room.config.json` controls which panels are active
- [ ] Unconfigured panels show actionable empty state (not blank)

---

#### Phase 6: Victory Gauntlet

Full `/gauntlet` across the combined v13.0 changes. Non-negotiable.

---

### Architecture Decisions

**ADR: Methodology-driven agent logging over hooks** — Hooks can't access tool input (agent identity). Methodology instructions are reliable, work today, and don't depend on Claude Code internals. The orchestrator writes the log, not the runtime.

**ADR: Per-session context files over shared file** — Multiple Claude Code sessions writing to one file causes corruption. Per-session files with "most recent wins" display logic eliminates the race condition.

**ADR: Panel registry over copy-paste endpoints** — Adding panels should be a single declaration, not 4-file surgery. The registry pattern pays for itself at panel #3.

**ADR: Tiered polling over uniform 10-second poll** — Version and deploy endpoints change monthly. Context changes per-message. Polling everything at the same rate wastes resources and scales poorly with 50 concurrent clients.

### Estimated effort
4-5 sessions (6 missions + Victory Gauntlet). ~1000 lines of changes. Wizard + methodology + UX. MAJOR version bump — new dashboard paradigm with live data, information architecture, and private network access.

---

## v13.1 — Dashboard Polish (Tech Debt from v13.0 Gauntlet)

*Gauntlet-identified items documented but not blocking v13.0 ship. Clean up before v14.0.*

| # | Item | Severity | Fix |
|---|------|----------|-----|
| 1 | Circular import: `dashboard-ws.ts` → `server.ts` → `danger-room.ts` → `dashboard-ws.ts` | MEDIUM | Extract `getServerPort`/`getServerHost` into `wizard/lib/server-config.ts` |
| 2 | CORS/CSP headers don't include LAN origins — WebSocket from LAN peers blocked by CSP | MEDIUM | In LAN mode, add requesting origin to CORS if `isPrivateOrigin()`, add `ws://*:PORT` to CSP `connect-src` |
| 3 | Context gauge scrolls out of view when user scrolls past Tier 1 | MEDIUM | Add compact context indicator in header bar (always visible) |
| 4 | Deep Current "Launch Campaign" and "Dismiss" buttons unwired | MEDIUM | Wire to API calls or display as disabled with CLI instruction tooltip |
| 5 | Health + Infrastructure panels deferred from v13.0 M6 | MEDIUM | Add `GET /api/danger-room/health` (poll configured endpoint), `GET /api/danger-room/infra` (execFile: df, free, pm2) |
| 6 | Deploy Drift Detector deferred from v13.0 M6 | MEDIUM | Add `GET /api/danger-room/drift` (compare build hash vs git HEAD) |
| 7 | `health-poller.ts` and `site-scanner.ts` still have old private IP implementations | LOW | Replace with import from shared `wizard/lib/network.ts` |
| 8 | `/deploy` command scoped — see v15.0 below | LOW | Feature request #97 — full spec in v15.0 |

### Estimated effort
1 session. ~200 lines. PATCH version bump (v13.1.0).

---

## v14.0 — The Day-0 Engine (Cultivation Onboarding Redesign)

*"Growth infrastructure from the first commit, not the first customer."*

**The problem:** Cultivation's install assumes a post-launch state — deployed project, existing revenue, ad accounts already configured. The highest-leverage growth work happens BEFORE launch. The current flow installs vault + daemon + empty dashboard tabs, then says "run /grow" — but /grow needs ad accounts you don't have yet.

**The vision:** Redesign `/cultivation` install as a 7-step guided onboarding wizard that establishes growth infrastructure from scratch. The user walks through treasury setup, revenue tracking, ad platform credentials, budget allocation, creative generation, tracking pixels, and launch — all in one guided session. The Danger Room's Growth tabs light up with real data from minute one.

**Source:** Field report #131, v13.0 architectural review.

### Campaign Missions

Build in this order. Dependencies are strict.

---

#### Mission 1: Financial Foundation + Revenue Tracking (Steps 1-2)

**Objective:** Connect treasury and revenue sources before anything else. Money in, money out — the foundation.

**Deliverables:**
1. Redesign `/cultivation` install command to start with a guided financial setup interview
2. Add "Day-0 Setup" section to GROWTH_STRATEGIST.md with the full onboarding sequence
3. Add "Pre-Revenue Setup" section to TREASURY.md — connecting treasury before first dollar
4. Verify Mercury adapter handles onboarding credential flow (guided API key setup)
5. Auto-detect Stripe: scan project for `stripe` dependency or `STRIPE_SECRET_KEY` in env/vault. If found, offer to connect. If not, offer Stripe setup or manual tracking.
6. Create financial vault entry for connected accounts with circuit breakers from the start

**Acceptance criteria:**
- [ ] `/cultivation install` starts with treasury connection interview
- [ ] Mercury/Brex API key setup is guided with test-connection verification
- [ ] Stripe auto-detection works for Next.js, Express, Django, FastAPI projects
- [ ] Manual budget entry works when no payment processor exists
- [ ] Circuit breakers configured: pause if ROAS < 1.0x for 7 days
- [ ] GROWTH_STRATEGIST.md has Day-0 Setup section
- [ ] TREASURY.md has Pre-Revenue Setup section

---

#### Mission 2: Ad Platform Onboarding (Step 3)

**Objective:** Guide users through ad platform credential setup with per-platform instructions.

**Deliverables:**
1. Interactive platform selection: present Google Ads, Meta, LinkedIn, Twitter, Reddit with guidance on best fit by product type (B2B → LinkedIn, visual → Meta, intent → Google, etc.)
2. Per-platform credential walkthrough: create account → get API credentials → store in vault → test connection
3. Verify existing adapters (`wizard/lib/adapters/`) handle the credential-collection flow, not just the API-call flow
4. Recommend starting with 1-2 platforms: "You can add more later."
5. Update `.claude/commands/cultivation.md` with the ad platform onboarding flow

**Acceptance criteria:**
- [ ] Each supported platform has a guided credential setup flow
- [ ] Test-connection verification before proceeding to next step
- [ ] Credentials stored in financial vault (not .env)
- [ ] Adapter interfaces support both "collect credentials" and "run campaign" modes
- [ ] User can skip platforms and add them later

---

#### Mission 3: Budget + Creatives + Tracking (Steps 4-6)

**Objective:** Allocate budget, generate initial creatives, set up attribution.

**Deliverables:**
1. Budget allocation: product-type-aware split suggestions (e.g., B2B SaaS → 60% Google, 30% LinkedIn, 10% testing). Daily spend limits per platform. Circuit breakers.
2. Creative foundation: pull brand assets from project (company name, tagline, OG images, brand colors from CSS vars). Generate initial ad variants via `/imagine` or Shallan's creative templates. Set up A/B test matrix (3 headlines × 2 images = 6 variants).
3. Tracking setup: inject tracking pixels (Google Ads conversion, Meta Pixel) into published site. Connect to PostHog/analytics for funnel tracking. Define conversion events (signup, first action, subscription). Attribution model: last-click default, cross-platform dedup.
4. Update Kelsier's GROWTH_STRATEGIST.md Phase 1 to reference the Day-0 setup outputs

**Acceptance criteria:**
- [ ] Budget suggestions are product-type-aware (not generic)
- [ ] Creative generation pulls from existing brand assets
- [ ] At least 6 ad variants generated (3 headlines × 2 images)
- [ ] Tracking pixel injection works for Next.js and static sites
- [ ] Conversion events are defined with measurable criteria
- [ ] Attribution model documented and configurable

---

#### Mission 4: Launch + Danger Room Integration (Step 7)

**Objective:** Activate everything and verify the Danger Room shows live data.

**Deliverables:**
1. Launch summary: present the full growth engine configuration for user review before activation
2. Activate campaigns via adapters. Heartbeat daemon starts monitoring spend, refreshing tokens, evaluating A/B tests.
3. Danger Room Growth tab: verify KPI cards show real revenue/spend/net data from connected sources
4. Danger Room Campaigns tab: verify campaign table shows active campaigns with real platform data
5. Verify the Growth tab empty state transitions to the real data view when Cultivation is installed and data flows
6. End-to-end test: install → configure → launch → verify Danger Room reflects live data

**Acceptance criteria:**
- [ ] Launch summary shows all configured platforms, budgets, creatives, tracking
- [ ] User must confirm before campaigns go live
- [ ] Growth tab KPI cards show real revenue from Stripe adapter
- [ ] Campaigns tab shows platform name, campaign name, spend, status
- [ ] Heartbeat daemon runs and reports to `/api/danger-room/heartbeat`
- [ ] Growth tab empty state → real data transition is smooth

---

#### Mission 5: Victory Gauntlet

Full `/gauntlet` across the combined v14.0 changes. Non-negotiable.

Focus areas beyond standard checks:
- **Financial safety:** Can the system accidentally overspend? Are circuit breakers tested?
- **Credential security:** Are ad platform API keys stored securely? Never in .env, always in vault?
- **Pixel injection safety:** Do injected tracking scripts introduce XSS vectors?
- **Adapter failure modes:** What happens when Google Ads API returns 429? When Meta token expires?

---

### Architecture Decisions

**ADR: Guided interview over config file** — The onboarding is an interactive interview, not a `cultivation.config.json` to fill in manually. Users don't know what API scopes Google Ads requires or what Mercury endpoint to use. The wizard asks questions and fills in the config.

**ADR: Vault-first credentials** — All ad platform and treasury credentials go to the financial vault with TOTP protection, never to `.env`. The adapters read from vault at runtime.

**ADR: Conservative budget defaults** — First-time budgets default to $10/day per platform with aggressive circuit breakers (pause at <1.0x ROAS after 7 days). Users can increase after seeing results. Prevent "$500 burned on day 1" scenarios.

### Dependencies

- v13.0 Living Dashboard (SHIPPED) — Danger Room Growth/Campaigns tabs exist, need real data
- v13.1 Dashboard Polish (PLANNED) — not a hard dependency but nice-to-have before v14.0
- Cultivation wizard code (`wizard/lib/adapters/`, `wizard/lib/financial-vault.ts`) — already exists, needs onboarding flow additions
- `/imagine` for creative generation — already exists, needs to be callable from onboarding

### Open Issues to Address

| Issue | Status | Action |
|-------|--------|--------|
| #97 | Feature: /deploy command | Evaluate in v14.0 — may integrate with launch step |
| #98 | Kongo.io M27 CSRF fix | Project-specific, not VoidForge methodology |
| #94, #91, #89, #87, #86 | Kongo.io campaign field reports | Project-specific debriefs, not VoidForge methodology issues — close as external |

### Estimated effort
3-4 sessions (4 missions + Victory Gauntlet). Wizard + methodology + adapter + Danger Room integration. MAJOR version bump — new growth paradigm. (Field report #131)

---

## v15.0 — The Last Mile (Deploy Command)

*"Build it. Ship it. Verify it. Roll it back if it breaks."*

**The problem:** Campaigns build code locally and commit it, but never deploy. In Dialog Travel, 3 campaigns of work (v0.3→v2.9) sat on the local machine while the live server ran the original version. There is no deploy step in the campaign protocol. `/build` builds, `/git` commits, `/assemble` orchestrates, but nothing pushes code to production. (GitHub issue #97)

**The fix:** A new `/deploy` command with Kusanagi as lead, integrating into `/campaign` and `/git` workflows.

### Core Behavior

1. **Read deploy target** from PRD frontmatter (`deploy: vps|vercel|railway|docker|static`)
2. **Detect infrastructure state** — SSH keys, remotes, VPS access, Vercel project
3. **Choose deploy strategy:**
   - **VPS/EC2:** rsync + SSH → npm ci → prisma migrate → build → pm2 restart
   - **Vercel:** `vercel --prod` or git push trigger
   - **Railway:** `railway up` or git push trigger
   - **Docker:** build image, push to registry, restart service
   - **Static (Cloudflare/S3):** sync built assets
4. **Health check** after deploy (curl health endpoint, verify HTTP 200)
5. **Rollback** if health check fails (keep previous build, restart with old version)

### Campaign Integration

- **At campaign end:** After Victory Gauntlet + debrief, prompt: "Deploy to [target]? [Y/n]". In `--blitz` mode, auto-deploy.
- **On `/git` commit:** Optional flag: `/git --deploy` to auto-deploy after commit
- **Standalone:** `/deploy` runs independently for ad-hoc deploys

### Deploy State

Maintain `/logs/deploy-state.md`:
```
Last deployed: 2026-03-17T12:00:00Z
Version: v2.9.0
Commit: abc123
Target: vps (dialog.travel)
Status: healthy
Health check: 200 OK
```

### Safety Rails

- Never deploy without a passing build
- Gauntlet checkpoint before first deploy of a campaign
- Preview deploy (staging) before production if target supports it
- Rollback on health check failure
- Deploy log with timestamps for audit
- The existing Danger Room deploy panel + drift detector (v13.0/v13.1) will show live deploy status

### Campaign Missions

| # | Mission | Scope |
|---|---------|-------|
| 1 | Deploy engine | Target detection, strategy selection, SSH/API deploy executors, health check, rollback |
| 2 | Campaign integration | Auto-deploy at campaign end, `/git --deploy` flag, deploy-state.md |
| 3 | Danger Room integration | Wire deploy panel to live deploy state, drift detector uses deploy-state.md |
| 4 | Victory Gauntlet | Full gauntlet on deploy infrastructure — security focus on SSH/credential handling |

### Files to Change

| File | Change |
|------|--------|
| `.claude/commands/deploy.md` | New — `/deploy` command definition |
| `docs/methods/DEVOPS_ENGINEER.md` | Add deploy automation section |
| `docs/methods/CAMPAIGN.md` | Add deploy step to Step 5 (after commit) |
| `docs/methods/RELEASE_MANAGER.md` | Add `/git --deploy` flag |
| `wizard/lib/deploy-engine.ts` | New — target detection, strategy execution, health check, rollback |
| `wizard/api/deploy.ts` | Extend with deploy-engine integration |
| `CLAUDE.md` | Add `/deploy` to slash command table |

### Estimated effort
2-3 sessions (3 missions + Victory Gauntlet). Wizard + methodology. MAJOR version bump — new command, new agent capabilities, campaign protocol change.

---

### Deferred Indefinitely

| Proposal | Reason |
|----------|--------|
| Visual PRD Editor | Solved better by `/prd` command (v8.0). Identity risk — pushes VoidForge toward SaaS. Dependency explosion contradicts zero-dep philosophy. |
| Live Collaboration | Solved better by Git branching + existing scope boundaries in SUB_AGENTS.md. Architectural mismatch with single-process monolith. |

---

## Versioning Rules

- **MINOR** (4.0, 4.1, 4.2...) — new capabilities, new integrations, new commands
- **PATCH** (4.0.1, 4.0.2...) — bug fixes, doc improvements, methodology refinements
- **MAJOR** (5.0, 6.0, 7.0) — new paradigms, breaking changes to methodology structure

## Prioritization Principles

1. **Fix what breaks first.** Pre-deploy build step > fancy features.
2. **The user's next 5 minutes.** Each version should save the user time on their very next build.
3. **Methodology over tooling.** A new method doc that changes how Claude thinks is worth more than a new wizard screen.
4. **Ship small, ship often.** Each version should be shippable in 1-2 sessions.
5. **Security is not a feature.** It is the prerequisite. Every version that adds network exposure must ship its security layer in the same release — never "add auth later."
