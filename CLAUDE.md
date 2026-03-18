# CLAUDE.md

## Project

- **Name:** [PROJECT_NAME]
- **One-liner:** [ONE_LINE_DESCRIPTION]
- **Domain:** [DOMAIN]
- **Repo:** [REPO_URL]

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

## Build Journal — Log Everything

Every phase, decision, handoff, and failure gets logged to `/logs/`. See `/docs/methods/BUILD_JOURNAL.md`.

- **Start of session:** Read `/logs/build-state.md` to recover state
- **During work:** Log decisions, test results, and findings to the active phase log
- **End of session or context getting heavy:** Update `/logs/build-state.md` with current state

## Context Management

Pre-load active domain methodology. Load application code on demand. See `/docs/methods/CONTEXT_MANAGEMENT.md`.

- Pre-load method docs for the active agent's domain at session start (1M context budget allows this)
- Watch for context pressure symptoms (re-reading files, forgetting decisions). When noticed, ask user to run `/context`. Only checkpoint when actual usage exceeds 70%.
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

## Slash Commands

| Command | What It Does |
|---------|-------------|
| `/prd` | Sisko's PRD generator — 5-act structured interview producing a complete PRD with valid YAML frontmatter |
| `/build` | Execute full build protocol — self-contained with inline steps per phase |
| `/qa` | Batman's full QA pass with double-pass verification and regression checklist |
| `/test` | Batman's test-writing mode — coverage analysis, test architecture, write missing tests |
| `/security` | Kenobi's OWASP audit with parallel + sequential phases and red-team verification |
| `/ux` | Galadriel's adversarial UX/UI review with a11y audit and verification pass |
| `/review` | Picard's code review — pattern compliance, quality, maintainability |
| `/devops` | Kusanagi's infrastructure — adapts based on deploy target |
| `/architect` | Picard's architecture review with parallel analysis and conflict resolution |
| `/git` | Coulson's version bump, changelog, commit — full release management |
| `/void` | Bombadil's forge sync — update VoidForge methodology from upstream |
| `/thumper` | Chani's worm rider — Telegram bridge with Gom Jabbar authentication |
| `/assemble` | Fury's Initiative — full pipeline: architect → build → 3x review → UX → 2x security → devops → QA → test → crossfire → council |
| `/gauntlet` | Thanos's Comprehensive Review — 5 rounds, 30+ agents, 6 universes. Review-only (no build). 4x QA, 4x UX, 4x security, crossfire, council. The ultimate test. |
| `/campaign` | Sisko's War Room — read the PRD, pick the next mission, finish the fight, repeat until done |
| `/imagine` | Celebrimbor's Forge — AI image generation from PRD visual descriptions |
| `/debrief` | Bashir's Field Report — post-mortem analysis, upstream feedback via GitHub issues |

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
| **PRD Generator** | `/docs/methods/PRD_GENERATOR.md` | Sisko — when generating a PRD from scratch |
| **Meta-Workflow** | `/docs/META_WORKFLOW.md` | How to use VoidForge to develop VoidForge — campaigns on self, anti-patterns, feedback loop |
| **Patterns** | `/docs/patterns/` | When writing code (13 reference implementations) |
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

170+ sub-agent names in `/docs/NAMING_REGISTRY.md`. No duplicates across active sessions.

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
