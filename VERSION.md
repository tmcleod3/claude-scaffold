# Version

**Current:** 23.8.4

## Versioning Scheme

This project uses [Semantic Versioning](https://semver.org/):

- **MAJOR** — Breaking changes to method doc structure, agent naming conventions, build protocol phases, or distribution model
- **MINOR** — New method docs, new agents/characters, new features to VoidForge
- **PATCH** — Typo fixes, clarifications, minor doc improvements

## Version History

| Version | Date | Summary |
|---------|------|---------|
| 23.8.2 | 2026-04-12 | Silver Surfer Gate in CLAUDE.md — root-level enforcement after 3 documented skip incidents |
| 23.8.1 | 2026-04-12 | Silver Surfer anti-skip hardening — NO EXCEPTIONS enforcement + field report learning |
| 23.8.0 | 2026-04-12 | The Personality — heralding one-liners for all 264 agents. Character-authentic announcements on every agent deployment. ADR-049. |
| 23.7.3 | 2026-04-12 | Cosmic Heraldings — 14 Silver Surfer one-liners announced at random before each roster scan |
| 23.7.2 | 2026-04-12 | Silver Surfer explicit Agent tool invocation — guaranteed to work in every environment |
| 23.7.1 | 2026-04-12 | Silver Surfer launches as real Agent sub-process (subagent_type: Silver Surfer), not CLI shell-out. Mandatory on every command. |
| 23.7.0 | 2026-04-12 | The Decount — eliminate hardcoded agent counts from 30+ files. Single source of truth: AGENT_CLASSIFICATION.md. |
| 23.6.1 | 2026-04-12 | Gauntlet fix: 30+ stale "263 agents" → 264 across commands, methods, docs |
| 23.6.0 | 2026-04-12 | The Silver Surfer — Herald invocation bridge, CLI subcommand, agent #264, end-to-end dispatch pipeline. ADR-048. Campaign 38. |
| 23.5.4 | 2026-04-12 | Command-doc sync: build.md Phase 12.75, ux.md screenshots, qa.md dynamic counts |
| 23.5.3 | 2026-04-12 | Fix 201 broken subagent_type refs (filename→YAML name) + /campaign as default start command |
| 23.5.2 | 2026-04-12 | /void auto-cleanup ~/.claude/ duplicates + git init stack trace fix |
| 23.5.1 | 2026-04-12 | Fix CLI self-upgrade: wrong package name (voidforge → thevoidforge) + stale npx cache on re-exec |
| 23.5.0 | 2026-04-12 | The Herald — intelligent agent dispatch: Haiku pre-scan, agent registry, 40 tags, --focus flag, 14 commands wired. ADR-047. Campaign 37. |
| 23.4.1 | 2026-04-12 | Gauntlet security fix — XSS escaping in blueprint banner, ROADMAP staleness, lobby a11y |
| 23.4.0 | 2026-04-12 | The Remediation — wizard UI audit: 3 critical API fixes, 4 WCAG a11y fixes, retired --blitz cleanup, content accuracy, 7 UX improvements. -2,400 lines legacy code. ADR-046. Campaign 36. |
| 23.3.1 | 2026-04-12 | Wizard UI fix — "Files to be created" list matched actual init output |
| 23.3.0 | 2026-04-10 | The Coverage + The Splitting — 599 new tests (741→1340, 77% coverage), 17 orphans purged, 9 oversized files split into 25 focused modules, field report #297 triaged. Campaigns 34+35. |
| 23.1.0 | 2026-04-09 | The Injection — knowledge injection into 35 agent definitions, 6 knowledge flow breaks closed (ADR-045), debrief→agent promotion path, vault agent recommendations, scaffold migration, distribution pipeline fixes. Campaign 33. |
| 23.0.0 | 2026-04-09 | The Materialization — 263 Claude Code subagent definitions with 3-tier model routing (Opus/Sonnet/Haiku), 4-category tool restrictions, description-driven dynamic dispatch. 18 commands migrated, 13 method docs updated. ADR-044. Campaign 32, 8 missions. |
| 22.2.0 | 2026-04-09 | The Polish — first-run onboarding UX, portfolio per-project reads, legacy route deprecation (19 routes, sunset July 2026), growth tutorial prerequisites, 263-agent accuracy pass, dynamic agent dispatch (ADR-042), max-by-default flag inversion (ADR-043). Campaign 31, 7 missions. |
| 22.1.0 | 2026-04-09 | The Migration — treasury migration CLI, treasury summary cache (O(1) reads), per-project vault with HKDF-SHA256 key derivation. 45 new tests. Campaign 30, 3 missions. |
| 22.0.0 | 2026-04-09 | The Scope — project-scoped dashboards, per-project financial isolation, router param matching, ProjectContext middleware, WebSocket subscription rooms, 5-tab project dashboard, dual-daemon guard, RBAC fixes. 696 tests. 2 campaigns (28+29), 15 missions, 52 files changed. ADR-040 + ADR-041. |
| 21.0.0 | 2026-04-08 | The Extraction — wizard becomes standalone npm package. Monorepo (packages/voidforge + packages/methodology). CLI router with 12 commands. .voidforge marker file. Project creation (headless init). Extension system (danger-room + cultivation). Methodology update (replaces /void git-fetch). Daemon aggregator for multi-project heartbeat. v20.x migration with rollback. 675 tests (618→675). ADR-038. |
| 20.2.0 | 2026-04-03 | Graceful Tier Degradation — scaffold cleanup (408→134 files), Spring Cleaning /void migration, tier gate sentinel fix, /grow Phase 1-3 fallback, /cultivation graceful skip, 6 field reports triaged (#271-#276, 11 methodology fixes). |
| 20.1.1 | 2026-04-02 | Parallel Agent Standard, ID Space Audit, Safety Parameter Audit, Maul mandatory gate, 7 field report triages (#264-#270). |
| 20.1.0 | 2026-04-02 | Kongo Engine Integration — 10 modules, 119 tests, 37th pattern, Infinity Gauntlet (3 Critical + 10 High fixed), 5 field reports triaged (14 methodology fixes), Operational Learnings system activated. |
| 19.5.0 | 2026-03-31 | The Blueprint Path — Fourth entry path for pre-written specs: /blueprint command, document discovery, CLAUDE.md merge, PRD validation, wizard auto-detection, PRD template. 499 tests (454→499). Gauntlet: path traversal fix, route registration, UX dead-end fix. |
| 19.4.0 | 2026-03-30 | The Last Mile — Campaign execution wiring: 4 campaign adapters (sandbox, Google, Meta, TikTok), 5 heartbeat stubs → real handlers, status polling, Danger Room live metrics. 454 tests (406→454). Victory Gauntlet: GAQL injection fix, path traversal fix, sandbox cache. |
| 19.3.0 | 2026-03-30 | The Field Surgeon — 22 field reports triaged, 13 fixes promoted into 6 method docs, 5 patterns documented (35 total), System Protocol identity headers, assessment remediation (18→6 findings). |
| 19.2.0 | 2026-03-26 | The Wider Net — TikTok billing adapter, AdPlatform type widened to 7 platforms, adapter factory extensibility proven. 385 total tests. |
| 19.1.0 | 2026-03-26 | The Live Wire — production intelligence: adapter factory, Mercury/billing wiring, auto-funding execution, WAL recovery, 66 new financial tests (380 total). All 9 Muster-identified gaps resolved. |
| 19.0.0 | 2026-03-25 | The Funding Rail — Stablecoin treasury to ad billing: Circle, Mercury, Google/Meta billing adapters, 8 heartbeat jobs, 6 circuit breakers, funding policy engine, treasury planner, reconciliation, reporting. 14 new financial modules, 3 new patterns (35 total). |
| 18.2.0 | 2026-03-25 | The Dogfood — browser intelligence on VoidForge: 6 a11y heading fixes, CDN fallback for tower, security verified clean |
| 18.1.0 | 2026-03-25 | The Eyes — browser-review.ts pattern, console error capture, behavioral walkthroughs, security inspection. Browser intelligence in QA, UX, Security, Gauntlet method docs. 32 patterns. |
| 18.0.0 | 2026-03-24 | The Proving Ground — Playwright E2E + axe-core a11y (21 browser tests), browser verification in 6 method docs, e2e-test.ts pattern, 315 total tests |
| 17.3.0 | 2026-03-24 | The Muster — --muster flag (full 9-universe deployment), flag nomenclature (8 fixes across 13 files), CLAUDE.md flag taxonomy (3 tiers) |
| 17.2.0 | 2026-03-24 | The Security Test Pass — 101 new tests for 7 P0 security modules (294 total), 0 TypeScript errors |
| 17.1.0 | 2026-03-24 | The Gauntlet Cleanup — HMAC vault comparison, negative spend clamping, TypeScript 0 errors, tsc in CI, 26 new tests (193 total), 3 ADRs, sandbox instance scoping |
| 17.0.0 | 2026-03-24 | The Complete Implementation — No Stubs Doctrine, P0/P1 security fixes, Cultivation activation (sandbox + Stripe adapters, heartbeat wiring, growth tabs), 74 new tests (167 total), 8 stub files deleted |
| 16.1.0 | 2026-03-24 | The Hardened Methodology — migration safety, data pipelines, backtest/execution patterns, dependency health, load testing, branch CI |
| 16.0.0 | 2026-03-24 | The Psychohistorians — AI Intelligence Layer: Foundation universe, Hari Seldon, /ai command, 6 AI patterns, AI_INTELLIGENCE.md, integrated into 8 commands |
| 15.3.0 | 2026-03-23 | The Chronicle — 9 public docs updated to v15.2.1 (76 staleness issues fixed) |
| 15.2.1 | 2026-03-23 | Inbox triage #147-#148: 4 methodology fixes + 3 lessons from field reports |
| 15.2.0 | 2026-03-23 | The Cleanup — tower-auth split (636→3 modules), SSH SG restriction post-provisioning |
| 15.1.0 | 2026-03-23 | The Hardening — Infinity Gauntlet (47 fixes), vault rate-limit + auto-lock, HMAC key rotation, sendJson consolidation, pattern proxy modules, batch health poller, TOTP clock skew recovery, vitest (91 tests), UX enchantments |
| 15.0.0 | 2026-03-22 | The Last Mile — /deploy command, campaign auto-deploy, /git --deploy, drift detector |
| 14.0.0 | 2026-03-22 | The Day-0 Engine — Cultivation onboarding redesign: treasury, revenue, ad platforms, budget, creatives, tracking, launch |
| 13.1.0 | 2026-03-22 | Dashboard Polish — break circular import, CORS/CSP LAN, header context gauge, consolidate private IP |
| 13.0.0 | 2026-03-22 | The Living Dashboard — consolidation, 3-tier UX, LAN mode, Status Line bridge, agent ticker, new panels |
| 12.6.4 | 2026-03-22 | Inbox triage #130-131 — encryption egress audit, GROUP BY compatibility, v14.0 Day-0 Engine roadmap |
| 12.6.3 | 2026-03-22 | Inbox triage #129 — acceptance criteria enforcement, gitignore warning, blitz pre-flight, --adr-only mode |
| 12.6.2 | 2026-03-22 | v13.0 roadmap — LAN mode, Danger Room bug fixes + feature proposals from field reports #127-128 |
| 12.6.1 | 2026-03-22 | Inbox triage #126 — Learned Rules for campaign checkpoints, historical data validation, PRD evolution workflow |
| 12.6.0 | 2026-03-22 | Inbox triage #123-125 — /assess command, --assess gauntlet flag, stub detection, migration check, auth-from-day-one, process manager discipline |
| 12.5.0 | 2026-03-19 | The Full Roster — agent deployment manifests: /review gets 20+ agents, /devops gets 16, /assemble gets 80+ documented |
| 12.4.2 | 2026-03-19 | Tier-gating: auto-pull wizard/ for Full-tier commands, CLAUDE.md integrity checks, 5 methodology improvements from field reports |
| 12.4.1 | 2026-03-18 | Missing /dangerroom command, community health files, WORKSHOP.md, inbox triage (#104), branch sync |
| 12.4.0 | 2026-03-18 | The Autonomy — route optimizer, Tier 2/3 autonomy, circuit breakers, kill switch, deploy freeze |
| 12.3.0 | 2026-03-18 | The Navigator — Paris's route optimization (included in v12.4 release) |
| 12.2.0 | 2026-03-18 | The Bridge — Chakotay's correlation engine, prediction tracking, cross-pipeline data flow |
| 12.1.0 | 2026-03-18 | The Analyst — Seven's gap analysis, campaign proposal generator, Tier 1 advisory, Deep Current Danger Room tab |
| 12.0.0 | 2026-03-18 | The Scanner — Deep Current: autonomous campaign intelligence, /current command, site scanner, situation model, cold start intake |
| 11.3.0 | 2026-03-18 | The Heartbeat — /portfolio command, Mercury/Brex adapters, anomaly detection, encrypted backup, service install, desktop notifications, Heartbeat tab |
| 11.2.0 | 2026-03-18 | The Distribution — 6 ad platform adapters, campaign state machine, spend execution pipeline, compliance framework, Ad Campaigns tab |
| 11.1.0 | 2026-03-18 | The Treasury — Dockson's financial operations: heartbeat daemon, reconciliation engine, revenue adapters, /treasury command, Treasury tab |
| 11.0.0 | 2026-03-18 | The Consciousness — Cosmere Growth Universe: 18 agents, /grow 6-phase protocol, /cultivation install, financial vault + TOTP 2FA, safety tiers, Danger Room growth tabs |
| 10.2.0 | 2026-03-17 | Unbuilt features: Natural Language Deploy, Methodology A/B Testing, Prophecy Visualizer |
| 10.1.0 | 2026-03-17 | Danger Room data feeds + feature enforcement: live WebSocket, confidence scoring in commands, agent debates, Living PRD gates |
| 10.0.1 | 2026-03-17 | Frontier features: confidence scoring, agent debates, adversarial PRD, living PRD, cross-project memory, build archaeology |
| 10.0.0 | 2026-03-17 | The Danger Room — mission control dashboard with 5 core panels, WebSocket real-time feed, agent activity ticker |
| 9.3.0 | 2026-03-17 | The Game Forge — game build protocol, 3 game patterns, game QA/UX checklists, 4 game agents. Distribution BLOCKED. |
| 9.2.0 | 2026-03-17 | The Mobile Forge — iOS/Android methodology, mobile patterns, 3 conditional agents. Provisioner BLOCKED (needs real API integration). |
| 9.1.0 | 2026-03-17 | The Multi-Language Forge (Python) — Django + FastAPI deep dives in all 8 patterns + build protocol Python path |
| 9.0.0 | 2026-03-17 | The Field-Tested Forge — META_WORKFLOW.md, pattern evolution data collection, /imagine API key persistence |
| 8.3.0 | 2026-03-16 | The Autonomy — /campaign --autonomous with git tags, critical-finding rollback, 5-mission checkpoints |
| 8.2.0 | 2026-03-16 | The Evolution — self-improving methodology (Wong promotion analysis), custom sub-agents (CUSTOM_AGENTS.md) |
| 8.1.2 | 2026-03-16 | Deep Roster command wiring — extended agents integrated into /qa, /security, /ux, /architect, /gauntlet, /assemble, /campaign commands |
| 8.1.1 | 2026-03-16 | The Deep Roster Phase 2 — 40+ extended agents across DC, Star Wars, Tolkien, Anime, Marvel, Star Trek |
| 8.1.0 | 2026-03-16 | The Deep Roster Phase 1 — 10 agents activated: Troi, Padmé, Celeborn, Worf, Riker, Torres, Cyborg, Raven, Wonder Woman, Valkyrie |
| 8.0.1 | 2026-03-16 | Victory Gauntlet hardening — 16 fixes, engines >=20.11.0, Quality Reduction Anti-Pattern, 9 methodology fixes from #46-#53 |
| 8.0.0 | 2026-03-16 | The Hive Mind — Agent Memory (active LESSONS.md read-back), Conflict Prediction (Phase 0.5), /prd command |
| 7.7.0 | 2026-03-16 | The Housekeeping — architecture doc refresh, server auto-restart detection, COMPATIBILITY.md, context pressure fix |
| 7.6.0 | 2026-03-16 | The Vault Pipeline — deploy --env-only, standalone vault reader, PTY cleanup, engines field |
| 7.5.3 | 2026-03-16 | Triage #42-#44 — vault key naming, outbound URL safety, accordion a11y, v7.7 roadmap |
| 7.5.2 | 2026-03-16 | HOLOCRON credentials flow docs + v7.6 Vault Pipeline roadmap |
| 7.5.1 | 2026-03-16 | 19 fixes from #36-#40 — vault awareness, anonymity invariant, deployment verification, cross-file deps, WCAG contrast |
| 7.5.0 | 2026-03-16 | Thumper Command Center — inline keyboard, bot personalization, water-rings fix, command↔doc sync |
| 7.4.1 | 2026-03-16 | 15 fixes from #31-#34 — thumper sync, parallel agents, cascade review, crypto check, proxy SSRF, campaign end debrief |
| 7.4.0 | 2026-03-16 | The Field Hardening — 20 methodology fixes from 5 field reports, runtime smoke test, first-run checklist, campaign-mode pipeline |
| 7.3.2 | 2026-03-16 | 13 methodology fixes from field reports #21-#25 — blitz gate, tier UI audit, auth retrofit, timestamps |
| 7.3.1 | 2026-03-16 | Blitz auto-debrief — /campaign --blitz files field reports after every mission |
| 7.3.0 | 2026-03-16 | Avengers Tower Overhaul — ws library, vault unlock, build-state Lobby, /campaign --blitz, IPv6 fix |
| 7.2.1 | 2026-03-15 | Fix Avengers Tower terminal crash on Node.js v24 (node-pty 1.1.0 → 1.2.0-beta.12) |
| 7.2.0 | 2026-03-15 | The Gauntlet Forging — 31 code fixes, 11 methodology fixes, 7 enchantments, WCAG AA, v8.0+ roadmap |
| 7.1.0 | 2026-03-15 | The Redesign — three-act wizard flow, operations menu, Resilience Pack, simple/advanced eliminated |
| 7.0.1 | 2026-03-15 | Three-act wizard redesign plan, Resilience Pack reclassification, 9 methodology fixes from field reports |
| 7.0.0 | 2026-03-15 | The Penthouse — multi-user RBAC, per-project ACLs, linked services, coordinated deploys, rollback, cost tracker, agent memory |
| 6.5.1 | 2026-03-15 | The Arthurian Retcon — Merlin→Gandalf, Camelot→Avengers Tower, Great Hall→The Lobby, Round Table→The Penthouse |
| 6.5.0 | 2026-03-15 | Avengers Tower Remote — 5-layer security, TOTP 2FA, self-deploy, audit trail, two-password architecture |
| 6.0.0 | 2026-03-15 | Avengers Tower Multi — The Lobby dashboard, project registry, health poller, import flow, SSRF protection |
| 4.4.0 | 2026-03-15 | The Imagination Release — /imagine (Celebrimbor), /debrief (Bashir), 2 new leads, 7 new sub-agents |
| 4.2.0 | 2026-03-14 | The DX Release — Prisma types, OpenAPI docs, ERD generation, integration templates, database seeding |
| 4.1.0 | 2026-03-14 | The Observability Release — deploy logs, cost estimation, health monitoring, Sentry integration |
| 4.0.0 | 2026-03-14 | The Reliability Release — pre-deploy build step, CI/CD generation, env validation, Railway API migration, credential scoping |
| 3.9.1 | 2026-03-14 | Roadmap + VoidForge PRD + /campaign --plan mode for roadmap updates |
| 3.9.0 | 2026-03-14 | Sisko's Danger Room — /campaign command, autonomous PRD-to-product mission sequencing, 11th lead agent |
| 3.8.0 | 2026-03-14 | Haku's Last Mile — end-to-end deploy automation for all 6 targets, GitHub integration, SSH deploy with rollback |
| 3.7.0 | 2026-03-14 | Fury's Initiative — /assemble full pipeline, /thumper Telegram bridge, Dune universe, 10 leads, 12 commands |
| 3.6.0 | 2026-03-14 | Chani's Worm Rider — /thumper Telegram bridge, Dune universe, Kongo.io methodology upgrades |
| 3.5.3 | 2026-03-14 | /thumper rename + cross-methodology hardening + Kongo.io lessons |
| 3.5.0 | 2026-03-14 | Chani's Worm Rider — /thumper Telegram bridge with Gom Jabbar auth, Dune universe (9th lead), 170+ characters |
| 3.4.0 | 2026-03-13 | 1M Context Adaptation — double-pass reviews, 3 new sub-agents, /test and /review commands, parallelized analysis |
| 3.3.1 | 2026-03-13 | Fix silent PRD truncation — model-aware max tokens, truncation detection and UI warning |
| 3.3.0 | 2026-03-13 | The Last Mile Complete — async resource polling, domain registration, security hardening (43 review findings resolved) |
| 3.2.0 | 2026-03-13 | Bombadil's Forge Sync — /void self-update command, Forge Keeper method doc, 8th lead agent |
| 3.1.0 | 2026-03-13 | The Last Mile — EC2 instance sizing, Cloudflare DNS wiring, platform domain registration |
| 3.0.0 | 2026-03-12 | The VoidForge Holocron, three-tier distribution (main/scaffold/core), README as system reference |
| 2.8.0 | 2026-03-12 | Gandalf/Haku wizard split, architecture review docs, security audit with SG hardening |
| 2.7.0 | 2026-03-12 | Real provisioning for all 6 targets, hardened infra scripts, SSE keepalive, crash recovery loop complete |
| 2.6.0 | 2026-03-12 | Auto-provisioning — Docker, AWS VPS (EC2/RDS/ElastiCache), config stubs, crash recovery manifest, atomic vault writes |
| 2.5.0 | 2026-03-12 | /git command — Coulson's version & release management with semver, changelog, and commit automation |
| 2.4.0 | 2026-03-12 | Wizard cloud providers, deploy targets, security hardening, UI overhaul |
| 2.3.0 | 2026-03-12 | Interactive setup wizard — browser-based onboarding with encrypted credential vault, PRD generation, project scaffolding |
| 2.2.0 | 2026-03-12 | Rename project to VoidForge — "from nothing, everything" |
| 2.1.1 | 2026-03-12 | Fix PostToolUse hook format — migrate from flat `command` to nested `hooks` array per Claude Code schema |
| 2.1.0 | 2026-03-10 | Build journal, context management, enriched slash commands, specific verification gates, test timeline, framework adaptations, rollback strategy, conflict resolution, new patterns (job-queue, multi-tenant, error-handling), regression checklist template, first-deploy checklist, dedup CLAUDE.md/README, parallel phase marking, Batman scope clarification |
| 2.0.0 | 2026-03-10 | Slash commands, testing protocol, code patterns, conditional build phases, Agent tool orchestration, troubleshooting, hooks, MCP guide, personality calibration, feedback loop, PRD frontmatter, CLAUDE.md restructure |
| 1.1.0 | 2026-03-10 | Rename DevOps lead agent from Motoko to Kusanagi |
| 1.0.0 | 2026-03-10 | Initial release — 6 agent protocols, 150+ named characters, 13-phase build protocol |
