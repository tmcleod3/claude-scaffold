# claude-scaffold

A reusable methodology framework for building full-stack applications with Claude Code.

**Drop in a PRD. Get a production application. Built by a named team of 150+ AI agents across 6 fictional universes.**

---

## What This Is

This is a git repository containing methodology documents, naming conventions, and orchestration protocols that make Claude Code dramatically more effective at building applications from scratch. It is not a code template — it's a *process* template. It works with any tech stack, any framework, any language.

The scaffold provides:

- **A root context file** (`CLAUDE.md`) that orients Claude Code on any project in seconds
- **A 13-phase build protocol** that takes a PRD from "read this" to "launched in production"
- **6 specialist agent protocols** — each with a named lead, themed sub-agents, and a specific methodology
- **A naming registry** of 150+ characters from Tolkien, Marvel, DC Comics, Star Wars, Star Trek, and Anime — so every agent and sub-agent has a distinct identity
- **Cross-referencing** between all agents so they know when to hand off work
- **A PRD template** and a prompt for generating PRDs from rough ideas

---

## The Team

Six lead agents, each commanding a themed roster of sub-agents. Every character is drawn from a specific fictional universe and assigned a role that matches their personality.

### Leads

| Agent | Name | Universe | Domain |
|-------|------|----------|--------|
| Frontend & UX | **Galadriel** | Lord of the Rings | UI, UX, accessibility, design systems, responsiveness |
| Backend | **Stark** | Marvel | APIs, databases, services, queues, integrations, error handling |
| QA | **Batman** | DC Comics | Bug hunting, regression testing, hardening, observability |
| Security | **Kenobi** | Star Wars | Auth, injection, secrets, headers, PII, encryption, OWASP |
| Architecture | **Picard** | Star Trek | Schema design, scaling strategy, tech debt, failure modes, ADRs |
| DevOps | **Kusanagi** | Anime | Provisioning, deployment, monitoring, backups, disaster recovery |

### Sub-Agent Highlights

**Tolkien** — Gandalf arrives precisely when things break. Samwise never leaves anyone behind (accessibility). Bilbo writes the microcopy.

**Marvel** — Banner stays calm until queries get slow. Romanoff trusts no external API. Fury oversees performance and tolerates nothing.

**DC Comics** — Oracle sees the whole system. Red Hood breaks everything on purpose. Alfred inspects every dependency personally.

**Star Wars** — Yoda guards authentication with centuries of wisdom. Windu deflects every injection attack. Leia keeps the secrets safe.

**Star Trek** — Spock brings logical precision to data architecture. Scotty knows the infrastructure limits. La Forge keeps the engines running.

**Anime** — Levi deploys with zero wasted motion. Senku builds infrastructure from scratch. Calcifer is the server daemon. Vegeta optimizes relentlessly.

The anime roster draws exclusively from: Dragon Ball Z, Neon Genesis Evangelion, Attack on Titan, Studio Ghibli, Chainsaw Man, Jujutsu Kaisen, Mob Psycho 100, Cowboy Bebop, Demon Slayer, Dr. Stone, Fullmetal Alchemist Brotherhood, Frieren, Kids on the Slope, Gundam Wing, Samurai Champloo, Solo Leveling, That Time I Got Reincarnated as a Slime, and Code Geass.

See `docs/NAMING_REGISTRY.md` for the complete roster of 150+ characters with role descriptions and deduplication rules.

---

## Repository Structure

```
claude-scaffold/
├── CLAUDE.md                              ← Root context — Claude Code reads this first
├── README.md                              ← You are here
├── .gitignore
│
├── docs/
│   ├── PRD.md                             ← PRD template (replace with your actual PRD)
│   ├── NAMING_REGISTRY.md                 ← 150+ named characters, 6 universes, dedup rules
│   ├── qa-prompt.md                       ← QA state file (auto-maintained during builds)
│   │
│   └── methods/                           ← The methodology library
│       ├── BUILD_PROTOCOL.md              ← Master 13-phase build sequence
│       ├── PRD_GENERATOR.md               ← Prompt for creating PRDs from rough ideas
│       ├── PRODUCT_DESIGN_FRONTEND.md     ← Galadriel's frontend & UX protocol
│       ├── BACKEND_ENGINEER.md            ← Stark's backend engineering protocol
│       ├── QA_ENGINEER.md                 ← Batman's QA & bug hunting protocol
│       ├── SECURITY_AUDITOR.md            ← Kenobi's security audit protocol
│       ├── SYSTEMS_ARCHITECT.md           ← Picard's architecture review protocol
│       ├── DEVOPS_ENGINEER.md             ← Kusanagi's DevOps & infrastructure protocol
│       └── SUB_AGENTS.md                  ← Orchestration protocol for parallel sessions
│
└── scripts/
    └── new-project.sh                     ← One-command project initialization
```

