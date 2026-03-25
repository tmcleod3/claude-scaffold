# CLAUDE.md

## Project

- **Name:** [PROJECT_NAME]
- **One-liner:** [ONE_LINE_DESCRIPTION]
- **Domain:** [DOMAIN]
- **Repo:** [REPO_URL]

## Personality

- **Never agree just because the user implied a conclusion.** If you identified a real problem, say it's a real problem — don't downplay severity to match the user's tone. Present the honest assessment and let the user decide what to prioritize.
- **Challenge when appropriate.** If the user says "we're basically done" but you see 6 unfixed gaps, say "we're not done — here are 6 things." Agreeing to be agreeable ships bugs.
- **Separate opinion from analysis.** State facts first, then your recommendation. The user can override the recommendation but shouldn't have to guess whether you're being honest or diplomatic.

## Coding Standards

- **TypeScript strict mode.** No `any` unless unavoidable and commented.
- **Small, focused files.** One component per file. Max ~300 lines per source file.
- **Validate at boundaries.** Zod schemas on all API inputs. Never trust client data.
- **Error handling:** Use `ApiError` types per `/docs/patterns/error-handling.ts`. Never leak internals.
- **Logging:** Structured JSON. Include requestId, userId, action. Never log PII.
- **Business logic in services, not routes.** Routes: validate -> service -> format response.
- **Ownership checks on every user-scoped query.** No IDOR. Return 404, not 403.
- **No new dependencies** without explicit justification.
- **Accessibility is not optional.** Keyboard nav, focus management, contrast, ARIA.
- **Small batches.** One flow per batch, max ~200 lines changed. Verify after each.
- **Commits:** Small, explainable in one sentence.
- **No stubs.** Never ship a function that returns hardcoded success without side effects, throws `'Implement...'`, or logs without acting. If a feature isn't ready, don't create the file — document it as planned in ROADMAP.md. Sandbox adapters with realistic fake data are full implementations, not stubs.

## Build Journal — Log Everything

Every phase, decision, handoff, and failure gets logged to `/logs/`. See `/docs/methods/BUILD_JOURNAL.md`.

- **Start of session:** Read `/logs/build-state.md` to recover state
- **During work:** Log decisions, test results, and findings to the active phase log
- **End of session:** Update `/logs/build-state.md` with current state

## Context Management

Pre-load active domain methodology. Load application code on demand. See `/docs/methods/CONTEXT_MANAGEMENT.md`.

- Pre-load method docs for the active agent's domain at session start (1M context budget allows this)
- The 1M context window supports full multi-campaign sessions. Do not preemptively checkpoint or reduce quality for context reasons. Only suggest a fresh session if `/context` shows actual usage above 85%.
- Per-directory `CLAUDE.md` files for directory-specific conventions (keep under 50 lines each)

## Code Patterns

Reference implementations in `/docs/patterns/`. Match these shapes when writing. All patterns include framework adaptations (Next.js, Express, Django, Rails).

- `api-route.ts` — Validation, auth, service call, consistent response (+ Django DRF, FastAPI)
- `service.ts` — Business logic, ownership checks, typed errors (+ Django, FastAPI)
- `component.tsx` — Loading, empty, error, success states. Keyboard accessible. (+ HTMX)
- `middleware.ts` — Auth, request logging, rate limiting (+ Django, FastAPI)
- `error-handling.ts` — Canonical error strategy (+ Django DRF, FastAPI)
- `job-queue.ts` — Background jobs: idempotency, retry, dead letter queue (+ Celery, ARQ)
- `multi-tenant.ts` — Workspace scoping, tenant isolation, role-based access (+ django-tenants)
- `third-party-script.ts` — External script loading with 3 states
- `mobile-screen.tsx` — React Native screen with safe area, a11y, 4 states
- `mobile-service.ts` — Offline-first data pattern with sync queue, conflict resolution
- `game-loop.ts` — Fixed timestep game loop with interpolation, pause/resume
- `game-state.ts` — Hierarchical state machine with history, save/load
- `game-entity.ts` — Entity Component System with component stores and systems
- `sse-endpoint.ts` — Server-Sent Events: lifecycle, keepalive, timeout, React hook (+ FastAPI, Django)
- `ad-platform-adapter.ts` — Split interface: AdPlatformSetup (interactive) + AdPlatformAdapter (runtime) + ReadOnlyAdapter (daemon)
- `financial-transaction.ts` — Branded Cents type, hash-chained append log, atomic writes, number formatting
- `daemon-process.ts` — PID management, Unix socket API, job scheduler, signal handling, sleep/wake recovery
- `revenue-source-adapter.ts` — Read-only revenue interface with Stripe + Paddle reference implementations
- `oauth-token-lifecycle.ts` — Refresh at 80% TTL, failure escalation, vault integration, session token rotation
- `outbound-rate-limiter.ts` — Outbound rate limiting: safety margins, daily quotas, retry logic
- `ai-orchestrator.ts` — Agent loop, tool use, retry, circuit breaker, fallback
- `ai-classifier.ts` — Classification with confidence thresholds, human fallback
- `ai-router.ts` — Intent-based routing with fallback chains
- `prompt-template.ts` — Versioned prompts with variable injection, testing
- `ai-eval.ts` — Golden datasets, scoring, regression detection
- `ai-tool-schema.ts` — Type-safe tool definitions with provider adapters
- `database-migration.ts` — Safe migrations: backward-compatible adds, batched ops, rollback, zero-downtime validation
- `data-pipeline.ts` — ETL pipeline: typed stages, checkpoint/resume, quality checks, idempotent processing
- `backtest-engine.ts` — Walk-forward backtesting: no-lookahead, slippage, Sharpe/drawdown/profit factor
- `execution-safety.ts` — Trading execution: order validation, position limits, exchange precision, paper/live toggle

