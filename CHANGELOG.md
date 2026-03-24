# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [16.0.0] - 2026-03-24

### Added
- **Foundation universe (Isaac Asimov)** — 9th universe, 13 named agents for the AI Intelligence domain
- **Hari Seldon** — 18th lead agent, AI Intelligence Architect. Owns: model selection, prompt engineering, tool-use schemas, orchestration patterns, failure modes, token economics, evaluation, AI safety, model versioning, LLM observability
- **`/ai` command** — Seldon's AI Intelligence Audit: 5-phase protocol (Surface Map → Parallel Audits → Sequential Audits → Remediate → Re-Verify)
- **`AI_INTELLIGENCE.md`** — Full method doc with 12 sub-agents, 10 operating rules, 5 checklists, 8 anti-patterns
- **6 AI pattern files** — `ai-orchestrator.ts` (agent loops, circuit breaker), `ai-classifier.ts` (confidence thresholds, fallback chains), `ai-router.ts` (intent routing), `prompt-template.ts` (versioned prompts), `ai-eval.ts` (golden datasets, regression detection), `ai-tool-schema.ts` (typed tools, provider adapters)
- **7th Gauntlet Stone: Wisdom** — AI Intelligence domain in comprehensive review
- **PRD frontmatter** — `ai: yes`, `ai_provider`, `ai_models`, `ai_features` fields

### Changed
- **8 existing commands** integrated with Seldon's AI layer: `/build` (AI Gate at Phase 4), `/gauntlet` (7th Stone + Crossfire + Council), `/assemble` (Phase 6.5), `/campaign` (5th requirement type), `/security` (Bliss handoff), `/qa` (AI Behavior Testing), `/architect` (Seldon Review), `/prd` (AI Architecture section)
- Agent counts: 247 → 260+, 8 → 9 universes, 25 → 26 commands, 20 → 26 patterns, 17 → 18 leads

## [15.3.0] - 2026-03-23

### Changed
- **README.md** — 247 agents / 8 universes / 25 commands / 20 patterns / 17 leads
- **HOLOCRON.md** — Same count updates + 8 missing command descriptions + Cosmere universe
- **ARCHITECTURE.md** — Updated to v15.2.1: 5 subsystems, tower-auth split, vault security, LAN mode
- **FAILURE_MODES.md** — 11 new failure modes (vault brute-force, deploy, Danger Room, heartbeat)
- **SCALING.md** — 7 new scaling improvements (batch writes, LAN mode, tiered polling, test suite)
- **TECH_DEBT.md** — Full rewrite: 17 resolved items, 11 current items
- **ROADMAP.md** — Header fixed from v12.6.4 to v15.2.1
- **COMPATIBILITY.md** — Engine range corrected, vitest added
- **patterns/README.md** — 7 → 20 patterns indexed

## [15.2.1] - 2026-03-23

