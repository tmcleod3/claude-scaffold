# The VoidForge Holocron

*A Holocron is an ancient device that stores the accumulated knowledge and teachings of Jedi masters. Only Force-sensitive users can open one.*

*You're holding VoidForge's. You opened it by installing Claude Code.*

---

## Table of Contents

1. [Ignition](#1-ignition) — What VoidForge is, choosing your tier, first setup
2. [The Forge](#2-the-forge) — Your first project, end-to-end
3. [The Protocol](#3-the-protocol) — The 13-phase build sequence explained
4. [The Council](#4-the-council) — The agent system, characters, and how they work together
5. [The Arsenal](#5-the-arsenal) — Slash commands, when to use each
6. [The Craft](#6-the-craft) — Code patterns and coding standards
7. [The Archive](#7-the-archive) — Build journal, context management, session recovery
8. [Troubleshooting](#8-troubleshooting) — When things break
9. [Evolution](#9-evolution) — Making VoidForge smarter over time

---

## 1. Ignition

### What VoidForge Is

VoidForge is a **methodology framework** for building full-stack applications with Claude Code. It's not a code template — it's a *process* template. Drop in a Product Requirements Document, and a named team of 170+ AI agents across 7 fictional universes builds your application through a 13-phase protocol.

**From nothing, everything.**

It works with any tech stack: Next.js, Express, Django, Rails, Go, or whatever your PRD specifies. VoidForge doesn't care about frameworks — it cares about *process*.

### Choose Your Tier

VoidForge comes in three flavors, each on its own branch:

#### Full (`main` branch)
Everything. Two browser-based wizards, cloud provisioners for 6 deploy targets, encrypted credential vault, PRD generation with Claude.

```bash
git clone https://github.com/tmcleod3/voidforge.git
cd voidforge
npm install
npm run wizard
```

**Best for:** Users who want the guided experience. Merlin walks you through setup, Strange handles deployment. Point-and-click where possible.

#### Scaffold (`scaffold` branch)
The methodology without the tooling. CLAUDE.md, all 15 slash commands, all agent protocols, all code patterns, project scaffolding script. No wizard, no npm dependencies, no TypeScript compilation.

```bash
mkdir my-app && cd my-app
git clone --branch scaffold https://github.com/tmcleod3/voidforge.git .
# Write your PRD in docs/PRD.md
# Open in Claude Code
/build
```

**Best for:** Developers who know what they're doing and want to skip the wizard. You manage your own infrastructure. VoidForge manages your build process.

#### Core (`core` branch)
The lightest possible version. CLAUDE.md, the 13 slash commands, full agent protocols, full character registry, code patterns. Zero overhead — can be dropped into any existing project or referenced as external context.

```bash
# Option A: Drop into an existing project
git clone --branch core https://github.com/tmcleod3/voidforge.git /tmp/vf
cp -r /tmp/vf/.claude /tmp/vf/CLAUDE.md /tmp/vf/docs your-project/

# Option B: Point Claude Code at it as context
# In your Claude Code session, reference the core branch
```

**Best for:** Teams with existing projects who want the VoidForge methodology. Or anyone who wants Claude Code to absorb the agent structure, build protocol, and coding patterns without changing their setup.

### What You Get (All Tiers)

Every tier includes:
- **CLAUDE.md** — Root context loaded at every session start
- **15 slash commands** — `/build`, `/qa`, `/test`, `/security`, `/ux`, `/review`, `/devops`, `/architect`, `/git`, `/void`, `/thumper`, `/assemble`, `/campaign`, `/imagine`, `/debrief`
- **13-phase build protocol** — PRD to production with verification gates
- **13 specialist agent protocols** — Each lead has behavioral directives and a sub-agent roster
- **170+ named characters** — From Tolkien, Marvel, DC, Star Wars, Star Trek, Dune, and Anime
- **7 code patterns** — Reference implementations with framework adaptations
- **This Holocron** — The guide you're reading now

The Full tier adds:
- **Merlin** — Browser-based setup wizard (vault, credentials, PRD generation, scaffolding)
- **Strange** — Browser-based deploy wizard (6 target provisioners with SSE streaming)
- **Encrypted vault** — AES-256-GCM credential storage
- **Cloud provisioners** — Docker, AWS VPS, Vercel, Railway, Cloudflare, S3

---

## 2. The Forge

### Your First Project, End-to-End

Here's the complete flow from idea to live application. This walkthrough uses the Full tier — Scaffold and Core users skip the wizard steps.

#### Step 1: Ignite

```bash
npx voidforge init
```

**Merlin** opens in your browser. Walk through:
1. **Vault** — Create a password-encrypted credential store (AES-256-GCM)
2. **Credentials** — Add your Anthropic API key (required for PRD generation)
3. **Cloud providers** — Optionally add AWS, Vercel, Railway, or Cloudflare credentials
4. **Project** — Name your project, choose a directory, pick a domain
5. **PRD** — Describe your idea and let Claude generate a full PRD with YAML frontmatter, OR paste one you've written
6. **Deploy target** — Choose where you'll deploy (Docker, AWS VPS, Vercel, Railway, Cloudflare, S3)
7. **Review & Create** — Merlin scaffolds your project

Your project directory now contains the full VoidForge build system plus your PRD.

#### Step 2: Build

```bash
cd your-project
# Open in Claude Code
/build
```

Claude reads your PRD, validates the frontmatter, and executes the 13-phase build protocol. This is the big step — Claude writes your actual application code:

- API routes, services, database migrations
- Frontend components, layouts, pages
- Authentication flows
- Integration code
- Tests at every phase

This is interactive. Claude works through each phase, verifies gates, and logs everything. A medium-complexity app takes 2-6 hours across multiple Claude Code sessions. The build journal handles session recovery.

#### Step 3: Deploy

```bash
# Option A: Browser wizard
npx voidforge deploy

# Option B: Headless (from terminal / Claude Code — no browser needed)
npx voidforge deploy --headless
```

**Strange** scans your project, loads your PRD, and provisions infrastructure for your chosen target. The browser wizard shows a visual UI with SSE progress streaming; the `--headless` flag runs the same provisioner code from the terminal (used by `/build` Phase 12 so you never leave Claude Code). For AWS VPS, that means:
- EC2 instance created and running
- Security groups configured
- SSH key generated
- Optional RDS (Postgres/MySQL) and ElastiCache (Redis)
- Deploy scripts generated in `infra/`

Then deploy:

```bash
# AWS VPS
ssh ec2-user@$SSH_HOST "bash -s" < infra/provision.sh   # One-time server setup
./infra/deploy.sh                                         # Push your app live

# Vercel
npx vercel deploy --prod

# Railway
railway link && railway up

# Cloudflare
npx wrangler pages deploy ./dist

# Docker
docker-compose up -d
```

#### Step 4: Verify

Your app is live. The deploy script ran a health check. SSL is auto-provisioned by Caddy (VPS) or the platform (Vercel/Railway/Cloudflare). Check your monitoring, run through the critical user journey, and you're launched.

### Scaffold/Core Users

Skip Steps 1 and 3. Write your PRD manually in `docs/PRD.md`, run `/build`, and handle your own infrastructure. The methodology is the same — only the automation layer differs.

---

## 3. The Protocol

### The 13 Phases

The build protocol is a sequence of phases, each led by a specialist agent. Phases have verification gates — you can't advance until the gate passes. Some phases can be skipped based on your PRD frontmatter.

| Phase | Lead | What Happens |
|-------|------|-------------|
| **0. Orient** | Picard | Reads PRD, validates frontmatter, produces ADRs, flags gaps |
| **1. Scaffold** | Stark + Kusanagi | Framework init, directory structure, test runner setup |
| **2. Infrastructure** | Kusanagi | Database, Redis, environment config, verify boot |
| **3. Auth** | Stark + Galadriel | Login, signup, OAuth, sessions, roles. Kenobi reviews. |
| **4. Core Feature** | Stark + Galadriel | Most important user flow, complete vertical slice |
| **5. Supporting** | Stark + Galadriel | Remaining features in dependency order, small batches |
| **6. Integrations** | Stark | Payments, email, storage, external APIs |
| **7. Admin** | Stark + Galadriel | Dashboard, user management, audit logging |
| **8. Marketing** | Galadriel | Landing pages, pricing, legal, SEO |
| **9. QA Pass** | Batman | Full test suite, bug hunting, regression checklist |
| **10. UX/UI Pass** | Galadriel | Accessibility audit, responsive design, state coverage |
| **11. Security Pass** | Kenobi | OWASP audit, secrets scan, dependency check |
| **12. Deploy** | Kusanagi | Production provisioning, monitoring, backups |
| **13. Launch** | All | Final checklist — SSL, email, payments, analytics, monitoring |

### PRD Frontmatter

Your PRD starts with a YAML block that controls which phases run:

```yaml
---
type: full-stack          # full-stack | api-only | static-site | prototype
auth: yes                 # yes | no
payments: stripe          # stripe | lemonsqueezy | none
workers: no               # yes | no
admin: yes                # yes | no
marketing: no             # yes | no
email: resend             # resend | sendgrid | ses | none
deploy: vps               # vps | vercel | railway | cloudflare | static | docker
---
```

Set `auth: no`? Phase 3 is skipped. Set `marketing: no`? Phase 8 is skipped. Set `type: api-only`? Phases 8 and 10 are skipped. The protocol adapts to your project.

### Verification Gates

Every phase has a gate — a combination of manual verification and automated checks:

- **Phase 0:** All PRD sections accounted for, frontmatter validates
- **Phase 1:** `npm run build` passes, test runner works
- **Phase 2:** Dev server starts, database connects, `npm test` passes
- **Phase 3:** Login/signup/logout works, auth tests pass
- **Phase 4:** Core journey works end-to-end, >80% service coverage
- **Phase 5:** Each batch works, no regressions, all tests pass
- **Phase 9:** All critical/high bugs fixed, full test suite green
- **Phase 11:** No critical/high security findings
- **Phase 12:** App loads in production, health check passes, monitoring receives data
- **Phase 13:** All checklist items verified

**Gates are breaking.** Failing tests prevent phase advancement. No exceptions.

### Small Batches

During feature phases (4-8), work happens in small batches:
- One user flow or component cluster per batch
- Max ~200 lines of production code (tests don't count)
- Each batch is independently verifiable
- If a batch breaks something, revert it, isolate the issue, fix, and re-apply

### Session Recovery

Long builds span multiple Claude Code sessions. The build journal system handles this:
1. Every phase logs to `/logs/phase-XX-*.md`
2. Master state lives in `/logs/build-state.md` (read at every session start)
3. Decisions go to `/logs/decisions.md`, handoffs to `/logs/handoffs.md`
4. New sessions pick up from the journal, not from scratch

---

## 4. The Council

### How the Agent System Works

VoidForge uses 13 lead agents across 7 fictional universes, each commanding a roster of themed sub-agents. This isn't decoration — it serves three purposes:

1. **Scope boundaries.** When Stark is leading, you're doing backend work. When Galadriel takes over, you're doing frontend. The character tells you which domain you're in.
2. **Scannable logs.** Build journal entries tagged with agent names are instantly searchable. "What did Batman find?" is faster than "What happened during QA?"
3. **Memorable teams.** You remember that Romanoff trusts no external API and Samwise never leaves anyone behind. Character traits encode behavioral directives.

### The Leads

| Agent | Name | Universe | Domain | Personality |
|-------|------|----------|--------|-------------|
| Frontend & UX | **Galadriel** | Lord of the Rings | UI, UX, accessibility, design systems | Timeless elegance, sees all, refuses to compromise on craft |
| Backend | **Stark** | Marvel | APIs, databases, services, queues, integrations | Builds fast, iterates faster, genius-level engineering |
| QA | **Batman** | DC Comics | Bug hunting, testing, hardening | Cross-cutting investigator. Breaks everything. Trusts nothing. |
| Security | **Kenobi** | Star Wars | Auth, injection, secrets, data, OWASP | Calm authority, centuries of wisdom, always has the high ground |
| Architecture | **Picard** | Star Trek | Schema, scaling, ADRs, tech debt, failure modes | Measured decisions, diplomatic, "make it so" |
| DevOps | **Kusanagi** | Anime | Deploy, monitor, backup, infrastructure | Ghost in the Shell precision, cybernetic efficiency |
| Release | **Coulson** | Marvel | Versioning, changelogs, commits, releases | S.H.I.E.L.D.'s meticulous record-keeper, everything by the book |
| Forge Sync | **Bombadil** | Lord of the Rings | VoidForge self-update from upstream | Ancient, joyful, sings while he works, tends the forge itself |
| Worm Rider | **Chani** | Dune | Telegram bridge, Gom Jabbar, sandworm relay | Desert-born, fierce, speaks across any distance |
| The Initiative | **Fury** | Marvel | Full pipeline orchestration, crossfire, council | Assembles the team. Doesn't leave until the mission is complete. |
| Campaign Command | **Sisko** | Star Trek | PRD-to-product campaign, mission sequencing | The builder, the prophet, the war commander. Reads the plan, picks the next fight. |
| Forge Artist | **Celebrimbor** | Lord of the Rings | AI image generation from PRD descriptions | Hand of Silver. Greatest elven smith. Forges visual assets from prose. |
| Field Medic | **Bashir** | Star Trek | Post-mortem analysis, upstream feedback | Genetically enhanced diagnostician. Traces root causes, sends field reports to Starfleet. |

### Sub-Agent Highlights

Each lead has a deep bench. Here are some standouts:

**Tolkien (Frontend)**
- **Gandalf** arrives precisely when things break
- **Samwise** never leaves anyone behind (accessibility champion)
- **Bilbo** writes the microcopy
- **Legolas** brings precision and elegance to components
- **Haldir** guards the boundaries between systems

**Marvel (Backend)**
- **Banner** stays calm until queries get slow
- **Romanoff** trusts no external API
- **Hill** tracks everything — mission control, nothing slips past her
- **Thor** brings the thunder on queue processing
- **Barton** never misses an error case

**DC Comics (QA)**
- **Oracle** sees the whole system at once
- **Red Hood** breaks everything on purpose
- **Alfred** inspects every dependency personally
- **Nightwing** covers every angle with agile testing
- **Constantine** finds cursed code nobody else can

**Star Wars (Security)**
- **Yoda** guards authentication with centuries of wisdom
- **Windu** deflects every injection attack
- **Leia** keeps the secrets safe
- **Ahsoka** enforces access control boundaries
- **Rex** performs tactical systematic lockdown

**Star Trek (Architecture + Campaign)**
- **Spock** brings logical precision to data architecture
- **Scotty** knows the infrastructure limits ("I'm givin' her all she's got!")
- **La Forge** keeps the engines running
- **Kira** detects unfinished work — finishes the fight before starting new ones
- **Dax** reads the PRD, figures out what's next across lifetimes of experience
- **Odo** verifies prerequisites — shapeshifts to match whatever's needed

**Anime (DevOps)**
- **Levi** deploys with zero wasted motion
- **Senku** builds infrastructure from scratch ("ten billion percent!")
- **Vegeta** optimizes relentlessly ("it's over 9000!" for monitoring)
- **L** observes everything (logging and observability)
- **Spike** stays cool under pressure (incident response)

**Dune (Worm Rider)**
- **Stilgar** protects the channel — no outsider enters the sietch
- **Mohiam** administers the Gom Jabbar — "put your hand in the box"
- **Idaho** keeps the connection alive — the eternal ghola who always returns
- **Thufir** parses every signal — Mentat precision, a million calculations per second

The full roster of 170+ characters lives in `docs/NAMING_REGISTRY.md`.

### How Handoffs Work

Agents hand off to each other when they find issues outside their domain:

- Galadriel finds bad API data → hands off to **Stark**
- Stark finds a vulnerability → hands off to **Kenobi**
- Batman finds an architecture problem → hands off to **Picard**
- Kenobi's fix needs infra changes → hands off to **Kusanagi**
- Any agent finds a release-worthy change → notifies **Coulson**

Every handoff is logged to `/logs/handoffs.md` with context so the receiving agent doesn't start from scratch.

### Conflict Resolution

When agents disagree (security vs. simplicity, architecture vs. implementation constraints):

1. **Check the PRD** — product requirements take precedence
2. **If PRD is silent** — present trade-offs to the user with a recommendation
3. **Document as ADR** — the resolution goes into `/docs/adrs/`
4. **Security wins ties** — when security and simplicity conflict, find the simplest secure solution

---

## 5. The Arsenal

### Slash Commands

Fifteen commands, each self-contained with inline execution steps. You don't need to read method docs first — the commands load what they need.

#### `/build` — The Full Protocol
**When:** Starting a new project or resuming a build.

Executes the 13-phase build protocol from PRD to production. Reads `build-state.md` to determine where you left off, loads the relevant method docs for the current phase, and drives through the sequence.

This is the main command. Everything else is a targeted operation.

#### `/qa` — Batman's QA Pass
**When:** After building features, before deploy. Or anytime something feels off.

Double-pass review: Pass 1 runs parallel analysis — Oracle scans the system, Red Hood breaks things, Alfred audits dependencies, Deathstroke probes adversarially, Constantine hunts cursed code. Lucius checks config. Fixes are applied in batch. Pass 2 re-verifies — Nightwing re-runs tests, Red Hood re-probes fixed areas, Deathstroke re-tests boundaries. Catches fix-induced regressions.

#### `/test` — Batman's Test-Writing Mode
**When:** You need to write or improve tests. Different from `/qa` (which finds bugs).

Analyzes coverage gaps (Oracle + Alfred in parallel), reviews test architecture (Nightwing), writes missing unit/integration/component tests in priority order, then Red Hood writes adversarial tests for boundary values and edge cases.

#### `/security` — Kenobi's Audit
**When:** Before any deploy. After adding auth, payments, or external integrations.

Phase 1 runs parallel scans (Leia: secrets, Chewie: dependencies, Rex: infrastructure, Maul: red-team). Phase 2 runs sequential deep audits (auth, input, access control, data). Critical/high findings are fixed. Phase 3: Maul re-probes all remediations to verify fixes hold.

#### `/ux` — Galadriel's Review
**When:** After UI work. Before launch.

Adversarial UX/UI review with double-pass: Pass 1 walks every user flow with 7 agents in parallel (UX, visual, a11y, copy, code, perf, edge cases). Fixes are applied. Pass 2: Samwise re-audits a11y on modified components, Gandalf re-checks edge cases. Ensures fixes don't break other properties.

#### `/review` — Picard's Code Review
**When:** After writing code, before committing. For pattern compliance and quality.

Picard-affiliated (Star Trek). Parallel analysis: Spock checks pattern compliance against `/docs/patterns/`, Seven reviews code quality (complexity, dead code, duplication), Data reviews maintainability (abstractions, coupling, boundaries). Re-verification pass after fixes. Findings categorized as Must Fix, Should Fix, Consider, or Nit.

#### `/devops` — Kusanagi's Infrastructure
**When:** Setting up deploy target. Adapts based on PRD `deploy` value.

Generates infrastructure configuration for your target (VPS, Vercel, Railway, Cloudflare, Docker, static). Includes first-deploy pre-flight checklist: env vars, secrets, database seeding, DNS, SSL, health check, rollback test, monitoring, security review.

#### `/architect` — Picard's Review
**When:** Before building, after major changes, when scaling concerns arise.

Full architecture review with parallel analysis: Spock (schema) + Uhura (integrations) run in parallel, then Scotty handles service architecture and scaling, then La Forge (failure modes) + Data (tech debt) run in parallel. ADR production. Includes conflict resolution protocol.

#### `/git` — Coulson's Release
**When:** After completing a set of changes you want to version.

6-step release flow: analyze diffs (Vision), determine semver bump (Friday), write changelog (Wong), craft commit (Rogers), verify consistency (Barton), optional push (Coulson). Updates VERSION.md, CHANGELOG.md, and package.json atomically.

#### `/void` — Bombadil's Forge Sync
**When:** You want to update your VoidForge methodology to the latest version.

Old Tom Bombadil tends the forge itself. He reaches upstream to the VoidForge scaffold branch, compares every shared methodology file against your local copies, shows you exactly what changed, and sings the updates into place — all while preserving your project-specific customizations (PRD, logs, code, CLAUDE.md project section). Works regardless of which tier you installed (main, scaffold, or core). If you're already on the latest, Tom tells you so and goes back to singing.

#### `/thumper` — Chani's Worm Rider
**When:** You want to control Claude Code from your phone via Telegram.

*"Tell me of your homeworld, Usul."*

Plant a thumper in the sand and ride the worm. Chani opens a bidirectional Telegram bridge to your running Claude Code session. Send prompts from anywhere — a coffee shop, your phone, another machine. Claude's responses are sent back automatically via the Water Rings (stop hook).

The Gom Jabbar protocol gates everything. On first activation, you choose a passphrase ("word of passage"). It's hashed with PBKDF2 and erased from your Telegram chat. After 60 minutes of idle, the Reverend Mother demands the test again — prove you're human. Three wrong attempts and The Voice is silenced for 5 minutes.

The sandworm daemon auto-detects your environment: tmux (preferred, cross-platform), PTY injection (headless Linux), or osascript (macOS Terminal.app/iTerm2). For VS Code, Warp, Alacritty, or Kitty users on macOS, tmux is recommended.

Setup: `/thumper setup` (one-time). Control: `/thumper on` / `/thumper off` / `/thumper status`.

#### `/assemble` — Fury's Initiative
**When:** You want the full production pipeline in one command.

*"There was an idea..."*

Fury assembles every agent in VoidForge and runs the complete pipeline: architecture review, full build, three rounds of code review, UX pass, two rounds of security audit, infrastructure review, QA, and test suite — then the Crossfire (adversarial agents from four universes attack each other's work) and the Council (domain specialists verify nobody broke anyone else's fixes).

13 phases, all 7 universes, 40+ agents. Checkpoints after every phase so you can resume across sessions with `/assemble --resume`. Skip the build with `--skip-build` to re-run reviews on existing code. Skip the Crossfire and Council with `--fast` for lower-stakes projects.

This is the nuclear option. Use it when quality is non-negotiable.

#### `/campaign` — Sisko's War Room
**When:** You have a PRD and want VoidForge to build the whole thing, mission by mission, autonomously.

*"It's easy to be a saint in paradise."*

Sisko sits above Fury. Fury runs one battle — Sisko runs the war. He reads your PRD, diffs it against what's already built, identifies what's next, scopes it into a buildable mission, briefs you, and hands it to Fury. After each mission completes and gets committed, Sisko checks the map again and picks the next objective.

Three sub-agents: Kira (detects unfinished work — if there's an in-progress build or assembly, she finishes the fight before starting anything new), Dax (reads the PRD and figures out what to build next, respecting dependency order), and Odo (verifies prerequisites are met before each mission).

The Prophecy Board (`/logs/campaign-state.md`) tracks which PRD sections are done, in progress, or not started — persistent across sessions. Run `/campaign` again and Sisko picks up where you left off.

Flags: `--plan [idea]` (update PRD/ROADMAP without building), `--fast` (skip Crossfire+Council), `--resume` (explicit resume), `--mission "Name"` (jump to a specific section).

#### `/imagine` — Celebrimbor's Forge
**When:** Your PRD describes visual assets (illustrations, portraits, OG images, hero art) that code can't produce.

Celebrimbor scans the PRD for image requirements, derives a consistent style from the brand section, presents a plan with cost estimate, then generates images via OpenAI's API. Every image gets an entry in the asset manifest (`public/images/manifest.json`) for regeneration and auditing.

Three sub-agents: Nori (scans PRD for assets), Ori (crafts generation prompts), Dori (verifies images are wired into components).

Flags: `--scan` (report only), `--asset "name"` (one image), `--regen "name"` (overwrite), `--style "override"` (change aesthetic), `--provider model`.

#### `/debrief` — Bashir's Field Report
**When:** Something went wrong and you want to understand why — or you want to help improve VoidForge.

Bashir analyzes the session's build logs, git history, and campaign state to produce a structured post-mortem. He identifies methodology gaps, proposes fixes in VoidForge's own language, and can submit the report as a GitHub issue on the upstream repo. Users become contributors just by running `/debrief --submit` after a rough session.

Four sub-agents: Ezri (reconstructs what happened), O'Brien (traces root causes), Nog (proposes solutions), Jake (writes the report).

The feedback loop: `/void` (Bombadil) pulls updates DOWN from upstream. `/debrief` (Bashir) pushes learnings BACK UP. The forge becomes a conversation, not a broadcast.

Flags: `--submit` (create GitHub issue after review), `--campaign` (full campaign analysis), `--session` (just this session), `--dry-run` (generate without submitting).

---

## 6. The Craft

### Code Patterns

Seven reference implementations live in `docs/patterns/`. Every pattern includes framework adaptations for Next.js, Express, Django, and Rails.

| Pattern | File | What It Teaches |
|---------|------|----------------|
| **API Route** | `api-route.ts` | Zod validation, auth check, service call, consistent response shape |
| **Service** | `service.ts` | Business logic in services (not routes), ownership checks, typed errors |
| **Component** | `component.tsx` | All 4 states (loading, empty, error, success), keyboard accessible |
| **Middleware** | `middleware.ts` | Auth middleware, request logging, rate limiting |
| **Error Handling** | `error-handling.ts` | Canonical error strategy — the single source of truth |
| **Job Queue** | `job-queue.ts` | Background jobs with idempotency, retry, dead letter queue |
| **Multi-Tenant** | `multi-tenant.ts` | Workspace scoping, tenant isolation, RBAC |

### Coding Standards

These are enforced across every phase:

- **TypeScript strict mode.** No `any` unless unavoidable and commented.
- **Small files.** One component per file. Max ~300 lines.
- **Validate at boundaries.** Zod schemas on all API inputs.
- **Error handling.** Use `ApiError` types per the error-handling pattern. Never leak internals.
- **Logging.** Structured JSON with requestId, userId, action. Never log PII.
- **Business logic in services, not routes.** Routes: validate, call service, format response.
- **Ownership checks on every query.** No IDOR. Return 404, not 403.
- **Accessibility is not optional.** Keyboard nav, focus management, contrast, ARIA.
- **Small batches.** Max ~200 lines changed, one flow per batch, verify after each.

### Testing Philosophy

Tests are written alongside features, not bolted on after. They're a **breaking gate** — failing tests prevent phase advancement.

- **Unit tests** for business logic (vitest/jest/pytest/RSpec)
- **Integration tests** for API routes
- **Regression checklist** grows with every feature (2-3 items per feature, 30-50 by launch)
- **Framework mapping** in `docs/methods/TESTING.md`

---

## 7. The Archive

### Build Journal

The build journal is VoidForge's persistent memory. When context compresses or a new session starts, agents read journal files to recover state.

**Files:**
- `logs/build-state.md` — Master state file, read at every session start (under 50 lines)
- `logs/phase-XX-*.md` — Per-phase logs with decisions, test results, findings
- `logs/decisions.md` — Running log of all non-obvious decisions
- `logs/handoffs.md` — Every agent-to-agent handoff with context
- `logs/errors.md` — What broke, why, how it was fixed

**Protocol:**
1. **Start of session:** Read `build-state.md` to recover state
2. **During work:** Log decisions, test results, and findings to the active phase log
3. **End of session:** Update `build-state.md` with current state

### Context Management

Claude Code has a finite context window. VoidForge keeps sessions fast:

- Load method docs **on demand**, not all at once. Read frontend docs when doing frontend work.
- **One phase or agent domain per session.** Don't try to do everything in one sitting.
- If **50+ files read** or **100+ tool calls**, checkpoint to `build-state.md` and suggest a new session.
- New sessions pick up from the journal, not from scratch.

### Session Recovery

Long builds will span multiple sessions. Here's how it works:

1. Start a new Claude Code session in your project
2. Claude reads `CLAUDE.md` (automatic) and `logs/build-state.md` (directed by CLAUDE.md)
3. Build state tells Claude: current phase, what's done, what's next, any blockers
4. Claude picks up exactly where the last session left off
5. No context is lost — everything important is in the journal

---

## 8. Troubleshooting

### Phase Gate Failures

**Gate fails = you stop.** Don't push through. Don't stack changes on top of broken code.

1. Log the failure in the phase log and `logs/errors.md`
2. Identify the breaking change (check recent diffs)
3. Revert the change: `git revert <commit>` or `git stash`
4. Verify the regression is gone
5. Fix the specific issue
6. Re-apply with the fix included
7. Re-verify the gate

### Context Window Filling Up

Signs: Claude starts forgetting earlier decisions, responses slow down, tool calls increase.

1. Update `logs/build-state.md` with your current state
2. Start a new Claude Code session
3. The new session reads the journal and continues

### Build Journal Corruption

If `build-state.md` gets corrupted or out of date:

1. Check `git log` for recent commits — they tell you what phase you're in
2. Read the most recent `logs/phase-XX-*.md` files
3. Reconstruct `build-state.md` from these sources
4. Continue

### PRD Gaps

If Phase 0 flags critical gaps (no schema, no stack, no features):

1. **Stop.** Don't proceed with assumptions.
2. Fill the gaps in `docs/PRD.md`
3. Re-run `/build` — Phase 0 will re-validate

### Deploy Failures

If Phase 12 or a deploy script fails:

1. The deploy script auto-rolls back on health check failure (VPS)
2. Check logs: SSH into the server, check PM2 logs or Caddy logs
3. For platform deploys (Vercel/Railway), check the platform dashboard
4. Fix locally, commit, re-deploy

### Common Issues

| Problem | Fix |
|---------|-----|
| `npm run build` fails after scaffold | Check TypeScript errors — usually a missing type or import |
| Auth tests fail | Check session config, cookie settings, CSRF token setup |
| Database won't connect | Verify `.env` has correct DB_URL, check if DB is running |
| Deploy script hangs | Check SSH connectivity, verify key permissions (0600) |
| Test runner not found | Phase 1 should set it up — re-run scaffold if missing |
| Context fills mid-phase | Checkpoint to journal, new session, continue |

---

## 9. Evolution

### Making VoidForge Smarter

VoidForge accumulates intelligence over time. Every project makes it better.

#### After Each Project

Add entries to `docs/LESSONS.md`:
- What worked well
- What caused friction
- Workarounds you discovered
- Patterns that emerged

#### Promote Proven Patterns

When a lesson proves reliable across multiple projects:
1. Write a reference implementation in `docs/patterns/`
2. Add framework adaptations
3. Reference it from the relevant method doc

#### Add New Protocols

Discovered a new process that works? Add a method doc to `docs/methods/`:
1. Name an agent lead (from the appropriate universe)
2. Define behavioral directives
3. List sub-agents with roles
4. Write the execution sequence
5. Add to the Docs Reference table in CLAUDE.md

#### Cross-Branch Sync

VoidForge ships on three branches. When you update shared methodology:

**Shared files** (must exist on all branches):
- `CLAUDE.md`
- `.claude/commands/*`
- `docs/methods/*`
- `docs/patterns/*`
- `docs/NAMING_REGISTRY.md`
- `HOLOCRON.md`

Update one branch → propagate to the other two. The agents, characters, and personality are VoidForge's identity. Never strip them from any tier.

---

*"In my experience, there's no such thing as luck." — Kenobi*

*"From nothing, everything." — VoidForge*