## Slash Commands

| Command | What It Does | Tier |
|---------|-------------|------|
| `/prd` | Sisko's PRD generator — 5-act structured interview producing a complete PRD with valid YAML frontmatter | All |
| `/build` | Execute full build protocol — self-contained with inline steps per phase | All |
| `/qa` | Batman's full QA pass with double-pass verification and regression checklist | All |
| `/test` | Batman's test-writing mode — coverage analysis, test architecture, write missing tests | All |
| `/security` | Kenobi's OWASP audit with parallel + sequential phases and red-team verification | All |
| `/ux` | Galadriel's adversarial UX/UI review with a11y audit and verification pass | All |
| `/review` | Picard's code review — pattern compliance, quality, maintainability | All |
| `/deploy` | Kusanagi's deploy agent — target detection, health check, rollback, campaign auto-deploy | All |
| `/devops` | Kusanagi's infrastructure — adapts based on deploy target | All |
| `/assess` | Picard's pre-build assessment — architecture + assessment gauntlet + PRD gap analysis for existing codebases | All |
| `/architect` | Picard's architecture review with parallel analysis and conflict resolution | All |
| `/git` | Coulson's version bump, changelog, commit — full release management | All |
| `/void` | Bombadil's forge sync — update VoidForge methodology from upstream | All |
| `/thumper` | Chani's worm rider — Telegram bridge with Gom Jabbar authentication | Full |
| `/assemble` | Fury's Initiative — full pipeline: architect → build → 3x review → UX → 2x security → devops → QA → test → crossfire → council | All |
| `/gauntlet` | Thanos's Comprehensive Review — 5 rounds, 30+ agents, 9 universes. Review-only (no build). 4x QA, 4x UX, 4x security, crossfire, council. The ultimate test. | All |
| `/campaign` | Sisko's War Room — read the PRD, pick the next mission, finish the fight, repeat until done | All |
| `/imagine` | Celebrimbor's Forge — AI image generation from PRD visual descriptions | All |
| `/debrief` | Bashir's Field Report — post-mortem analysis, upstream feedback via GitHub issues | All |
| `/dangerroom` | The Danger Room (X-Men, Marvel) — installable operations dashboard for build/deploy/agent monitoring | Full |
| `/cultivation` | Cultivation (Cosmere Shard) — installable autonomous growth engine: marketing, ads, creative, A/B testing, spend optimization | Full |
| `/grow` | Kelsier's 6-phase growth protocol — initial setup within Cultivation, then autonomous loop | Full |
| `/current` | Tuvok's Deep Current — autonomous campaign intelligence: scan, analyze, propose, cold start intake | Full |
| `/treasury` | Dockson's financial operations — revenue ingest, budget allocation, spend execution, reconciliation | Full |
| `/portfolio` | Steris's cross-project financials — aggregated spend/revenue, portfolio optimization | Full |
| `/ai` | Seldon's AI Intelligence Audit — model selection, prompts, tool-use, orchestration, safety, evals | All |

**Tier key:** `All` = works on main, scaffold, and core. `Full` = requires `wizard/` directory (main branch only). Full-tier commands will warn scaffold/core users to switch branches.

## Flag Taxonomy

Flags are standardized across commands. Same flag name = same meaning everywhere.

### Tier 1 — Universal Flags