### Changed
- **GAUNTLET.md** — Added Dimension 4 (output verification) to Sibling Verification Protocol: verify fixes against real output data to catch false positives in keyword filters (#148)
- **CAMPAIGN.md** — Victory condition now includes deploy entrypoint verification: confirm Docker CMD / PM2 ecosystem runs the built architecture, not a legacy file (#147)
- **BUILD_PROTOCOL.md** — Phase 12 Docker smoke test: mandatory check that container entrypoint runs new code before go-live (#147)
- **DEVOPS_ENGINEER.md** — First deployment checklist: process manager, env vars, log directory, health endpoint, entrypoint verification (#147)

### Added
- **LESSONS.md** — 3 new lessons: read-before-export (verify source exports before re-exporting), read-before-test (read implementation before writing expectations), numeric context checks (cite actual % from /context)

## [15.2.0] - 2026-03-23

### Changed
- **tower-auth.ts** split into 3 modules: tower-auth (424 lines — auth core), tower-session (149 lines — sessions/cookies), tower-rate-limit (87 lines — rate limiting). All exports re-exported for backward compatibility.
- **aws-vps.ts** — SSH security group restricted to deployer's IP post-provisioning (detects IP via checkip.amazonaws.com, revokes 0.0.0.0/0 rule)
- **ProvisionEvent.status** type now includes `'warning'` for non-fatal alerts

## [15.1.0] - 2026-03-23

### Added
- **vitest** test framework with `--pool forks` isolation — 91 tests across 8 files (vault, body-parser, tower-auth, network, frontmatter, instance-sizing, safety-tiers, http-helpers)
- **Vault unlock rate limiting** — 5 attempts/min, lockout after 10 consecutive failures (separate from login rate limits)
- **Vault auto-lock** — 15-minute idle timeout clears session password
- **6 proxy modules** — financial-core, daemon-core, oauth-core, revenue-types, ad-platform-core, rate-limiter-core (breaks direct wizard/ → docs/patterns/ imports)
- **provisioner-registry.ts** — single source of truth for provisioners, credential scoping, GitHub-linked targets

### Changed
- **Terminal HMAC** — per-boot random 32-byte key replaces vault password as HMAC keying material
- **sendJson** consolidated from 10 duplicate definitions to 1 shared module in http-helpers.ts (with noCache support)
- **Health poller** — batch writes (N individual → 1 registry update per poll cycle)
- **TOTP clock skew** — prunes usedCodes when drift exceeds ±3 steps (prevents lockout after clock jump)

### Fixed
- **47 Infinity Gauntlet fixes** — provision lock deadlock, vault cache mutation, body-parser non-object bypass, terminal resize NaN crash, Docker healthcheck exec form, CI SSH key leak, RDS hardcoded 'admin', symlink security no-op, autonomy-controller crash safety, secret stripping keyword gaps, and 36 more across 21 files
- **Accessibility** — skip-nav + noscript on all 7 pages, aria-labelledby on deploy step 1

### Security
- Secret stripping expanded with allowlist (SAFE_OUTPUT_KEYS) — comprehensive keyword coverage without false positives
- Error message token regex lowered from 40+ to 16+ characters

---

## [15.0.0] - 2026-03-22

### Added
- **`/deploy` command** — Kusanagi's deploy agent with 6-step protocol: target detection (VPS/Vercel/Railway/Docker/Static/Cloudflare), pre-deploy checks (Levi), deploy execution, health check (L), rollback (Valkyrie), deploy-state.md logging
- **Campaign Step 7** — optional auto-deploy after Victory Gauntlet passes. Blitz mode auto-deploys. Deploy failure doesn't revoke Victory.
- **`/git --deploy` flag** — one-command commit + push + deploy. Coulson commits, Kusanagi deploys.
- **Deploy drift detector** — `GET /api/danger-room/drift` compares deployed commit against `git rev-parse HEAD`. Catches "pushed but not deployed" scenarios.
- **Deploy Automation** section in DEVOPS_ENGINEER.md — target detection, deploy state, campaign integration, rollback protocol

### Changed
- **Deploy panel** reads from `deploy-state.md` (v15.0 format) in addition to `deploy-log.json`

---

## [14.0.0] - 2026-03-22

### Added
- **Day-0 Cultivation onboarding** — 7-step guided install: treasury → revenue → ad platforms → budget → creatives → tracking → launch. No longer requires a deployed product.
- **`/grow --setup`** — standalone ad platform onboarding: guided credential collection for Google Ads, Meta, LinkedIn, Twitter, Reddit with per-platform best-fit guidance
- **Phase 4.5 Launch Preparation** — budget allocation (product-type-aware splits), creative foundation (6 variants via /imagine), tracking & attribution (pixel snippets + conversion events)
- **Launch activation flow** — summary presentation, user confirmation, platform submission, Danger Room Growth tab wiring
- **Pre-Revenue Setup** in TREASURY.md — budget tracking before first dollar, auto-detection of payment processors, absolute spend limits for pre-revenue projects

### Changed
- **Cultivation install no longer requires deployment** — "product should be deployed" prerequisite removed. Day-0 setup works pre-launch, launch day, and post-launch.
- **Growth Strategist operating rule 1** updated — product deployment required for Phase 1+ (reconnaissance), not for installation

---

## [13.1.0] - 2026-03-22

### Changed
- **Circular import broken** — `getServerPort`/`getServerHost` extracted to `wizard/lib/server-config.ts`, eliminating the `server.ts ↔ dashboard-ws.ts` cycle
- **CORS/CSP for LAN mode** — private IP origins accepted via `isPrivateOrigin()` in CORS; `ws://*:PORT` added to CSP `connect-src` for WebSocket
- **Context gauge always visible** — compact percentage indicator in header bar, color-coded, stays visible when scrolling past Tier 1
- **Private IP consolidation** — `health-poller.ts` now imports `isPrivateIp` from shared `network.ts` instead of inline checks

---

## [13.0.0] - 2026-03-22

### Added
- **LAN mode (`--lan`)** — Private network access for ZeroTier, Tailscale, WireGuard. Binds `0.0.0.0` with optional password, no TOTP/Caddy. Private IP validation covers RFC 1918, CGNAT (Tailscale), IPv6 ULA (ZeroTier).
- **Status Line bridge** — `scripts/danger-room-feed.sh` connects Claude Code's Status Line API to the Danger Room. Per-session files with atomic writes, 60-second staleness threshold. Powers context gauge + cost display.
- **Agent activity ticker** — Methodology-driven JSONL logging (not hooks). Hybrid `fs.watch` + 3-second poll fallback. Live agent dispatch events broadcast via WebSocket.
- **Tests panel** — Structured `test-results.json` data contract with defined schema. New `/api/danger-room/tests` endpoint.
- **Git status panel** — Branch, uncommitted count, ahead/behind, last commit via `execFile` with 5-second timeout. New `/api/danger-room/git-status` endpoint.
- **Dashboard config** — `danger-room.config.json` for project-specific panel settings (health endpoint, PM2 process, enabled panels).
- **Shared `wizard/lib/network.ts`** — `isPrivateIp()` + `isPrivateOrigin()` with numeric octet parsing. Consolidates duplicate implementations.

### Changed
- **3-tier information architecture** — Ops tab restructured: Live Feed (context gauge + agent ticker) → Campaign State (timeline + findings + pipeline) → System Status (version + deploy + tests). Visual hierarchy with tier labels and distinct styling.
- **Tiered polling** — Fast 5s (context), campaign 10s (timeline/findings), slow 60s (version/deploy). Replaces uniform 10-second poll. ~60% reduction in unnecessary network requests.
- **Dashboard consolidation** — 800+ lines of duplicated code extracted into 3 shared modules (`http-helpers.ts`, `dashboard-data.ts`, `dashboard-ws.ts`). danger-room.ts: 306→113 lines. war-room.ts: 248→67 lines.
- **War Room wired** — Routes now actually register (was dead code — never imported by server.ts).
- **Empty states** — Every panel shows actionable guidance when data is missing.

### Fixed
- **Campaign regex** — `parseCampaignState()` rewritten for actual 5-column format. Handles bold markdown status (`**DONE**`). Normalizes vocabulary. Extracts `blockedBy` + `debrief` fields.
- **Build state artifacts** — `parseBuildState()` explicit trim removes leading `| ` capture artifacts.
- **Findings counter** — `parseFindings()` reads `build-state.md` "Known Issues" first (curated, open issues only). Falls back to regex scan with defensive logging.

---

## [12.6.4] - 2026-03-22

### Added
- **Encryption Egress Audit** in security auditor — grep all usages of plaintext variable after encrypting, not just the storage path (DB, Redis, SSE, logs, API responses)
- **GROUP BY Compatibility Check** in security auditor — random-IV encryption breaks aggregation; add deterministic HMAC hash column
- **v14.0 roadmap** — The Day-0 Engine: Cultivation onboarding redesign with 7-step guided growth setup

### Fixed
- Field reports #130, #131 triaged — 2 security methodology fixes applied, 1 feature request roadmapped

---

## [12.6.3] - 2026-03-22

### Changed
- Campaign planning now **requires acceptance criteria** on every mission before the Prophecy Board is finalized — applies to `--plan` mode too, not just build
- Kira's Step 0 checks if `campaign-state.md` is **gitignored** and warns immediately — prevents silent data loss on `/clear`
- Kira's Step 0 includes a **pre-flight checklist**: VERSION.md, package manifest, campaign-state tracking, clean working tree

### Added
- `/architect --adr-only` lightweight mode — write ADRs without full bridge crew deployment, for deferred architecture decisions

### Fixed
- Field report #129 triaged — 4 fixes applied, 1 wontfix (--plan --draft solved by git diff)

---

## [12.6.2] - 2026-03-22

### Added
- **v13.0 roadmap** — The Private Network: `--lan` mode for ZeroTier/Tailscale/WireGuard access, context gauge wiring via Status Line bridge, 3 Danger Room bug fixes, 3 unwired feature plans, 4 new dashboard panel proposals from real-world usage (field reports #127, #128)

---

## [12.6.1] - 2026-03-22

### Changed
- Campaign Gauntlet checkpoints now extract **Learned Rules** — recurring root causes become pre-flight checks for subsequent missions, with escalation triggers (hardening sprints for >5 HIGH findings, auto-add missions for missing capabilities)
- Build Protocol Phase 0 validates data-dependent business cases against **historical data** before building infrastructure — no more blocking campaigns on live monitoring
- Campaign missions for data-dependent systems must re-run **regression test suites** when modifying strategy logic

### Added
- Iterative PRD evolution workflow documented for `/architect --plan` — multi-commit PRD refinement as a recognized pattern
- PRD Evolution Log section in PRD template for tracking architectural reasoning across iterations

### Fixed
- Field report #126 triaged — 3 root causes accepted, 5 file changes applied, issue closed

---

## [12.6.0] - 2026-03-22

### Added
- **`/assess` command** — Pre-build codebase assessment: chains `/architect` → `/gauntlet --assess` → PRD gap analysis into a unified "State of the Codebase" report. For evaluating existing codebases before a rebuild or VoidForge onboarding.
- **`--assess` flag for `/gauntlet`** — Assessment-only mode: Rounds 1-2 (Discovery + First Strike), no fix batches. Produces report grouped by root cause. Designed for pre-build evaluation where full 10 rounds would be redundant.
- **Stub Detection** in QA_ENGINEER.md — Oracle scans for methods that return True/success without side effects (no network calls, no state writes). The most dangerous form of incomplete code. High severity; Critical for financial systems.
- **Migration Completeness Check** in BUILD_PROTOCOL.md Phase 1 — Before scaffolding, scan for duplicate implementations across directories. Abandoned migrations are flagged as blockers.
- **Auth-from-Day-One** in BUILD_PROTOCOL.md Phase 1 — HTTP endpoints require API key middleware returning 401 from birth. Full auth stays Phase 3, but the door is locked from day one.
- **Process Manager Discipline** in DEVOPS_ENGINEER.md — Never kill ports owned by PM2/systemd/Docker directly; always reload through the process manager.
- **Frontmatter Validation** in CAMPAIGN.md Step 1 — Before Dax analyzes the PRD, validate YAML frontmatter exists. If missing, Sisko runs a 5-question interview to add it.
- **VM execution test** in GAUNTLET.md build-output verification — Compiled JSX/HTML must be tested in the target runtime, not just built successfully.

### Fixed
- Field reports #123, #124, #125 triaged — 8 methodology improvements applied, all 3 issues closed

---

## [12.4.2] - 2026-03-19

### Changed
- Full-tier commands auto-pull `wizard/` from upstream when missing — scaffold/core users get "Pull it? [Y/n]" instead of a dead end
- CLAUDE.md slash command table has Tier column (All/Full) for all 23 commands
- Gauntlet Troi verifies CLAUDE.md claims (commands, agents, docs exist at stated paths)
- Gauntlet Kenobi checks pattern auth completeness (flags presence-only `!!header` checks)
- Campaign Victory Gauntlet has cross-campaign integration gate
- Release Manager has CLAUDE.md command table integrity check

### Fixed
- Field reports #108, #109, #110 triaged — 12 methodology improvements applied

---

## [12.4.1] - 2026-03-18

### Added
- **`/dangerroom` command** — starts wizard server and opens the Danger Room dashboard. Documents all 6 tabs, global elements, prerequisites. Was listed in CLAUDE.md but the command file never existed.
- **`WORKSHOP.md`** — 45-minute beginner workshop for building web apps with Claude Code + VoidForge scaffold
- **GitHub community health files** — LICENSE (MIT), CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, 3 issue templates, PR template, CODEOWNERS, FUNDING.yml

### Fixed
- GAUNTLET.md: env var audit after smoke test (NEXT_PUBLIC blindness — field report #104)
- RELEASE_MANAGER.md: post-push deploy check (build-not-deployed gap — field report #104)
- BUILD_PROTOCOL.md: build-time env var verification in Phase 13 (field report #104)
- CAMPAIGN.md: deploy credential check in Step 0 (field report #103)
- DEVOPS_ENGINEER.md: rsync exclusion mandate + credential pre-flight (field report #103)
- TROUBLESHOOTING.md: destructive DB operation recovery checklist (field report #103)

---

## [12.4.0] - 2026-03-18

### Added — The Autonomy (Full Autonomous Operation)
- **`wizard/lib/route-optimizer.ts`** — Paris's ROI-weighted campaign sequencing: scores proposals on ROI (40%), urgency (35%), risk-inverted (25%). `pickBestCampaign()` for single-proposal selection.
- **`wizard/lib/autonomy-controller.ts`** — Tier 2 supervised autonomy (24h delay queue, veto mechanism) + Tier 3 full autonomy (immediate execution). 6 circuit breakers: kill switch, strategic drift (>30%), consecutive Criticals (3+), spend increase streak (7 days), ROAS floor (<1.0x for 7 days), 30-day mandatory strategic sync. Deploy freeze windows. 10-campaign human checkpoint for Tier 3.
- All 3 branches synced to v12.4 shared methodology

### Fixed
- DC-001: Added DEEP_CURRENT.md to CLAUDE.md docs reference table
- DC-003: Added /api/danger-room/current endpoint for Deep Current tab data
- DC-007: Improved SSRF protection (IPv6-mapped addresses, cloud metadata hostnames)

## [12.2.0] - 2026-03-18

### Added — The Bridge (Cross-Pipeline Correlation)
- **`wizard/lib/correlation-engine.ts`** — Chakotay's correlation engine: product change → metric outcome tracking. Before/after comparison with configurable lag windows (1/7/28 days). Confidence levels (high >30%, medium >15%, low >5%). Prediction recording, evaluation, and accuracy averaging.

## [12.1.0] - 2026-03-18

### Added — The Analyst (Gap Analysis + Campaign Proposals)
- **`wizard/lib/gap-analysis.ts`** — Seven's 5-dimension scoring: feature completeness (PRD vs codebase diff), quality (tests, gauntlet history, lessons), revenue potential (treasury, payments, pricing). Feeds situation model.
- **`wizard/lib/campaign-proposer.ts`** — Tuvok's campaign proposal generator: per-dimension templates (feature sprint, quality hardening, performance optimization, growth foundation, revenue infrastructure). Quantified predictions, risk assessments, autonomy tier recommendations.
- **Danger Room Deep Current tab** — 7th tab with 4 panels: situation model (5-dimension KPI cards), active proposal (Tuvok's recommendation with launch/dismiss), prediction history, autonomy status.

---

## [12.0.0] - 2026-03-18

### Added — The Scanner (Deep Current: Autonomous Campaign Intelligence)
- **`/current` command** — Tuvok's Deep Current: scan → analyze → propose → gate → execute → learn. Cold start intake for greenfield projects. Status display with 5-dimension radar.
- **`docs/methods/DEEP_CURRENT.md`** — Tuvok's method doc: the Loop (SENSE→ANALYZE→PROPOSE→GATE→EXECUTE→LEARN), 3-tier autonomy, cold start sequence, situation model schema, security constraints, circuit breakers
- **`wizard/lib/site-scanner.ts`** — Torres's HTTP-based site scanner: performance (TTFB, compression, cache), SEO (meta tags, sitemap, JSON-LD), security (HTTPS, HSTS, CSP), growth (analytics detection, email capture, social meta). SSRF protection + redirect depth limit.
- **`wizard/lib/deep-current.ts`** — Situation model: 5-dimension scoring (feature, quality, performance, growth, revenue), project state classifier (GREENFIELD → OPERATING), cold start intake with per-state recommendations, persistent JSON state
- **5 Voyager agent roles** — Tuvok (strategic intelligence), Seven (optimization), Chakotay (cross-pipeline bridge), Paris (route planning), Torres (site scanning). Updated in naming registry.

### Fixed
- SSRF protection in site scanner (private IP blocking)
- Redirect depth limit (max 5, was unbounded)
- IDEA+PRD → IDEA_PRD naming consistency

---

## [11.3.0] - 2026-03-18

### Added — The Heartbeat (Portfolio, Anomaly Detection, Service Management)
- **`/portfolio` command** — cross-project financial dashboard with --report (tax records), --optimize (Kelsier's reallocation), project registration
- **Mercury + Brex bank adapters** — read-only OAuth 2.0 adapters for account balance and transaction polling
- **Anomaly detection engine** — 4 types (spend spikes, traffic drops, conversion changes, ROAS drops), 3 severity tiers (warning/alert/critical), configurable thresholds, self-contained messages
- **Encrypted daily backup** — AES-256-GCM with scrypt key derivation, 30-day retention, automatic pruning, export function for /treasury --export
- **Service install** — macOS LaunchAgent plists + Linux systemd user units for both heartbeat daemon and wizard server. KeepAlive, RunAtLoad, Background process type.
- **Desktop notifications** — macOS (osascript) + Linux (notify-send), agent-voiced messages (Wax, Breeze, Dockson), non-blocking with try/catch
- **Danger Room Heartbeat tab** — Daemon status (state/PID/uptime/last beat), token health per platform, scheduled jobs, anomaly alerts (aria-live="assertive")
- All 5 Danger Room tabs now complete: Ops → Growth → Campaigns → Treasury → Heartbeat

---

## [11.2.0] - 2026-03-18

### Added — The Distribution (Ad Platform Adapters + Spend Execution)
- **6 ad platform adapters** — Meta Marketing, Google Ads, TikTok Marketing, LinkedIn Marketing, Twitter/X Ads, Reddit Ads. Each with Setup (interactive OAuth) + Adapter (daemon runtime). All use OutboundRateLimiter.
- **`docs/patterns/outbound-rate-limiter.ts`** — Token bucket with per-platform configs, safety margin reservation, daily quota tracking, executeWithRetry with exponential backoff
- **Campaign state machine** — 10 states with validated transitions, agent-allowed subset (active→paused only), event-sourced history with source/reason/ruleId
- **Spend execution pipeline** — WAL intent → budget lock → platform API → spend log. Idempotency keys per ADR-3.
- **Szeth's compliance framework** — GDPR cookie consent, CAN-SPAM unsubscribe/address, per-platform ToS checks. Critical findings block campaign launch.
- **Danger Room Ad Campaigns tab** — Campaign performance table with semantic HTML, A/B test groups panel, agent recommendations panel
- **Platform adapter registry** — Index with name and minimum budget per platform

### Fixed
- ARC-001: Removed dead TokenBucketLimiter re-export from adapter types
- QA-002: Budget lock uses `>=` (not `>`) for hard stop enforcement

---

## [11.1.0] - 2026-03-18

### Added — The Treasury (Dockson's Financial Operations)
- **`docs/methods/TREASURY.md`** — Dockson's financial operations protocol: revenue ingest, budget allocation, reconciliation, safety controls, immutable spend log
- **`docs/methods/HEARTBEAT.md`** — Daemon architecture: startup sequence, signal handling, sleep/wake recovery, socket API contract, vault session, service management, daemon states
- **`/treasury` command** — first-run setup flow, financial summary, budget management, freeze/unfreeze, reconciliation trigger, data export
- **`docs/patterns/daemon-process.ts`** — PID management with stale detection, Unix domain socket server with JSON-over-HTTP, session token auth with rotation, job scheduler with sleep/wake detection, signal handling with 10s deadline, structured JSON logger
- **`docs/patterns/revenue-source-adapter.ts`** — Read-only revenue interface with Stripe Events API + Paddle implementations, overlapping poll windows, externalId dedup, timing-safe webhook signature verification
- **`docs/patterns/oauth-token-lifecycle.ts`** — Per-platform TTL configs (Meta 60d, Google 1h, TikTok 24h, LinkedIn 60d, Reddit 1h), refresh at 80% TTL, 3-failure escalation to requires_reauth, session token 24h rotation with 30s grace period
- **`wizard/lib/heartbeat.ts`** — Heartbeat daemon: single-writer for all financial state (ADR-1), Unix domain socket API with auth tiers, 10 scheduled jobs, WAL reconciliation on startup (ADR-3), vault key in memory with SIGTERM zeroing
- **`wizard/lib/reconciliation.ts`** — Two-pass reconciliation engine: preliminary at midnight UTC, authoritative at 06:00 UTC, tiered discrepancy thresholds ($5 noise / 5% relative / $50 absolute), ADR-6 currency enforcement
- **Danger Room Treasury tab** — KPI cards (revenue/spend/net/ROAS), budget utilization progress bar with ARIA, platform connections status, reconciliation status, empty states with CTAs
- **5 methodology improvements from inbox triage** — GAUNTLET.md (3-dimension Sibling Verification Protocol + R1 runtime diagnostics), SECURITY_AUDITOR.md (Remediation Caller Tracing), SYSTEMS_ARCHITECT.md (Data Mutation Parity + Security Tradeoff Register)

### Fixed
- VG-001: Added creative endpoint stub (501) to heartbeat daemon socket API
- VG-006: Stripe webhook signature now uses timing-safe comparison

---

## [11.0.0] - 2026-03-18

### Added — The Consciousness (Cosmere Growth Universe)
- **8th Universe: Cosmere (Brandon Sanderson)** — 18 agents led by Kelsier. Growth, marketing, analytics, and financial operations.
- **`/grow` command** — 6-phase growth protocol: Reconnaissance → Foundation → Content → Distribution → Compliance → Measure. CLI-driven initial setup transitioning to autonomous daemon monitoring.
- **`/cultivation install` command** — installs the heartbeat daemon, financial vault, TOTP 2FA, and adds Growth tabs to the Danger Room.
- **`docs/methods/GROWTH_STRATEGIST.md`** — Kelsier's growth methodology with 3-tier autonomous execution model (deterministic daemon jobs, on-demand AI, opt-in scheduled AI).
- **`docs/patterns/ad-platform-adapter.ts`** — Split interface pattern: `AdPlatformSetup` (interactive OAuth), `AdPlatformAdapter` (daemon runtime), `ReadOnlyAdapter` (Tier 1 jobs). Reference Meta Marketing API implementation. Token bucket rate limiter.
- **`docs/patterns/financial-transaction.ts`** — Branded `Cents`/`Percentage`/`Ratio` types, hash-chained append-only log, atomic write with macOS `F_FULLFSYNC` awareness, number formatting per §9.15.4.
- **`wizard/lib/financial-vault.ts`** — Separate encrypted vault for ad platform and bank credentials. scrypt KDF (memory-hard). AES-256-GCM. Different password from infrastructure vault.
- **`wizard/lib/totp.ts`** — RFC 6238 TOTP for financial 2FA. macOS Keychain storage (ADR-4). Replay protection tracking all used codes within window. 5-minute session TTL.
- **`wizard/lib/safety-tiers.ts`** — Budget authorization with half-open interval tiers ($25/$100/$500). Aggregate $100/day cap. Campaign creation rate limits. Autonomous scope enforcement.
- **Danger Room tab navigation system** — ARIA-compliant tablist/tab/tabpanel with arrow key navigation, hash routing. Tabs shown conditionally when Cultivation is installed.
- **Danger Room Growth tab** — KPI cards (revenue/spend/net), ROAS by Platform, Traffic Sources, Conversion Funnel panels. Read-only placeholder data for v11.0.
- **Financial CSS color tokens** — 8 semantic tokens for financial data display (positive, negative, warning, neutral, healthy, error, inactive, frozen).
- **Global freeze button** — Emergency spend freeze in Danger Room header (desktop) and FAB (mobile). CSP-compliant event handlers.
- **WebSocket reconnection** — Exponential backoff (1s→30s cap), reconnection banner, full state refresh on reconnect.
- **PRD §9.19** — 16 subsections: Cultivation architecture clarification, process model, install commands, autonomous execution model, autonomous scope, code modification policy, authentication, CLI-to-autonomous handoff, WebSocket reconnection, adapter interface update, campaign state machine events, system state type, backup scope, rate limits, token rotation, API response sanitization.
- **PRD §9.20** — 14 subsections: Network binding fix, tab architecture, A/B test group data model, daemon authorization guard, autonomous rule thresholds, approval queue UX, agent voice in autonomous loop, freeze button spec, symlink guard, prompt injection mitigation, socket API contract, CampaignConfig schema, data propagation model, proxy token re-read.

### Changed
- **Danger Room rename complete** — War Room → Danger Room across all remaining PRD references (lines 1607-1609, component contract)
- **PRD §9.1 Vision rewritten** — Cultivation is the engine (daemon + rules), not a separate web app
- **PRD §9.3 /grow rewritten** — aligned with §9.19 execution model
- **ROADMAP.md v11 deliverables expanded** — Danger Room tab system, §9.19/§9.20 references, per-version tab additions
- **10 methodology improvements from inbox triage** — BUILD_PROTOCOL (+4 wiring checks), SECURITY_AUDITOR (+fail-closed), TESTING (+constraint smoke test), BACKEND_ENGINEER (+2 gotchas), CAMPAIGN (+consumer verification), FIELD_MEDIC (+--submit clarification)

---

## [10.2.0] - 2026-03-17

### Added
- **Natural Language Deploy** — `wizard/lib/natural-language-deploy.ts`. Prose description → YAML deploy frontmatter. Budget parsing, platform detection, resilience config inference. Integrated into `/prd` Act 5 as optional input.
- **Methodology A/B Testing** — `wizard/lib/experiment.ts`. Experiment CRUD + evaluation framework at `~/.voidforge/experiments.json`. True-positive rate + context efficiency comparison. Per-agent accuracy tracking. Danger Room Experiment Dashboard panel.
- **Prophecy Visualizer** — `wizard/ui/war-room-prophecy.js`. Interactive SVG dependency graph. Color-coded mission nodes (green/yellow/red/gray/purple). Clickable with keyboard support. Legend and detail panel. Danger Room integration.

### Fixed
- SVG focus indicators for keyboard navigation (Gauntlet G-UX-001)
- SVG role changed to `group` for assistive technology compatibility (G-UX-002)
- XSS defense-in-depth: escape mission status/number in prophecy detail panel (G-SEC-001)
- Atomic write + restricted permissions (0o600) for experiments.json (G-QA-001)
- Experiment panel aria-labelledby linked to title (G-UX-003)

---

## [10.1.0] - 2026-03-17

### Added
- **Danger Room data feeds** — `wizard/api/war-room.ts` with 6 REST endpoints parsing campaign-state.md, assemble-state.md, phase logs, deploy logs, VERSION.md. WebSocket handler at `/ws/war-room` with heartbeat, connection limits, and graceful shutdown.
- **Confidence scoring enforcement** — mandatory `[CONFIDENCE: XX]` in finding tables across `/gauntlet`, `/qa`, `/security`, `/ux`, `/review` commands. Low-confidence (<60) escalation to different-universe agent. Cross-referenced in QA_ENGINEER.md, SECURITY_AUDITOR.md, PRODUCT_DESIGN_FRONTEND.md.
- **Agent debates enforcement** — conflict detection in `/assemble` (Crossfire + Council) and `/review` (new Step 1.5). Structured 3-exchange debates logged as ADRs.
- **Living PRD enforcement** — Phase 0 PRD snapshot (`PRD-snapshot-phase0.md`), PRD alignment gates at Phases 4, 6, 8 in `/build`. Two-way sync: fix code or update PRD.

### Fixed
- Danger Room a11y: ARIA landmarks, keyboard focus, responsive breakpoint, reduced motion, gauge progressbar role, agent ticker aria-live
- WebSocket: exponential backoff reconnect, onerror handler, heartbeat keepalive, stale connection cleanup
- Context gauge shows em-dash instead of misleading 0% when data unavailable

---

## [10.0.1] - 2026-03-17

### Added
- **Agent Confidence Scoring** — findings report 0-100 confidence, low-confidence escalated.
- **Agent Debate Protocol** — structured 3-exchange debates, logged as ADRs.
- **Adversarial PRD Review** (`/prd --challenge`) — Boromir challenges the PRD before building.
- **The Living PRD** — PRD evolves at phase gates, Phase 0 snapshot for drift view.
- **Cross-Project Memory** — global lessons file across all projects.
- **Build Archaeology** — trace production bugs back through the build protocol.

---

## [10.0.0] - 2026-03-17

### Added
- **Danger Room dashboard** — `war-room.html` + `war-room.js`. 5 core panels (Campaign Timeline, Phase Pipeline, Finding Scoreboard, Context Gauge, PRD Coverage), sidebar (Version, Deploy, Tests, Cost), Agent Activity Ticker. WebSocket real-time feed with auto-reconnect.
- **`/api/war-room/*` REST endpoints** in server.ts.
- **Danger Room button** in Lobby navigation.

---

## [9.3.0] - 2026-03-17

### Added
- **Game build protocol** — 12-phase adaptation for `type: game`.
- **3 game patterns:** `game-loop.ts`, `game-state.ts`, `game-entity.ts`.
- **Game QA + UX checklists** — frame rate, input latency, game feel, accessibility.
- **4 game agents:** Spike-GameDev, Éowyn-GameFeel, Deathstroke-Exploit, L-Profiler.

---

## [9.2.0] - 2026-03-17

### Added
- **Mobile methodology** — BUILD_PROTOCOL, QA_ENGINEER, SECURITY_AUDITOR, PRODUCT_DESIGN_FRONTEND all gain mobile-specific checklists.
- **2 mobile patterns:** `mobile-screen.tsx` (React Native, safe area, a11y) + `mobile-service.ts` (offline-first, sync queue).
- **3 conditional agents:** Uhura-Mobile, Samwise-Mobile, Rex-Mobile.
- **PRD template** updated with mobile frontmatter.

### Blocked
- Mobile provisioner deferred (needs Xcode CLI + Play Console API).

---

## [9.1.0] - 2026-03-17

### Added
- **Django + FastAPI deep dives** in all 8 pattern files — full code examples for DRF ViewSets, Pydantic models, Celery tasks, django-tenants, HTMX templates, FastAPI dependency injection, SQLAlchemy services, ARQ workers.
- **Python framework detection** in BUILD_PROTOCOL.md — Phase 0 detects `framework: django|fastapi`, adapts scaffold, migrations, testing, and security checks.

---

## [9.0.0] - 2026-03-17

### Added
- **`docs/META_WORKFLOW.md`** — How to use VoidForge to develop VoidForge. Documents the feedback loop, anti-patterns discovered across 4 campaigns, when to use each campaign mode, and version history of campaigns-on-self.
- **Wong's Pattern Usage Log (Phase 12.5)** — After each build, logs which patterns were used, which framework adaptations applied, which custom modifications made. Feeds pattern evolution analysis in `/debrief`.
- **Pattern Evolution Check** in FIELD_MEDIC.md — Wong checks pattern-usage data for recurring variations across projects. 10+ occurrences → propose as new pattern.

### Changed
- **`/imagine` API key persistence** — FORGE_ARTIST.md now instructs persisting the OpenAI API key to `.env.local` on first use, preventing key loss between sessions. (Field report #62)

---

## [8.3.0] - 2026-03-16

### Added
- **`/campaign --autonomous`** — supervised autonomy with safety rails: git tag before each mission, critical-finding rollback, 5-mission human checkpoints, Victory Gauntlet requires human confirmation. Safer than `--blitz` for long campaigns (10+ missions).

---

## [8.2.0] - 2026-03-16

### Added
- **Self-Improving Methodology (Wong Promotion Analysis)** — when 3+ lessons in LESSONS.md share the same category and target the same method doc, Wong auto-drafts a promotion: a specific checklist item or rule based on the lesson cluster. Presented for user approval, never auto-applied. Added to FIELD_MEDIC.md and `/debrief` command.
- **Custom Sub-Agents** — users can create project-specific sub-agents in `docs/CUSTOM_AGENTS.md`. Agents carry domain knowledge (e.g., `Jarvis-Tailwind` for Tailwind v4 patterns). Run alongside built-in agents. Naming collision check rule added to NAMING_REGISTRY.md. Template file created.

---

## [8.1.2] - 2026-03-16

### Changed
- **`/qa` command** gains Green Lantern (test matrix), Flash (smoke tests), Batgirl (detail audit), Aquaman (deep dive), Huntress (flaky tests), Green Arrow (precision), Superman (standards).
- **`/security` command** gains Han + Cassian (Phase 0.5 first strike + recon), Bo-Katan (perimeter alongside Rex), Qui-Gon + Sabine + Bail Organa (Phase 2 extended), Anakin + Din Djarin (Phase 4 bypass + bounty).
- **`/ux` command** gains Aragorn (orchestrator), Pippin + Frodo (Step 3 edge cases + hardest flow), Faramir (Step 5 quality focus), Boromir + Glorfindel (Step 6 hubris + hard rendering), Haldir (Step 7 boundaries), Merry (Step 7.5 pair verification).
- **`/architect` command** gains Crusher + Archer (Step 0 diagnostics + greenfield), Tuvok (Step 1 security architecture), Kim + Janeway (Step 2 API design + novel architectures).
- **`/gauntlet` command** Round 3 now explicitly names DevOps team (Senku, Levi, Spike, L, Bulma, Holo, Valkyrie).
- **`/assemble` command** gains Hill (phase tracking) + Jarvis (status summaries).
- **`/campaign` command** gains Pike (Step 1 — bold ordering challenge to Dax).

---

## [8.1.1] - 2026-03-16

### Added
- **Extended DC roster for `/qa`** — Flash (rapid testing), Batgirl (detail audit), Green Arrow (precision), Huntress (flaky tests), Aquaman (deep dive), Superman (standards), Green Lantern (scenario construction), Martian Manhunter (cross-environment).
- **Extended Star Wars roster for `/security`** — Qui-Gon (subtle vulns), Han (first strike), Anakin (dark-side exploitation), Bo-Katan (perimeter), Din Djarin (bug bounty), Bail Organa (governance), Cassian (threat modeling), Sabine (unconventional attacks).
- **Extended Tolkien roster for `/ux`** — Aragorn (UX leadership), Faramir (quality focus), Pippin (edge cases), Boromir (hubris check), Haldir (boundary guard), Glorfindel (hard rendering), Frodo (hardest task), Merry (pair review).
- **Extended Anime roster for `/devops`** — Vegeta (monitoring), Trunks (migrations), Mikasa (critical protection), Erwin (planning), Mustang (cleanup), Olivier (hardening), Hughes (observability), Calcifer (daemons), Duo (teardown).
- **Extended Star Trek roster for `/architect`** — Janeway (novel architectures), Tuvok (security architecture), Crusher (diagnostics), Archer (greenfield), Kim (API design), Pike (bold planning).
- **Extended Marvel roster for `/build`** — T'Challa (craft), Wanda (state), Shuri (innovation), Rocket (scrappy), Okoye (data integrity), Falcon (migrations), Bucky (legacy).

---

## [8.1.0] - 2026-03-16

### Added
- **Troi (PRD Compliance)** activated in `/build` Phase 0 (confirms PRD extraction), Phase 4/8 gates (spot-checks built features against PRD), and `/campaign` per-mission checks.
- **Padmé (Functional Verification)** activated in `/build` Phase 4/6 gates (verifies primary user flow end-to-end) and `/campaign` per-mission for user-facing missions.
- **Celeborn (Design System Governance)** activated in `/ux` Step 2 and `/build` Phase 5 — audits spacing tokens, typography scale, color palette consistency, component naming.
- **Worf (Security Implications)** activated in `/architect` Step 1 — flags security implications of architectural decisions alongside Spock and Uhura.
- **Riker (Decision Review)** activated in `/architect` Step 5 — reviews Picard's ADRs for trade-off validity and second-order effects.
- **Torres (Performance Architecture)** activated in `/architect` Step 3 — identifies N+1 queries, missing indexes, caching gaps in design phase.
- **Cyborg (System Integration)** activated in `/qa` Step 1 — traces full data paths across module boundaries when 3+ modules connect.
- **Raven (Deep Analysis)** activated in `/qa` Step 1 — finds bugs hidden beneath layers of abstraction, data flowing through transforms.
- **Wonder Woman (Truth Detector)** activated in `/qa` Step 1 — finds code that says one thing and does another.
- **Valkyrie (Disaster Recovery)** activated in `/devops` — backup verification, restore testing, failover procedures.

---

## [8.0.1] - 2026-03-16

### Fixed
- **Victory Gauntlet hardening** — 16 fixes across 2 Gauntlet runs: PTY stale session cleanup (3 compounding bugs), .env newline/shell injection, globSync Node 22+ compat replaced with recursive readdir, restart banner dead endpoint + CSP violation, symlink cycle guard, XSS in auto-command banner, dead code cleanup.
- **Node.js `engines` field** tightened from `>=20.0.0` to `>=20.11.0` — `import.meta.dirname` requires 20.11+.
- **Quality Reduction Anti-Pattern** — hard methodology rule: agents MUST NOT reduce Gauntlet, checkpoint, or debrief quality based on self-assessed "context pressure." Must run `/context` and report actual usage. Below 70% = continue full protocol.
- **9 methodology fixes** from field reports #46-#53: CORS requirements check, external API HTTPS enforcement, IP range validation warning, internal path leakage check, client-side partial failure testing, const/let audit, Node API compatibility check, UI→server route tracing, Victory Checklist with debrief-before-sign-off.
- **CLAUDE.md** — added PRD_GENERATOR to Docs Reference, corrected pattern count (7→8).
- **Architecture docs** version headers updated to 8.0.0.

---

## [8.0.0] - 2026-03-16

### Added
- **Agent Memory — Active Lessons Read-Back.** Wong loads `/docs/LESSONS.md` during Phase 0 Orient. Review commands (`/qa`, `/security`, `/ux`, `/review`) read LESSONS.md in Context Setup and flag matches during analysis.
- **Conflict Prediction — Phase 0.5 Architecture Scan.** Picard scans PRD frontmatter for 8 structural contradictions before any code is written. Added Conflict Checklist to SYSTEMS_ARCHITECT.md and pre-analysis step to `/architect`.
- **`/prd` command** — Sisko's PRD generator. 5-act structured interview producing a complete PRD with valid YAML frontmatter.

---

## [7.7.0] - 2026-03-16

### Added
- **Native module mtime detection** — server snapshots `.node` file mtimes at startup, checks on Lobby load. If changed (npm install while server running), shows "Restart Now" banner.
- **`/api/server/status` endpoint** — returns `needsRestart` flag for native module detection.
- **`docs/COMPATIBILITY.md`** — Node.js version testing doc with known ABI-breaking changes and engines field policy.
- **Restart banner** in Lobby — appears when native modules changed on disk.

### Changed
- **ARCHITECTURE.md** rewritten from v2.7.0 to v7.7.0 — adds Avengers Tower, RBAC, Thumper, ws/node-pty, PTY manager, vault key naming, mtime detection.
- **FAILURE_MODES.md** rewritten — adds WebSocket, PTY, Tower, Thumper, and native module failure modes.
- **SCALING.md** rewritten — Tier 2 reflects shipped multi-user features, PTY sessions as bottleneck.
- **Context pressure rule** fixed — removed "3 consecutive missions" heuristic. Checks actual usage, only checkpoints at 70%.

---

## [7.6.0] - 2026-03-16

### Added
- **`voidforge deploy --env-only`** — write vault credentials to `.env` without provisioning infrastructure. Reads all vault keys, maps both `env:`-prefixed and hyphenated keys to env vars, appends to `.env`. Supports `VOIDFORGE_VAULT_PASSWORD` env var for non-interactive use.
- **`scripts/vault-read.ts`** — standalone vault reader. Read a single key (`--key`) or list all keys (`--list`). Supports non-interactive use via `VOIDFORGE_VAULT_PASSWORD`.
- **Campaign vault auto-inject (Step 0.5)** — if vault has credentials not yet in `.env`, auto-run `deploy --env-only` before the first mission. Blitz mode auto-runs; normal mode asks for confirmation.
- **Node.js `engines` field** in package.json — `>=20.0.0 <25.0.0`. Prevents silent ABI breaks with unsupported Node versions.

### Changed
- **Stale PTY session cleanup** — Tower auto-detects sessions that fail within 2 seconds of creation. Auto-removes the dead tab and retries once. Prevents dead sessions from consuming MAX_SESSIONS slots.
- **Fallback model ID** updated from `claude-sonnet-4-5-20241022` to `claude-sonnet-4-6`.

---

## [7.5.3] - 2026-03-16

### Added
- **Vault key naming convention** in HOLOCRON — documents hyphenated keys (global/infra) vs `env:`-prefixed keys (project-specific), with resolver order and provisioner mapping.
- **Outbound URL Safety** checklist in security audit — verify transactional emails never send localhost/private IP URLs, production fallback requirement, dedicated `EMAIL_BASE_URL` recommendation. (Field report #44)
- **Query-param state trust** attack vector in QA — Deathstroke tests whether URL parameters controlling client state are validated server-side before rendering. (Field report #44)
- **Collapsible/Accordion ARIA pattern** in component reference — `aria-expanded` + `aria-controls` + `id` triple checklist with code example. (Field report #43)
- **v7.7 The Housekeeping** planned in ROADMAP — architecture doc refresh, server auto-restart (tech debt #11), Node.js compatibility doc.
- **v7.6 bolt-ons** planned in ROADMAP — stale PTY cleanup (#12), Node.js `engines` field, fallback model ID update.
- **v8.0 ship order** in ROADMAP — Agent Memory first, then Conflict Prediction, then Auto-PRD.

### Fixed
- **Stale roadmap header** — updated from v7.1.0 to v7.5.2 with correct next version (v7.6).
- **Field reports #42-#44** triaged and closed — 4 fixes applied, 2 already-fixed, 2 deferred to v7.6, 2 wontfix.

---

## [7.5.2] - 2026-03-16

### Added
- **Credentials flow documentation** in HOLOCRON — explains how vault credentials reach `.env` during build and deploy.
- **v7.6 The Vault Pipeline** planned in ROADMAP — `deploy --env-only`, standalone vault reader, campaign auto-inject.

---

## [7.5.1] - 2026-03-16

### Added
- **Vault awareness in campaign** — Kira checks vault status in Step 0, Dax classifies credentials as "vault-available" instead of BLOCKED. (Field report #40)
- **Troi pre-scan before Victory** — verifies all PRD claims before declaring "all complete." (Field report #38)
- **Cross-file dependency check** in per-mission review — catch cross-module integration gaps. (Field report #38)
- **Deployment verification** in Assembler Phase 9 — check if project is already live before suggesting deploy steps. (Field report #37)
- **Deployment section** in build-state.md template. (Field report #37)

### Changed
- **Security audit** gains 5 new checklist items: anonymity invariant, filesystem access, constant-time comparison, sanitizer baseline, auth framework rate limiting. (Field reports #36, #38)
- **API route pattern** gains Prisma select-on-mutations rule and fire-and-forget endpoint (sendBeacon/CSRF) guidance. (Field report #36)
- **Service pattern** gains Prisma select-on-mutation example. (Field report #36)
- **Campaign** gains data model retrofit check, pattern replication check, vault-aware Dax classification. (Field reports #38, #40)
- **WCAG contrast verification** added to Galadriel's UX checklist. (Field report #38)
- **Post-pipeline deploy offer** in Assembler after Phase 13. (Field report #37)

---

## [7.5.0] - 2026-03-16

### Added
- **Thumper Command Center** — `/help` in Telegram shows an interactive inline keyboard grid of all 15 VoidForge commands. Tap a command → submenu shows all flag variants (e.g., `/campaign --blitz`, `/gauntlet --quick`, `/debrief --inbox`). Tap a variant to send immediately. ← Back returns to grid.
- **Bot personalization** in `/thumper setup` — auto-sets bot name (project-branded), Bilbo writes description from PRD, registers 15+1 commands in Telegram menu, generates DALL-E avatar (if OpenAI key in vault).
- **Command↔doc sync check** in `/git` Step 5.5 — flags when method docs change but paired command files don't. 13 pairs tracked.

### Fixed
- **Thumper response relay** — water-rings.sh now reads `last_assistant_message` from Stop hook stdin metadata. Previously tried to read conversation JSON from stdin (which doesn't exist), always falling back to "no summary available."
- **scan.sh non-interactive** — all `read -r -p` prompts skipped when `--token` and `--chat-id` provided. Environment confirmation and "Start now?" prompts were still blocking.

### Changed
- **`/thumper setup` is Claude-native** — conversational flow guides through BotFather, validates token via API, auto-detects chat ID, runs scan.sh non-interactive. No interactive stdin needed.
- **9 Gauntlet consistency fixes** — command files synced with method docs: Kusanagi in Round 1, Hawkeye smoke test, Lucius in Round 2 Batman, --ux-extra flag, VERSION.md/CHANGELOG.md in shared file lists, 3-mission context limit, minimum 1 review guarantee.

---

## [7.4.1] - 2026-03-16

### Added
- **Thumper scripts now synced** by `/void` — `scripts/thumper/*` added to shared files, carved out from `scripts/*` exclusion. (Field report #34)
- **Parallel agent convention lock** — schema ownership, naming conventions, required fields must be specified when launching parallel agents. (Field report #33)
- **Integration wiring check** in build protocol — verify new services are connected to consumers, TODOs resolved, workers registered. (Field report #33)
- **Cascade review checklist** — orphaned references, race conditions, PII scrubbing, reassignment fallbacks for DELETE/UPDATE operations. (Field report #31)
- **Mandatory end-of-campaign debrief** — `/debrief --submit` required after Victory Gauntlet, non-negotiable. (Field report #31)
- **Campaign state auto-sync** — cross-reference git log against campaign-state.md at session start. (Field report #32)
- **3-mission context pressure limit** — checkpoint and consider fresh session after 3 consecutive build missions. (Field report #33)

### Changed
- **Proxy route SSRF** added to security checklist — validate target paths against regex allowlist. (Field report #33)
- **No secrets in stored data** — verify no API keys/tokens embedded in database-stored URLs. (Field report #33)
- **Crypto randomness** check — flag `Math.random()` in token/code/identifier generation. (Field report #32)
- **Deeper PRD scan** in Dax's analysis — grep for feature completeness, not just file existence. (Field report #32)
- **Database fixtures** guidance — always use shared conftest, never custom DDL. (Field report #31)

---

## [7.4.0] - 2026-03-16

### Added
- **Runtime smoke test** in Gauntlet Round 2 — start server, hit endpoints, test WebSocket lifecycle. Catches what static analysis misses. (Field report #30)
- **First-run scenario checklist** in QA — fresh install, server restart, project import, dependency update transitions. (Field report #30)
- **Restart resilience checklist** in DevOps — inventory in-memory state, define recovery paths. (Field report #30)
- **Campaign-mode assemble pipeline** — reduced phases (arch + build + 1 review + security if needed) for multi-mission campaigns. Full pipeline deferred to Victory Gauntlet. (Field report #26)
- **Lightweight inline debrief** option for blitz — 3-line summary to log file when full `/debrief --submit` is too heavy. (Field report #26)
- **Minimum 1 review round guarantee** — even `--fast` gets 1 review, never 0. (Field report #28)

### Changed
- **Direct-ID entity access** is now High severity minimum in security audit — never defer. (Field report #28)
- **Role enforcement** must cover ALL write routes, not just CRUD — batch, merge, import/export, admin utilities. (Field report #28)
- **Admin self-referential case** added to UX checklist — disable destructive actions on own user row. (Field report #28)
- **SQL fragment builders** must accept alias parameter from day 1 — breaks in JOINs without it. (Field report #28)
- **Per-item processing** for unreliable inputs — individual items with timeouts, not batch. (Field report #27)
- **Cache AI agent outputs** — reuse cached intermediate results to prevent cross-generation drift. (Field report #27)
- **Server components for content pages** — "use client" on marketing pages kills SEO. (Field report #27)
- **Background operations need visible progress** — loading state, progress indicator, completion notification. (Field report #27)
- **Mode instructions must replace, not append** — each mode needs complete spec, not a footnote. (Field report #27)
- **Platform networking** — bind `::` (dual-stack) not `127.0.0.1`. macOS resolves localhost to IPv6. (Field report #30)
- **Tailwind v4 deployment guide** — pin versions, restrict source scanning, avoid `attr()` in CSS. (Field report #29)
- **Don't interleave debugging with syncs** — sync first, verify, THEN debug separately. (Field report #29)
- **Infrastructure dependency exception** — zero-dep policy applies to business logic, not protocol infrastructure (ws, node-pty). (Field report #30)

---

## [7.3.2] - 2026-03-16

### Changed
- **Blitz debrief is now a blocking gate** — `/debrief --submit` must complete before the campaign loop continues. Previously it was a suggestion that agents skipped in velocity mode. Now it blocks progression. (Field reports #24, #25)
- **Blitz per-mission checklist** added to campaign command header — 5 mandatory items (assemble, git, debrief, state update, proceed) that must be verified before each loop-back.
- **Blitz mode documented in CAMPAIGN.md method doc** — full section under "Two Modes" explaining what blitz changes, what it preserves, and that `--blitz ≠ --fast`. (Field report #25)
- **Debrief issue tracking** in campaign state — mission table now includes debrief issue number column.
- **Blitz privacy exception** in FIELD_MEDIC.md — user opted into autonomous mode, so auto-submit is permitted without review. (Field report #25)
- **Blitz checkpoint enforcement** — explicit mission counter instruction in Step 4.5 with mandatory logging. (Field report #23)
- **"No questions in blitz"** rule — all decisions autonomous, choose quality-preserving option when uncertain. (Field report #23)
- **Tier enforcement extended to UI components** — QA now greps `.tsx`/`.jsx` for hardcoded tier comparisons. (Field report #22)
- **Action inventory before hiding containers** — UX redesigns must list all primary AND secondary actions before collapsing/hiding a component. (Field report #22)
- **Test schema vs. production schema** check — verify test fixtures create all tables from migration runner. (Field report #21)
- **Timestamp format enforcement** — QA greps for non-canonical `strftime`/format calls. (Field report #21)
- **Auth retrofit audit** — when adding auth to a router, audit ALL existing endpoints in that file. (Field report #21)

---

## [7.3.1] - 2026-03-16

### Changed
- **`/campaign --blitz` now auto-debriefs after every mission.** In blitz mode, `/debrief --submit` runs automatically after each mission completes, filing a GitHub field report with learnings while context is fresh. No user review needed — blitz trusts the output. Run `/debrief --inbox` on the upstream repo later to triage accumulated reports. This is the missing feedback loop for autonomous builds: every mission's failures, patterns, and methodology gaps are captured even when nobody is watching.

---

## [7.3.0] - 2026-03-16

### Added
- **`/campaign --blitz`** — Fully autonomous campaign mode. Skips mission confirmation prompts, implies `--fast`, auto-continues between missions. Victory Gauntlet still mandatory. Use when you want to click "Start Building" and walk away.
- **Lobby build-state indicator** — Project cards show contextual buttons: "Start Building" (Phase 0), "Resume Build" (Phase 1-12), "Open Room" (built/deployed). Color-coded badge shows current state.
- **Tower vault unlock form** — When the vault is locked (server restart, import), the Tower shows an inline password form instead of a cryptic error. Unlock → auto-retries terminal creation.
- **Tower auto-send countdown** — After Claude Code launches, a 3-second countdown auto-types the command (e.g., `/campaign --blitz`). Cancel button available.

### Fixed
- **WebSocket terminal connection** — Replaced custom WebSocket implementation with the `ws` library (same as VS Code). The custom handshake was incompatible with Node.js v24's HTTP internals, causing `code 1006` connection failures in all browsers.
- **IPv6 localhost binding** — Server now binds to `::` (dual-stack) in local mode. macOS resolves `localhost` to `::1` (IPv6 first); binding to `127.0.0.1` broke WebSocket connections.
- **PTY Enter key** — Auto-send used `\n` (line feed) instead of `\r` (carriage return). PTY terminals require `\r` to simulate the Enter key.
- **Build status "Live" false positive** — Projects with a `deployUrl` set during wizard setup (intended domain) showed as "Live" even at Phase 0. Now requires both `deployUrl` AND `lastDeployAt` to confirm actual deployment.
- **Static file caching** — Added `Cache-Control: no-cache, must-revalidate` to static file responses. Prevents browsers from serving stale JS after server updates.
- **CSP connect-src** — Added `https://cdn.jsdelivr.net` to allow xterm.js source map fetching.

### Changed
- **Claude Code in Tower** now launches with `--dangerously-skip-permissions` for autonomous operation.
- **`ws` + `@types/ws`** added as dependencies (replaces 200+ lines of custom WebSocket code).

---

## [7.2.1] - 2026-03-15

### Fixed
- **Avengers Tower terminal crash on Node.js v24** — `posix_spawnp failed` error when opening terminal. Upgraded `node-pty` from 1.1.0 to 1.2.0-beta.12 which includes prebuilds compatible with Node v24's ABI.

---

## [7.2.0] - 2026-03-15

### Added
- **Third-party script loading pattern** — Three-state pattern (loading/ready/error) for external script dependencies (`docs/patterns/third-party-script.ts`)
- **v8.0-v9.0+ roadmap** — The Hive Mind (Agent Memory, Conflict Prediction, `/prd`), The Evolution (Self-Improving Methodology, Agent Specialization), The Autonomy (`/campaign --autonomous`), The Horizon (Pattern Evolution, Cross-Project, Multi-Language)
- **7 enchantment animations** — Forge-lit pulse on vault unlock, streaming cursor for PRD generation, success icon pop, directional step transitions, primary button gradient glow, subtitle delayed fade-in, status message slide-in

### Changed
- **Vault password minimum raised to 8 characters** — was 4, now consistent with security best practices (server + client)
- **TOTP validation enforces exactly 6 digits** — rejects alphabetic and short/long codes per RFC 6238
- **Provisioning concurrency lock** — check-and-set is now synchronous (same event loop tick), preventing TOCTOU race on concurrent requests
- **Manifest writes serialized** — all mutation functions in provision-manifest.ts now use write queue, preventing race conditions
- **PTY cols/rows clamped before spawnOptions** — consistent with resize clamping, prevents oversized terminal dimensions
- **ANTHROPIC_API_KEY excluded from remote PTY** — operator's API key no longer leaks to deployer-role terminal sessions
- **11 methodology fixes** from 5 field reports: execution order verification (Gauntlet), Node.js mutex pattern (Backend), symlink resolution (Security), CSS animation replay (Frontend), cross-file flow tracing (Assembler), VERSION.md content checks (Forge Keeper + void), .claude/settings.json in /void "Never touch" list

### Security
- **HSTS header** in remote mode (`Strict-Transport-Security: max-age=31536000; includeSubDomains`)
- **Vault cache timing-safe comparison** — uses `timingSafeEqual` instead of `===` for password check
- **UUID validation on manifest runId** — prevents path traversal via crafted cleanup requests
- **Symlink resolution** in project import — `fs.realpath()` prevents symlink attacks pointing outside project directory

### Fixed
- **Skip navigation link** added for keyboard/screen reader users (WCAG 2.1 AA)
- **ARIA tab linkage** — PRD tabs have ids, aria-controls, and aria-labelledby
- **Section aria-labelledby** — all wizard step sections linked to their headings
- **noscript fallback** — shows clear message when JavaScript is disabled
- **--text-muted contrast** raised from #767676 to #8a8a8a (5.76:1 ratio, WCAG AA compliant)
- **Heading "Describe Your Vision"** replaces "Product Requirements" — matches PRD three-act language
- **Backward animation direction** — navigating from step 5 to 4b now plays slide-left (not slide-right)
- **Forge-lit animation replay** — vault unlock pulse replays correctly on repeated attempts via reflow trick

---

## [7.1.0] - 2026-03-15

### Added
- **Operations menu** — Act 3 presents expandable cards: Deploy Target, Cloud Credentials, Domain & Hostname, Resilience Pack. Pick what you need, skip the rest.
- **Resilience Pack** — 10 opt-in toggles for operational hardening: multi-env, preview deploys, auto-rollback, migrations, backups, health check, graceful shutdown, error boundaries, rate limiting, dead letter queue.
- **Live header** — Shows "Gandalf — [Project Name]" as you type.

### Changed
- **Three-act wizard flow** — "Secure Your Forge" (vault → API key) → "Describe Your Vision" (project → PRD) → "Equip Your Project" (operations menu). Vault and API key split into separate focused screens. Domain/hostname moved to operations menu.
- **Act-based progress labels** — "Act 1 — Secure Your Forge" instead of "Step 3 of 7".

### Removed
- **Simple/Advanced toggle** — Eliminated. Every user gets the same flow; configure depth via the operations menu.

---

## [7.0.1] - 2026-03-15

### Changed
- **Gandalf wizard redesigned as Three-Act Flow** — identity (vault + key), vision (name + PRD), operations (menu of cards). Eliminates simple/advanced toggle. Éowyn's enchantment notes woven into each act.
- **v4.3 reclassified as "The Resilience Pack"** — opt-in card in Gandalf's Act 3 operations menu with 10 toggles (5 deploy + 5 runtime resilience). Smart defaults based on deploy target and framework.
- **v7.1 "The Redesign" added to ROADMAP** — implementation plan for the wizard UX overhaul.

### Fixed
- **SSRF bypass checklist** added to Kenobi's security audit — octal IPs, decimal IPs, IPv6, DNS rebinding, URL scheme bypass (field report #12).
- **AI output sanitization checklist** added — nested structure handling, secure fallback paths, isolated-vm requirement, sandbox escape test (field report #11).
- **"Grep for siblings" rule** added to Batman's QA Pass 2 and Gauntlet fix batches — fix ALL instances of a pattern, not just the one reported (field reports #11 + #12).
- **Encoding variant check** added to Gauntlet fix batch protocol — verify security filters handle all name encodings (field report #12).
- **Enum consumer sweep** added to Build Protocol Phase 5 — grep all consumers when adding new enum values (field report #11).
- **Cross-surface consistency sweep** added to Build Protocol Phase 8 — search all surfaces when changing pricing/tiers/counts (field report #11).
- **Kusanagi added to Gauntlet Round 1** — infrastructure issues discovered earlier, not deferred to Round 3 (field report #11).
- **Whitelist-over-blocklist** documented as general security principle in Kenobi's method doc (field report #12).

---

## [7.0.0] - 2026-03-15

### Added
- **The Penthouse — Multi-User RBAC** — Three roles (admin, deployer, viewer) with invitation-only user creation. TOTP mandatory. ROUTE_ROLES middleware enforces role hierarchy on every API endpoint.
  - `wizard/lib/user-manager.ts` — User CRUD, invitation system (24h tokens, single-use, timing-safe comparison), `hasRole()` hierarchy, `hasProjectAccess()` per-project checks.
  - `wizard/api/users.ts` — User management endpoints: list, invite, complete-invite, remove, role change. All admin-gated with defense-in-depth.
- **Per-Project Access Control** — Project ownership and access lists. Each project has an owner and a list of `{ username, role }` entries. Queries filtered by access — users only see projects they own or have been granted access to.
  - `grantAccess()`, `revokeAccess()`, `getProjectsForUser()`, `checkProjectAccess()` in project-registry.
  - Access management modal in Lobby UI with focus trap, Escape handler, DOM-safe event binding.
  - Role badges on project cards (Owner/Deployer/Viewer).
- **Linked Services** — Bidirectional project linking for monorepo orchestration. BFS group resolution with cycle detection. Coordinated deploy checks across linked services.
  - `wizard/lib/deploy-coordinator.ts` — `checkDeployNeeded()`, `getDeployPlan()` with audit.
  - Link/unlink API endpoints with dual-ownership verification.
  - Link management modal in Lobby UI.
- **Rollback Dashboard** — Deploy history panel in Avengers Tower with collapsible sidebar, keyboard navigation (Escape to close), `aria-expanded`/`aria-controls`.
  - `wizard/ui/rollback.js` — viewer-gated deploy history display.
- **Cost Tracker** — Aggregate monthly costs across all accessible projects via existing `monthlyCost` field. NaN/negative guard on writes.
  - `wizard/lib/cost-tracker.ts` — `getAggregateCosts()`, `setProjectCost()`.
  - Lobby Penthouse footer fetches real cost data from API.
- **Agent Memory** — Cross-project lesson storage for methodology learning. 1000-entry cap with oldest-eviction. Serialized writes, atomic file ops.
  - `wizard/lib/agent-memory.ts` — `addLesson()`, `getLessons()`, `getRelevantLessons()`.
  - `~/.voidforge/lessons.json` (0600 permissions).
- 4 Architecture Decision Records: ADR-028 (RBAC), ADR-029 (per-project access), ADR-030 (linked services), ADR-031 (observatory features).

### Changed
- `tower-auth.ts` — Extended for multi-user: `UserRole` type, `SessionInfo` return from `validateSession()`, role in sessions, `createUser()` accepts role, `removeUser()`/`updateUserRole()`/`listUsers()`/`getUserRole()` added, legacy user migration (pre-v7.0 users get `role: 'admin'`), username character validation (`/^[a-zA-Z0-9._-]+$/`), X-Forwarded-For takes rightmost IP.
- `server.ts` — ROUTE_ROLES middleware maps API paths to minimum roles. WebSocket upgrade uses `hasRole()` (not hardcoded string). CSRF error format standardized. User context propagated to handlers.
- `project-registry.ts` — `owner`, `access`, `linkedProjects` fields. `removeProject()` cleans up linked references. `removeUserFromAllProjects()` clears ownership on user deletion. BFS `getLinkedGroup()`.
- `pty-manager.ts` — `username` field in PtySession for audit trail.
- `terminal.ts` — Per-project access checks, user context extraction, session list filtered by ownership, kill endpoint with ownership check.
- `lobby.js` — Role-aware UI: conditional buttons per role, access/link modals with focus traps, cost display from API.
- `lobby.html` — Access modal, link modal, role badge styling, linked badge styling.
- `tower.html` — Rollback panel with a11y attributes.

### Fixed
- Tailwind v4 content scanning check added to Galadriel's UX method (field report #10).
- Platform Build Gate added to Kusanagi's DevOps method (field report #10).

### Security
- ROUTE_ROLES enforces minimum role on all 45+ API endpoints (defense-in-depth with handler-level checks).
- Per-project access returns 404 (not 403) to prevent information leakage.
- Invite tokens: 256-bit, timing-safe comparison, 24h expiry, single-use with rollback on failure.
- Terminal sessions filtered by user — deployers can only see/kill their own sessions.
- Viewer blocked from terminals (WebSocket + REST), deploy metadata, and write operations.
- User removal clears project ownership to prevent privilege escalation via username reuse.
- Session cookie always sets Secure flag in remote mode (not header-dependent).
- `ProjectAccessEntry.role` tightened to `'deployer' | 'viewer'` (admin grants blocked at API).
- 52 security/quality findings resolved across 4 missions + 2 Gauntlet checkpoints.

---

## [6.5.1] - 2026-03-15

### Changed
- **The Arthurian Retcon** — All Arthurian legend references removed from the codebase. VoidForge's identity is rooted in its declared fictional universes (Tolkien, Marvel, DC, Star Wars, Star Trek, Dune, Anime). Arthurian legend was never one of them.
  - **Merlin → Gandalf** (Tolkien) — Setup wizard is now Gandalf. *"I'm looking for someone to share in an adventure."* The wizard who kicks off the journey.
  - **Gandalf → Radagast** (Tolkien) — UX edge-cases sub-agent renamed to free the name. Radagast notices things at the boundaries others overlook.
  - **Camelot → Avengers Tower** (Marvel) — Browser terminal / operations console. Stark's HQ. Every project gets a floor.
  - **Great Hall → The Lobby** (Marvel) — Multi-project dashboard. Where you see every floor at a glance.
  - **Round Table → The Penthouse** (Marvel) — v7.0 multi-user coordination. Where the team meets. Top floor.
- 39 files modified, 5 files renamed, ~180 replacements across code + docs.

---

## [6.5.0] - 2026-03-15

### Added
- **Avengers Tower Remote** — self-hosted VoidForge with 5-layer security. Access your forge from any browser, anywhere.
  - `wizard/lib/tower-auth.ts` — Full authentication engine: PBKDF2 password hashing (210k iterations, NIST SP 800-63B), TOTP 2FA (RFC 6238 with replay protection), session management (in-memory only, 8-hour TTL, IP binding, single active session), rate limiting (5/min, 10-consecutive lockout for 30 min), serialized writes, periodic cleanup.
  - `wizard/api/auth.ts` — Login, logout, session check, initial setup endpoints. Runtime type validation, field length caps, Cache-Control: no-store on auth responses.
  - `wizard/ui/login.html` + `wizard/ui/login.js` — Login page with setup flow (first-time TOTP enrollment) and auth flow (username + password + TOTP). Keyboard accessible, autofill-friendly.
  - `wizard/lib/audit-log.ts` — Append-only JSON lines audit trail at `~/.voidforge/audit.log`. Logs: login attempts, sessions, vault events, terminal sessions, deploys, credential access. 10MB rotation. Never crashes the server.
  - `wizard/lib/provisioners/self-deploy.ts` — VoidForge self-deploy provisioner: installs Node.js, Caddy, PM2, creates forge-user, generates Caddy HTTPS config, starts VoidForge as a managed service.
  - ADR-027: Avengers Tower Remote 5-Layer Security Architecture.

### Changed
- `wizard/server.ts` — Auth middleware gates all routes in remote mode (exempt: login/setup/static). WebSocket upgrade validates Avengers Tower session. CSP includes `wss://` for remote WebSocket. CORS expanded for remote domain. Binds to `0.0.0.0` in remote mode.
- `wizard/lib/pty-manager.ts` — Remote mode: 20 max sessions (vs. 5 local), audit log integration (terminal_start/terminal_end), forge-user sandboxing.
- `wizard/ui/lobby.html` + `wizard/ui/lobby.js` — Auth-aware: shows username, logout button, redirects to login when unauthenticated.
- `scripts/voidforge.ts` — `--remote` flag (remote mode), `--self` flag (self-deploy), `--host` flag (domain name).

### Security
- Two-password architecture: login password (bcrypt/PBKDF2) ≠ vault password (AES-256-GCM). Compromised session cannot read credentials.
- TOTP replay protection: lastTotpStep tracked per user, codes rejected at or before last used step.
- Rate limiting with memory cleanup: periodic eviction of expired sessions and stale rate-limit entries.
- Setup endpoint rate-limited and serialized to prevent race-to-setup attacks.
- X-Forwarded-For only trusted in remote mode (behind Caddy reverse proxy).
- Auth store throws on corruption (prevents silent re-setup attack vector).
- Shell injection prevention in self-deploy: input validation + shell escaping.
- IP binding on sessions: mismatch invalidates session entirely.

---

## [6.0.0] - 2026-03-15

### Added
- **Avengers Tower Multi — The Lobby** — multi-project operations console. Dashboard shows all VoidForge projects with health status, deploy URL, framework badge, cost, and quick actions.
  - `wizard/lib/project-registry.ts` — CRUD for `~/.voidforge/projects.json`. Serialized writes (vault pattern), atomic file ops (temp + fsync + rename), backup before overwrite, field validation on read, MUTABLE_FIELDS allowlist on update.
  - `wizard/api/projects.ts` — REST API: list all, get by ID, import existing project, delete from registry. Runtime type validation on all inputs, path canonicalization via `resolve()`.
  - `wizard/ui/lobby.html` + `wizard/ui/lobby.js` — The Lobby dashboard with project cards, health indicators (color + text labels for WCAG 1.4.1), import modal with focus trap, keyboard-navigable cards, 30-second polling.
  - `wizard/lib/health-poller.ts` — Background health checks every 5 minutes. Parallel via `Promise.allSettled`, 5-second timeout per project, SSRF protection (private IP blocklist, redirect blocking, hex/octal/IPv6 coverage).
- **Import Existing Project** — `POST /api/projects/import` scans a directory for CLAUDE.md, PRD frontmatter, .env, build-state, and auto-detects framework from package.json/requirements.txt/Gemfile.
- **Back-to-Lobby navigation** in Avengers Tower — "← Lobby" button with session persistence confirmation.
- ADR-026: Project Registry and The Lobby Architecture.

### Changed
- Server landing page changed from Gandalf (`/index.html`) to The Lobby (`/lobby.html`). Gandalf still accessible via direct URL and "New Project" buttons.
- `wizard/server.ts` — health poller lifecycle (start on listen, stop before PTY cleanup), double-shutdown guard, CORS fix (non-matching origins get no allow-origin header).
- `wizard/api/project.ts` — registers new projects in registry, runtime type validation on all body fields, .env template injection prevention (newline stripping).
- `wizard/ui/tower.html` — ARIA landmarks (`<main>`, `role="alert"`), `:focus-visible` on buttons, `prefers-reduced-motion` support.

### Security
- SSRF prevention in health poller: URL scheme validation, private IP blocklist (IPv4, IPv6, hex, octal, decimal, 0.0.0.0, metadata endpoints), `redirect: 'manual'` to prevent redirect-based SSRF.
- CORS hardened: non-matching origins no longer receive `Access-Control-Allow-Origin` header.
- .env injection prevention: newlines stripped from all template-interpolated fields (name, description, domain, hostname, deploy target).
- Runtime type validation on `/api/project/create` body fields (was unsafe `as` cast).
- Registry file backup before every write (data loss prevention).

### Fixed
- **Field Report #9:** Rex (Kenobi's security team) now checks build output HTML for inline scripts before tightening CSP. Gauntlet adds build-output verification gate after every fix batch. Prevents framework-generated inline scripts (Next.js, Nuxt, SvelteKit) from being blocked by CSP changes.

---

## [5.5.0] - 2026-03-15

### Added
- **Avengers Tower Local** — browser terminal with real Claude Code. Never leave the browser.
  - `wizard/lib/pty-manager.ts` — PTY lifecycle management using `node-pty`. Spawns real shell processes, manages multiple sessions per project, 30-min idle timeout, max 5 concurrent sessions.
  - `wizard/api/terminal.ts` — WebSocket ↔ PTY bridge (raw RFC 6455 implementation). REST endpoints for session CRUD. Vault password required to establish connections.
  - `wizard/ui/tower.html` + `wizard/ui/tower.js` — browser terminal UI using xterm.js. Tabbed interface: multiple terminals per project (Claude Code, Shell, SSH). Auto-launches Claude Code on open. Resize handling, session reconnection on navigate-back.
  - "Open in Avengers Tower" button on Gandalf's done screen — transitions directly from project creation to browser terminal.
  - WebSocket upgrade handler in `wizard/server.ts` — routes `/ws/terminal` to PTY bridge.
  - Graceful shutdown: `killAllSessions()` on SIGINT/SIGTERM.
- New dependency: `node-pty` (~2MB native module, same as VS Code terminal)
- CSP updated to allow xterm.js CDN and WebSocket connections

---

## [5.0.0] - 2026-03-15

### Added
- **Lessons integration** — Wong extracts learnings after every `/assemble` run and appends to `LESSONS.md`. Lessons confirmed across 2+ projects are flagged for promotion to method docs. `/build` Phase 0 now loads relevant lessons from prior projects to inform the current build.
- **Build analytics** — `wizard/lib/build-analytics.ts` tracks metrics across projects: phase findings, fix-to-finding ratios, framework-specific trends. Stored at `~/.voidforge/analytics.json`. `surfaceTrends()` generates human-readable insights.
- **Smart scoping** — `/campaign` now orders missions complexity-first within dependency tiers. Hardest features (most integrations, edge cases, schema relationships) built first when energy is fresh; polish and admin later.
- **Project templates** — 4 curated starters: SaaS (Next.js + Stripe + teams), REST API (Express + Postgres), Marketing Site (Next.js + Tailwind), Admin Dashboard (Next.js + shadcn/ui). `npx voidforge init --template saas` or select in Gandalf wizard. `npx voidforge templates` lists all available.
  - New file: `wizard/lib/templates.ts` — template definitions with frontmatter, suggested integrations, and PRD scaffolding
  - New API: `GET /api/prd/templates`, `GET /api/prd/templates/get?id=saas`
  - New CLI: `npx voidforge templates` command

---

## [4.6.0] - 2026-03-15

### Added
- **`/debrief --inbox`** — Bashir's inbox mode: fetches open `field-report` issues from GitHub, triages each one (accept/already-fixed/wontfix/needs-info), applies accepted fixes, comments on issues with triage results, closes resolved issues. Completes the feedback loop: downstream submits → upstream triages → `/void` propagates fixes.
- **`/imagine` retry logic** — 3 attempts with exponential backoff (1s, 3s, 9s) for DALL-E server errors (500/502/503). ~15% of requests hit transient failures; now handled automatically.
- **Global CSS conflict check** in `/ux` Step 1.5 — Galadriel checks for specificity conflicts between global stylesheets and component-level utilities (Tailwind, CSS modules). Common traps: `overflow: hidden` on parents, stacking context conflicts, `:focus-visible` bleed-through.

### Changed
- Count cross-referencing in `/qa` already existed (shipped in v4.4.0) — confirmed during field report triage, no changes needed.

---

## [4.5.0] - 2026-03-15

### Added
- **PRD-driven credential collection** — Gandalf Step 4.5: after pasting a PRD, the wizard parses the env var section and presents a dynamic form to collect project-specific API keys (WhatsApp, Mapbox, Google Places, etc.). All stored in the vault with AES-256-GCM encryption.
  - New API endpoint: `POST /api/prd/env-requirements` — parses PRD content for service-specific credentials
  - New API endpoint: `POST /api/credentials/env-batch` — stores multiple credentials in one call
  - New Gandalf step between PRD and Deploy Target with accordion-style credential groups
- **Headless deploy mode** — `npx voidforge deploy --headless` runs the full provisioner pipeline from the terminal without opening a browser. Uses vault credentials and PRD frontmatter. Progress output to stdout with colored status icons. Used by `/build` Phase 12 so you never leave Claude Code.
  - New file: `wizard/lib/headless-deploy.ts` — terminal adapter for provisioner pipeline
  - Updated `scripts/voidforge.ts` with `--headless` and `--dir` flags
  - Updated `/build` Phase 12 to reference headless deploy
- **PostgreSQL extension support** — VPS provisioner now detects `postgis` and `pg_trgm` from Prisma schema's `extensions` directive and generates install commands in `provision.sh`
  - Updated `wizard/lib/provisioners/scripts/provision-vps.ts` with extension block generator
  - Updated `wizard/api/deploy.ts` to parse Prisma schema for extensions

### Changed
- Gandalf navigation updated to handle Step 4b (project credentials) with proper back/forward flow
- HOLOCRON updated with headless deploy documentation
- `/build` Phase 12 now references `npx voidforge deploy --headless` as the primary deploy path

---

## [4.4.0] - 2026-03-15

### Added
- **`/imagine` command** — Celebrimbor's Forge: AI image generation from PRD visual descriptions. Scans PRD for illustrations, portraits, OG images, hero art. Derives style from brand section. Generates via OpenAI API with asset manifest for regeneration. Provider-abstracted.
  - New agent: **Celebrimbor** (Tolkien, Silmarillion) — "Hand of Silver," greatest elven smith
  - Sub-agents: **Nori** (asset scanner), **Ori** (prompt engineer), **Dori** (integration checker)
- **`/debrief` command** — Bashir's Field Reports: post-session analysis that identifies methodology gaps and proposes fixes in VoidForge's own language. Can submit structured post-mortems as GitHub issues on the upstream repo.
  - New agent: **Bashir** (Star Trek DS9) — chief medical officer, diagnostician
  - Sub-agents: **Ezri** (timeline), **O'Brien** (root cause), **Nog** (solutions), **Jake** (report)
- `wizard/lib/image-gen.ts` — Image generation provider abstraction with OpenAI support, asset manifest, cost estimation
- `wizard/lib/asset-scanner.ts` — PRD parser for visual asset requirements with brand style extraction
- `docs/methods/FORGE_ARTIST.md` — Celebrimbor's full method doc
- `docs/methods/FIELD_MEDIC.md` — Bashir's full method doc

### Changed
- Lead agent count: 11 → 13 (Celebrimbor + Bashir)
- Command count: 13 → 15 (`/imagine` + `/debrief`)
- NAMING_REGISTRY.md: 7 new character entries (Celebrimbor, Nori, Ori, Dori, Ezri, Nog, Jake)

---

## [4.2.0] - 2026-03-14

### Added
- **Prisma type generation** (ADR-025) — runs `prisma generate` and creates `types/index.ts` barrel export. Conditional on Prisma schema existing.
- **OpenAPI spec generation** (ADR-025) — generates starter `docs/api.yaml` with framework-aware defaults. Users fill in their endpoints.
- **Database ERD generation** (ADR-025) — parses Prisma schema and generates `docs/schema.md` with Mermaid entity-relationship diagram.
- **Database seeding** (ADR-025) — generates `prisma/seed.ts` with factory functions for all models. Run with `npx tsx prisma/seed.ts`.
- **Integration templates** (ADR-025) — pre-built client wrappers selected via PRD frontmatter:
  - `payments: stripe` → `lib/stripe.ts` (checkout, portal, webhooks)
  - `email: resend` → `lib/resend.ts` (transactional email)
  - `storage: s3` → `lib/s3-upload.ts` (signed URL upload/download)

### Security
- All integration templates validate required env vars at startup (fail-fast, not silent fallback)

---

## [4.1.0] - 2026-03-14

### Added
- **Structured deploy logs** (ADR-021) — every successful provision is persisted to `~/.voidforge/deploys/` with timestamp, target, URL, resources, and sanitized outputs. New `/api/deploys` endpoint to query deploy history.
- **AWS cost estimation** (ADR-022) — before provisioning AWS targets (VPS/S3), emits an estimated monthly cost based on instance type, RDS, and ElastiCache selections. Informational only, does not block.
- **Post-deploy health monitoring** (ADR-023) — VPS: generates `infra/healthcheck.sh` cron script (curl every 5 minutes, log failures). Platforms: emits direct links to Vercel Analytics, Railway Metrics, or Cloudflare dashboard.
- **Sentry error tracking** (ADR-024) — optional integration. When `sentry-dsn` exists in vault, generates framework-specific Sentry SDK initialization code (`sentry.ts`, `sentry.client.config.ts`, or `sentry_config.py`). Writes DSN to `.env`. Non-fatal — works without it.

### Security
- Deploy log outputs are sanitized (password/secret/token keys stripped) before persisting to disk — same logic as SSE output sanitizer.
- Health check script sanitizes projectName and deployUrl to prevent shell injection in generated bash.

---

## [4.0.0] - 2026-03-14

### Added
- **Pre-deploy build step** (ADR-016) — framework-aware build runs BEFORE any deploy action. Detects build command and output directory per framework (Node, Django, Rails). Installs dependencies automatically. Skips if output already exists or no package.json found.
- **GitHub Actions CI/CD generation** (ADR-017) — generates `ci.yml` (test + lint on PR) and `deploy.yml` (deploy on merge to main) during GitHub pre-step. Framework-aware test/lint/build commands. Deploy target-specific workflows (Vercel, Cloudflare, Railway, VPS, S3). Required secrets documented in generated files.
- **Environment validation script** (ADR-018) — generates `validate-env.js` or `validate_env.py` that checks all required env vars at startup. Detects placeholder values. Works in both CommonJS and ESM projects.
- **Credential scoping** (ADR-020) — each provisioner only receives the vault keys it needs, not the full vault. Extends the cleanup scoping pattern from v3.8.0 to the provisioning phase. Internal `_`-prefixed keys (GitHub metadata) pass through.

### Changed
- **Railway API migration** (ADR-019) — replaced deprecated `pluginCreate` GraphQL mutation with `templateDeploy` for database/Redis provisioning. Falls back to `serviceCreate` if templates unavailable. Fixed custom domain ordering (now created after service). Deploy polling queries by service ID to target the correct service.
- `provision.ts` — framework value normalized to lowercase at boundary. Build failure message clarified. Fatal error now includes sanitized detail. Hostname validation includes format example. keepaliveTimer moved into finally block.
- `github.ts` — accepts framework/deployTarget params for CI/CD generation. Second commit/push for workflow files after initial push.
- S3 deploy uses framework-aware output directory via `getBuildOutputDir()` instead of hardcoded `dist`.

### Architecture
- 5 new ADRs: 016 (build step), 017 (CI/CD), 018 (env validation), 019 (Railway templates), 020 (credential scoping)

---

## [3.9.1] - 2026-03-14

### Added
- **ROADMAP.md** — 5-version strategic roadmap (v4.0 Reliability → v5.0 Intelligence)
- **PRD-VOIDFORGE.md** — VoidForge's own product requirements document (root-level, not synced to user projects via /void)
- **`/campaign --plan`** — planning mode: update PRD and ROADMAP with new ideas without building. Dax analyzes where it fits, Odo checks dependencies, presents changes for review.

### Changed
- `/campaign` PRD discovery: checks `/PRD-VOIDFORGE.md` at root first, falls back to `/docs/PRD.md`. User projects unaffected.

---

## [3.9.0] - 2026-03-14

### Added
- **/campaign command** — Sisko's Danger Room: read the PRD, pick the next mission, finish the fight, repeat until done. Autonomous campaign execution with mission scoping, dependency ordering, and The Prophecy Board for tracking progress across sessions.
- **Sisko** (Benjamin Sisko, DS9) promoted to 11th lead agent. Star Trek now has two leads: Picard (architecture) and Sisko (campaign). Sub-agents: Kira (ops), Dax (strategy), Odo (prerequisites).
- `docs/methods/CAMPAIGN.md` — full operating rules, 6-step sequence, session management, victory condition.
- Flags: `--resume` (continue mid-campaign), `--fast` (skip Crossfire+Council in each mission), `--mission "Name"` (jump to specific PRD section).

### Changed
- Command count updated to 13, lead count to 11 across CLAUDE.md, HOLOCRON.md, README.md, and NAMING_REGISTRY.md.

---

## [3.8.0] - 2026-03-14

### Added
- **Haku's Last Mile** — every deploy target is now fully automated end-to-end. Run `npm run deploy` and get a live URL, not a manual checklist.
- **GitHub integration** — new cloud provider in Gandalf. Collects PAT, creates repos, pushes code. Used by Vercel, Cloudflare Pages, and Railway for auto-deploy on push.
- **SSH deploy module** — provisions EC2 servers remotely (provision.sh), deploys via release-directory strategy with atomic symlink swap, health checks, and automatic rollback on failure.
- **S3 deploy via SDK** — uploads build directory to S3 with correct MIME types and cache-control headers. No AWS CLI dependency (ADR-014).
- **Shared exec utility** — child process wrapper with timeout, abort signal, and streaming (ADR-013). Used by GitHub and SSH modules.
- **Shared env-writer** — extracted .env append logic from 5 copy-pasted provisioner implementations.
- **Deploy polling** — Vercel, Cloudflare Pages, and Railway provisioners poll deployment status after git push, reporting progress until the app is live.
- **DEPLOY_URL** and **GITHUB_REPO_URL** displayed as clickable links on the Haku Done screen.
- 5 Architecture Decision Records: ADR-011 (GitHub pre-step), ADR-012 (no GitHub cleanup), ADR-013 (exec utility), ADR-014 (S3 via SDK), ADR-015 (platform auto-deploy).

### Changed
- **Vercel provisioner** — links GitHub repo, sets env vars via API, polls deploy. Re-runs (409) now fetch the existing project ID so all steps execute.
- **Cloudflare provisioner** — includes GitHub source at project creation (required by Cloudflare API). Re-runs set CF_PROJECT_URL. Next.js destination dir corrected to `out`.
- **Railway provisioner** — creates service with GitHub source, sets env vars using Railway's `${{Plugin.VAR}}` syntax. Deprecated `pluginCreate` gets clear fallback guidance.
- **AWS VPS provisioner** — uses shared slugify and env-writer. Error messages now include resource IDs and console URLs instead of generic "Check AWS Console."
- **GitHub org repos** — uses `/orgs/{owner}/repos` endpoint when owner is explicitly set, with fallback to `/user/repos`.

### Security
- **Token never touches disk** — git push uses `http.extraheader` via environment variables instead of embedding PAT in the URL. No reflog persistence (ADR-011).
- **Triple token sanitization** — error messages scrubbed with 3 regexes covering URL-embedded tokens, Base64 Authorization headers, and GIT_CONFIG env vars.
- **projectDir validation** — rejects paths with `..` segments or non-absolute paths to prevent directory traversal.
- **Credential scoping** — in-memory cleanup credentials store only target-specific keys, not the full vault.
- **Auth gate on /incomplete** — orphaned run enumeration now requires vault unlock.
- **.gitignore defense-in-depth** — verifies `.env` and `.ssh/` are protected before `git add -A`.
- **Secret stripping loop** — SSE output deletes any key containing "password", "secret", or "token" (case-insensitive).

### Fixed
- Vercel 409 (project exists) now fetches project ID — re-runs no longer silently skip linking, env vars, and deploy.
- Cloudflare 409 now sets `CF_PROJECT_URL` — re-runs show the deploy URL on the Done screen.
- Removed duplicate `slugify` from aws-vps.ts (diverged from shared implementation).
- Removed unused `httpsPut` import from vercel.ts.
- `.env` value parser strips surrounding quotes before uploading to Vercel.
- `npm ci --omit=dev` replaces `--ignore-scripts` in SSH deploy (fixes native deps like bcrypt, sharp).
- Null safety on all `safeJsonParse` casts in Cloudflare provisioner (8/8 now include `| null`).

---

## [3.7.0] - 2026-03-14

### Added
- **/assemble command** — Fury's Initiative: 13-phase full pipeline (architect → build → 3x review → UX → 2x security → devops → QA → test → crossfire → council). Calls every agent from every universe. Convergence loop, session checkpointing, --resume/--fast/--skip-build flags.
- **Fury** promoted to 10th lead agent (Marvel → The Initiative). Hill added to Marvel pool.
- **/thumper command** — Chani's Worm Rider: drive Claude Code via Telegram from anywhere. Gom Jabbar passphrase authentication with PBKDF2 hashing, message deletion, 60-minute idle timeout, 3-attempt lockout. Five bash scripts, zero dependencies.
- **Dune universe** — Chani as lead (Worm Rider) with 20 named characters. Sub-agents: Stilgar (security), Thufir Hawat (parsing), Duncan Idaho (relay), Reverend Mother Mohiam (authentication).
- **Transport auto-detection** — TMUX_SENDKEYS (cross-platform), PTY_INJECT (headless Linux), OSASCRIPT (macOS Terminal.app/iTerm2). Explicit guidance for VS Code, Warp, Alacritty, Kitty users. Windows Git Bash gets "use WSL" message.
- **Water Rings stop hook** — automatic task completion notifications to Telegram.
- **LESSONS.md** — first entries from Kongo.io Sprint 4 post-mortem.

### Changed
- **/review** — mandatory integration tracing (follow URLs/keys to consumers) and error path verification (verify UI displays specific server errors).
- **/ux** — mandatory error state testing with intentionally invalid/conflicting input.
- **/qa** — Step 2.5 smoke tests: hit the running server after build, verify cross-module paths at runtime.
- **/test** — Step 3.5 cross-module integration tests: at least one test per feature crossing module boundaries.
- **/security** — Maul executes actual HTTP exploitation attempts. Ahsoka traces the full auth middleware chain.
- **/build** — Phase 4/5/6 gates define "works manually" explicitly: error paths, cross-module integration, generated URLs.
- **/devops** — post-deploy smoke tests verify application behavior (not just infrastructure health).
- CLAUDE.md, HOLOCRON.md, README.md — 12 commands, 10 agents, 7 universes, 170+ characters.

### Security
- Gom Jabbar: PBKDF2 hashing (100k iterations), Telegram message deletion with fail-secure invalidation, idle timeout, lockout.
- Control character sanitization strips terminal-dangerous bytes from all injected messages.
- Root guard prevents /thumper from running as root.
- Empty hash bypass prevention refuses auth when hashing tools unavailable.
- Config injection prevention via `printf '%q'` and umask 077.

### Fixed
- THUMPER.md rewritten — 10+ factual errors corrected (wrong timeouts, hash algo, flow description, nonexistent CLI flags).
- Script copy clarified — hostile lockout softened, ambiguous passphrase prompts made explicit, empty notifications made useful.

---

## [3.5.3] - 2026-03-14

### Changed
- **Renamed `/voice` to `/thumper`** — resolved conflict with Claude Code's built-in `/voice` skill. A thumper is the Fremen device that summons the sandworm — plant it, the worm comes, you ride it.
- **Renamed "Remote Bridge" to "Worm Rider"** — proper Dune universe domain name for Chani's role. Worm riding is the quintessential Fremen skill.
- All files renamed: `scripts/voice/` → `scripts/thumper/`, `voice.sh` → `thumper.sh`, `VOICE.md` → `THUMPER.md`, `.voidforge/voice/` → `.voidforge/thumper/`.
- `/security` — Maul now executes actual HTTP exploitation attempts, not just conceptual red-teaming. Ahsoka traces the full auth middleware chain.
- `/build` — Phase 4/5/6 gates now define "works manually" explicitly: must test error paths and cross-module integration at runtime.
- `/devops` — Post-deploy smoke tests verify application behavior, not just infrastructure health.
- Kongo.io lessons applied across `/review`, `/ux`, `/qa`, `/test` — integration tracing, error path verification, smoke tests, cross-module tests.

---

## [3.5.0] - 2026-03-14

### Added
- **/voice command** — Chani's remote bridge: drive Claude Code sessions via Telegram from anywhere. Environment-aware setup auto-detects tmux, headless Linux, and macOS terminals.
- **Gom Jabbar authentication** — passphrase-based session gate with PBKDF2 hashing, Telegram message deletion, 60-minute idle timeout, and 3-attempt lockout. Passphrase is erased from chat history; session invalidated if deletion fails.
- **Dune universe** — 9th agent lead (Chani) with 20 named characters from Arrakis. Sub-agents: Stilgar (security), Thufir (parsing), Idaho (relay), Mohiam (authentication).
- **Water Rings stop hook** — automatic task completion notifications to Telegram when Claude Code finishes responding.
- **Transport vectors** — three injection methods: TMUX_SENDKEYS (cross-platform), PTY_INJECT (headless Linux), OSASCRIPT (macOS Terminal.app/iTerm2). Auto-detection with manual override.

### Security
- Control character sanitization strips terminal-dangerous bytes (Ctrl+C, ESC, ANSI sequences) from all incoming messages before injection.
- Root guard prevents /voice from running as root (unspoofable `id -u` check).
- Config injection prevention via `printf '%q'` escaping and umask 077 subshells.
- Empty hash bypass prevention — refuses authentication when hashing tools are unavailable.
- Credentials stored in chmod 600 sietch vault, directory chmod 700, gitignored via `.voidforge/`.

### Changed
- CLAUDE.md updated with /voice command, Chani in Team table, VOICE.md in Docs Reference.
- HOLOCRON.md updated to 11 commands, 9 agents, 7 universes, 170+ characters. Full /voice Arsenal entry with Gom Jabbar explanation.
- README.md updated with /voice in commands table, Chani in agent leads, voice/ in structure tree.
- NAMING_REGISTRY.md expanded with full Dune universe section (Chani lead + 20 pool characters).
- Environment detection improved: VS Code, Warp, Alacritty, Kitty on macOS now get explicit guidance instead of silent OSASCRIPT failure. Windows Git Bash/MSYS2 gets explicit "use WSL" message.

---

## [3.4.0] - 2026-03-13

### Added
- **/test command** — Batman's test-writing mode: coverage gap analysis, test architecture review, write missing unit/integration/component tests. Different from /qa (which finds bugs).
- **/review command** — Picard's code review: pattern compliance (Spock), code quality (Seven), maintainability (Data). Parallel analysis with re-verification pass.
- **Deathstroke** (DC) — adversarial tester added to Batman's QA team. Penetration-style probing, bypasses validations, chains unexpected interactions.
- **Constantine** (DC) — cursed code hunter added to Batman's QA team. Finds dead branches, impossible conditions, logic that only works by accident.
- **Maul** (Star Wars) — red-team attacker added to Kenobi's Security team. Thinks like an attacker, chains vulnerabilities, re-probes after remediation.
- **Double-pass review pattern** — all review phases (QA, UX, Security) now use find → fix → re-verify. Catches fix-induced regressions before they ship.

### Changed
- **Context thresholds for 1M** — checkpoint trigger raised from 15 files/30 tool calls to 50 files/100 tool calls. Pre-load active domain's methodology at session start instead of on-demand only.
- **Picard's architecture review parallelized** — Spock + Uhura run in parallel (independent), then La Forge + Data run in parallel. ~30% faster wall-clock time.
- **Stark's backend audit parallelized** — Rogers + Banner analysis in parallel, then Barton + Romanoff + Thor in parallel. Fury validates all findings.
- **Security audit restructured** — aligned method doc and command to 4 clear phases: parallel scans → sequential audits → remediate → Maul re-verifies.
- **Build protocol phases 9-11** — merged into a unified double-pass review cycle. All three agents (Batman, Galadriel, Kenobi) find issues in parallel, fixes are batched, then all three re-verify.
- **Galadriel's UX pass** — added Samwise + Gandalf re-verification after fixes to catch a11y regressions.
- **Session boundaries expanded** — small-to-medium projects can complete phases 0-8 in a single session with 1M context.
- **SUB_AGENTS.md** — added Coulson and Bombadil to the full roster table, fixed phantom anime character references.

---

## [3.3.1] - 2026-03-13

### Fixed
- **PRD generation silently truncating** — output was hard-coded to 8192 max tokens, causing complex PRDs to cut off mid-stream with no warning. Now uses each model's full output capacity (Opus 32K, Sonnet 16K, Haiku 8K).
- **No truncation feedback** — server now tracks `stop_reason` from the Claude API `message_delta` event and forwards a `truncated` signal to the client, which displays a visible warning instead of silently accepting incomplete output.

---

## [3.3.0] - 2026-03-13

### Added
- **Async resource polling** — Haku now waits for RDS (up to 15min) and ElastiCache (up to 5min) to become available, extracts real endpoints (`DB_HOST`, `REDIS_HOST`), and writes them to `.env`. No more "check the AWS Console." (ADR-009)
- **Domain registration via Cloudflare Registrar** — buy a domain through Haku as a pre-DNS step. Registration creates the zone, then DNS records are created in it. Includes availability check, price display, and non-refundable purchase confirmation gate. (ADR-010)
- **Cloudflare Account ID** field in Cloud Providers — required for domain registration, validated as 32-char hex on save
- **Post-failure registration verification** — if the registration API times out, Haku re-checks availability to detect masked successes before reporting failure

### Changed
- **Partial success UI** — if infrastructure provisions but domain/DNS fails, Haku shows "partial success" with guidance instead of binary pass/fail
- **Output display** — infra details on the Done page are now grouped logically (server → DB → cache → platform → domain → DNS) with human-readable date formatting for domain expiry
- **AbortController integration** — polling loops cancel cleanly when the client disconnects instead of running for up to 15 minutes server-side
- **HTTP client** — single retry on transient errors (ECONNRESET, ETIMEDOUT) with 2s delay; per-call timeout override (60s for registration)
- **Polling jitter** — random interval variation prevents API throttling under concurrent use
- **ADR-009** corrected to reflect actual AbortController implementation
- **Cloudflare DNS** accepts `pending` zones from fresh domain registrations (previously required `active`)

### Fixed
- **Terminal failure detection** — RDS/ElastiCache polling breaks immediately on `failed`/`deleted`/`create-failed` states instead of waiting for timeout
- **Cleanup handling** — resources in "creating" state get a manual-cleanup warning instead of a silent deletion failure
- **Asymmetric token check** — all combinations of missing Cloudflare credentials now emit clear skip messages
- **404 availability fallback** — notes that availability is unconfirmed when domain is simply absent from the account
- **Registration row** hidden for Docker (local) deploys and invalid hostnames
- **`state.deployCmd`** declared in initial state object

### Security
- **CSRF protection** — `X-VoidForge-Request` custom header required on all POST requests; triggers CORS preflight to block cross-origin form submissions
- **DB_PASSWORD stripped from SSE** — password stays in `.env` only, never sent to the browser
- **AWS error sanitization** — ARNs, account IDs, and internal identifiers no longer leak to the client
- **`.env` file permissions** — `chmod 600` applied after generation, matching SSH key protection
- **Provisioning concurrency lock** — returns 429 if a run is already in progress
- **`encodeURIComponent(accountId)`** on all Cloudflare API URL interpolations — prevents path injection
- **Domain + Account ID validation** at client, server, and registrar layers
- **Random password suffix** replaces static `A1!` — uppercase + digit + special char now randomized
- **Hostname allowlist** documented in HTTP client module

---

## [3.2.0] - 2026-03-13

### Added
- **`/void` slash command** — Bombadil's Forge Sync. Self-update mechanism that fetches the latest VoidForge methodology from the scaffold branch, compares every shared file, shows a human-readable update plan, and applies changes while preserving project-specific customizations (PRD, logs, code, CLAUDE.md project section). Works on all three tiers.
- **Forge Keeper method doc** (`docs/methods/FORGE_KEEPER.md`) — Bombadil's protocol with 5-step update sequence, sub-agent roster (Goldberry, Treebeard, Radagast), shared file manifest, edge cases, and rollback guidance
- **Bombadil** (Tolkien) as 8th lead agent — Tom Bombadil, the Forge Keeper. Ancient, joyful, sings while he works. Tends the forge itself while others forge applications.
- **Goldberry** added to Tolkien character pool — River-daughter, upstream change detection
- ADR-008 (scaffold branch as update source for /void)

### Changed
- **Command count** updated from 7 to 8 across CLAUDE.md, README, and Holocron
- **`.claude/settings.json` excluded from Bombadil's sync scope** — user permissions and hooks are never overwritten (Picard's architecture review finding)
- **Semver comparison** in `/void` uses integer parsing, not string comparison — prevents incorrect results for versions like 3.10.x vs 3.9.x (Picard's architecture review finding)

---

## [3.1.0] - 2026-03-13

### Added
- **PRD-driven EC2 instance type selection** — PRD frontmatter `instance_type` field recommends t3.micro/small/medium/large based on project scope (database, cache, workers, payments, framework). Haku wizard shows the recommendation with cost estimates and allows override. RDS and ElastiCache sizes match automatically. (ADR-005)
- **Cloudflare DNS wiring** — new `hostname` field in Gandalf wizard and PRD frontmatter. After Haku provisions infrastructure, it auto-creates Cloudflare DNS records (A for VPS, CNAME for platforms) pointing your domain at the provisioned resource. Works with all deploy targets. Non-fatal — infrastructure still succeeds if DNS fails. (ADR-006)
- **Platform custom domain registration** — Haku now registers your hostname directly with Vercel, Railway, and Cloudflare Pages via their APIs, so the platform expects traffic on your domain
- **Caddyfile auto-HTTPS** — when hostname is set, generated Caddyfile uses the domain instead of `:80`, enabling automatic Let's Encrypt SSL via Caddy
- **Instance sizing module** (`wizard/lib/instance-sizing.ts`) — scoring heuristic with `recommendInstanceType()`, RDS/ElastiCache size mapping, swap scaling
- **DNS module** (`wizard/lib/dns/`) — Cloudflare zone lookup, record CRUD, post-provision orchestration, cleanup support
- ADRs 005 (instance type selection), 006 (DNS as post-provision step), 007 (hostname vs domain naming)

### Changed
- **Provision script swap size** scales with instance type (2GB for micro/small, 1GB for medium, none for large)
- **Cloudflare help text** updated to recommend Zone:DNS:Edit token permission for DNS wiring
- **Architecture doc** updated with DNS in system diagram and new ADR references

---

## [3.0.0] - 2026-03-12

### Added
- **The VoidForge Holocron** (`HOLOCRON.md`) — comprehensive 9-chapter user guide covering setup, first project walkthrough, build protocol, agent system, slash commands, code patterns, build journal, troubleshooting, and evolution. Named after the Star Wars knowledge devices.
- **Three-tier distribution** — VoidForge now ships on three branches: `main` (full wizard), `scaffold` (methodology only), `core` (ultra-light drop-in). Each has its own README, release, and install path.
- **Branch sync rules** in CLAUDE.md — shared methodology files (agents, methods, patterns, commands) must propagate across all three branches.

### Changed
- **README restructured** — stripped down to pure system reference (architecture, components, tables). All walkthrough and guide content moved to the Holocron.
- **Semver rules updated** — MAJOR now includes distribution model changes.
- **VoidForge is now designed for external adoption** — three install paths, comprehensive guide, clean separation between system reference and user guide.

---

## [2.8.0] - 2026-03-12

### Added
- **Wizard split into Gandalf (setup) and Haku (deploy)** — `npx voidforge init` launches the setup wizard, `npx voidforge deploy` launches the deploy wizard. Provisioning moved from Gandalf to Haku for cleaner separation of concerns.
- **Architecture docs** — `ARCHITECTURE.md` (system overview + diagram), `SCALING.md` (three-tier assessment), `TECH_DEBT.md` (prioritized catalog), `FAILURE_MODES.md` (component failure analysis with recovery procedures)
- **Security checklist** — `SECURITY_CHECKLIST.md`, reusable pre-deploy verification list covering secrets, vault, server, AWS provisioning, generated infrastructure, input validation, and dependencies

### Changed
- **Gandalf UI simplified** — removed provisioning steps (now in Haku). Gandalf focuses on vault, credentials, project setup, PRD, and scaffold creation.

### Fixed
- **QA fixes** for Gandalf/Haku restructure
- **UX polish** for Haku deploy wizard

### Security
- **DB/Redis security group ports** restricted from `0.0.0.0/0` (internet-open) to self-referencing security group (SG-only). Prevents database and Redis exposure to the internet.
- **Security headers** added to local server: `X-Frame-Options: DENY`, `Content-Security-Policy`, `Referrer-Policy`, `Permissions-Policy`
- **Error message sanitization** — API error responses no longer leak internal details (file paths, stack traces). Real errors logged server-side only.

---

## [2.7.0] - 2026-03-12

### Added
- **Real API provisioning** for all deploy targets — Vercel creates projects, Railway creates projects with database/Redis services, Cloudflare creates Pages projects with D1 databases, Static S3 creates buckets with website hosting. All verified with live infrastructure.
- **Shared HTTP client** for provisioner API calls with safe JSON parsing and slug generation
- **Crash recovery cleanup** — orphaned resources from process crashes can now be cleaned up after server restart via disk-persisted manifests
- **SSE keepalive** on provisioning and PRD generation streams — prevents proxy/VPN/browser timeouts with 15-second heartbeats and event IDs
- **VoidForge favicon** — purple void portal icon

### Changed
- **Generated deploy scripts** use release-directory strategy with atomic symlink swap, post-deploy health check, and automatic rollback on failure. Keeps last 5 releases.
- **Generated provision scripts** include fail2ban, SSH hardening (no root/password), unattended security updates, 2GB swap, and log rotation
- **Generated Caddyfile** includes HSTS, Content-Security-Policy, and Permissions-Policy headers
- **Generated Dockerfiles** include HEALTHCHECK instructions. Build errors no longer silenced.
- **Generated docker-compose** uses env var DB passwords (not hardcoded), internal-only ports for DB/Redis, and app health checks
- **Generated PM2 config** includes crash-loop protection and graceful reload timeouts
- **Done page** shows target-specific deploy commands, human-readable labels, clickable URLs, and free tier/cost info
- **Railway** terminology updated from "plugins" to "services"

### Fixed
- Safe JSON parsing on all external API responses — no more crashes on HTML error pages
- S3 cleanup paginates object listing — handles buckets with more than 1000 objects
- Slugify strips leading/trailing hyphens and provides fallback for empty slugs
- Cloudflare D1 database only created for SQLite projects, not Postgres
- Railway token validation works with API tokens (not just user sessions)
- Help button now expands provider accordion when collapsed
- Vercel and Cloudflare 409 (project exists) paths track resources for cleanup

### Security
- Generated Caddyfile: HSTS, CSP, Permissions-Policy headers
- Generated provision.sh: fail2ban, SSH hardening, firewall lock-down-first
- Generated docker-compose: DB passwords from environment variables, database/Redis ports internal-only
- All 4 ADRs now implemented: provision manifest, atomic vault writes, API response validation, SSE keepalive

---

## [2.6.0] - 2026-03-12

### Added
- **Auto-provisioning system** — wizard steps 8 + 9. After project creation, provision infrastructure for your chosen deploy target with live SSE-streamed progress.
- **Docker provisioner** — generates Dockerfile (multi-stage per framework), docker-compose.yml (with optional Postgres/MySQL/Redis services), and .dockerignore
- **AWS VPS provisioner** — full EC2 + security group + SSH key pair provisioning, with optional RDS (Postgres/MySQL) and ElastiCache (Redis). Generates deploy scripts (provision.sh, deploy.sh, rollback.sh), Caddyfile, and PM2 ecosystem config.
- **Config-only provisioners** — Vercel (vercel.json), Railway (railway.toml), Cloudflare (wrangler.toml), Static S3 (deploy-s3.sh)
- **Provisioning API** — `POST /api/provision/start` (SSE-streamed), `POST /api/provision/cleanup`, `GET /api/provision/incomplete` for crash recovery
- **Provision manifest** (ADR-001) — write-ahead resource tracking at `~/.voidforge/runs/` prevents orphaned AWS resources on crash
- **Pre-provisioning confirmation gate** — users see what will be created (and AWS cost warning) before clicking "Start Provisioning"
- **4 Architecture Decision Records** — provision manifest, atomic vault writes, API response validation, SSE keepalive
- **QA regression checklist** — 24-item checklist covering all provisioning flows, a11y, and mobile

### Changed
- **Vault writes are now atomic** (ADR-002) — write-to-temp + fsync + rename prevents credential loss on crash
- **Wizard expanded to 9 steps** — step 8 (provision with confirmation gate) and step 9 (done with infra details)
- **User-controlled transitions** — replaced auto-advance with explicit "Continue" button for a11y
- **Advanced setup card** — updated copy from "Infrastructure provisioning in future phases" to "Automatic infrastructure provisioning"

### Fixed
- **JS injection** in PM2 config via project names containing quotes — now uses `JSON.stringify`
- **S3 deploy script** — added missing `--exclude '*'` before `--include` flags
- **RDS/EC2 networking** — RDS instance now shares security group with EC2; DB/Redis ports added to SG
- **RDS password** — generated with `crypto.randomBytes` instead of predictable slug-based derivation
- **Skip provisioning** — now aborts in-flight fetch via AbortController
- **Cleanup race condition** — resources tracked per run ID instead of global mutable state
- **Security group cleanup** — retry loop with 10s intervals instead of insufficient 5s sleep
- **Empty SSH key** — validates AWS returns key material before writing file
- **Rollback script** — framework-aware restart commands (Django/Rails) instead of hardcoded npm/PM2

### Security
- **Atomic vault writes** prevent credential file corruption
- **DB password masked** on wizard done page (shown as bullet characters)
- **`.ssh/` added to .gitignore** — prevents accidental deploy key commits

---

## [2.5.0] - 2026-03-12

### Added
- **`/git` slash command** (`.claude/commands/git.md`) — Coulson's version & release management. 7-step flow: orient, analyze diffs, determine semver bump, write changelog, craft commit, verify consistency, optional push. 5 Marvel sub-agents (Vision, Friday, Wong, Rogers, Barton).
- **Release Manager protocol** (`docs/methods/RELEASE_MANAGER.md`) — Coulson's method doc with semver rules, changelog writing guidelines, commit message format, and verification checklist. Works for VoidForge and generic projects.
- **Coulson** (Marvel) as 7th lead agent — S.H.I.E.L.D.'s meticulous record-keeper for version management
- **Friday** added to Marvel character pool in NAMING_REGISTRY.md — AI assistant for versioning and automation

### Changed
- **CLAUDE.md** — added `/git` to Slash Commands table, Coulson to The Team table, Release Manager to Docs Reference
- **README.md** — added `/git` to commands table, Coulson to leads table, updated command count to 7, added git.md and RELEASE_MANAGER.md to repo structure
- **NAMING_REGISTRY.md** — added Coulson as Marvel lead (release), Friday to Marvel pool, updated rules and reserved list

---

## [2.4.0] - 2026-03-12

### Added
- **Cloud provider management** — new credential validation and storage for AWS, Vercel, Railway, and Cloudflare. Live API validation (STS, GraphQL, token verify) with vault-encrypted storage.
- **Deploy target selection** in wizard — choose deployment platform based on which providers have valid credentials. Docker always available.
- **Deploy target in `.env`** — scaffolded projects include `DEPLOY_TARGET` when a platform is selected

### Changed
- **Wizard UI overhaul** — redesigned credential step with provider cards, inline help, validation feedback. Expanded wizard flow with cloud and deploy target integration.
- **Vault concurrency** — all vault operations now serialized through a write queue to prevent race conditions on concurrent requests
- **Async key derivation** — PBKDF2 moved from sync to async to avoid blocking the event loop during encryption/decryption

### Fixed
- **Command injection** in browser launcher — replaced `exec` with `execFile` to prevent shell interpretation of URLs
- **Directory traversal** in static file server — replaced naive `..` stripping with `resolve()` + prefix check
- **SSE crash on client disconnect** — PRD generation stream now safely no-ops when the client has disconnected
- **CORS wildcard** — scoped `Access-Control-Allow-Origin` to the wizard's actual origin instead of `*`
- **Error detail leaking** — API error responses no longer include internal error bodies or stack traces
- **Password length cap** — vault unlock rejects passwords over 256 characters (DoS prevention)

### Removed
- **`claude` dependency** — removed unused package from dependencies

---

## [2.3.0] - 2026-03-12

### Added
- **Interactive setup wizard** (`wizard/`) — browser-based onboarding launched via `npm run wizard`. 5-step flow: credential vault, project setup, PRD creation, review, create.
- **Encrypted credential vault** (`wizard/lib/vault.ts`) — AES-256-GCM with PBKDF2 key derivation, stored at `~/.voidforge/vault.enc`. Cross-platform (macOS, Linux, Windows). Users manage the password however they like.
- **PRD generation with Claude** — streams a full PRD from a product idea using the best available model (auto-resolved via `/v1/models` API). Primary path in the wizard.
- **Bring Your Own PRD** tab — copy the generator prompt to clipboard for use with any AI (ChatGPT, Gemini, etc.), paste the result back with frontmatter validation.
- **Project scaffolding** — TypeScript port of `new-project.sh` logic with git init, CLAUDE.md substitution, .env generation.
- **CLI entry point** (`scripts/voidforge.ts`) — `npx voidforge init` launches the wizard.
- **Dynamic model resolution** (`wizard/lib/anthropic.ts`) — fetches available models from Anthropic API, picks newest Opus > Sonnet > Haiku. No hardcoded model IDs.
- **Frontmatter parser** (`wizard/lib/frontmatter.ts`) — YAML frontmatter extraction and validation for PRD documents.
- `tsconfig.json`, TypeScript and tsx dev dependencies.

### Changed
- **README.md** — wizard is now the primary Quick Start path. Manual setup is an alternative section. Repository structure updated to include `wizard/` and `scripts/voidforge.ts`.
- **`new-project.sh`** — comment noting `wizard/` exclusion from project copies.
- **`package.json`** — added `bin` field, `wizard` and `typecheck` scripts, `type: "module"`.

---

## [2.2.0] - 2026-03-12

### Changed
- **Project renamed to VoidForge** — "from nothing, everything." Replaced all references to `claude-scaffold` across README, scripts, package files, patterns, and version docs

---

## [2.1.1] - 2026-03-12

### Fixed
- **PostToolUse hook format** in `.claude/settings.json` — migrated from flat `command` field to nested `hooks` array structure per current Claude Code schema

---

## [2.1.0] - 2026-03-10

### Added
- **Build Journal system** (`docs/methods/BUILD_JOURNAL.md`) — persistent logging protocol for decisions, phase state, handoffs, errors. Every agent produces structured output in `/logs/`. Agents read journal files to recover state across sessions.
- **Context Window Management** (`docs/methods/CONTEXT_MANAGEMENT.md`) — session scoping guide, load-on-demand protocol, file size discipline, context checkpointing, emergency recovery.
- **Job queue pattern** (`docs/patterns/job-queue.ts`) — background jobs with idempotency keys, exponential backoff retry, dead letter queue, graceful shutdown. Includes BullMQ, Celery (Django), and Sidekiq (Rails) implementations.
- **Multi-tenancy pattern** (`docs/patterns/multi-tenant.ts`) — workspace scoping middleware, tenant-scoped services, role-based access control. Includes Next.js, Django, and Rails implementations.
- **Error handling pattern** (`docs/patterns/error-handling.ts`) — canonical error strategy: custom error types, global handler, response shape, operational vs programmer errors. Includes Express, Django, and Rails implementations.
- **Regression checklist template** in QA_ENGINEER.md — concrete table format with example entries, growth rules (2-3 items per feature, by launch: 30-50 items)
- **First-deploy pre-flight checklist** in `/devops` command — env vars, secrets, DB seeding, DNS, SSL, health check, rollback test, monitoring, security review
- **Phase rollback strategy** in BUILD_PROTOCOL.md and TROUBLESHOOTING.md — identify, revert, verify, isolate, fix, re-apply, log
- **Test execution timeline** in BUILD_PROTOCOL.md — authoritative table of which tests are written in which phase, all marked as breaking gates
- **Frontmatter validation table** in BUILD_PROTOCOL.md — valid values for each PRD field, defaults when missing
- **Parallel phase marking** in BUILD_PROTOCOL.md — each phase marked as parallelizable or strictly sequential
- **Multi-agent conflict resolution** in SUB_AGENTS.md — escalation protocol: check PRD, present trade-offs to user, document as ADR. Common conflict patterns with resolutions.
- **Framework-to-test-runner mapping** in TESTING.md — table covering Next.js, Express, Django, Rails, Go, Spring Boot
- **Batman scope clarification** — explicitly cross-cutting investigator + validator

### Changed
- **CLAUDE.md** — added build journal and context management references, "small batches" defined (max ~200 lines), error-handling.ts as canonical source, deduped from README
- **BUILD_PROTOCOL.md** — rewritten with specific verification gates (manual + automated criteria per phase), test execution timeline, rollback strategy, frontmatter validation, parallel phase marking, small batch definition (~200 lines), logging integrated at every phase
- **All 6 slash commands** — rewritten from pointers to self-contained executable sequences with inline steps, context setup, parallel analysis phases, logging instructions, and handoff protocols
- **SUB_AGENTS.md** — Agent tool section clarified (parallel analysis, not parallel coding), git coordination for multi-session, conflict resolution expanded with tiebreaker protocol
- **QA_ENGINEER.md** — added Scope section clarifying cross-cutting role, regression checklist template with format and rules
- **TESTING.md** — added framework-to-test-runner mapping table at top
- **TROUBLESHOOTING.md** — added phase rollback protocol section
- **All 4 original pattern files** — added framework adaptation notes (Express, Django, Rails, Vue, Svelte)
- **patterns/README.md** — updated table with all 7 patterns, framework columns
- **new-project.sh** — creates `/logs/` directory, copies all new files
- **DevOps slash command** — adapts based on PRD `deploy` target (vps/vercel/railway/docker/static), includes first-deploy checklist

---

## [2.0.0] - 2026-03-10

### Added
- Slash commands (`.claude/commands/`) — `/build`, `/qa`, `/security`, `/ux`, `/devops`, `/architect`
- Claude Code settings (`.claude/settings.json`) — permissions, deny list, quality gate hooks
- Testing protocol (`docs/methods/TESTING.md`) — automated testing pyramid
- Troubleshooting guide (`docs/methods/TROUBLESHOOTING.md`) — error recovery per phase
- MCP integration guide (`docs/methods/MCP_INTEGRATION.md`)
- Code patterns (`docs/patterns/`) — api-route, service, component, middleware
- Feedback loop (`docs/LESSONS.md`)
- PRD frontmatter, conditional build phases, project sizing profiles
- Phase verification gates, single-session parallelism in SUB_AGENTS.md
- Per-directory CLAUDE.md convention
- Behavioral directives on all 6 agent method docs

### Changed
- CLAUDE.md restructured to dense operational instructions
- QA_ENGINEER.md integrated automated testing
- BUILD_PROTOCOL.md added conditional skip rules and verification gates

---

## [1.1.0] - 2026-03-10

### Changed
- Renamed DevOps lead from Motoko to Kusanagi across all files

---

## [1.0.0] - 2026-03-10

### Added
- Root context file (`CLAUDE.md`), 13-phase Build Protocol
- 6 specialist agent protocols (Galadriel, Stark, Batman, Kenobi, Picard, Kusanagi)
- 150+ named characters across 6 universes
- Sub-Agent Orchestrator, PRD Generator, PRD template, QA state file
- Project initialization script
