# VoidForge

From nothing, everything. A reusable methodology framework for building full-stack applications with Claude Code.

**Drop in a PRD. Get a production application. Forged by a named team of 150+ AI agents across 6 fictional universes.**

---

## What This Is

A git repository containing methodology documents, naming conventions, and orchestration protocols that make Claude Code dramatically more effective at building applications from scratch. Not a code template — a *process* template. Works with any tech stack, any framework, any language.

VoidForge provides:

- **A root context file** (`CLAUDE.md`) — dense operational instructions loaded at session start
- **7 self-contained slash commands** — `/build`, `/qa`, `/security`, `/ux`, `/devops`, `/architect`, `/git` with inline execution steps
- **A 13-phase build protocol** — PRD to production with conditional skipping, specific verification gates, and rollback strategy
- **A build journal system** — persistent logging so agents recover state across sessions without re-deriving context
- **Context window management** — session scoping, load-on-demand, checkpointing to stay fast
- **7 specialist agent protocols** — each with named lead, themed sub-agents, and behavioral directives
- **An automated testing protocol** — framework-agnostic testing pyramid with authoritative timeline
- **7 code patterns** — API routes, services, components, middleware, error handling, job queues, multi-tenancy — all with framework adaptations (Next.js, Express, Django, Rails)
- **A troubleshooting guide** — error recovery for every build phase including rollback protocol
- **Multi-agent conflict resolution** — tiebreaker protocol for disputes between agents
- **A feedback loop** — `LESSONS.md` for capturing cross-project intelligence
- **Claude Code integration** — settings, hooks, and MCP server guidance
- **150+ named characters** from Tolkien, Marvel, DC Comics, Star Wars, Star Trek, and Anime

---

## The Team

Seven lead agents, each commanding a themed roster of sub-agents.

### Leads

| Agent | Name | Universe | Domain |
|-------|------|----------|--------|
| Frontend & UX | **Galadriel** | Lord of the Rings | UI, UX, accessibility, design systems, responsiveness |
| Backend | **Stark** | Marvel | APIs, databases, services, queues, integrations, error handling |
| QA | **Batman** | DC Comics | Bug hunting, automated testing, hardening, observability |
| Security | **Kenobi** | Star Wars | Auth, injection, secrets, headers, PII, encryption, OWASP |
| Architecture | **Picard** | Star Trek | Schema design, scaling strategy, tech debt, failure modes, ADRs |
| DevOps | **Kusanagi** | Anime | Provisioning, deployment, monitoring, backups, disaster recovery |
| Release | **Coulson** | Marvel | Version management, changelogs, commit messages, releases |

### Sub-Agent Highlights

**Tolkien** — Gandalf arrives precisely when things break. Samwise never leaves anyone behind (accessibility). Bilbo writes the microcopy.

**Marvel** — Banner stays calm until queries get slow. Romanoff trusts no external API. Fury oversees performance and tolerates nothing.

**DC Comics** — Oracle sees the whole system. Red Hood breaks everything on purpose. Alfred inspects every dependency personally.

**Star Wars** — Yoda guards authentication with centuries of wisdom. Windu deflects every injection attack. Leia keeps the secrets safe.

**Star Trek** — Spock brings logical precision to data architecture. Scotty knows the infrastructure limits. La Forge keeps the engines running.

**Anime** — Levi deploys with zero wasted motion. Senku builds infrastructure from scratch. L observes everything. Vegeta optimizes relentlessly.

See `docs/NAMING_REGISTRY.md` for the complete roster of 150+ characters.

---

## Repository Structure