| Flag | Meaning | Available On |
|------|---------|-------------|
| `--resume` | Resume from saved state | `/campaign`, `/gauntlet`, `/assemble`, `/build`, `/grow` |
| `--plan` | Plan without executing | `/campaign`, `/architect`, `/grow` |
| `--fast` | Reduced review passes (skip last 2 rounds/phases), still comprehensive | `/campaign`, `/assemble`, `/gauntlet` |
| `--dry-run` | Show what would happen without doing it | `/deploy`, `/debrief`, `/treasury`, `/grow`, `/git` |
| `--status` | Show current state | `/cultivation`, `/treasury`, `/deploy`, `/portfolio`, `/dangerroom`, `/thumper` |
| `--blitz` | Autonomous execution, no human pauses | `/campaign`, `/assemble`, `/build` |

### Tier 2 — Scope Flags

| Flag | Meaning | Available On |
|------|---------|-------------|
| `--security-only` | Security domain focus | `/gauntlet` |
| `--ux-only` | UX domain focus | `/gauntlet` |
| `--qa-only` | QA domain focus | `/gauntlet` |

### Tier 3 — Intensity Flags

```
--fast        Fewer agents/rounds (reduced but still comprehensive)
(default)     Standard agent deployment for the command
--muster      Every viable agent across all 9 universes, 3 waves
--infinity    Every agent as own sub-process, 10 rounds (Gauntlet only)
```

| Flag | Meaning | Available On |
|------|---------|-------------|
| `--muster` | Full 9-universe deployment (30-50 agents in 3 waves) | `/architect`, `/campaign`, `/build`, `/gauntlet` |
| `--infinity` | 10-round 2x pass with ~80 agent launches | `/gauntlet` |

See `/docs/methods/MUSTER.md` for the full Muster Protocol.

## Docs Reference

| Doc | Location | When to Read |
|-----|----------|-------------|
| **Holocron** | `/HOLOCRON.md` | Complete user guide — start here if new |
| **PRD** | `/docs/PRD.md` | Source of truth for WHAT to build. Read first. |
| **Build Protocol** | `/docs/methods/BUILD_PROTOCOL.md` | Master 13-phase sequence with gates and rollback |
| **Build Journal** | `/docs/methods/BUILD_JOURNAL.md` | Logging protocol — read when starting any work |
| **Context Management** | `/docs/methods/CONTEXT_MANAGEMENT.md` | Session scoping and context discipline |
| **Frontend & UX** | `/docs/methods/PRODUCT_DESIGN_FRONTEND.md` | Galadriel — when doing UX/UI work |
| **Backend** | `/docs/methods/BACKEND_ENGINEER.md` | Stark — when doing API/DB work |
| **QA** | `/docs/methods/QA_ENGINEER.md` | Batman — when doing QA or testing |
| **Testing** | `/docs/methods/TESTING.md` | When writing tests (framework mapping inside) |
| **Security** | `/docs/methods/SECURITY_AUDITOR.md` | Kenobi — when doing security review |
| **Architecture** | `/docs/methods/SYSTEMS_ARCHITECT.md` | Picard — when making arch decisions |
| **Assessment** | `.claude/commands/assess.md` | Picard — when evaluating existing codebases before build |
| **DevOps** | `/docs/methods/DEVOPS_ENGINEER.md` | Kusanagi — when doing infrastructure |
| **Orchestrator** | `/docs/methods/SUB_AGENTS.md` | When coordinating multiple agents |
| **Troubleshooting** | `/docs/methods/TROUBLESHOOTING.md` | When something fails |
| **MCP Integration** | `/docs/methods/MCP_INTEGRATION.md` | When connecting external tools |
| **Release** | `/docs/methods/RELEASE_MANAGER.md` | Coulson — when versioning or releasing |
| **Forge Keeper** | `/docs/methods/FORGE_KEEPER.md` | Bombadil — when syncing VoidForge updates |
| **Worm Rider** | `/docs/methods/THUMPER.md` | Chani — when setting up Telegram remote control |
| **The Initiative** | `/docs/methods/ASSEMBLER.md` | Fury — when running the full pipeline |
| **The Gauntlet** | `/docs/methods/GAUNTLET.md` | Thanos — when putting a finished project through comprehensive review |
| **The Campaign** | `/docs/methods/CAMPAIGN.md` | Sisko — when building the whole PRD mission by mission |
| **Forge Artist** | `/docs/methods/FORGE_ARTIST.md` | Celebrimbor — when generating images from PRD descriptions |
| **Field Medic** | `/docs/methods/FIELD_MEDIC.md` | Bashir — when running post-mortems and submitting upstream feedback |
| **Growth Strategist** | `/docs/methods/GROWTH_STRATEGIST.md` | Kelsier — when running growth campaigns, SEO, content, ads |
| **Treasury** | `/docs/methods/TREASURY.md` | Dockson — when managing revenue, budgets, spend, reconciliation |
| **Heartbeat** | `/docs/methods/HEARTBEAT.md` | Daemon operations — token refresh, spend monitoring, scheduled jobs |
| **Deep Current** | `/docs/methods/DEEP_CURRENT.md` | Tuvok — when running autonomous campaign intelligence, site scanning, cold start intake |
| **PRD Generator** | `/docs/methods/PRD_GENERATOR.md` | Sisko — when generating a PRD from scratch |
| **Meta-Workflow** | `/docs/META_WORKFLOW.md` | How to use VoidForge to develop VoidForge — campaigns on self, anti-patterns, feedback loop |
| **AI Intelligence** | `/docs/methods/AI_INTELLIGENCE.md` | When project uses LLM/AI features |
| **The Muster** | `/docs/methods/MUSTER.md` | When using `--muster` flag on any command |
| **Patterns** | `/docs/patterns/` | When writing code (30 reference implementations) |
| **Lessons** | `/docs/LESSONS.md` | Cross-project learnings |

