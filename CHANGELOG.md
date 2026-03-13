# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [2.7.0] - 2026-03-12

### Added
- **Real API provisioning** for all deploy targets — Vercel creates projects, Railway creates projects with database/Redis services, Cloudflare creates Pages projects with D1 databases, Static S3 creates buckets with website hosting. All verified with live infrastructure.
- **Shared HTTP client** for provisioner API calls with safe JSON parsing and slug generation
- **Crash recovery cleanup** — orphaned resources from process crashes can now be cleaned up after server restart via disk-persisted manifests
- **SSE keepalive** on provisioning and PRD generation streams — prevents proxy/VPN/browser timeouts with 15-second heartbeats and event IDs
- **VoidForge favicon** — purple void portal icon

### Changed
- **Generated deploy scripts** use release-directory strategy with atomic symlink swap, post-deploy health check, and automatic rollback on failure. Keeps last 5 releases.
- **Generated provision scripts** include fail2ban, SSH hardening (no root/password), unattended security updates, 2GB swap, and log rotation
- **Generated Caddyfile** includes HSTS, Content-Security-Policy, and Permissions-Policy headers
- **Generated Dockerfiles** include HEALTHCHECK instructions. Build errors no longer silenced.
- **Generated docker-compose** uses env var DB passwords (not hardcoded), internal-only ports for DB/Redis, and app health checks
- **Generated PM2 config** includes crash-loop protection and graceful reload timeouts
- **Done page** shows target-specific deploy commands, human-readable labels, clickable URLs, and free tier/cost info
- **Railway** terminology updated from "plugins" to "services"

### Fixed
- Safe JSON parsing on all external API responses — no more crashes on HTML error pages
- S3 cleanup paginates object listing — handles buckets with more than 1000 objects
- Slugify strips leading/trailing hyphens and provides fallback for empty slugs
- Cloudflare D1 database only created for SQLite projects, not Postgres
- Railway token validation works with API tokens (not just user sessions)
- Help button now expands provider accordion when collapsed
- Vercel and Cloudflare 409 (project exists) paths track resources for cleanup

### Security
- Generated Caddyfile: HSTS, CSP, Permissions-Policy headers
- Generated provision.sh: fail2ban, SSH hardening, firewall lock-down-first
- Generated docker-compose: DB passwords from environment variables, database/Redis ports internal-only
- All 4 ADRs now implemented: provision manifest, atomic vault writes, API response validation, SSE keepalive

---

## [2.6.0] - 2026-03-12

### Added
- **Auto-provisioning system** — wizard steps 8 + 9. After project creation, provision infrastructure for your chosen deploy target with live SSE-streamed progress.
- **Docker provisioner** — generates Dockerfile (multi-stage per framework), docker-compose.yml (with optional Postgres/MySQL/Redis services), and .dockerignore
- **AWS VPS provisioner** — full EC2 + security group + SSH key pair provisioning, with optional RDS (Postgres/MySQL) and ElastiCache (Redis). Generates deploy scripts (provision.sh, deploy.sh, rollback.sh), Caddyfile, and PM2 ecosystem config.
- **Config-only provisioners** — Vercel (vercel.json), Railway (railway.toml), Cloudflare (wrangler.toml), Static S3 (deploy-s3.sh)
- **Provisioning API** — `POST /api/provision/start` (SSE-streamed), `POST /api/provision/cleanup`, `GET /api/provision/incomplete` for crash recovery
- **Provision manifest** (ADR-001) — write-ahead resource tracking at `~/.voidforge/runs/` prevents orphaned AWS resources on crash
- **Pre-provisioning confirmation gate** — users see what will be created (and AWS cost warning) before clicking "Start Provisioning"
- **4 Architecture Decision Records** — provision manifest, atomic vault writes, API response validation, SSE keepalive
- **QA regression checklist** — 24-item checklist covering all provisioning flows, a11y, and mobile

