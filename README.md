# VoidForge

From nothing, everything.

**VoidForge is a methodology framework that turns Claude Code into a full engineering team.** Write a PRD describing what you want. Run `/campaign`. A named team of 260+ agents — architects, engineers, reviewers, security, UX, QA, release — builds, hardens, and ships it against your spec. Works with any tech stack. Ships to any cloud.

Inside: 30 slash commands, 34 code patterns, 260+ specialist agents across 9 fictional universes, 1384 automated tests.

**New here?** Read the **[Holocron](HOLOCRON.md)** — the complete guide. **Curious about what's next?** Read the **[Prophecy](PROPHECY.md)** — the roadmap.

---

## Install

**Prerequisites:** [Claude Code CLI](https://claude.com/claude-code) (provides the `claude` command) and Node ≥20.11.

```bash
# Create a new project with VoidForge methodology
npx voidforge-build init my-app
cd my-app

# Open Claude Code in the project:
claude

# Then run your first command:
#   /prd         ← start here if you don't have a PRD yet
#   /campaign    ← build an existing PRD end-to-end
#   /assess      ← evaluate an existing codebase first
```

Or launch the browser wizard for vault, credentials, and guided PRD generation: `npx voidforge-build`.

VoidForge distributes via npm as two scoped packages: `voidforge-build` (wizard + CLI, bin name `voidforge`) and `voidforge-build-methodology` (agents, commands, methods, patterns). Projects contain methodology only — zero VoidForge runtime dependencies.

---

## System Architecture

### Components

```
voidforge/
├── CLAUDE.md                     ← Root context — loaded every session
├── HOLOCRON.md                   ← User guide (you should read this)
├── README.md                     ← System reference (you are here)
├── VERSION.md                    ← Semantic versioning
├── CHANGELOG.md                  ← Version history
│
├── .claude/
│   ├── settings.json             ← Permissions, hooks
│   └── commands/                 ← 30 slash commands
│       ├── build.md              ← /build — 13-phase protocol
│       ├── qa.md                 ← /qa — Batman's QA pass (double-pass)
│       ├── test.md               ← /test — Batman's test-writing mode
│       ├── security.md           ← /security — Kenobi's audit (with Maul red-team)
│       ├── ux.md                 ← /ux — Galadriel's review (with re-verify)
│       ├── review.md             ← /review — Cross-agent code review
│       ├── devops.md             ← /devops — Kusanagi's infra
│       ├── architect.md          ← /architect — Picard's review (parallel analysis)
│       ├── git.md                ← /git — Coulson's releases
│       ├── void.md              ← /void — Bombadil's forge sync
│       ├── thumper.md           ← /thumper — Chani's worm rider
│       ├── assemble.md          ← /assemble — Fury's Initiative
│       ├── campaign.md          ← /campaign — Sisko's War Room
│       ├── imagine.md           ← /imagine — Celebrimbor's Forge
│       ├── debrief.md           ← /debrief — Bashir's Field Report
│       ├── gauntlet.md          ← /gauntlet — Thanos's Comprehensive Review
│       ├── deploy.md            ← /deploy — Kusanagi's Deploy Agent
│       ├── prd.md               ← /prd — Sisko's PRD Generator
│       ├── assess.md            ← /assess — Picard's Pre-Build Assessment
│       ├── dangerroom.md        ← /dangerroom — Mission Control Dashboard
│       ├── cultivation.md       ← /cultivation — Growth Engine Install
│       ├── grow.md              ← /grow — Kelsier's Growth Protocol
│       ├── current.md           ← /current — Tuvok's Deep Current
│       ├── treasury.md          ← /treasury — Dockson's Financial Ops
│       ├── portfolio.md         ← /portfolio — Steris's Cross-Project Financials
│       └── ai.md                ← /ai — Seldon's AI Intelligence Audit
│
├── docs/
│   ├── PRD.md                    ← PRD template with YAML frontmatter
│   ├── NAMING_REGISTRY.md        ← 260+ characters, 9 universes
│   ├── LESSONS.md                ← Cross-project learnings
│   ├── ARCHITECTURE.md           ← System overview + data flow
│   ├── SCALING.md                ← Three-tier scaling assessment
│   ├── TECH_DEBT.md              ← Prioritized tech debt catalog
│   ├── FAILURE_MODES.md          ← Component failure analysis
│   ├── SECURITY_CHECKLIST.md     ← Pre-deploy security checklist
│   ├── qa-prompt.md              ← QA state + regression template
│   ├── adrs/                     ← Architecture Decision Records
│   │
│   ├── methods/                  ← Agent protocols
│   │   ├── BUILD_PROTOCOL.md     ← 13-phase sequence, gates, rollback
│   │   ├── BUILD_JOURNAL.md      ← Persistent logging protocol
│   │   ├── CONTEXT_MANAGEMENT.md ← Session scoping
│   │   ├── PRODUCT_DESIGN_FRONTEND.md  ← Galadriel
│   │   ├── BACKEND_ENGINEER.md         ← Stark
│   │   ├── QA_ENGINEER.md              ← Batman
│   │   ├── TESTING.md                  ← Framework-agnostic testing
│   │   ├── SECURITY_AUDITOR.md         ← Kenobi
│   │   ├── SYSTEMS_ARCHITECT.md        ← Picard
│   │   ├── DEVOPS_ENGINEER.md          ← Kusanagi
│   │   ├── RELEASE_MANAGER.md          ← Coulson
│   │   ├── FORGE_KEEPER.md            ← Bombadil
│   │   ├── SUB_AGENTS.md              ← Orchestration + conflict resolution
│   │   ├── TROUBLESHOOTING.md         ← Error recovery + rollback
│   │   ├── MCP_INTEGRATION.md         ← External tool connections
│   │   ├── PRD_GENERATOR.md           ← PRD auto-generation prompt
│   │   ├── THUMPER.md                ← Chani — worm rider (Dune)
│   │   ├── ASSEMBLER.md             ← Fury — the initiative
│   │   ├── FIELD_MEDIC.md           ← Bashir — post-mortems
│   │   ├── FORGE_ARTIST.md          ← Celebrimbor — image generation
│   │   ├── CAMPAIGN.md              ← Sisko — war room
│   │   ├── GAUNTLET.md              ← Thanos — comprehensive review
│   │   ├── GROWTH_STRATEGIST.md     ← Kelsier — growth, SEO, ads
│   │   ├── DEEP_CURRENT.md          ← Tuvok — autonomous intelligence
│   │   ├── TREASURY.md              ← Dockson — financial operations
│   │   ├── HEARTBEAT.md             ← Daemon operations
│   │   └── AI_INTELLIGENCE.md         ← Hari Seldon — AI intelligence
│   │
│   └── patterns/                 ← Reference implementations
│       ├── api-route.ts          ← Validation, auth, service call
│       ├── service.ts            ← Business logic, ownership checks
│       ├── component.tsx         ← 4 states, keyboard accessible
│       ├── middleware.ts         ← Auth, logging, rate limiting
│       ├── error-handling.ts     ← Canonical error strategy
│       ├── job-queue.ts          ← Idempotency, retry, DLQ
│       ├── multi-tenant.ts       ← Workspace scoping, RBAC
│       ├── sse-endpoint.ts       ← Server-Sent Events lifecycle
│       ├── game-loop.ts          ← Fixed timestep, interpolation
│       ├── game-state.ts         ← Hierarchical state machine
│       ├── game-entity.ts        ← Entity Component System
│       ├── mobile-screen.tsx     ← React Native screen pattern
│       ├── mobile-service.ts     ← Offline-first with sync
│       ├── ad-platform-adapter.ts ← Split setup/runtime interfaces
│       ├── financial-transaction.ts ← Branded Cents, hash chain
│       ├── daemon-process.ts     ← PID management, signals
│       ├── oauth-token-lifecycle.ts ← Token refresh at 80% TTL
│       ├── revenue-source-adapter.ts ← Read-only revenue interface
│       ├── outbound-rate-limiter.ts ← Token bucket with backpressure
│       ├── ai-orchestrator.ts   ← Agent loop, tool use, retry
│       ├── ai-classifier.ts    ← Classification with confidence thresholds
│       ├── ai-router.ts        ← Intent-based routing with fallback chains
│       ├── prompt-template.ts   ← Versioned prompts with variable injection
│       ├── ai-eval.ts          ← Golden datasets, scoring, regression
│       ├── ai-tool-schema.ts   ← Type-safe tool definitions
│       ├── database-migration.ts ← Safe migrations, rollback
│       ├── data-pipeline.ts    ← ETL with checkpoint/resume
│       ├── backtest-engine.ts  ← Walk-forward backtesting
│       └── execution-safety.ts ← Order validation, position limits
│
├── logs/                         ← Build journal (per-project)
│   └── build-state.md            ← Master state file
│
├── scripts/
│   └── thumper/                  ← /thumper — Chani's worm rider (Dune)
│
└── packages/
    ├── voidforge/                ← npm: "voidforge" (wizard + CLI)
    │   ├── scripts/voidforge.ts  ← CLI entry point (12 commands)
    │   └── wizard/               ← Server, API, UI, lib, tests
    │       ├── server.ts         ← Local HTTP server (127.0.0.1)
    │       ├── api/              ← API handlers
    │       ├── ui/               ← Gandalf, Haku, Lobby, Tower, Danger Room, War Room
    │       ├── __tests__/        ← 675 vitest tests
    │       └── lib/              ← Vault, auth, provisioners, dashboards, growth, financial
    │
    └── methodology/              ← npm: "voidforge-build-methodology"
        ├── package.json          ← Metadata + prepack script
        └── scripts/prepack.sh    ← Copies methodology from root at publish time
```

### Agent Leads

| Agent | Name | Universe | Domain |
|-------|------|----------|--------|
| Frontend & UX | **Galadriel** | Lord of the Rings | UI, UX, accessibility, design systems |
| Backend | **Stark** | Marvel | APIs, databases, services, queues, integrations |
| QA | **Batman** | DC Comics | Bug hunting, testing, hardening |
| Security | **Kenobi** | Star Wars | Auth, injection, secrets, OWASP |
| Architecture | **Picard** | Star Trek | Schema, scaling, ADRs, failure modes |
| DevOps | **Kusanagi** | Anime | Deploy, monitor, backup, infrastructure |
| Release | **Coulson** | Marvel | Versioning, changelogs, releases |
| Forge Sync | **Bombadil** | Lord of the Rings | VoidForge self-update from upstream |
| Worm Rider | **Chani** | Dune | The Voice, Gom Jabbar authentication, sandworm relay |
| The Initiative | **Fury** | Marvel | Full pipeline orchestration — assembles all agents |
| Campaign Command | **Sisko** | Star Trek | PRD-to-product campaign, mission sequencing |
| Forge Artist | **Celebrimbor** | Lord of the Rings | AI image generation from PRD descriptions |
| Field Medic | **Bashir** | Star Trek | Post-mortem analysis, upstream feedback |
| The Gauntlet | **Thanos** | Marvel | Comprehensive 5-round review — every domain, every agent |
| Growth Strategist | **Kelsier** | Cosmere | Growth campaigns, SEO, ads, A/B testing |
| Deep Current | **Tuvok** | Star Trek | Autonomous campaign intelligence — scan, analyze, propose |
| Treasury | **Dockson** | Cosmere | Revenue ingest, budget allocation, spend execution |
| AI Intelligence | **Hari Seldon** | Foundation | Model selection, prompts, orchestration, AI safety |

260+ sub-agents across all 9 universes. See `docs/NAMING_REGISTRY.md`.

### Build Protocol

13 phases from PRD to production. Conditional skip rules via PRD frontmatter. Verification gates at every phase. See `docs/methods/BUILD_PROTOCOL.md`.

### Slash Commands

| Command | Agent | Protocol |
|---------|-------|----------|
| `/build` | All | 13-phase build from PRD |
| `/qa` | Batman | Double-pass QA with parallel analysis |
| `/test` | Batman | Test-writing mode — coverage + architecture |
| `/sentinel` (alias: `/security`) | Kenobi | OWASP audit with red-team verification |
| `/ux` | Galadriel | Adversarial UX/UI + a11y with re-verify |
| `/engage` (alias: `/review`) | Picard | Cross-agent code review — patterns + quality |
| `/devops` | Kusanagi | Target-adaptive infrastructure |
| `/architect` | Picard | Architecture review with parallel analysis |
| `/git` | Coulson | Semver + changelog + commit |
| `/void` | Bombadil | Sync VoidForge methodology from upstream |
| `/thumper` | Chani | Worm rider — Dune-themed Telegram bridge with Gom Jabbar auth |
| `/assemble` | Fury | The Initiative — full pipeline with crossfire + council |
| `/campaign` | Sisko | Danger Room — autonomous PRD-to-product mission sequencing |
| `/imagine` | Celebrimbor | Forge — AI image generation from PRD visual descriptions |
| `/debrief` | Bashir | Field Report — post-mortem analysis, upstream feedback |
| `/gauntlet` | Thanos | Comprehensive review — 5 rounds, agents across all domains |
| `/deploy` | Kusanagi | Deploy agent — target detection, health check, rollback |
| `/prd` | Sisko | PRD generator — 5-act structured interview |
| `/assess` | Picard | Pre-build assessment — architecture + gap analysis |
| `/dangerroom` | — | Mission control dashboard — live agent monitoring |
| `/cultivation` | — | Growth engine install — Cosmere growth universe |
| `/grow` | Kelsier | 6-phase growth protocol — SEO, ads, content, A/B |
| `/current` | Tuvok | Deep Current — autonomous campaign intelligence |
| `/treasury` | Dockson | Financial operations — revenue, budgets, spend |
| `/portfolio` | Steris | Cross-project financials — aggregated spend/revenue |
| `/ai` | Hari Seldon | AI intelligence audit — models, prompts, tools, safety, evals |

### Wizards (Full Tier)

| Wizard | Command | Purpose |
|--------|---------|---------|
| **Gandalf** | `npx voidforge-build init` | Setup: vault, credentials, PRD generation, scaffolding |
| **Haku** | `npx voidforge-build deploy` | Deploy: provisions infrastructure for 6 targets |

### Deploy Targets

| Target | What Haku Provisions | Deploy Command |
|--------|------------------------|----------------|
| Docker | Dockerfile, docker-compose.yml | `docker-compose up -d` |
| AWS VPS | EC2, security groups, SSH key, optional RDS + ElastiCache | `./infra/deploy.sh` |
| Vercel | Vercel project, vercel.json | `npx vercel deploy --prod` |
| Railway | Railway project, optional DB + Redis services | `railway up` |
| Cloudflare | Pages project, optional D1 database | `npx wrangler pages deploy` |
| S3 Static | S3 bucket with website hosting | `./infra/deploy-s3.sh` |

### Release Tiers

| Branch | Contents | Dependencies |
|--------|----------|-------------|
| `main` | Full: wizards + methodology + provisioners | Node.js, npm, AWS SDK |
| `scaffold` | Methodology: CLAUDE.md, commands, methods, patterns | None |
| `core` | Ultra-light: CLAUDE.md, commands, methods, patterns, registry | None |

Shared methodology files are synced across all three branches. See `CLAUDE.md` > Release Tiers.

---

## Philosophy

- **Methodology, not templates.** Stack-agnostic process.
- **Accumulate intelligence.** Every project makes VoidForge better.
- **Named agents are not gimmicks.** Scope boundaries, scannable logs, memorable teams.
- **The PRD is sacred.** Agents never override product decisions.
- **Verify everything.** Manual + automated + regression.
- **Skip what doesn't apply.** Not every project needs all 13 phases.
- **Log everything.** The build journal is persistent memory.
- **Stay fast.** Load on demand, checkpoint often.

---

## License

MIT