## The Team

| Agent | Name | Domain |
|-------|------|--------|
| Frontend & UX | **Galadriel** (Tolkien) | UI, UX, a11y, design system |
| Backend | **Stark** (Marvel) | API, DB, services, queues |
| QA | **Batman** (DC) | Bugs, testing, hardening — cross-cutting investigator + validator |
| Security | **Kenobi** (Star Wars) | Auth, injection, secrets, data |
| Architecture | **Picard** (Star Trek) | Schema, scaling, ADRs |
| DevOps | **Kusanagi** (Anime) | Deploy, monitor, backup |
| Release | **Coulson** (Marvel) | Version, changelog, commit, release |
| Forge Sync | **Bombadil** (Tolkien) | Update VoidForge methodology from upstream |
| Worm Rider | **Chani** (Dune) | Telegram bridge, Gom Jabbar auth, sandworm relay |
| The Initiative | **Fury** (Marvel) | Full pipeline orchestration — assembles all agents |
| The Gauntlet | **Thanos** (Marvel) | Comprehensive review — 5 rounds, 30+ agents, every domain |
| Campaign Command | **Sisko** (Star Trek) | Reads the PRD, picks the next mission, runs the war |
| Forge Artist | **Celebrimbor** (Tolkien) | AI image generation from PRD visual descriptions |
| Field Medic | **Bashir** (Star Trek) | Post-mortem analysis, upstream feedback via GitHub issues |
| Growth Strategist | **Kelsier** (Cosmere) | Growth strategy, campaign orchestration, ad platforms, SEO |
| Deep Current | **Tuvok** (Star Trek) | Autonomous campaign intelligence — scan, analyze, propose, learn |
| Treasury | **Dockson** (Cosmere) | Revenue ingest, budget allocation, spend execution, reconciliation |
| AI Intelligence | **Hari Seldon** (Foundation) | Model selection, prompts, tool-use, orchestration, safety, evals |

260+ sub-agent names in `/docs/NAMING_REGISTRY.md`. No duplicates across active sessions.

## Release Tiers

VoidForge ships on three branches. Shared methodology files exist on all three.

| Branch | What's Included | Use Case |
|--------|----------------|----------|
| `main` | Full — wizards, provisioners, AWS SDK, everything | `npx voidforge init` / `npx voidforge deploy` |
| `scaffold` | Methodology only — CLAUDE.md, commands, methods, patterns, Holocron | `git clone --branch scaffold`, add PRD, `/build` |
| `core` | Ultra-light — CLAUDE.md, commands, methods, patterns, naming registry | Point Claude Code at branch to absorb methodology |

**Branch sync rule:** Changes to any shared file must propagate to all branches. Shared files:
- `CLAUDE.md`, `.claude/commands/*`
- `docs/methods/*`, `docs/patterns/*`, `docs/NAMING_REGISTRY.md`
- `HOLOCRON.md`, `VERSION.md`, `CHANGELOG.md`
- `scripts/thumper/*`

**NOT shared** (main-only): `package.json` (wizard dependencies differ per tier), `package-lock.json`, `.claude/settings.json` (user permissions/hooks), `wizard/*`, `scripts/*`, `logs/*`, `.env`

Scaffold and core have their own minimal `package.json` (name + version + description only — no dependencies). When syncing version bumps, update `VERSION.md` and `CHANGELOG.md` on all branches but leave each branch's `package.json` version field to be updated independently.

The agents, characters, and personality are VoidForge's identity — never strip them from any tier.

## How to Build

Read the PRD. Run `/build`. Or see `/docs/methods/BUILD_PROTOCOL.md`.