### Changed
- **Vault writes are now atomic** (ADR-002) — write-to-temp + fsync + rename prevents credential loss on crash
- **Wizard expanded to 9 steps** — step 8 (provision with confirmation gate) and step 9 (done with infra details)
- **User-controlled transitions** — replaced auto-advance with explicit "Continue" button for a11y
- **Advanced setup card** — updated copy from "Infrastructure provisioning in future phases" to "Automatic infrastructure provisioning"

### Fixed
- **JS injection** in PM2 config via project names containing quotes — now uses `JSON.stringify`
- **S3 deploy script** — added missing `--exclude '*'` before `--include` flags
- **RDS/EC2 networking** — RDS instance now shares security group with EC2; DB/Redis ports added to SG
- **RDS password** — generated with `crypto.randomBytes` instead of predictable slug-based derivation
- **Skip provisioning** — now aborts in-flight fetch via AbortController
- **Cleanup race condition** — resources tracked per run ID instead of global mutable state
- **Security group cleanup** — retry loop with 10s intervals instead of insufficient 5s sleep
- **Empty SSH key** — validates AWS returns key material before writing file
- **Rollback script** — framework-aware restart commands (Django/Rails) instead of hardcoded npm/PM2

### Security
- **Atomic vault writes** prevent credential file corruption
- **DB password masked** on wizard done page (shown as bullet characters)
- **`.ssh/` added to .gitignore** — prevents accidental deploy key commits

---

## [2.5.0] - 2026-03-12

### Added
- **`/git` slash command** (`.claude/commands/git.md`) — Coulson's version & release management. 7-step flow: orient, analyze diffs, determine semver bump, write changelog, craft commit, verify consistency, optional push. 5 Marvel sub-agents (Vision, Friday, Wong, Rogers, Barton).
- **Release Manager protocol** (`docs/methods/RELEASE_MANAGER.md`) — Coulson's method doc with semver rules, changelog writing guidelines, commit message format, and verification checklist. Works for VoidForge and generic projects.
- **Coulson** (Marvel) as 7th lead agent — S.H.I.E.L.D.'s meticulous record-keeper for version management
- **Friday** added to Marvel character pool in NAMING_REGISTRY.md — AI assistant for versioning and automation

### Changed
- **CLAUDE.md** — added `/git` to Slash Commands table, Coulson to The Team table, Release Manager to Docs Reference
- **README.md** — added `/git` to commands table, Coulson to leads table, updated command count to 7, added git.md and RELEASE_MANAGER.md to repo structure
- **NAMING_REGISTRY.md** — added Coulson as Marvel lead (release), Friday to Marvel pool, updated rules and reserved list

---

## [2.4.0] - 2026-03-12

### Added
- **Cloud provider management** — new credential validation and storage for AWS, Vercel, Railway, and Cloudflare. Live API validation (STS, GraphQL, token verify) with vault-encrypted storage.
- **Deploy target selection** in wizard — choose deployment platform based on which providers have valid credentials. Docker always available.
- **Deploy target in `.env`** — scaffolded projects include `DEPLOY_TARGET` when a platform is selected

### Changed
- **Wizard UI overhaul** — redesigned credential step with provider cards, inline help, validation feedback. Expanded wizard flow with cloud and deploy target integration.
- **Vault concurrency** — all vault operations now serialized through a write queue to prevent race conditions on concurrent requests
- **Async key derivation** — PBKDF2 moved from sync to async to avoid blocking the event loop during encryption/decryption

### Fixed
- **Command injection** in browser launcher — replaced `exec` with `execFile` to prevent shell interpretation of URLs
- **Directory traversal** in static file server — replaced naive `..` stripping with `resolve()` + prefix check
- **SSE crash on client disconnect** — PRD generation stream now safely no-ops when the client has disconnected
- **CORS wildcard** — scoped `Access-Control-Allow-Origin` to the wizard's actual origin instead of `*`
- **Error detail leaking** — API error responses no longer include internal error bodies or stack traces
- **Password length cap** — vault unlock rejects passwords over 256 characters (DoS prevention)

