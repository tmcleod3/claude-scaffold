# ADR-041: Muster Architecture Review Amendments to v22.0

## Status: Accepted

## Context

ADR-040 defined the project-scoped dashboard architecture for v22.0. Before execution, a full Muster review (17 agents, 3 waves, 9 universes) was conducted on 2026-04-08/09. The review surfaced 6 CRITICAL, 8 HIGH, 7 MEDIUM, and 3 LOW findings that require amendments to the original plan.

This ADR documents the specific changes to ADR-040's plan, the architectural decisions made during the review, and the conflict resolutions where agents disagreed.

## Decision

### Amendment 1: Add Mission 0 — Infrastructure Prerequisites

ADR-040 assumed the router could handle URL params and the TREASURY_DIR was a single definition. Neither is true.

**Router:** `router.ts` is 29 lines of exact-match comparison (`r.path === path`). It cannot match `/api/projects/:id/danger-room/campaign`. The router must be upgraded to support `:id` parameters before any project-scoped route can be registered.

**TREASURY_DIR:** Four separate files independently define `TREASURY_DIR = join(homedir(), '.voidforge', 'treasury')`:
- `wizard/lib/patterns/financial-transaction.ts` (line 303)
- `wizard/lib/financial-vault.ts`
- `wizard/lib/totp.ts`
- `wizard/lib/treasury-backup.ts`

These must be consolidated into a single `getTreasuryDir(projectDir?)` function before M2/M3 can proceed.

**Inline treasury reader:** `danger-room.ts` lines 167-348 contain 180 lines of inline treasury path construction that duplicates `financial-core.ts`. This must be extracted before project scoping or there will be two independent code paths to maintain.

**JSONL projectId:** Spend and revenue JSONL entries lack a `projectId` field (the `Transaction` type defines it, but `appendToLog` calls in `heartbeat.ts` omit it). Without this, per-project migration and future cross-project aggregation are impossible.

### Amendment 2: Reorder Missions — Writes Before Reads

ADR-040 specified M2 (financial reads) ‖ M3 (daemon writes) as parallel. This is incorrect:

- The daemon is the single writer (per ADR-1). If read paths move to per-project before write paths, the dashboard reads from empty project directories while the daemon writes to the global path.
- The daemon-aggregator already expects per-project sockets (`project/cultivation/heartbeat.sock`), but the daemon writes to `~/.voidforge/run/heartbeat.sock`. Moving writes first makes reads follow naturally.

**New order:** M0 → M1 → M2 (daemon state) → M3 (financial reads) → M4 → M5 → M6. Strictly sequential.

### Amendment 3: Router Upgrade in M0, Not M5

ADR-040 planned URL-based routing (`/api/projects/:id/...`) in M5. This forces M1-M4 to use query params as a workaround, then M5 rewrites all routes to URL params — two URL migrations.

**Decision:** Upgrade the router in M0. All subsequent missions build against the final URL shape. One migration, one URL structure, done.

### Amendment 4: Financial Migration — Clean Break, Not Copy

ADR-040 specified: "Treasury migration CLI copies global data to per-project, leaves backup."

The Muster found this is problematic:
1. JSONL entries lack `projectId` — cannot filter by project during copy
2. Copying the global log to Project A means Project A's log contains Project B's spend history — false provenance
3. Hash chains break if entries are filtered; they're valid if copied whole, but the data isn't isolated

**Decision:** Clean break. Per-project logs start with genesis hash (`'0'`). Global `~/.voidforge/treasury/` is archived to `~/.voidforge/treasury-pre-v22/`. No entries are copied. The archive is the historical audit record. Per-project chains are valid from v22.0 onward.

### Amendment 5: ProjectContext Type

ADR-040 mentioned adding `projectDir: string` as a parameter. The Muster recommended a richer type:

```typescript
interface ProjectContext {
  readonly id: string;
  readonly name: string;
  readonly directory: string;
  readonly cultivationDir: string;    // {directory}/cultivation/
  readonly treasuryDir: string;       // {directory}/cultivation/treasury/
  readonly spendLog: string;          // {directory}/cultivation/treasury/spend-log.jsonl
  readonly revenueLog: string;        // {directory}/cultivation/treasury/revenue-log.jsonl
  readonly campaignsDir: string;      // {directory}/cultivation/treasury/campaigns/
  readonly pidFile: string;           // {directory}/cultivation/heartbeat.pid
  readonly socketPath: string;        // {directory}/cultivation/heartbeat.sock
  readonly stateFile: string;         // {directory}/cultivation/heartbeat.json
  readonly logsDir: string;           // {directory}/logs/
}
```

Constructed once per request via `createProjectContext()`. Threaded through data functions. No caching of file reads (correctness over performance).

### Amendment 6: WebSocket — Subscription Rooms (Option B)

ADR-040 specified per-project WebSocket paths. The Muster evaluated three options:

- **A. WSS per project** — Resource leak risk when projects come and go
- **B. Single WSS with subscription rooms** — Client subscribes after connect, server filters broadcasts
- **C. Path-based routing** — Hybrid, requires regex in upgrade handler

**Decision:** Option B. Single WSS, client sends `{ type: 'subscribe', projectId }`, server stores `projectId` on the WebSocket instance, `broadcast(data, projectId?)` filters by subscriber. Global broadcasts (no projectId) reach all clients. Old global paths (`/ws/danger-room`, `/ws/war-room`) must be explicitly removed.

### Amendment 7: Access Control on All Dashboard Endpoints

ADR-040 mentioned `checkProjectAccess()` but did not specify where. The Muster requires:

- `resolveProject()` middleware called at the top of every dashboard route handler
- Returns 400 for missing project, 404 for invalid/unauthorized (no enumeration)
- WebSocket upgrade validates project access BEFORE connection (not after)
- DaemonAggregator results filtered at API layer by `getProjectsForUser()`, `projectPath` stripped from non-admin responses
- LAN mode WebSocket auth fixed (currently only checks `isRemoteMode()`)

### Amendment 8: Dual-Daemon Guard

New daemon startup at per-project paths must check for a running global daemon at `~/.voidforge/run/heartbeat.pid`. If a global daemon is alive, refuse to start. Prevents split-brain where both daemons write financial data independently.

### Amendment 9: Treasury Summary File (Performance)

The heartbeat endpoint scans entire JSONL files on every 30-second poll — O(n) per request. The daemon should maintain a `treasury-summary.json` with running totals (spend, revenue, net, ROAS, budget remaining). Dashboard reads this O(1) file instead. This is a P0 performance fix that belongs in M3.

## Consequences

**Enables:**
- Clean, single-pass URL migration (router upgraded once in M0)
- Correct write→read ordering (daemon paths before dashboard reads)
- Honest per-project financial data (no false provenance from copied logs)
- Complete project isolation (access checks on every endpoint + WebSocket)
- O(1) treasury reads instead of O(n) JSONL scanning

**Requires:**
- 7 missions instead of 6 (M0 added)
- Strictly sequential execution (no M2‖M3 parallelism)
- 29+ files with global `~/.voidforge` paths evaluated (larger blast radius than originally estimated)
- Zero-coverage dashboard-data.ts needs unit tests before refactoring

**Trade-offs:**
- Multi-project users lose per-project historical financial data (archived globally, per-project starts fresh)
- Router change in M0 touches a stable, simple module
- Sequential execution is slower than parallel but prevents data corruption

## Alternatives Considered

1. **Keep financial data global, filter per-project in views (Stark/Riker position):** Valid — ad platform spend is per-account. Rejected because the daemon runs per-project and each project has its own campaigns. Per-project files are the simpler long-term model. Dissent preserved: revisit if users report confusion.

2. **Query params for M1-M4, router upgrade in M5 (Picard position):** Rejected because it causes two URL migrations. The router is 29 lines — upgrading once is less work than migrating URLs twice.

3. **Copy global JSONL to per-project during migration (Dockson initial position):** Rejected because entries lack `projectId` and copying creates false provenance. Clean break is simpler and more honest.

## Muster Agents

| Wave | Agent | Universe | Key Contribution |
|------|-------|----------|-----------------|
| 1 | Picard | Star Trek | Router limitation, TREASURY_DIR duplication, read/write mismatch |
| 1 | Stark | Marvel | ProjectContext design, import chain analysis, inline hazards |
| 1 | Batman | DC | Blast radius (29+ files), test gap, daemon singleton problem |
| 1 | Galadriel | Tolkien | Navigation model, single project.html, empty states, keyboard a11y |
| 1 | Kenobi | Star Wars | Zero access control on 19 endpoints, WebSocket auth gap, aggregator leak |
| 1 | Kusanagi | Anime | WebSocket Option B, configurePaths(), lazy-init watchers |
| 2 | Spock | Star Trek | ProjectContext type, data path inventory, hash chain analysis, clean break |
| 2 | Kim | Star Trek | requireProject middleware, API response design, URL structure |
| 2 | Torres | Star Trek | JSONL O(n) bottleneck, treasury summary file, caching strategy |
| 2 | La Forge | Star Trek | Dual-daemon split-brain, migration atomicity, failure modes table |
| 2 | Tuvok | Star Trek | resolveProject() design, WebSocket auth architecture, token design |
| 2 | Dockson | Cosmere | Migration strategy, file inventory, hash chain integrity, execution checklist |
| 3 | Deathstroke | DC | Project ID manipulation, old WebSocket bypass, treasury fallback, cross-project freeze |
| 3 | Maul | Star Wars | LAN auth bypass, connection DoS, unscoped broadcast, old path persistence |
| 3 | Riker | Star Trek | Financial scope challenge, router timing, mission reordering, scope honesty |
| 3 | Constantine | DC | import.meta.dirname audit, Deep Current route bug, zero test coverage, handoff chain |
