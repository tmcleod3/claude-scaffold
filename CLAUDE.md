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

Load docs on demand, not all at once. See `/docs/methods/CONTEXT_MANAGEMENT.md`.

- Read method docs when entering that agent's phase, not upfront
- If 15+ files read or 30+ tool calls in one session, checkpoint and suggest a new session
- Per-directory `CLAUDE.md` files for directory-specific conventions (keep under 50 lines each)

## Code Patterns

Reference implementations in `/docs/patterns/`. Match these shapes when writing. All patterns include framework adaptations (Next.js, Express, Django, Rails).

- `api-route.ts` — Validation, auth, service call, consistent response
- `service.ts` — Business logic, ownership checks, typed errors
- `component.tsx` — Loading, empty, error, success states. Keyboard accessible.
- `middleware.ts` — Auth, request logging, rate limiting
- `error-handling.ts` — Canonical error strategy (single source of truth)
- `job-queue.ts` — Background jobs: idempotency, retry, dead letter queue
- `multi-tenant.ts` — Workspace scoping, tenant isolation, role-based access

## Slash Commands

| Command | What It Does |
|---------|-------------|
| `/build` | Execute full build protocol — self-contained with inline steps per phase |
| `/qa` | Batman's full QA pass with parallel analysis and regression checklist |
| `/security` | Kenobi's OWASP audit with parallel + sequential phases |
| `/ux` | Galadriel's adversarial UX/UI review with a11y audit |
| `/devops` | Kusanagi's infrastructure — adapts based on deploy target |
| `/architect` | Picard's architecture review with conflict resolution protocol |
| `/git` | Coulson's version bump, changelog, commit — full release management |

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
| **Patterns** | `/docs/patterns/` | When writing code (7 reference implementations) |
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

150+ sub-agent names in `/docs/NAMING_REGISTRY.md`. No duplicates across active sessions.

## Release Tiers

VoidForge ships on three branches. Shared methodology files exist on all three.

| Branch | What's Included | Use Case |
|--------|----------------|----------|
| `main` | Full — wizards, provisioners, AWS SDK, everything | `npx voidforge init` / `npx voidforge deploy` |
| `scaffold` | Methodology only — CLAUDE.md, commands, methods, patterns, Holocron | `git clone --branch scaffold`, add PRD, `/build` |
| `core` | Ultra-light — CLAUDE.md, commands, methods, patterns, naming registry | Point Claude Code at branch to absorb methodology |

**Branch sync rule:** Changes to any shared file must propagate to all branches. Shared files:
- `CLAUDE.md`, `.claude/commands/*`, `.claude/settings.json`
- `docs/methods/*`, `docs/patterns/*`, `docs/NAMING_REGISTRY.md`
- `HOLOCRON.md`

The agents, characters, and personality are VoidForge's identity — never strip them from any tier.

## How to Build

Read the PRD. Run `/build`. Or see `/docs/methods/BUILD_PROTOCOL.md`.