### Removed
- **`claude` dependency** — removed unused package from dependencies

---

## [2.3.0] - 2026-03-12

### Added
- **Interactive setup wizard** (`wizard/`) — browser-based onboarding launched via `npm run wizard`. 5-step flow: credential vault, project setup, PRD creation, review, create.
- **Encrypted credential vault** (`wizard/lib/vault.ts`) — AES-256-GCM with PBKDF2 key derivation, stored at `~/.voidforge/vault.enc`. Cross-platform (macOS, Linux, Windows). Users manage the password however they like.
- **PRD generation with Claude** — streams a full PRD from a product idea using the best available model (auto-resolved via `/v1/models` API). Primary path in the wizard.
- **Bring Your Own PRD** tab — copy the generator prompt to clipboard for use with any AI (ChatGPT, Gemini, etc.), paste the result back with frontmatter validation.
- **Project scaffolding** — TypeScript port of `new-project.sh` logic with git init, CLAUDE.md substitution, .env generation.
- **CLI entry point** (`scripts/voidforge.ts`) — `npx voidforge init` launches the wizard.
- **Dynamic model resolution** (`wizard/lib/anthropic.ts`) — fetches available models from Anthropic API, picks newest Opus > Sonnet > Haiku. No hardcoded model IDs.
- **Frontmatter parser** (`wizard/lib/frontmatter.ts`) — YAML frontmatter extraction and validation for PRD documents.
- `tsconfig.json`, TypeScript and tsx dev dependencies.

### Changed
- **README.md** — wizard is now the primary Quick Start path. Manual setup is an alternative section. Repository structure updated to include `wizard/` and `scripts/voidforge.ts`.
- **`new-project.sh`** — comment noting `wizard/` exclusion from project copies.
- **`package.json`** — added `bin` field, `wizard` and `typecheck` scripts, `type: "module"`.

---

## [2.2.0] - 2026-03-12

### Changed
- **Project renamed to VoidForge** — "from nothing, everything." Replaced all references to `claude-scaffold` across README, scripts, package files, patterns, and version docs

---

## [2.1.1] - 2026-03-12

### Fixed
- **PostToolUse hook format** in `.claude/settings.json` — migrated from flat `command` field to nested `hooks` array structure per current Claude Code schema

---

## [2.1.0] - 2026-03-10

### Added
- **Build Journal system** (`docs/methods/BUILD_JOURNAL.md`) — persistent logging protocol for decisions, phase state, handoffs, errors. Every agent produces structured output in `/logs/`. Agents read journal files to recover state across sessions.
- **Context Window Management** (`docs/methods/CONTEXT_MANAGEMENT.md`) — session scoping guide, load-on-demand protocol, file size discipline, context checkpointing, emergency recovery.
- **Job queue pattern** (`docs/patterns/job-queue.ts`) — background jobs with idempotency keys, exponential backoff retry, dead letter queue, graceful shutdown. Includes BullMQ, Celery (Django), and Sidekiq (Rails) implementations.
- **Multi-tenancy pattern** (`docs/patterns/multi-tenant.ts`) — workspace scoping middleware, tenant-scoped services, role-based access control. Includes Next.js, Django, and Rails implementations.
- **Error handling pattern** (`docs/patterns/error-handling.ts`) — canonical error strategy: custom error types, global handler, response shape, operational vs programmer errors. Includes Express, Django, and Rails implementations.
- **Regression checklist template** in QA_ENGINEER.md — concrete table format with example entries, growth rules (2-3 items per feature, by launch: 30-50 items)
- **First-deploy pre-flight checklist** in `/devops` command — env vars, secrets, DB seeding, DNS, SSL, health check, rollback test, monitoring, security review
- **Phase rollback strategy** in BUILD_PROTOCOL.md and TROUBLESHOOTING.md — identify, revert, verify, isolate, fix, re-apply, log
- **Test execution timeline** in BUILD_PROTOCOL.md — authoritative table of which tests are written in which phase, all marked as breaking gates
- **Frontmatter validation table** in BUILD_PROTOCOL.md — valid values for each PRD field, defaults when missing
- **Parallel phase marking** in BUILD_PROTOCOL.md — each phase marked as parallelizable or strictly sequential
- **Multi-agent conflict resolution** in SUB_AGENTS.md — escalation protocol: check PRD, present trade-offs to user, document as ADR. Common conflict patterns with resolutions.
- **Framework-to-test-runner mapping** in TESTING.md — table covering Next.js, Express, Django, Rails, Go, Spring Boot
- **Batman scope clarification** — explicitly cross-cutting investigator + validator

