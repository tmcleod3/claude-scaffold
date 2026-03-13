# VoidForge

From nothing, everything.

A methodology framework for building full-stack applications with Claude Code. Drop in a PRD. Get a production application. Forged by a named team of 150+ AI agents across 6 fictional universes.

**New here?** Read the **[Holocron](HOLOCRON.md)** -- the complete guide. **Curious about what's next?** Read the **[Prophecy](PROPHECY.md)** -- the roadmap.

---

## Install

VoidForge ships in three tiers. Pick the one that fits.

```bash
# Full — wizards, provisioners, everything
git clone https://github.com/tmcleod3/voidforge.git && cd voidforge && npm install
npx voidforge init

# Scaffold — methodology only, no wizard, no npm deps
git clone --branch scaffold https://github.com/tmcleod3/voidforge.git my-app
cd my-app && /build

# Core — ultra-light, drop into any existing project
git clone --branch core https://github.com/tmcleod3/voidforge.git /tmp/vf
cp -r /tmp/vf/.claude /tmp/vf/CLAUDE.md /tmp/vf/docs your-project/
```

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
│   └── commands/                 ← 8 slash commands
│       ├── build.md              ← /build — 13-phase protocol
│       ├── qa.md                 ← /qa — Batman's QA pass
│       ├── security.md           ← /security — Kenobi's audit
│       ├── ux.md                 ← /ux — Galadriel's review
│       ├── devops.md             ← /devops — Kusanagi's infra
│       ├── architect.md          ← /architect — Picard's review
│       ├── git.md                ← /git — Coulson's releases
│       └── void.md              ← /void — Bombadil's forge sync
│
├── docs/
│   ├── PRD.md                    ← PRD template with YAML frontmatter
│   ├── NAMING_REGISTRY.md        ← 150+ characters, 6 universes
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
│   │   └── PRD_GENERATOR.md           ← PRD auto-generation prompt
│   │
│   └── patterns/                 ← Reference implementations
│       ├── api-route.ts          ← Validation, auth, service call
│       ├── service.ts            ← Business logic, ownership checks
│       ├── component.tsx         ← 4 states, keyboard accessible
│       ├── middleware.ts         ← Auth, logging, rate limiting
│       ├── error-handling.ts     ← Canonical error strategy
│       ├── job-queue.ts          ← Idempotency, retry, DLQ
│       └── multi-tenant.ts       ← Workspace scoping, RBAC
│
├── logs/                         ← Build journal (per-project)
│   └── build-state.md            ← Master state file
│
├── scripts/
│   ├── new-project.sh            ← Manual project initialization
│   └── voidforge.ts              ← CLI entry point
│
└── wizard/                       ← Full tier only
    ├── server.ts                 ← Local HTTP server (127.0.0.1)
    ├── router.ts                 ← API route registry
    ├── api/                      ← API handlers
    ├── ui/                       ← Merlin (setup) + Strange (deploy)
    └── lib/                      ← Vault, model resolution, provisioners
        └── provisioners/         ← Docker, AWS VPS, Vercel, Railway, Cloudflare, S3
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

150+ sub-agents across all 6 universes. See `docs/NAMING_REGISTRY.md`.

### Build Protocol

13 phases from PRD to production. Conditional skip rules via PRD frontmatter. Verification gates at every phase. See `docs/methods/BUILD_PROTOCOL.md`.

### Slash Commands

| Command | Agent | Protocol |
|---------|-------|----------|
| `/build` | All | 13-phase build from PRD |
| `/qa` | Batman | Parallel analysis + test suite |
| `/security` | Kenobi | OWASP audit (parallel + sequential) |
| `/ux` | Galadriel | Adversarial UX/UI + a11y |
| `/devops` | Kusanagi | Target-adaptive infrastructure |
| `/architect` | Picard | Architecture review + ADRs |
| `/git` | Coulson | Semver + changelog + commit |
| `/void` | Bombadil | Sync VoidForge methodology from upstream |

### Wizards (Full Tier)

| Wizard | Command | Purpose |
|--------|---------|---------|
| **Merlin** | `npx voidforge init` | Setup: vault, credentials, PRD generation, scaffolding |
| **Strange** | `npx voidforge deploy` | Deploy: provisions infrastructure for 6 targets |

### Deploy Targets

| Target | What Strange Provisions | Deploy Command |
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