```
voidforge/
├── CLAUDE.md                              ← Root context — operational instructions
├── README.md                              ← You are here
├── VERSION.md                             ← Semantic versioning
├── CHANGELOG.md                           ← Version history
├── .gitignore
│
├── .claude/
│   ├── settings.json                      ← Claude Code settings, permissions, hooks
│   └── commands/                          ← Self-contained slash commands
│       ├── build.md                       ← /build — full build protocol with inline steps
│       ├── qa.md                          ← /qa — Batman's QA pass with parallel analysis
│       ├── security.md                    ← /security — Kenobi's audit with phased execution
│       ├── ux.md                          ← /ux — Galadriel's UX/UI review
│       ├── devops.md                      ← /devops — adapts to deploy target
│       ├── architect.md                   ← /architect — with conflict resolution
│       └── git.md                         ← /git — Coulson's version & release management
│
├── logs/                                  ← Build journal (created per-project)
│   └── build-state.md                     ← Master state file — read at every session start
│
├── docs/
│   ├── PRD.md                             ← PRD template with YAML frontmatter
│   ├── NAMING_REGISTRY.md                 ← 150+ characters, 6 universes, dedup rules
│   ├── LESSONS.md                         ← Cross-project learnings
│   ├── qa-prompt.md                       ← QA state + regression checklist
│   ├── ARCHITECTURE.md                    ← System overview + data flow diagram
│   ├── SCALING.md                         ← Three-tier scaling assessment
│   ├── TECH_DEBT.md                       ← Prioritized tech debt catalog
│   ├── FAILURE_MODES.md                   ← Component failure analysis + recovery
│   ├── SECURITY_CHECKLIST.md              ← Reusable pre-deploy security checklist
│   ├── adrs/                              ← Architecture Decision Records
│   │
│   ├── patterns/                          ← Reference implementations (all with framework adaptations)
│   │   ├── README.md                      ← Pattern index
│   │   ├── api-route.ts                   ← API route (Next.js + Express/Django/Rails notes)
│   │   ├── service.ts                     ← Service layer (Prisma + Django/Rails notes)
│   │   ├── component.tsx                  ← Component with all 4 states (React + Vue/Svelte notes)
│   │   ├── middleware.ts                  ← Auth, logging, rate limiting
│   │   ├── error-handling.ts              ← Canonical error strategy (all frameworks)
│   │   ├── job-queue.ts                   ← Background jobs (BullMQ + Celery + Sidekiq)
│   │   └── multi-tenant.ts               ← Workspace scoping (Next.js + Django + Rails)
│   │
│   └── methods/                           ← Agent protocols
│       ├── BUILD_PROTOCOL.md              ← Master 13-phase sequence with gates + rollback
│       ├── BUILD_JOURNAL.md               ← Persistent logging protocol
│       ├── CONTEXT_MANAGEMENT.md          ← Session scoping + context discipline
│       ├── PRODUCT_DESIGN_FRONTEND.md     ← Galadriel's frontend & UX protocol
│       ├── BACKEND_ENGINEER.md            ← Stark's backend engineering protocol
│       ├── QA_ENGINEER.md                 ← Batman's QA protocol + regression checklist
│       ├── TESTING.md                     ← Testing pyramid with framework mapping
│       ├── SECURITY_AUDITOR.md            ← Kenobi's security audit protocol
│       ├── SYSTEMS_ARCHITECT.md           ← Picard's architecture review protocol
│       ├── DEVOPS_ENGINEER.md             ← Kusanagi's DevOps & infrastructure protocol
│       ├── SUB_AGENTS.md                  ← Orchestration + conflict resolution
│       ├── RELEASE_MANAGER.md             ← Coulson's version & release protocol
│       ├── TROUBLESHOOTING.md             ← Error recovery + rollback protocol
│       ├── MCP_INTEGRATION.md             ← External tool connections
│       └── PRD_GENERATOR.md               ← Prompt for auto-generating PRDs
│
├── scripts/
│   ├── new-project.sh                     ← One-command project initialization
│   └── voidforge.ts                       ← CLI entry point for wizard
│
└── wizard/                                ← Two browser-based wizards
    ├── server.ts                          ← Local HTTP server (127.0.0.1)
    ├── router.ts                          ← API route registry
    ├── api/                               ← API handlers (credentials, cloud, PRD, project, provision, deploy)
    ├── ui/                                ← Vanilla HTML/CSS/JS frontend
    │   ├── index.html + app.js            ← Merlin (setup wizard)
    │   └── deploy.html + deploy.js        ← Strange (deploy wizard)
    └── lib/                               ← Encrypted vault, model resolution, provisioners
        └── provisioners/                  ← 6 deploy targets (Docker, AWS VPS, Vercel, Railway, Cloudflare, S3)
```

---

## Quick Start

```bash
git clone https://github.com/tmcleod3/voidforge.git
cd voidforge
npm install
npm run wizard
```

**Merlin** (the setup wizard) walks you through:
1. Credential vault (password-encrypted, works on any OS)
2. Cloud provider credentials (AWS, Vercel, Railway, Cloudflare — optional)
3. Project setup (name, directory, domain)
4. PRD generation with Claude (or paste one from any AI)
5. Deploy target selection
6. Review and create

Your project is scaffolded, git-initialized, and ready for `/build`.

After building your app, deploy with **Strange** (the deploy wizard):

```bash
npm run deploy
```

Strange provisions infrastructure for your chosen target (Docker, AWS VPS, Vercel, Railway, Cloudflare, or S3 static hosting).

### Alternative: Manual setup

If you prefer to skip the wizard:

```bash
# Clone and scaffold directly
git clone https://github.com/tmcleod3/voidforge.git
./voidforge/scripts/new-project.sh "My App" ~/my-app
cd ~/my-app

# Replace docs/PRD.md with your actual PRD, then:
/build
```

---

## Slash Commands

| Command | Agent | What It Does |
|---------|-------|-------------|
| `/build` | All | Execute the 13-phase build protocol from PRD to production |
| `/qa` | Batman | Full QA pass: static analysis, dynamic probing, automated tests, regression |
| `/security` | Kenobi | OWASP security audit with prioritized findings and remediation |
| `/ux` | Galadriel | Adversarial UX/UI review with accessibility audit |
| `/devops` | Kusanagi | Infrastructure provisioning, deploy scripts, monitoring, backups |
| `/architect` | Picard | Architecture review with ADRs, scaling plan, failure analysis |
| `/git` | Coulson | Version bump, changelog, commit message, release management |

---

## How It Works

### The Build Sequence

The `BUILD_PROTOCOL.md` defines a 13-phase sequence with conditional skip rules:

| Phase | Lead Agent | What Happens | Skippable? |
|-------|-----------|-------------|-----------|
| 0. Orient | Picard | Reads PRD, extracts architecture, produces ADRs | No |
| 1. Scaffold | Stark + Kusanagi | Framework, configs, schema, test runner | No |
| 2. Infrastructure | Kusanagi | Database, Redis, environment, verify boot | Partial (static sites) |
| 3. Auth | Stark + Galadriel | Login, signup, OAuth, sessions. Kenobi reviews. | Yes (if `auth: no`) |
| 4. Core Feature | Stark + Galadriel | Most important user flow, end-to-end | No |
| 5. Supporting | Stark + Galadriel | Remaining features in dependency order | No |
| 6. Integrations | Stark (Romanoff) | Payments, email, storage, external APIs | Partial (per feature flag) |
| 7. Admin | Stark + Galadriel | Admin panel, dashboards, audit logging | Yes (if `admin: no`) |
| 8. Marketing | Galadriel | Homepage, pricing, legal, SEO | Yes (if `marketing: no`) |
| 9. QA Pass | Batman | Oracle + Red Hood + Nightwing (tests) + Alfred + Lucius | No |
| 10. UX/UI Pass | Galadriel | Full adversarial UX/UI + a11y review | Yes (if API-only) |
| 11. Security Pass | Kenobi | Full OWASP audit | No |
| 12. Deploy | Kusanagi | Provision, deploy, monitor, backup | No |
| 13. Launch | All | Full checklist verified | No |

### PRD Frontmatter

The PRD includes a YAML frontmatter block that tells the build protocol which features exist:

```yaml
auth: yes
payments: stripe
workers: no
admin: yes
marketing: no
deploy: vps
```

The build protocol reads these values and automatically skips irrelevant phases.

### Build Journal

Every agent produces persistent log files in `/logs/`. When context compresses or a new session starts, agents read journal files to recover state. See `BUILD_JOURNAL.md`.

- `build-state.md` — master state file, read at every session start (under 50 lines)
- `phase-XX-*.md` — per-phase logs with decisions, test results, findings
- `decisions.md` — running log of all non-obvious decisions
- `handoffs.md` — every agent-to-agent handoff with context

### Context Management

`CONTEXT_MANAGEMENT.md` keeps sessions fast:

- Load method docs on demand, not all upfront
- One phase or agent domain per session
- Checkpoint to `/logs/build-state.md` before context fills
- New sessions pick up from the journal, not from scratch

### Code Patterns

7 reference implementations in `docs/patterns/`, all with framework adaptations:

- **api-route.ts** — Zod validation, auth check, service call (+ Express/Django/Rails notes)
- **service.ts** — Business logic, ownership checks, typed errors (+ Django/Rails notes)
- **component.tsx** — Loading/empty/error/success states, keyboard accessible (+ Vue/Svelte notes)
- **middleware.ts** — Auth middleware, request logging, rate limiting (+ Express/Django/Rails notes)
- **error-handling.ts** — Canonical error strategy: types, handler, response shape (all frameworks)
- **job-queue.ts** — Background jobs: idempotency, retry, DLQ (BullMQ + Celery + Sidekiq)
- **multi-tenant.ts** — Workspace scoping, tenant isolation, RBAC (Next.js + Django + Rails)

### Testing

Testing protocol with framework-agnostic principles and a framework-to-test-runner mapping:

- Unit tests for business logic (vitest/jest/pytest/RSpec)
- Integration tests for API routes
- Tests are a **breaking gate** — failing tests prevent phase advancement
- Authoritative timeline: which tests are written in which phase

### Troubleshooting

Error recovery for every build phase including a **rollback protocol** — identify, revert, verify, isolate, fix, re-apply, log.

### Agent Cross-References

Every agent knows when to hand off:

- Galadriel finds bad API data → **Stark**
- Stark finds a vulnerability → **Kenobi**
- Batman finds an architecture problem → **Picard**
- Kenobi's fix needs infra changes → **Kusanagi**

---

## Evolving VoidForge

VoidForge gets smarter over time:

1. **After each project:** Add entries to `docs/LESSONS.md`
2. **When a pattern proves reliable:** Promote it from LESSONS.md into the relevant method doc
3. **When you discover a new process:** Add a method doc to `docs/methods/`
4. **When you write reusable code:** Add a pattern to `docs/patterns/`

---

## Philosophy

**Methodology, not templates.** Stack-agnostic process that works for Next.js, Django, Rails, or anything else.

**Accumulate intelligence.** Every project makes VoidForge better through `LESSONS.md` and promoted patterns.

**Named agents are not gimmicks.** They create scope boundaries, make logs scannable, and make development more fun.

**The PRD is sacred.** Agents never override product decisions with process opinions.

**Verify everything.** Manual verification, automated tests, and regression checklists. All three.

**Skip what doesn't apply.** Not every project needs all 13 phases.

**Log everything.** The build journal is your persistent memory across sessions. Decisions, test results, handoffs, failures — all on disk, all recoverable.

**Stay fast.** Context management keeps sessions lean. Load on demand, checkpoint often, start fresh when needed.

---

## License

MIT — use it however you want.