### Changed
- **CLAUDE.md** — added build journal and context management references, "small batches" defined (max ~200 lines), error-handling.ts as canonical source, deduped from README
- **BUILD_PROTOCOL.md** — rewritten with specific verification gates (manual + automated criteria per phase), test execution timeline, rollback strategy, frontmatter validation, parallel phase marking, small batch definition (~200 lines), logging integrated at every phase
- **All 6 slash commands** — rewritten from pointers to self-contained executable sequences with inline steps, context setup, parallel analysis phases, logging instructions, and handoff protocols
- **SUB_AGENTS.md** — Agent tool section clarified (parallel analysis, not parallel coding), git coordination for multi-session, conflict resolution expanded with tiebreaker protocol
- **QA_ENGINEER.md** — added Scope section clarifying cross-cutting role, regression checklist template with format and rules
- **TESTING.md** — added framework-to-test-runner mapping table at top
- **TROUBLESHOOTING.md** — added phase rollback protocol section
- **All 4 original pattern files** — added framework adaptation notes (Express, Django, Rails, Vue, Svelte)
- **patterns/README.md** — updated table with all 7 patterns, framework columns
- **new-project.sh** — creates `/logs/` directory, copies all new files
- **DevOps slash command** — adapts based on PRD `deploy` target (vps/vercel/railway/docker/static), includes first-deploy checklist

---

## [2.0.0] - 2026-03-10

### Added
- Slash commands (`.claude/commands/`) — `/build`, `/qa`, `/security`, `/ux`, `/devops`, `/architect`
- Claude Code settings (`.claude/settings.json`) — permissions, deny list, quality gate hooks
- Testing protocol (`docs/methods/TESTING.md`) — automated testing pyramid
- Troubleshooting guide (`docs/methods/TROUBLESHOOTING.md`) — error recovery per phase
- MCP integration guide (`docs/methods/MCP_INTEGRATION.md`)
- Code patterns (`docs/patterns/`) — api-route, service, component, middleware
- Feedback loop (`docs/LESSONS.md`)
- PRD frontmatter, conditional build phases, project sizing profiles
- Phase verification gates, single-session parallelism in SUB_AGENTS.md
- Per-directory CLAUDE.md convention
- Behavioral directives on all 6 agent method docs

### Changed
- CLAUDE.md restructured to dense operational instructions
- QA_ENGINEER.md integrated automated testing
- BUILD_PROTOCOL.md added conditional skip rules and verification gates

---

## [1.1.0] - 2026-03-10

### Changed
- Renamed DevOps lead from Motoko to Kusanagi across all files

---

## [1.0.0] - 2026-03-10

### Added
- Root context file (`CLAUDE.md`), 13-phase Build Protocol
- 6 specialist agent protocols (Galadriel, Stark, Batman, Kenobi, Picard, Kusanagi)
- 150+ named characters across 6 universes
- Sub-Agent Orchestrator, PRD Generator, PRD template, QA state file
- Project initialization script