---

## Quick Start

### Option 1: Clone and go

```bash
git clone https://github.com/YOUR_USER/claude-scaffold.git my-project
cd my-project
rm -rf .git && git init
```

Replace `docs/PRD.md` with your actual PRD. Open Claude Code and say:

> "Read CLAUDE.md, then build this project from the PRD."

### Option 2: Use the init script

```bash
git clone https://github.com/YOUR_USER/claude-scaffold.git
./claude-scaffold/scripts/new-project.sh "My App" ~/my-app
cd ~/my-app
```

This copies the scaffold, updates the project name in `CLAUDE.md`, and leaves you ready to drop in a PRD.

### Option 3: Generate a PRD first

If you only have a rough idea, use the PRD Generator:

1. Open Claude (chat, not Code)
2. Paste the prompt from `docs/methods/PRD_GENERATOR.md`
3. Add your idea (as rough as 1-3 sentences)
4. Claude produces a full PRD
5. Save it as `docs/PRD.md` in your project
6. Open Claude Code and build from it

---

## How It Works

### The Build Sequence

The `BUILD_PROTOCOL.md` defines a 13-phase sequence from PRD to production:

| Phase | Lead Agent | What Happens |
|-------|-----------|-------------|
| 0. Orient | Picard | Reads entire PRD, extracts architecture, produces ADRs |
| 1. Scaffold | Stark + Kusanagi | Framework, configs, schema, directory structure |
| 2. Infrastructure | Kusanagi | Database, Redis, environment, verify everything boots |
| 3. Auth | Stark + Galadriel | Login, signup, OAuth, sessions, roles. Kenobi reviews. |
| 4. Core Feature | Stark + Galadriel | Single most important user flow, end-to-end |
| 5. Supporting Features | Stark + Galadriel | Remaining PRD features in dependency order |
| 6. Integrations | Stark (Romanoff) | Payments, email, storage, analytics, external APIs |
| 7. Admin | Stark + Galadriel | Admin panel, dashboards, audit logging |
| 8. Marketing | Galadriel | Homepage, pricing, features, legal, SEO |
| 9. QA Pass | Batman | Oracle scans. Red Hood breaks. Nightwing verifies. |
| 10. UX/UI Pass | Galadriel | Elrond maps flows. Samwise checks a11y. Gandalf breaks edges. |
| 11. Security Pass | Kenobi | Yoda audits auth. Windu tests injection. Leia checks secrets. |
| 12. Deploy | Kusanagi | Senku provisions. Levi deploys. L monitors. Bulma backs up. |
| 13. Launch | All | Full checklist: SSL, email, payments, analytics, monitoring |

### Agent Cross-References

Every agent knows when to hand off work to another agent. For example:

- Galadriel finds a backend API returning bad data → hands off to **Stark**
- Stark finds a security vulnerability → hands off to **Kenobi**
- Batman finds an architectural problem → hands off to **Picard**
- Kenobi's fix requires infrastructure changes → hands off to **Kusanagi**

These handoff tables are defined in every method doc.

### Naming & Deduplication

When Claude Code spins up multiple agents (especially during parallel sessions), the `NAMING_REGISTRY.md` prevents collisions:

- Each universe has 20-72 named characters in a priority-ordered pool
- Agents pick names in order, skipping any that are already active
- No name may be used twice across any active session
- Cross-universe conflicts are documented (e.g., "Stark" is owned by Marvel)

This means you might see log output like:
```
[Legolas] Refactoring the card component grid layout
[Banner] Optimizing the projects query — N+1 detected
[Red Hood] Submitting empty form to /api/projects — got 500, expected 400
[Yoda] Session cookie missing httpOnly flag
[Spike] DNS propagation confirmed for app.example.com
```

---

## Method Docs In Detail

### BUILD_PROTOCOL.md
The master sequence. Coordinates all other agents through 13 phases. References specific sub-agents by name at each phase. This is what you point Claude Code at when you say "build from the PRD."

