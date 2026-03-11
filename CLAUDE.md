# CLAUDE.md

## What This Is

This is the root context file for Claude Code. It is read at the start of every session to orient the agent on the project, stack, conventions, and methodology.

**This scaffold is PRD-driven.** Drop a product requirements document into `/docs/PRD.md` and Claude Code can build the entire application from it.

---

## Project

- **Name:** [PROJECT_NAME]
- **One-liner:** [ONE_LINE_DESCRIPTION]
- **Domain:** [DOMAIN]
- **Repo:** [REPO_URL]

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp .env.example .env

# 3. Set up database (if applicable)
npx prisma migrate dev
npx prisma generate

# 4. Run development server
npm run dev
```

---

## Critical Docs — READ BEFORE BUILDING

| Doc | Location | When to Use |
|-----|----------|-------------|
| **PRD** | `/docs/PRD.md` | The product spec. Source of truth for what to build. Read first. |
| **Build Protocol** | `/docs/methods/BUILD_PROTOCOL.md` | The master build sequence. Coordinates the full team from PRD to production. |
| **Frontend & UX** | `/docs/methods/PRODUCT_DESIGN_FRONTEND.md` | **Galadriel** (Tolkien). UX/UI audit, accessibility, responsiveness, design system. |
| **Backend** | `/docs/methods/BACKEND_ENGINEER.md` | **Stark** (Marvel). API, database, services, error handling, queues, integrations. |
| **QA** | `/docs/methods/QA_ENGINEER.md` | **Batman** (DC Comics). Bug hunting, hardening, regression checklists. |
| **Security** | `/docs/methods/SECURITY_AUDITOR.md` | **Kenobi** (Star Wars). OWASP, auth, secrets, headers, PII, encryption. |
| **Architecture** | `/docs/methods/SYSTEMS_ARCHITECT.md` | **Picard** (Star Trek). Architecture decisions, scaling, tech debt, failure modes. |
| **DevOps** | `/docs/methods/DEVOPS_ENGINEER.md` | **Motoko** (Anime). Provisioning, deploy, monitoring, backups, disaster recovery. |
| **Orchestrator** | `/docs/methods/SUB_AGENTS.md` | How to parallelize across Claude Code sessions. Full roster + delegation protocol. |
| **PRD Generator** | `/docs/methods/PRD_GENERATOR.md` | Prompt for creating PRDs from rough product ideas. |
| **QA State** | `/docs/qa-prompt.md` | Auto-maintained. Stack info, known issues, regression checklist. |
| **Naming Registry** | `/docs/NAMING_REGISTRY.md` | All 150+ character names by universe. Dedup rules. |

---

## The Team

| Agent | Name | Universe | Domain | Default Sub-agents |
|-------|------|----------|--------|-----------|
| Frontend & UX | **Galadriel** | Tolkien | UI, UX, a11y, design system | Elrond, Arwen, Samwise, Bilbo, Legolas, Gimli, Gandalf |
| Backend | **Stark** | Marvel | API, DB, services, queues | Rogers, Banner, Strange, Barton, Romanoff, Thor, Fury |
| QA | **Batman** | DC Comics | Bugs, hardening, regression | Oracle, Red Hood, Alfred, Lucius, Nightwing |
| Security | **Kenobi** | Star Wars | Auth, injection, secrets, data | Yoda, Windu, Ahsoka, Leia, Rex, Padmé, Chewie |
| Architecture | **Picard** | Star Trek | Schema, scaling, decisions | Spock, Scotty, Uhura, La Forge, Data |
| DevOps | **Motoko** | Anime | Deploy, monitor, backup | Senku, Levi, Spike, L, Bulma, Holo |

**150+ named characters** across all universes. See `/docs/NAMING_REGISTRY.md` for the full pool. No duplicate names across active sessions — first claim wins, pick the next from your pool.

---

## How to Build From the PRD

When given a PRD at `/docs/PRD.md`, follow this sequence:

### Phase 0: Orient
1. Read the PRD completely
2. Extract: tech stack, database schema, API routes, page routes, integrations
3. Generate the project structure per the PRD's architecture section
4. Set up infrastructure (database, cache, env vars, process management)

### Phase 1: Foundation
1. Scaffold the framework (Next.js, Django, Rails, etc. — whatever the PRD specifies)
2. Database schema + migrations
3. Authentication
4. Basic layout/routing

### Phase 2: Core Features
1. Build the primary user flow end-to-end
2. Integrate external services (AI, payments, email, storage)
3. Background jobs/workers if needed

### Phase 3: Secondary Features
1. Dashboard, settings, admin
2. Analytics, tracking
3. Billing/subscription management

### Phase 4: Polish
1. Run full QA pass (`/docs/methods/QA_ENGINEER.md`)
2. Run full UX/UI pass (`/docs/methods/PRODUCT_DESIGN_FRONTEND.md`)
3. Performance optimization
4. Security audit

### Phase 5: Ship
1. Deployment configuration
2. DNS, SSL, CDN
3. Monitoring, backups
4. Launch checklist

---

## Coding Standards (Defaults — Override in PRD)

- **TypeScript strict mode.** No `any` unless unavoidable and commented.
- **Small, focused files.** One component per file. Co-locate types with modules.
- **Validate at boundaries.** Zod schemas on all API inputs.
- **Error handling:** Catch at boundaries, structured responses, never leak stack traces.
- **Logging:** Structured JSON. Include requestId, userId, action.
- **Commits:** Small, explainable in one sentence.
- **No new dependencies** without explicit justification.
- **Accessibility is not optional.** Keyboard nav, focus management, contrast, ARIA.

---

## What "Done" Looks Like

Before marking any feature complete:

1. Works on desktop AND mobile
2. Works with keyboard-only navigation
3. Has loading, empty, error, and success states
4. Has been manually walked through end-to-end
5. No console errors or warnings
6. Passes lint and typecheck
7. Copy matches the product's voice/tone
8. Updated in regression checklist if it touches a critical flow

---

## Adding New Method Docs

Drop new `.md` files into `/docs/methods/`. Each should be a self-contained protocol that Claude Code can follow. Reference them in this file's doc table above. The more specific and actionable the method doc, the better the output.

Examples of method docs you might add:
- `API_DESIGN.md` — REST/GraphQL conventions, error codes, pagination
- `DATABASE_PATTERNS.md` — Query patterns, indexing strategy, migration rules
- `SECURITY_AUDIT.md` — Penetration testing checklist, OWASP top 10 review
- `PERFORMANCE.md` — Load testing, profiling, optimization playbook
- `COPYWRITING.md` — Brand voice guide, microcopy patterns, tone rules
- `DEPLOYMENT.md` — CI/CD pipeline, blue-green deploys, rollback procedures
- `ANALYTICS.md` — Event taxonomy, funnel definitions, instrumentation guide