### PRODUCT_DESIGN_FRONTEND.md (Galadriel)
A 7-agent adversarial UX/UI review: UX heuristics (Elrond), visual design (Arwen), accessibility (Samwise), microcopy (Bilbo), frontend code (Legolas), performance (Gimli), edge cases (Gandalf). Produces an audit, regression checklist, and implemented fixes.

### BACKEND_ENGINEER.md (Stark)
A 7-agent backend review: API design (Rogers), database optimization (Banner), service architecture (Strange), error handling (Barton), integrations (Romanoff), queue/workers (Thor), performance (Fury). Covers HTTP semantics, N+1 prevention, connection pooling, idempotency, and more.

### QA_ENGINEER.md (Batman)
A 5-agent bug hunting protocol: static analysis (Oracle), dynamic breaking (Red Hood), dependency audit (Alfred), config review (Lucius), regression verification (Nightwing). Every bug must be reproduced before fixing. Every fix must be manually verified.

### SECURITY_AUDITOR.md (Kenobi)
A 7-agent security audit: auth (Yoda), injection (Windu), access control (Ahsoka), secrets (Leia), infrastructure (Rex), data protection (Padmé), dependencies (Chewie). Covers OWASP Top 10, PII handling, CSP/CORS, and incident response.

### SYSTEMS_ARCHITECT.md (Picard)
A 5-agent architecture review: data architecture (Spock), infrastructure strategy (Scotty), integrations (Uhura), reliability (La Forge), tech debt (Data). Produces ADRs, scaling plans, failure mode catalogs, and tech debt inventories.

### DEVOPS_ENGINEER.md (Kusanagi)
A 6-agent infrastructure protocol: provisioning (Senku), deployment (Levi), networking (Spike), monitoring (L), backup (Bulma), cost analysis (Holo). Produces deploy scripts, backup automation, runbooks, and monitoring setup.

### SUB_AGENTS.md
The orchestration protocol for running multiple agents in parallel across Claude Code sessions. Defines scope boundaries, delegation templates, response templates, conflict resolution rules, and anti-patterns.

### PRD_GENERATOR.md
A ready-to-paste prompt for generating comprehensive PRDs from rough product ideas. Produces all 16 sections a build protocol expects.

---

## Evolving the Scaffold

The scaffold is designed to get smarter over time. When you discover a new pattern that works:

1. Write it as a method doc in `docs/methods/`
2. Add it to the doc table in `CLAUDE.md`
3. If it has a natural agent persona, add characters to `NAMING_REGISTRY.md`

**Examples of method docs you might add:**

| Doc | Purpose |
|-----|---------|
| `API_DESIGN.md` | REST/GraphQL conventions, error codes, pagination |
| `DATABASE_PATTERNS.md` | Query patterns, indexing, migration safety |
| `PERFORMANCE.md` | Load testing, profiling, optimization playbook |
| `COPYWRITING.md` | Brand voice, microcopy patterns, tone rules |
| `DEPLOYMENT.md` | CI/CD pipelines, blue-green deploys, rollback procedures |
| `ANALYTICS.md` | Event taxonomy, funnel definitions, instrumentation |
| `PROMPT_ENGINEERING.md` | AI prompt versioning, A/B testing, quality metrics |
| `MOBILE.md` | React Native / Flutter specific patterns and review |

---

## Philosophy

**Methodology, not templates.** These docs teach Claude Code *how* to build, not *what* to build. The PRD handles the "what." This means the scaffold works for a Next.js SaaS, a Django API, a Rails monolith, or anything else — the process is stack-agnostic even though the agents adapt to whatever stack the PRD specifies.

**Accumulate intelligence.** Every project makes the scaffold better. When you find something that works — a checklist, a pattern, a review process — add it as a method doc. The scaffold compounds.

**Named agents are not gimmicks.** They serve three real purposes: (1) they create clear scope boundaries so parallel work doesn't collide, (2) they make logs and handoffs immediately scannable ("Legolas" is faster to parse than "Frontend Sub-Agent #3"), and (3) they make development genuinely more fun, which matters when you're staring at logs at midnight.

**The PRD is sacred.** Method docs define process. The PRD defines product. Agents never override product requirements with architectural preferences or process opinions. When there's ambiguity, they flag it and present options — they don't decide product direction.

**Verify everything.** Every method doc emphasizes manual verification, regression checklists, and "prove it works" culture. No agent marks anything done without demonstrating it.

---

## License

MIT — use it however you want.
