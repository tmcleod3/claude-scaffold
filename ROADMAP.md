# VoidForge Roadmap

> The plan for the plan-maker.

**Current:** v9.0.0 (2026-03-17)
**Next:** v9.1 — The Multi-Language Forge (Python)
**Status:** v9.0.0 shipped. Next: v9.1 (Python) → v9.2 (Mobile) → v9.3 (Game) → v10.0 (War Room).

---

## v4.0 — The Reliability Release

*What breaks most often for users today.*

### Pre-deploy build step
Every platform deploy assumes `dist/` exists. If the user hasn't built, they get a confusing error after infrastructure is already provisioned. Add a framework-aware build step (`npm run build`, `python manage.py collectstatic`, `bundle exec rails assets:precompile`) before any upload/push. Detect the build output directory from the framework (`dist/`, `out/`, `.next/`, `build/`, `public/`).

### GitHub Actions CI/CD generation
Users get auto-deploy on push via platform webhooks, but no test-on-PR, no lint-on-push. Generate `.github/workflows/ci.yml` (test + lint on PR) and `.github/workflows/deploy.yml` (deploy on merge to main) as part of the GitHub pre-step. Framework-aware: Node runs `npm test`, Django runs `pytest`, Rails runs `rspec`.

### Environment validation
Generate a startup validation script that checks all required env vars exist before the app boots. Read from the generated `.env` template — any key with a placeholder value (`# pending`, empty) triggers a clear error at startup instead of a cryptic runtime crash.

### Railway API migration
Replace deprecated `pluginCreate` GraphQL mutation with Railway's current template service API. Database and Redis provisioning is silently failing for new Railway accounts.

### Credential scoping per provisioner
The full vault is passed to every provisioner via `ctx.credentials`. Scope it so each provisioner only receives the keys it needs. Currently only cleanup credentials are scoped (v3.8.0 fix) — extend to the provisioning phase.

---

## v4.1 — The Observability Release

*What happens after deploy is a black box.*

### Post-deploy health monitoring
After the initial health check passes, generate a simple cron-based uptime monitor for VPS (`curl` every 5 minutes, alert on failure). For platform targets, add monitoring dashboard links to the Done screen (Vercel Analytics, Railway Metrics, Cloudflare Analytics).

### Error tracking integration
Add Sentry as an optional integration in the Gandalf wizard. If enabled, generate the Sentry SDK initialization code, configure source maps, and inject the DSN as an env var. Non-fatal — works without it.

### Structured deploy logs
Store deploy results to `~/.voidforge/deploys/` with timestamps, targets, URLs, and resource IDs. Users can run `voidforge deploys` to see their deploy history. Haku's Done screen links to the log.

### Cost estimation
Before AWS provisioning, estimate the monthly cost based on instance type, RDS, and ElastiCache choices. Display in the Haku confirm screen. Rough but useful: "Estimated: ~$45/month (t3.micro + db.t3.micro + cache.t3.micro)."

---

## v4.2 — The DX Release

*Developer ergonomics that save 10 minutes per session.*

### Type generation from schema
After Prisma schema changes, auto-run `npx prisma generate` and generate a barrel export (`types/index.ts`). Components and services import from one place.

### API documentation generation
Generate OpenAPI/Swagger spec from Express/Next.js routes. Write to `docs/api.yaml`. Optionally serve Swagger UI at `/api/docs` in development.

### Database ERD generation
Auto-generate a Mermaid entity-relationship diagram from the Prisma schema. Write to `docs/schema.md`. Picard references it during architecture reviews.

### Integration templates
Pre-built client wrappers for common services:
- **Stripe** — checkout session, webhook handler, customer portal
- **Resend** — transactional email with templates
- **S3** — file upload with signed URLs
- **Sentry** — error tracking initialization

Selected via PRD frontmatter (`payments: stripe`, `email: resend`). Generated during Phase 6 (Integrations).

### Database seeding
Generate `seed.ts` with factory functions for all schema models. Used by tests and local development. Run via `npm run seed`.

---

## v4.3 — The Resilience Pack (opt-in, integrated into Gandalf)

*From "it works" to "it stays working." Now an opt-in feature pack in Gandalf's Act 3 operations menu — not a standalone release.*

**Status:** Reclassified. Originally a standalone version, now integrated as the "Resilience Pack" card in the v7.1 wizard redesign. Users choose which features they want during project setup. All features are also addable after creation via `/campaign --plan add resilience`.

### Deploy Resilience (opt-in toggles)
- **Multi-environment** — generate `.env.development`, `.env.staging`, `.env.production`. Platform deploys scope env vars per environment.
- **Preview deployments** — for Vercel and Cloudflare Pages, configure PR preview deploys automatically. PR comments via GitHub API.
- **Auto-rollback** — one-click rollback via platform API (Vercel/Railway/Cloudflare). Surface in Avengers Tower rollback panel.
- **Migration automation** — run `prisma migrate deploy` (or framework equivalent) as part of deploy. For VPS, before symlink swap.
- **Backup automation** — daily `pg_dump` to S3 for VPS+RDS. Platform-native backups documented for Railway/D1. S3 versioning for static.

### Runtime Resilience (opt-in toggles)
- **Health check endpoint** — generates `/api/health` checking DB, Redis, disk. Framework-aware.
- **Graceful shutdown** — `SIGTERM` → drain connections → close DB → exit. Critical for zero-downtime platform deploys.
- **Error boundaries** — React error boundaries for frontend, global exception handler for backend.
- **Rate limiting** — basic rate limiter on auth endpoints. Per-IP counter middleware.
- **Dead letter queue** — for projects with `workers: yes`. Failed jobs to DLQ instead of silent drops.

### PRD Frontmatter
```yaml
resilience:
  multi-env: yes | no
  preview-deploys: yes | no
  rollback: yes | no
  migrations: auto | manual | no
  backups: daily | weekly | no
  health-check: yes | no
  graceful-shutdown: yes | no
  error-boundaries: yes | no  # only if framework has UI
  rate-limiting: yes | no
  dead-letter-queue: yes | no  # only if workers: yes
```

Smart defaults based on deploy target and framework — Vercel gets preview deploys on by default, static sites skip backups, API-only projects skip error boundaries.

---

## v4.4 — The Imagination Release

*The forge creates images. The forge learns from its users.*

### `/imagine` command — Celebrimbor's Image Generation
New slash command and agent for AI image generation. Celebrimbor (Tolkien — greatest elven smith) reads the PRD for visual asset requirements (illustrations, portraits, OG images, hero art), derives a style prompt from the brand section, and generates images via OpenAI's image API. Manages an asset manifest for regeneration and auditing. Provider-abstracted (OpenAI default, extensible to Replicate/others).

Sub-agents: Nori (asset scanner), Ori (prompt engineer), Dori (integration checker) — dwarves from The Hobbit.

Command: `/imagine` (not `/forge` — avoids collision with VoidForge/Bombadil naming). Flags: `--scan`, `--asset "name"`, `--regen "name"`, `--style "override"`, `--provider model`.

### Wizard integration — OpenAI API key in Gandalf
Add OpenAI API key as an optional credential in Gandalf's Step 2 (Cloud Providers). Same vault, same AES-256-GCM encryption, same UX. Key name: `openai-api-key`. If not provided in wizard, `/imagine` prompts on first use. Non-blocking — projects work fine without it.

### Pipeline integration
- `/assemble` Phase 2b: Celebrimbor generates assets after build, before review
- `/build` Phase 8 (Marketing): Celebrimbor runs if PRD has visual asset requirements
- `/campaign` Step 1: Dax classifies image requirements as "Asset — via /imagine" instead of BLOCKED
- Galadriel verifies generated images match brand during `/ux` pass

### Files to create
- `.claude/commands/imagine.md` — slash command
- `docs/methods/FORGE_ARTIST.md` — Celebrimbor's method doc
- `wizard/lib/image-gen.ts` — provider abstraction + generation
- `wizard/lib/asset-scanner.ts` — PRD parsing for image requirements
- Update: `NAMING_REGISTRY.md`, `CLAUDE.md`, `HOLOCRON.md`, `wizard/ui/app.js`

### `/debrief` command — Bashir's Field Reports
New slash command for post-session analysis and upstream feedback. Bashir (Star Trek DS9 — chief medical officer, diagnostician) reads the session's build logs, assemble state, campaign state, and git history, then produces a structured post-mortem that identifies methodology gaps and proposes fixes in VoidForge's own language.

The key innovation: the report can be **submitted as a GitHub issue** on the VoidForge upstream repo (`tmcleod3/voidforge`), labeled `field-report`. Users become contributors just by running `/debrief --submit` after a rough session. Upstream maintainers get structured, actionable feedback written in VoidForge's agent/command vocabulary.

Sub-agents: Ezri (session timeline reconstruction — joined Trill, multiple lifetimes of perspective), O'Brien (root cause investigation — "the bloody EPS conduits again"), Nog (solution proposals within VoidForge's framework — first Ferengi in Starfleet, creative and resourceful), Jake (report writing — Sisko's son, aspiring journalist).

Command: `/debrief`. Flags: `--submit` (create GitHub issue), `--campaign` (analyze full campaign), `--session` (just this session), `--dry-run` (generate without submitting).

**The feedback loop:**
- `/void` (Bombadil) pulls updates DOWN from upstream
- `/debrief` (Bashir) pushes learnings BACK UP to upstream
- When `/void` next runs, Bombadil can note: "Your field report was incorporated into v4.5"

**Privacy:** Reports contain timeline, root causes, and proposed fixes — NOT source code, credentials, or personal data. User reviews and approves every word before submission.

**Integration:**
- `/campaign` Step 6: After victory, Sisko offers debrief
- `/assemble` completion: If 3+ Must Fix items found, Fury suggests debrief
- Standalone: run `/debrief` anytime after a session with interesting findings

### Files to create
- `.claude/commands/debrief.md` — slash command
- `docs/methods/FIELD_MEDIC.md` — Bashir's method doc
- Update: `NAMING_REGISTRY.md`, `CLAUDE.md`, `HOLOCRON.md`

---

## v4.5 — The Seamless Release

*From Gandalf to live URL without leaving Claude Code.*

### PRD-driven credential collection
Gandalf currently collects cloud provider credentials (AWS, Vercel, etc.) in Step 2. But project-specific API keys (WhatsApp, Mapbox, Google Places, Resend, etc.) must be manually added to `.env` later. After the PRD is pasted in Step 4, Gandalf should parse the env var section, identify which keys are needed, and present a dynamic credential form (Step 4.5). All keys stored in the vault with the same AES-256-GCM encryption. Grouped by urgency: required for build, required for deploy, optional enrichment sources.

New API endpoint: `POST /api/prd/env-requirements` — parses PRD content and returns structured list of required credentials with labels, placeholders, and help text. New Gandalf step between PRD and deploy target selection.

### Headless deploy mode (`--headless`)
Haku is a browser wizard. But `/build` Phase 12 already says "Kusanagi provisions and deploys." The vault has the credentials. The PRD has the target. There's no reason to context-switch to a browser. Add `npx voidforge deploy --headless` that runs the same provisioner code but outputs progress to terminal (stdout) instead of SSE to a browser. Phase 12 of `/build` calls this directly.

New file: `wizard/lib/headless-deploy.ts` — terminal output adapter that wraps the provisioner dispatch. Modified: `scripts/voidforge.ts` to accept `--headless` flag, `.claude/commands/build.md` Phase 12 to reference headless deploy.

### PostgreSQL extension support
The VPS provisioner generates `provision.sh` but doesn't handle PostgreSQL extensions. PRDs that use PostGIS or pg_trgm (common for geospatial apps) need extension packages installed and `CREATE EXTENSION` run. Parse extensions from Prisma schema's `extensions = [postgis, pg_trgm]` line during the deploy scan step. Generate the appropriate `apt-get install` and `psql CREATE EXTENSION` commands.

Modified: `wizard/lib/provisioners/scripts/provision-vps.ts`, `wizard/api/deploy.ts`.

---

## v4.6 — The Feedback Release

*The forge learns from every battle it fights.*

Clears the field report backlog (GitHub issues #1, #2, #3). Most findings from the marketing site and Union Station field reports were already fixed in v4.4.0 (Phase 2.5 smoke tests, route collision checks, React render cycle tracing, usability walkthrough in /ux, requirement classification in /campaign, Troi compliance). Four outstanding items remain.

### `/debrief --inbox` — Bashir reads incoming field reports
Completes the feedback loop. When run on the main VoidForge repo, Bashir fetches open GitHub issues labeled `field-report`, triages each one (accept / wontfix / duplicate / needs-info), and optionally applies the fixes. This is the inverse of `--submit`: downstream projects push learnings up, `--inbox` pulls them in.

Flow: `gh issue list --label field-report --state open` → read each issue body → extract severity, root causes, proposed fixes → present inbox summary → user selects issue to triage → Bashir classifies each fix → applies accepted changes → comments on issue with triage results → closes if fully addressed.

Modified: `.claude/commands/debrief.md` (add `--inbox` argument handling), `docs/methods/FIELD_MEDIC.md` (add Inbox Mode section with triage protocol).

### `/imagine` retry logic
DALL-E 3 returns 500 errors on ~15% of requests (field report #1). Add 3 attempts with exponential backoff (1s, 3s, 9s) to the image generation pipeline. Log retry attempts. Only fail after all 3 attempts exhausted.

Modified: `wizard/lib/image-gen.ts`.

### Global CSS conflict check
Galadriel's UX review should check for specificity conflicts between global CSS (globals.css, base styles) and component-level styles (Tailwind utilities, CSS modules). When a component uses `overflow-auto` but globals.css has `.parent { overflow: hidden }`, the global wins. Add to Step 1.5 (Usability Review): "For each component with layout/overflow/position utilities, grep globals.css for conflicting rules on parent selectors."

Modified: `docs/methods/PRODUCT_DESIGN_FRONTEND.md`.

### Automated count cross-referencing in QA
Marketing sites, landing pages, and docs often claim specific numbers ("170+ agents", "13 phases", "7 patterns"). Batman should grep for numeric claims and cross-reference against the actual data source. Add to Step 3: "For marketing/docs pages, grep for number + noun patterns (e.g., '\\d+ agents'). Cross-reference each against the data source (agents.length, phase count, pattern count). Flag mismatches."

Modified: `docs/methods/QA_ENGINEER.md`.

### Estimated effort
~120 lines across 4 files. 1 session.

---

## v5.0 — The Intelligence Release

*VoidForge gets smarter with use.*

### Lessons integration
After every `/assemble` run, auto-extract learnings (what broke, what patterns emerged, what was slow) and append to `LESSONS.md`. Feed lessons back into future builds — if a pattern caused bugs in project A, flag it when seen in project B.

### Build analytics
Track build metrics across projects: phase durations, finding counts, fix-to-finding ratios, most common security issues. Surface trends: "Your projects consistently fail on auth edge cases — consider adding the auth integration test template."

### Smart scoping
`/campaign` currently scopes missions by PRD section order. Teach Dax to scope by complexity and risk — build the hardest features first (when energy is high), save polishing for later.

### Template marketplace
Curated project starters (SaaS, API, marketing site, admin dashboard) with pre-filled PRDs, pre-configured integrations, and pre-written seed data. `voidforge init --template saas` gets you 80% of the way before `/build` even starts.

---

## v5.5 — Avengers Tower Local

*Gandalf builds Avengers Tower. You never leave the browser.*

The insight: instead of reimplementing Claude Code's capabilities via the Anthropic API (custom tool executor, custom agentic loop), embed a real terminal in the browser. The user gets actual Claude Code — full tool access, 1M context window, interactive conversation — running inside an xterm.js terminal connected to the VoidForge server via WebSocket. After Gandalf creates the project (Steps 1-6), the UI transitions to Avengers Tower: a browser terminal that auto-launches Claude Code in the project directory. The user types `/build` or `/campaign` and the real 13-phase protocol executes. No terminal app needed. No context switch. And the terminal stays open after deploy — you can SSH into production, push hotfixes, run `/qa`, run `/debrief`, all from the same browser tab.

### PTY Manager (`wizard/lib/pty-manager.ts`)
Server-side component that spawns real pseudo-terminal processes using `node-pty` (the same library VS Code, Gitpod, and GitHub Codespaces use). Each PTY is a real shell (`zsh` or `bash`) with full capabilities. Manages multiple sessions per project (Claude Code in one tab, SSH in another, shell in a third). Auto-injects initial commands (`cd /path/to/project && claude`) when a session starts.

Key behaviors:
- Spawn shells as current user (no privilege escalation in local mode)
- Max 5 concurrent PTY sessions (configurable)
- Idle timeout: 30 minutes (configurable), then session is killed
- Session resurrection: if the browser disconnects and reconnects within 60 seconds, reattach to the existing PTY (don't lose work)
- Clean shutdown: on server stop, SIGHUP all PTY children

### WebSocket endpoint (`wizard/api/terminal.ts`)
Bridges browser ↔ PTY. Bidirectional: keystrokes from xterm.js → PTY stdin, PTY stdout → xterm.js render. Requires vault password to establish connection (prevents unauthorized terminal access even in local mode). Binary frames for efficiency. Handles resize events (terminal dimension changes flow through to PTY).

### Browser terminal UI (`wizard/ui/tower.html` + `wizard/ui/tower.js`)
Uses xterm.js (the standard browser terminal renderer — same as VS Code web, Gitpod, Railway console). Renders full ANSI color, cursor positioning, scrollback. Fits to container with `xterm-addon-fit`. Clickable URLs with `xterm-addon-web-links`. Tabbed interface: multiple terminals per project. Tab bar shows session type: `[Claude Code] [SSH: prod] [Shell] [+ New]`.

### Navigation flow
After Gandalf Step 6 (Review) → Step 7 (Create Project) → **Step 8: Avengers Tower**. The wizard header changes from "Gandalf — VoidForge Setup" to "Avengers Tower — [Project Name]". The progress bar is replaced by a phase status indicator (for builds in progress). Back navigation goes to The Lobby (in v6.0+) or Gandalf (single-project mode). The Gandalf wizard and Avengers Tower share the same Express server, same port, same vault session.

### Security (local mode)
Local Avengers Tower binds to `localhost:3141`. No external exposure. The threat model is the same as Claude Code itself: physical access to the machine. Mitigations:
- WebSocket requires vault password to establish PTY connection (prevents rogue browser tabs from opening terminals)
- PTY idle timeout: 30 min default, configurable
- Max 5 concurrent terminal sessions (prevent resource exhaustion)
- Terminal output sanitization: xterm.js renders raw bytes, which is safe for display, but if terminal output is ever reflected into HTML (e.g., build status sidebar), it must be escaped to prevent XSS
- `node-pty` spawns shells as the current user (never root, never a different user)

### New dependencies
- `node-pty` (~2MB native module) — spawns real PTY processes. Used by VS Code, Hyper, every Electron terminal.
- `xterm.js` (~200KB client) — browser terminal renderer. Used by VS Code web, Gitpod, GitHub Codespaces.
- `xterm-addon-fit` (~5KB) — auto-resize terminal to container.
- `xterm-addon-web-links` (~3KB) — clickable URLs in terminal output.

### Files to create
- `wizard/lib/pty-manager.ts` (~200 lines) — PTY lifecycle management
- `wizard/api/terminal.ts` (~100 lines) — WebSocket ↔ PTY bridge
- `wizard/ui/tower.html` (~100 lines) — terminal page
- `wizard/ui/tower.js` (~300 lines) — xterm.js setup, tab management, WebSocket client
- Update: `wizard/server.ts` (WebSocket upgrade handling), `wizard/ui/app.js` (transition to Avengers Tower after project creation), `scripts/voidforge.ts` (serve tower.html)

### Estimated effort
~850 lines (including security), 2-3 sessions.

---

## v6.0 — Avengers Tower Multi

*Every project gets a room. The Lobby shows them all.*

Avengers Tower expands from a single-project terminal to a multi-project operations console. The landing page becomes The Lobby: a dashboard showing all VoidForge projects with status, health, deploy URL, and quick actions. Each project is a "room" you click into — opening the full terminal workspace for that project.

### Project Registry (`wizard/lib/project-registry.ts`)
Simple JSON file at `~/.voidforge/projects.json`. Each entry:
```json
{
  "id": "uuid",
  "name": "Dialog Travel",
  "directory": "/home/forge/projects/dialog-travel",
  "deployTarget": "vps",
  "deployUrl": "https://dialog.travel",
  "sshHost": "ec2-52-1-2-3.compute-1.amazonaws.com",
  "framework": "next.js",
  "database": "postgres",
  "createdAt": "2026-03-15",
  "lastBuildPhase": 13,
  "lastDeployAt": "2026-03-15T18:30:00Z",
  "healthCheckUrl": "https://dialog.travel/api/health",
  "monthlyCost": 47
}
```

No database — VoidForge stays zero-dep for core. Registry auto-populated when Gandalf creates a project. Updated when builds complete and deploys succeed. File permissions: `0600` (owner read/write only).

### The Lobby (`wizard/ui/lobby.html` + `wizard/ui/lobby.js`)
Dashboard landing page. Cards for each project showing: name, status (building/deployed/errored), deploy URL (clickable), framework badge, deploy target badge, estimated monthly cost, health indicator (green/yellow/red), last activity timestamp. Quick actions per card: Open Room, SSH (if VPS), Logs, Deploy. Bottom bar: "The Penthouse" — vault credential count, total projects, aggregate monthly cost, links to Manage Vault and Deploy History.

"+ New Project" button launches Gandalf wizard. On completion, returns to The Lobby with the new project card.

### Import Existing Project
"+ Import Project" button in The Lobby for projects that were built with VoidForge before v6.0, or built on the scaffold/core branches without the wizard, or created on a different machine. The import flow:

1. User provides the project directory path (text input or paste)
2. VoidForge scans the directory — reuses the same scan logic from `wizard/api/deploy.ts`:
   - Checks for `CLAUDE.md` (confirms it's a VoidForge project)
   - Reads project name from `CLAUDE.md`
   - Reads `docs/PRD.md` frontmatter (framework, database, deploy target, cache)
   - Reads `.env` (deploy URL, hostname)
   - Auto-detects framework from `package.json` / `requirements.txt` / `Gemfile`
   - Reads `logs/build-state.md` (build progress, last phase)
   - Detects PostgreSQL extensions from Prisma schema
3. Presents a confirmation card: "Found: [Name] ([framework], [deploy target]). Add to Avengers Tower?"
4. On confirm, project is added to `projects.json` with all discovered metadata
5. Card appears in The Lobby — user can open a terminal immediately

Validation: directory must exist, must contain `CLAUDE.md`, must not already be in the registry (check by directory path). If the project has a deploy history in `~/.voidforge/deploys/`, the import links those deploy records to the project.

New API endpoint: `POST /api/projects/import` — accepts `{ directory: string }`, runs the scan, adds to registry, returns the project card data. Path validation: absolute path required, no `..` segments (same as all other directory-accepting endpoints).

### Health Poller (`wizard/lib/health-poller.ts`)
Background service that pings each project's health check URL every 5 minutes. Updates project registry with last health status and timestamp. Runs only when the server is active. Non-blocking — uses `fetch` with 5-second timeout. Health states: `healthy` (200 OK), `degraded` (non-200 but responding), `down` (timeout or connection refused), `unchecked` (no health URL configured).

### Multi-terminal per project
Each project room supports N terminal sessions (default max 5). Tabs show session type and can be renamed. Sessions persist across page navigation (go to The Lobby, come back, terminals are still running). Closing a terminal tab sends SIGHUP to the PTY. Creating "SSH: production" tab auto-runs `ssh user@host` using the SSH key from the vault (key never reaches the browser — server executes the SSH connection through the PTY).

### Shared vault awareness
The vault is already global (not per-project) — AWS, GitHub, Cloudflare credentials work across all projects. Gandalf's Step 4b (PRD-driven credentials) stores project-specific keys with `env:` prefix in the vault (e.g., `env:WHATSAPP_ACCESS_TOKEN`). When creating a second project that uses the same service (e.g., two projects both need Resend), the credential form pre-fills from the vault.

### Security (multi-project)
- Project directory isolation: each PTY session is scoped to its project directory. The shell starts with `cd /path/to/project`. The user CAN navigate out (it's a real shell), but initial scope is correct.
- Project registry file permissions: `0600` (owner only)
- Health poller uses GET requests only (read-only, no credentials in polling)
- Per-project session limits (prevent one project from consuming all PTY slots)
- Terminal sessions namespaced by project ID in the PTY manager

### Files to create
- `wizard/lib/project-registry.ts` (~150 lines) — CRUD for projects.json
- `wizard/api/projects.ts` (~150 lines) — REST endpoints for project list, status, health, import
- `wizard/ui/lobby.html` (~100 lines) — The Lobby dashboard
- `wizard/ui/lobby.js` (~250 lines) — project cards, health indicators, navigation
- `wizard/lib/health-poller.ts` (~100 lines) — background health checks
- Update: `wizard/server.ts` (route lobby.html as landing), `wizard/api/project.ts` (register project on creation), `wizard/ui/tower.js` (back-to-lobby navigation)

### Estimated effort
~950 lines (including security + import), 2-3 sessions.

---

## v6.5 — Avengers Tower Remote

*Access your forge from anywhere. Phone, iPad, hotel business center, a friend's laptop.*

Deploy VoidForge itself on a remote server. Access Avengers Tower through a public URL behind serious authentication. The server becomes your build machine, production host, operations console, and development environment — all accessible from any browser. You could build and deploy an entire application from your phone in an Uber.

### The architecture

```
Your device (just a browser)
  → https://forge.yourdomain.com (HTTPS + WSS)
    → Caddy (reverse proxy, auto-TLS, auth layer)
      → VoidForge Server (:3141)
        → Wizard API (Gandalf), PTY Manager, Vault, Provisioners
        → Claude Code (installed on this server, runs in PTY sessions)
        → All projects live at /home/forge/projects/
      → Also proxies deployed apps:
        → dialog.travel → Dialog Travel (port 3000)
        → api.widgets.co → Widget API (port 3001)
```

One VPS (t3.medium recommended, $30/mo) serves as your build server, production host for VPS-targeted projects, and operations console for platform-targeted projects (Vercel, Railway, Cloudflare — managed via terminal).

### Threat model — what's behind the door

Remote Avengers Tower exposes the following over the internet:
- Anthropic API key (AI access, billed to the user)
- AWS credentials (can provision EC2, RDS, S3 — significant cost exposure)
- GitHub token (push to any repo, delete branches)
- Cloudflare token (modify DNS for all domains)
- All project-specific API keys (WhatsApp, Mapbox, Google Places, Stripe, etc.)
- SSH access to every production server via stored keys
- Source code for every project
- Database credentials for every deployed project
- A live terminal that can execute ANY command as the server user
- The ability to deploy code to production at will

**This is root access to the user's entire digital infrastructure, exposed over HTTPS. Security is not a feature — it is the prerequisite.**

### Security architecture — five layers (all mandatory for remote mode)

**Layer 1: Network — minimize exposure**

Caddy configuration with IP allowlist (optional but strongly recommended) and rate limiting:
```
forge.yourdomain.com {
    @blocked not remote_ip <user-ip>/32 <vpn-cidr>/24
    respond @blocked 403

    rate_limit {
        zone forge_login {
            key {remote_host}
            events 5
            window 1m
        }
    }

    reverse_proxy localhost:3141
}
```

IP allowlist is the strongest single defense. If the user is always on a VPN, this alone blocks 99.9% of attacks. But IPs change, VPNs fail, and mobile access is a real use case — so all other layers are still required.

**Layer 2: Authentication — multi-factor, time-limited**

NOT Caddy basic auth. A proper login flow served by the VoidForge server:

Step 1 — Username + password. Bcrypt-hashed, stored in `~/.voidforge/auth.json`. Rate-limited: 5 attempts per minute per IP. Lockout: 30 minutes after 10 consecutive failures. No username enumeration (same response for invalid user and wrong password).

Step 2 — TOTP 2FA. Mandatory for remote mode, optional for local. Standard TOTP (RFC 6238) — compatible with Google Authenticator, 1Password, Authy. Secret stored encrypted in vault. Codes rotate every 30 seconds. Why TOTP and not SMS/email: works offline, no external dependencies, no SIM swap risk. The user is technical enough to use VoidForge — they can install an authenticator app.

Step 3 — Session token issued. HttpOnly + Secure + SameSite=Strict cookie. TTL: 8 hours (configurable). Stored in server memory only (never written to disk). One active session at a time (new login invalidates previous session). Session invalidated on: explicit logout, timeout, IP change (configurable — can be disabled for mobile), manual revoke via admin endpoint.

Every HTTP request checks: session valid? Every WebSocket upgrade checks: session valid? Failed checks return 401 and redirect to login.

**Layer 3: Vault — separate encryption from access**

Two-password architecture. The login password gets you into Avengers Tower (dashboard, terminals, project list). The vault password decrypts credentials. These are DIFFERENT passwords.

Why: if someone compromises the login (session hijack, XSS, shoulder surfing), they can see the dashboard and interact with terminals where Claude Code is already running, but they CANNOT:
- Read API keys or tokens
- SSH into production (SSH keys are in the vault)
- Deploy to new infrastructure (provisioners need vault credentials)
- Create new projects (Gandalf needs vault for credential storage)
- View or edit stored credentials

The vault password is NEVER stored on disk or in the session. It's held in server memory only while actively needed, then cleared. The user re-enters it for sensitive operations:
- First deploy of a session
- SSH to production
- Viewing or editing credentials in the vault
- Creating a new project
- Any provisioner operation

Vault auto-locks after 15 minutes of inactivity. Lock event logged to audit trail.

**Layer 4: Terminal sandboxing — limit blast radius**

Even after full authentication, terminal sessions are constrained:
- PTY processes run as a dedicated non-root user (`forge-user`, created during VoidForge server setup)
- Each session starts `cd`'d into the project directory
- Resource limits: max CPU time, max memory, max file descriptors per PTY
- Command audit log: every command entered into any terminal is logged (timestamp, project, session ID, command text) to `~/.voidforge/audit.log`
- Idle timeout: 30 minutes default, then session is killed
- Max sessions per project: 5. Max total sessions across all projects: 20.
- SSH to production is proxied: the browser connects to the VoidForge server's PTY, the server's PTY runs the SSH command with the key from disk. The SSH private key NEVER reaches the browser. The server acts as a jump host.

Dangerous commands (`rm -rf /`, `git push --force`, `DROP TABLE`, `shutdown`) are not blocked by VoidForge (the user is a developer, they may need these), but they ARE logged to the audit trail for review.

**Layer 5: Audit trail — know everything that happened**

Append-only log at `~/.voidforge/audit.log`. JSON lines format, machine-parseable. Every action logged:
- Login attempts (success and failure, with IP, user-agent)
- Session creation and destruction (with IP, duration)
- Vault unlock and lock events (which user, how long unlocked)
- Terminal session start and end (project, session type, duration)
- SSH connections initiated (from which project, to which host)
- Deploy commands executed (target, project, result)
- Credential access (which vault key was read, by which action)
- Project creation and deletion
- File modifications via wizard API (not via terminal — terminal commands are logged separately)
- Health check failures (which project, which URL, what status)

Log rotation: daily, 90-day retention, compressed archives. Alert on failed login attempts: if a Resend API key is in the vault, send email notification after 3 failed logins from an unknown IP.

### Self-deploy provisioner

New provisioner that deploys VoidForge itself to a VPS. The user runs `npx voidforge deploy --self` which:
1. Provisions a VPS (EC2 or manual SSH target)
2. Installs Node.js, Git, Claude Code, VoidForge
3. Configures Caddy with HTTPS for the forge domain
4. Sets up the `forge-user` system account
5. Generates initial auth credentials (username + bcrypt password, TOTP secret)
6. Shows QR code for TOTP setup
7. Starts VoidForge as a PM2-managed service
8. Reports the public URL

### Files to create
- `wizard/lib/tower-auth.ts` (~300 lines) — login flow, session management, TOTP verification, rate limiting, lockout
- `wizard/api/auth.ts` (~150 lines) — login/logout/session endpoints
- `wizard/ui/login.html` + `wizard/ui/login.js` (~150 lines) — login page with password + TOTP fields
- `wizard/lib/audit-log.ts` (~100 lines) — append-only JSON lines logger
- `wizard/lib/provisioners/self-deploy.ts` (~200 lines) — VoidForge self-deploy provisioner
- Caddy config template for remote mode (~50 lines)
- Update: `wizard/server.ts` (auth middleware, session checks), `wizard/lib/pty-manager.ts` (sandboxing, audit integration), `scripts/voidforge.ts` (`--self` flag)

### Estimated effort
~1,200 lines (security is the majority), 3-4 sessions.

---

## v7.0 — The Penthouse

*Multi-user, multi-project, coordinated operations.*

Avengers Tower becomes a team tool. Multiple users, role-based access, per-project permissions, coordinated deploys across linked services, and a rollback dashboard. The Penthouse is where the team manages their fleet.

### Role-based access
Three roles: `admin` (full access — create projects, manage users, deploy, access vault), `deployer` (can build and deploy assigned projects, cannot manage vault or users), `viewer` (read-only — can see dashboards, logs, health, but cannot execute commands or deploy).

User management stored in `~/.voidforge/users.json`. Each user: username, bcrypt password hash, TOTP secret (encrypted in vault), role, project access list, created timestamp, last login. Admin can create/remove users via The Lobby settings.

### Per-project access control
Each project in the registry has an `access` field: list of usernames with their role for that project. Admin has implicit access to all projects. A deployer might have access to "Dialog Travel" but not "Widget API". A viewer can see all projects in The Lobby but only open rooms they have access to.

### Monorepo / linked services
Projects can be linked (via `linkedProjects` field in registry). Linked projects appear as sub-cards in The Lobby. Coordinated deploys: when deploying "Dialog Travel — API", the system checks if "Dialog Travel — Workers" and "Dialog Travel — Web" also need redeployment (shared schema change, shared dependency update). Deploy order is configurable. Coordinated deploys require vault unlock + explicit confirmation for each service ("Deploy API first, then Workers, then Web? [Confirm all / Step through]").

### Rollback dashboard
Deploy history per project, visible in the project room. Each deploy entry: timestamp, git commit, deploy target, success/failure, URL. One-click rollback to any previous version. For VPS: symlink swap to previous release directory. For platforms: Vercel/Railway/Cloudflare API rollback. Rollback requires deployer role + vault unlock.

### Cost tracker
Aggregate monthly cost across all projects. Per-project breakdown. AWS billing API integration (optional — requires additional IAM permissions). For non-AWS targets: manual cost entry or platform API queries. Displayed in The Lobby footer and per-project room sidebar. Alerts when cost exceeds configurable threshold.

### Agent memory (cross-project learning)
Agents that remember across projects. After each build, key learnings are extracted and stored in `~/.voidforge/lessons.json`. When starting a new build, relevant lessons are loaded into the methodology context. "Last time you built a Next.js app with Stripe, Phase 6 failed because webhook signatures weren't verified in test mode. Adding that check proactively." Wong guards the knowledge. The Sanctum grows.

### Security (multi-user)
- Role enforcement on every API endpoint and WebSocket connection
- Per-project access checks before PTY session creation
- Coordinated deploys require vault unlock + confirmation prompt per service
- Cross-project credential access logged separately in audit trail
- User management actions (create, delete, role change) require admin role + vault unlock
- Session isolation: users cannot see each other's terminal sessions
- Shared team vault with per-user encryption keys (stretch goal — complex key management)

### Files to create
- `wizard/lib/user-manager.ts` (~200 lines) — user CRUD, role checks
- `wizard/api/users.ts` (~150 lines) — user management endpoints
- `wizard/lib/deploy-coordinator.ts` (~200 lines) — linked service deploy orchestration
- `wizard/ui/rollback.js` (~150 lines) — deploy history and rollback UI
- `wizard/lib/cost-tracker.ts` (~150 lines) — cost aggregation and alerts
- `wizard/lib/agent-memory.ts` (~150 lines) — cross-project lesson storage and retrieval
- Update: all auth and session code for role enforcement, PTY manager for user isolation, The Lobby for role-filtered views

### Estimated effort
~1,400 lines (including security), 3-4 sessions.

---

## v7.1 — The Redesign

*The wizard becomes a conversation.*

Gandalf's setup wizard is restructured from a 7-step linear form into a three-act conversation: identity, vision, operations. The simple/advanced toggle is eliminated — replaced by an operations menu where every user picks what they need.

### Act 1 — "Secure Your Forge" (2 steps)
Vault password alone on the first screen — clean, focused, one field. API key on the second screen. The forge is lit.

### Act 2 — "Describe Your Vision" (2 steps + conditional)
Project name + directory. Then PRD (generate/paste/skip). If PRD has env vars, collect credentials. The project is taking shape.

### Act 3 — "Equip Your Project" (1 menu screen)
A single screen with expandable cards — not a sequence of steps. Five cards: Deploy Target, Cloud Credentials (contextual), Domain & Hostname, The Resilience Pack (v4.3 features as opt-in toggles), Monitoring. Each card expands in-place. Smart defaults from PRD frontmatter. "Skip All" for lean setup.

### Éowyn's Enchantment Notes
- First screen: mostly empty, dark, one glowing input. The forge lighting moment.
- Project name: header updates live as user types — the project is already becoming real.
- PRD generation: text streams like it's being written by hand, not loaded from a server.
- Operations menu: cards feel like choosing equipment before an adventure.
- Creation moment: brief animation of project structure appearing, then terminal fills screen. You're home.

### Files to modify
- `wizard/ui/index.html` — restructure into 3 acts, add operations menu
- `wizard/ui/app.js` — remove simple/advanced, add card expand/collapse, smart defaults
- `wizard/ui/styles.css` — act transitions, card animations, enchantment styling

### Estimated effort
~400 lines changed (mostly restructuring existing code), 1-2 sessions.

---

## v7.6 — The Vault Pipeline

*Credentials flow from vault to project without provisioning.*

The missing link between "Gandalf collected my API keys" and "my project can use them." Currently, vault credentials only reach `.env` during full provisioning (Haku deploy). But many projects need env vars for local development, testing, or non-VPS deploy targets. This release adds a standalone vault-to-env pipeline.

### `voidforge deploy --env-only` Flag

Run the deploy wizard's env-writing step without provisioning infrastructure:
```bash
npx voidforge deploy --env-only
```

Reads the PRD frontmatter, identifies required env vars, pulls matching values from the vault, and writes them to `.env`. No AWS, no GitHub, no DNS — just the env file. This is the "I just want my API keys in .env" command.

**What changes:** `scripts/voidforge.ts` gains `--env-only` flag. `wizard/lib/headless-deploy.ts` gains an env-only code path that calls `vaultGet()` for each PRD-referenced key and appends to `.env` via `appendEnvSection()`.

### Standalone Vault Reader (`scripts/vault-read.ts`)

A zero-dependency script that reads a single key from the vault:
```bash
npx tsx scripts/vault-read.ts --key "env:WHATSAPP_ACCESS_TOKEN"
```

Useful for CI/CD scripts, custom deploy flows, and debugging. Prompts for vault password (or reads from env var `VOIDFORGE_VAULT_PASSWORD` for non-interactive use).

**What changes:** New file `scripts/vault-read.ts` (~50 lines). Imports directly from `wizard/lib/vault.ts`.

### Campaign Vault Integration

Kira's Step 0 already checks vault status (v7.5.1). This release adds: if Dax classifies env vars as "vault-available but not in .env," Sisko auto-runs `deploy --env-only` before the first mission. No manual step needed.

**What changes:** `docs/methods/CAMPAIGN.md` Step 0.5 (new), `.claude/commands/campaign.md` Step 0.5.

### Bolt-ons (from architecture review)

**Stale PTY session cleanup (tech debt #12).** Tower `init()` checks if the auto-created session actually connected. If "Session ended" appears within 2 seconds, auto-close and retry once. After 2 failures: "Terminal failed to start. The VoidForge server may need to restart." with a Lobby link. ~30 lines.

**Node.js `engines` field.** Add `"engines": { "node": ">=20.0.0 <25.0.0" }` to package.json. Prevents the v7.2→v7.3 crisis (node-pty ABI break on Node v24) from recurring silently. Update when node-pty ships Node 25 support. ~1 line.

**Fallback model ID update.** Tech debt #6: replace `claude-sonnet-4-5-20241022` with `claude-sonnet-4-6` in the model resolution fallback. ~1 line.

### Estimated effort
1 session. ~200 lines of new code + methodology doc updates.

---

## v7.7 — The Housekeeping

*Catch the docs up to reality. Fix the runtime papercuts.*

The architecture docs are stuck at v2.7.0 while the system is at v7.5+. Avengers Tower, RBAC, Thumper, the ws/node-pty migration, three-act wizard — none of it is documented in ARCHITECTURE.md. This release closes the gap and addresses the two highest-impact runtime bugs.

### Architecture Doc Refresh

Bring ARCHITECTURE.md, FAILURE_MODES.md, and SCALING.md from v2.7.0 to v7.7.0:

- **ARCHITECTURE.md:** Add Avengers Tower (Lobby, Penthouse, Tower), Thumper, RBAC, three-act wizard, ws/node-pty dependencies, WebSocket subsystem, project registry, PTY manager, multi-user session isolation.
- **FAILURE_MODES.md:** Add WebSocket connection failures (IPv6/IPv4, ws upgrade), PTY session failures (node-pty ABI, stale sessions, MAX_SESSIONS), Tower crash modes (vault lock on restart, cache invalidation), Thumper failure modes (bot token invalid, webhook timeout).
- **SCALING.md:** Update Tier 2 to reflect the multi-project registry and Penthouse features that already shipped in v7.0. Note that Avengers Tower's PTY sessions are the new practical ceiling (MAX_SESSIONS=5).

### Server Auto-Restart (tech debt #11)

Native module updates (`npm install` for node-pty/ws) change the `.node` binary on disk, but the running process keeps the old binary in memory. The server must be manually killed and restarted. Users see "Session ended" with no explanation.

Fix: On each request to the Lobby, compare mtime of `node_modules/**/**.node` files against a startup snapshot. If changed, show banner: "VoidForge updated — restart required. [Restart Now]". The restart button calls a server endpoint that executes graceful shutdown (kill PTY sessions, close WebSocket connections, 2s drain) then `process.execve()` to replace the process in-place.

**What changes:** `wizard/server.ts` gains startup mtime snapshot + comparison endpoint. `wizard/ui/lobby.js` gains restart banner. ~100 lines.

### Node.js Version Testing Note

Add `COMPATIBILITY.md` to `docs/` documenting: tested Node.js versions, known ABI-breaking changes (v24 node-pty incident), and the `engines` field policy. When upgrading the `engines` range, this doc is the checklist.

### Estimated effort
1-2 sessions. Doc rewrites + ~100 lines server code + 1 new doc.

---

## v8.0 — The Hive Mind

*VoidForge remembers, predicts, and generates.*

The first release where VoidForge learns from experience. Three features that compound: agents read past lessons before reviewing, Phase 0 catches structural contradictions before building, and a new command generates production-ready PRDs from conversation.

**Ship order:** These three features are independent. If scope pressure hits, ship in this order:
1. **Agent Memory** (foundation — v8.1 and v8.2 depend on it)
2. **Conflict Prediction** (highest time-savings per line of methodology)
3. **Auto-PRD** (highest user-facing value but not a dependency for anything else)

### Agent Memory — Active Lessons Read-Back

`docs/LESSONS.md` exists but is passive — agents never read it. Activate the feedback loop: during Phase 0 Orient, Wong loads lessons matching the current project's framework and domain. During reviews, agents check lessons tagged to their domain and flag matching patterns.

**What changes:** Phase 0 in BUILD_PROTOCOL.md gains a "Wong loads relevant lessons" step. Review commands (/qa, /security, /ux, /review) gain a directive: "Before analysis, check LESSONS.md for entries in your domain. Flag matches." The existing `wizard/lib/agent-memory.ts` (getRelevantLessons) provides the query mechanism for the wizard tier.

**Why first:** Agent Memory is the foundation — everything in v8.x reads from it.

### Conflict Prediction — Phase 0.5 Architecture Scan

Before a single line is written, Picard runs a lightweight contradiction scan on the PRD frontmatter:
- Auth required but no session store → flag
- Payments enabled but auth disabled → flag
- WebSocket features but static/Cloudflare deploy → flag
- Workers enabled but deploy target has no background process support → flag
- Database specified but deploy target doesn't support persistent storage → flag

10-15 common contradictions, checked in seconds. Catches the architecture mistakes that currently escape until Phase 9-11 reviews — where fixing them costs hours instead of minutes.

**What changes:** BUILD_PROTOCOL.md Step 0.5 (new). SYSTEMS_ARCHITECT.md gains a "Conflict Checklist" section. `.claude/commands/architect.md` gains a pre-analysis step.

### Auto-PRD Generation — `/prd` Command

The PRD is VoidForge's highest-friction input. Users who aren't good at writing PRDs produce bad builds. A new `/prd` command where Sisko conducts a structured interview:

1. "What are you building?" → name, one-liner, audience
2. "What stack?" → framework, database, deploy target (Sisko proposes defaults)
3. "What features?" → core flow, supporting features, integrations
4. "What does it look like?" → brand personality, key screens
5. "How does it ship?" → launch sequence, success metrics

Each act drafts that PRD section, shows it for confirmation. Output: complete `docs/PRD.md` with valid frontmatter. The existing wizard PRD generation (Step 4, SSE stream via Anthropic API) provides the backend; this adds a CLI-native path.

**New files:** `.claude/commands/prd.md`, update CLAUDE.md and HOLOCRON.md.

### Estimated effort
3-4 sessions total. All methodology doc changes + 1 new command file.

---

## v8.1 — The Deep Roster

*107 agents with names but no jobs. Time to put the full roster to work.*

VoidForge has 170+ named characters across 7 universes, but only ~63 have protocol tasks. The remaining ~107 are pool names with no defined role. This release activates the deep roster in two phases — high-impact agents first, then the full bench.

### Phase 1 — Core Protocol Integration (10 agents)

**Troi (Star Trek) — PRD Compliance, expanded from Gauntlet-only to per-phase:**
- `/build` Phase 0: after Orient, Troi confirms extraction matches PRD prose
- `/build` Phase 4: after core features, Troi checks routes/components match PRD Section 4
- `/build` Phase 8: after marketing, Troi checks landing page matches PRD brand section
- `/campaign` per-mission: Troi spot-checks the PRD sections that mission targeted
- `/architect --plan`: Troi validates the plan covers all PRD requirements

**Padmé (Star Wars) — Functional Verification, expanded from Gauntlet-only to build gates:**
- `/build` Phase 4 gate: "Can a user complete the primary flow end-to-end?"
- `/build` Phase 6 gate: "Do the integrations work in the primary flow?"
- `/assemble` Phase 2.5: functional verification alongside Hawkeye's endpoint checks
- `/campaign` per-mission: if mission touches user flows, Padmé verifies the affected flow

**Celeborn (Tolkien) — Design System Governance (NEW — currently unused):**
- `/ux` Step 2: parallel agent — consistent spacing tokens, typography scale, color palette, component naming
- `/build` Phase 5: after UI components, design system compliance check
- `/gauntlet` Round 2: part of Galadriel's team

**Worf (Star Trek) — Security Implications of Architecture:**
- `/architect` Step 1: runs parallel with Spock and Uhura — flags schema/design decisions with security implications
- "This schema stores PII in the same table as public data — separate."

**Riker (Star Trek) — Decision Review:**
- `/architect` Step 5 (ADRs): reviews Picard's decisions — "Number One, does this hold up?"
- Second opinion on trade-offs before ADRs are finalized

**Cyborg (DC) — System Integration Testing:**
- `/qa` Step 1: when multiple services/modules connect, Cyborg traces the full path across boundaries
- Activated when project has 3+ API files or cross-module data flows

**Wonder Woman (DC) — Truth Detector:**
- `/review` Step 1: finds where code says one thing and does another — misleading names, wrong comments, stale docs

**Raven (DC) — Deep Static Analysis:**
- `/qa` Step 1: bugs hidden beneath 3 layers of abstraction — follows data through transforms
- `/gauntlet` Round 1: deep analysis during discovery

**Valkyrie (Marvel) — Disaster Recovery:**
- `/devops`: backup verification, restore testing, failover procedures

**Torres (Star Trek) — Performance Architecture:**
- `/architect` Step 3: identifies N+1 queries, missing indexes, connection pool sizing in design phase (before code)

**What changes:** BUILD_PROTOCOL.md, CAMPAIGN.md, SYSTEMS_ARCHITECT.md, PRODUCT_DESIGN_FRONTEND.md, QA_ENGINEER.md, SECURITY_AUDITOR.md, DEVOPS_ENGINEER.md, ASSEMBLER.md + paired command files. NAMING_REGISTRY.md updated with protocol assignments for each activated agent.

### Phase 2 — Extended Roster (40+ agents)

**Extended DC roster for `/qa`:**
- Flash (rapid smoke tests), Batgirl (detail audit), Green Arrow (precision targeting), Huntress (flaky test hunter), Aquaman (deep dive testing), Superman (standard enforcement), Green Lantern (test scenario construction), Martian Manhunter (cross-environment testing)

**Extended Star Wars roster for `/security`:**
- Qui-Gon (subtle vulnerabilities), Han (first-strike scanner), Anakin (dark-side exploitation), Bo-Katan (perimeter defense), Din Djarin (bug bounty hunter), Bail Organa (governance/compliance), Cassian (threat modeling/recon), Sabine (unconventional attack vectors)

**Extended Tolkien roster for `/ux`:**
- Aragorn (UX leadership), Faramir (quality-over-glory check), Pippin (edge case discovery), Boromir (hubris/overengineering check), Haldir (boundary/transition guard), Glorfindel (hardest rendering challenges), Frodo (dedicated to the hardest UX task), Merry (pair review with Pippin)

**Extended Anime roster for `/devops`:**
- Vegeta (monitoring), Trunks (migrations/rollback), Mikasa (critical system protection), Erwin (capacity planning), Mustang (cleanup scripts), Olivier (infra hardening), Hughes (logging/observability), Calcifer (daemon management), Duo (teardown/decommission)

**Extended Marvel roster for `/build`:**
- T'Challa (craft/elegance review), Wanda (state management), Strange (service architecture during auth), Thor (queue/worker review)

**Extended Star Trek roster for `/architect`:**
- Janeway (novel architectures), Tuvok (security architecture), Crusher (system health diagnostics), Archer (greenfield architecture), Kim (API design), Pike (bold mission planning in `/campaign`)

**What changes:** Same files as Phase 1, plus each agent gets a one-line task definition in the relevant protocol step. Agents are activated conditionally — not every agent runs on every project. Trigger conditions defined per agent (e.g., "Cyborg activates when project has 3+ API files").

### Estimated effort
Phase 1: 2-3 sessions (10 agents across 8 method docs + 8 command files).
Phase 2: 2-3 sessions (40+ agents, but each is a one-line addition to existing protocol steps).

---

## v8.2 — The Evolution (was v8.1)

*The methodology improves itself. With permission.*

### Self-Improving Methodology

When 3+ entries in `docs/LESSONS.md` share the same category and target the same method doc, Wong auto-drafts a method doc update: a specific new checklist item, rule, or pattern based on the lesson cluster. Presented for user approval — never auto-applied.

For upstream: `/debrief --submit` includes the proposed method doc change in the GitHub issue body. `/debrief --inbox` processes these proposals.

**What changes:** FIELD_MEDIC.md gains a "Promotion Analysis" step. `/debrief` command gains promotion logic. LESSONS.md format unchanged (already has "Promoted to" field).

### Agent Specialization — Custom Sub-Agents

Users can create project-specific sub-agents that carry domain knowledge. A `docs/CUSTOM_AGENTS.md` file defines specialists:

```markdown
### Jarvis-Tailwind
**Universe:** Marvel | **Reports to:** Galadriel
**Domain:** Tailwind CSS v4 configuration, PostCSS, source() directive
**Behavioral directives:** Always check for v3→v4 migration issues. Verify @config path.
**Reference docs:** tailwindcss.com/docs/upgrade-guide
```

Custom agents run alongside built-in agents, not instead of them. Names must not collide with the naming registry.

**What changes:** SUB_AGENTS.md gains "Custom Agent" section. NAMING_REGISTRY.md gains collision check rule. New template file: `docs/CUSTOM_AGENTS.md`.

### Estimated effort
2-3 sessions. Methodology doc changes + 1 new template.

---

## v8.3 — The Autonomy (was v8.2)

*Supervised autonomy with safety rails.*

### Autonomous Campaigns — `/campaign --autonomous`

Sisko executes missions without waiting for confirmation at every brief. Guardrails:
1. Git checkpoint (`git tag campaign-mission-N-start`) before each mission
2. If `/assemble` produces Critical findings that can't be auto-fixed → rollback to tag, pause for human
3. Maximum 5 consecutive autonomous missions before mandatory human checkpoint
4. Victory Gauntlet ALWAYS requires human confirmation
5. Post-mission summary logged but not presented interactively

**Why after v8.0-v8.2:** Autonomous campaigns are safer when Agent Memory catches known pitfalls, the Deep Roster catches more issues per review, and Conflict Prediction catches structural problems before they propagate through 10 unattended missions.

**What changes:** CAMPAIGN.md gains `--autonomous` section with guardrails. `.claude/commands/campaign.md` gains flag handling.

### Estimated effort
1-2 sessions. Command + method doc changes.

---

## v9.0 — The Field-Tested Forge

*Codify everything we learned into hardened methodology.*

### Campaign Missions

**Mission 1 — Meta-Workflow Documentation**

Document how to use VoidForge to develop VoidForge. Deliverables:
- New `docs/META_WORKFLOW.md` (~200 lines):
  - How campaign-on-self works (methodology changes as missions)
  - Anti-patterns discovered: context pressure false alarms, reduced pipeline skipping review, `const` reassignment in strict mode, `globSync` API availability
  - The feedback loop: field reports → `/debrief --inbox` → methodology fixes → better field reports
  - When to blitz vs autonomous vs manual
  - Version table: which campaigns shipped which versions
- Update `HOLOCRON.md`: add META_WORKFLOW.md reference
- Update `CLAUDE.md` Docs Reference table: add META_WORKFLOW.md row

**Mission 2 — Pattern Evolution Data Collection**

Add the data collection side for Wong's promotion analysis. Deliverables:
- Update `docs/methods/BUILD_PROTOCOL.md` Phase 12: add pattern-usage logging step — after build completes, log which patterns were used, which framework adaptations applied, which custom mods made
- Update `docs/methods/FIELD_MEDIC.md`: add pattern-evolution check in promotion analysis — when pattern-usage data exists, check for recurring variations
- Update `.claude/commands/build.md`: add Phase 12 pattern logging instruction
- Update `.claude/commands/debrief.md`: add pattern-evolution check instruction

**Bolt-on from field report #62:**
- Update `docs/methods/FORGE_ARTIST.md` Step 0: persist OpenAI API key to `.env.local` on first use, not just shell env. Prevents key loss between sessions.

### Estimated effort
1-2 sessions. 2 missions.

---

## v9.1 — The Multi-Language Forge (Python)

*"From nothing, everything" — in any language.*

### Campaign Missions

**Mission 1 — Core Pattern Adaptations (4 patterns)**

Add full Django + FastAPI deep-dive sections to the 4 most critical patterns:
- `docs/patterns/api-route.ts` → Django REST Framework ViewSets + FastAPI path operations (~80 lines each)
- `docs/patterns/service.ts` → Django services layer + FastAPI repository pattern (~60 lines each)
- `docs/patterns/middleware.ts` → Django middleware + FastAPI dependency injection (~60 lines each)
- `docs/patterns/error-handling.ts` → Django exception handler + FastAPI HTTPException (~50 lines each)

**Mission 2 — Supporting Pattern Adaptations (4 patterns)**

- `docs/patterns/component.tsx` → Django templates + HTMX / Jinja2 + HTMX (~60 lines each)
- `docs/patterns/job-queue.ts` → Celery tasks + Django-Q / ARQ with FastAPI (~60 lines each)
- `docs/patterns/multi-tenant.ts` → Django-tenants + FastAPI Depends() scoping (~50 lines each)
- `docs/patterns/third-party-script.ts` → Python equivalent (script loading, initialization) (~40 lines)

**Mission 3 — Build Protocol Python Path**

- Update `docs/methods/BUILD_PROTOCOL.md`: Phase 0 detects `framework: django|fastapi`, Phase 1 scaffolds with `django-admin startproject` / `poetry init`, Phase 9-11 use `pytest`
- Update `.claude/commands/build.md`: Python-specific phase instructions
- Update `docs/methods/TESTING.md`: pytest setup, Django test client, FastAPI TestClient
- Update `docs/methods/QA_ENGINEER.md`: Python-specific attack vectors (Django ORM injection, Pydantic validation bypass)
- Update `docs/methods/SECURITY_AUDITOR.md`: Python-specific checks (Django settings, SECRET_KEY, DEBUG=True, ALLOWED_HOSTS)

### Estimated effort
2-3 sessions. 3 missions.

---

## v9.2 — The Mobile Forge

*Ship to pockets, not just browsers.*

VoidForge builds web apps. This release adds iOS and Android as deploy targets — from PRD to App Store.

### New Deploy Targets

| Target | Framework | Build | Distribution |
|--------|-----------|-------|-------------|
| `ios` | React Native or SwiftUI | Xcode CLI (`xcodebuild`) | TestFlight → App Store Connect |
| `android` | React Native or Kotlin | Gradle (`./gradlew assembleRelease`) | Google Play Console (internal track) |
| `cross-platform` | React Native or Flutter | Both pipelines | TestFlight + Play Console |

### PRD Frontmatter

```yaml
deploy: "ios"           # ios | android | cross-platform
mobile_framework: ""    # react-native | flutter | swiftui | kotlin
app_store_id: ""        # Apple Team ID (for code signing)
bundle_id: ""           # com.yourcompany.appname
```

### What Changes

**New provisioner:** `wizard/lib/provisioners/mobile.ts` — handles code signing, build configuration, and store submission. No infrastructure to provision (unlike VPS) — the "provisioning" is build + sign + upload.

**Build protocol adaptation:**
- Phase 1: scaffold with `npx react-native init` or `flutter create` or Xcode project
- Phase 5: mobile-specific UI patterns (safe area, navigation stacks, gestures, haptics)
- Phase 9: mobile QA additions (orientation, deep links, push notifications, offline mode, battery)
- Phase 11: mobile security additions (certificate pinning, secure storage, jailbreak detection, obfuscation)
- Phase 12: build + sign + upload to TestFlight/Play Console

**New patterns:**
- `mobile-screen.tsx` — React Native screen pattern (navigation, safe area, platform-specific behavior)
- `mobile-service.ts` — Offline-first data pattern (local SQLite + sync, conflict resolution)

**New agents (conditional — activate when `deploy: ios|android|cross-platform`):**
- **Uhura-Mobile** (Star Trek) → Reports to Picard. Mobile architecture: navigation stacks, deep linking, universal links, app lifecycle.
- **Samwise-Mobile** (Tolkien) → Reports to Galadriel. Mobile a11y: VoiceOver, TalkBack, Dynamic Type, reduced motion, touch targets (44pt minimum).
- **Rex-Mobile** (Star Wars) → Reports to Kenobi. Mobile security: certificate pinning, Keychain/Keystore, jailbreak detection, transport security.

### Campaign Missions

**Mission 1 — Mobile Methodology (methodology-only, no wizard code)**
- Update `docs/methods/BUILD_PROTOCOL.md`: mobile-specific phase adaptations (Phases 1, 5, 9, 11, 12)
- Update `.claude/commands/build.md`: mobile detection from `deploy: ios|android|cross-platform`
- Update `docs/methods/QA_ENGINEER.md`: mobile QA additions (orientation, deep links, push, offline, battery)
- Update `docs/methods/SECURITY_AUDITOR.md`: mobile security additions (cert pinning, secure storage, jailbreak)
- Update `docs/methods/PRODUCT_DESIGN_FRONTEND.md`: mobile UX additions (safe area, gestures, haptics)
- Add 3 custom agents to `docs/CUSTOM_AGENTS.md`: Uhura-Mobile, Samwise-Mobile, Rex-Mobile
- Update `docs/PRD.md` template: add mobile frontmatter fields

**Mission 2 — Mobile Patterns (new pattern files)**
- Create `docs/patterns/mobile-screen.tsx` (~150 lines): React Native screen with navigation, safe area, platform branching, loading/error/empty states, keyboard avoidance
- Create `docs/patterns/mobile-service.ts` (~150 lines): offline-first data pattern with local SQLite, sync queue, conflict resolution, optimistic UI
- Update `docs/patterns/README.md`: add mobile pattern descriptions

**Mission 3 — Mobile Provisioner (wizard code — main branch only)**
- Create `wizard/lib/provisioners/mobile.ts` (~200 lines): code signing config, build invocation, TestFlight/Play Console upload
- Update `scripts/voidforge.ts`: add `deploy: ios|android|cross-platform` to headless deploy
- Update `wizard/lib/headless-deploy.ts`: mobile provisioner registration
- Update `docs/ARCHITECTURE.md`: add mobile provisioner to system diagram

### Estimated effort
3-4 sessions. 3 missions.

---

## v9.3 — The Game Forge

*From nothing, everything — including worlds.*

VoidForge builds applications. This release adds game development as a project type — from PRD to playable build.

### New Project Type

```yaml
type: "game"            # full-stack | api-only | static-site | prototype | game
game_engine: ""         # unity | godot | phaser | three.js | pixi
game_genre: ""          # platformer | rpg | puzzle | simulation | fps
deploy: "web"           # web (WebGL/HTML5) | steam | itch | mobile
```

### What Changes

**Build protocol adaptation for `type: game`:**
- Phase 1: scaffold with engine-specific project structure (Godot project, Unity project, Phaser/webpack)
- Phase 2: game infrastructure (asset pipeline, scene management, input system, audio system)
- Phase 3: replaced by "Game Core" — game loop, ECS or component system, state machines, physics
- Phase 4: replaced by "Gameplay" — core mechanics, player controller, enemies/AI, level design data
- Phase 5: replaced by "Game UI" — HUD, menus, inventory, dialog system, transitions
- Phase 6: replaced by "Polish" — particles, screen shake, juice, audio cues, game feel
- Phase 7: replaced by "Content" — levels, balancing, progression, save/load
- Phase 8: replaced by "Game Marketing" — store page, screenshots, trailer script, press kit
- Phase 9-11: game-specific QA (frame rate profiling, input latency, memory leaks, platform testing)
- Phase 12: build + export (WebGL, desktop, mobile)

**New patterns:**
- `game-loop.ts` — Core game loop pattern (fixed timestep, interpolation, pause/resume)
- `game-state.ts` — State machine pattern (menu → playing → paused → game-over, with transition hooks)
- `game-entity.ts` — Entity component system or scene-tree pattern (depending on engine)

**New agents (conditional — activate when `type: game`):**
- **Spike-GameDev** (Anime) → Reports to Kusanagi. Game architecture: frame budgets, memory pools, object pooling, asset streaming.
- **Éowyn-GameFeel** (Tolkien) → Reports to Galadriel. Game juice: screen shake, hit pause, particle bursts, camera dynamics, audio cues. The enchantment pass, but for games.
- **Deathstroke-Exploit** (DC) → Reports to Batman. Game QA: speedrun exploits, out-of-bounds, sequence breaks, economy exploits, save corruption.
- **L-Profiler** (Anime) → Reports to Kusanagi. Performance profiling: frame time analysis, draw call optimization, garbage collection pressure, loading time budgets.

### Campaign Missions

**Mission 1 — Game Build Protocol (methodology adaptation)**
- Update `docs/methods/BUILD_PROTOCOL.md`: add `type: game` conditional path with all 12 phase adaptations (game core, gameplay, game UI, polish, content, game marketing)
- Update `.claude/commands/build.md`: game detection from `type: game`, engine-specific scaffolding instructions
- Update `docs/PRD.md` template: add game frontmatter fields (game_engine, game_genre)
- Update `docs/methods/SYSTEMS_ARCHITECT.md`: add game architecture section (ECS, scene graph, game loop patterns, asset pipeline architecture)

**Mission 2 — Game Patterns (new pattern files)**
- Create `docs/patterns/game-loop.ts` (~120 lines): fixed timestep with interpolation, pause/resume, frame budget tracking
- Create `docs/patterns/game-state.ts` (~120 lines): hierarchical state machine (menu → playing → paused → game-over) with transition hooks and history
- Create `docs/patterns/game-entity.ts` (~120 lines): ECS pattern (entities, components, systems) with pooling and lifecycle
- Update `docs/patterns/README.md`: add game pattern descriptions

**Mission 3 — Game Review Methodology**
- Update `docs/methods/QA_ENGINEER.md`: game QA additions (frame rate profiling, input latency, memory leaks, speedrun exploits, out-of-bounds, save corruption)
- Update `docs/methods/SECURITY_AUDITOR.md`: game security (anti-cheat, save file tampering, network protocol validation for multiplayer)
- Update `docs/methods/PRODUCT_DESIGN_FRONTEND.md`: game UX (game feel, juice, screen shake, controller support, accessibility options menu)
- Update `docs/methods/DEVOPS_ENGINEER.md`: game DevOps (build pipelines for WebGL/Steam/itch.io, asset optimization, platform-specific builds)
- Add 4 custom agents to `docs/CUSTOM_AGENTS.md`: Spike-GameDev, Éowyn-GameFeel, Deathstroke-Exploit, L-Profiler

**Mission 4 — Game Distribution (wizard code — main branch only)**
- Engine-specific scaffolding scripts (Godot, Phaser/webpack, Three.js)
- Build + export automation for WebGL, desktop, mobile targets
- Steam/itch.io distribution support in headless deploy

### Estimated effort
4-5 sessions. 4 missions.

---

## v10.0 — The War Room + The Frontier

*The War Room is the surface. The Frontier features are what it displays.*

**Ship order:** Build the War Room dashboard FIRST (it's the platform). Then add Frontier features one at a time — each one gets a new panel on the dashboard.

### 1. Agent Confidence Scoring

Each agent reports a confidence score (0-100) on their findings. Low-confidence findings (<60) get escalated to a second agent from a different universe instead of being presented as definitive. Reduces false positives. High-confidence findings (>90) skip re-verification in Pass 2. The system learns which agents are reliable in which domains.

### 2. Agent Debates

When two agents disagree on a finding (Kenobi says "security risk," Stark says "by design"), instead of listing both opinions, run a structured debate. Each agent makes their case with evidence from the codebase. Picard or the user arbitrates. The debate transcript is logged as an ADR. Better decisions come from argued positions than from listed bullet points. The debate format: Agent A states finding → Agent B responds → Agent A rebuts → Arbiter decides. 3 exchanges max.

### 3. Adversarial PRD Review (`/prd --challenge`)

Before building, an agent argues AGAINST the PRD. "This feature will be expensive to maintain." "This integration has a 40% chance of API deprecation." "Your schema doesn't support the multi-tenant use case you mentioned in Section 7." Forces the user to defend their choices before committing 8 phases of build time. Cheaper than discovering design flaws in Phase 9.

### 4. Natural Language Deploy

Instead of YAML frontmatter, describe deployment in prose: "I want this running on a $20/month server with a custom domain, automatic SSL, and daily backups." The system figures out the deploy target (VPS), instance type (t3.small), DNS provider (Cloudflare), backup schedule (pg_dump daily to S3), and generates the frontmatter. `/prd` already does this for features — extend it to infrastructure.

### 5. The War Room Dashboard — THE CENTERPIECE

**This is not just one of ten ideas. It is the surface that makes every other idea visible.** Agent debates, confidence scores, build archaeology, the living PRD, the prophecy graph — they all need somewhere to live. The War Room is the connective tissue. Promote to its own version (v9.5 or v10.0 foundation) and build it BEFORE the other v10.0 features so they have a surface to render on.

**Architecture:** New tab in Avengers Tower Lobby (`/war-room.html`). Real-time updates via WebSocket (same `ws` infrastructure as Tower terminals). Data fed by Hill (phase tracking) and Jarvis (status summaries). Vanilla JS frontend — no framework, same as the rest of the wizard UI.

**Core Panels (from existing system data):**

| Panel | Data Source | What It Shows |
|-------|-----------|---------------|
| **Campaign Timeline** | campaign-state.md | Horizontal timeline of missions: completed (green), active (yellow), pending (gray), blocked (red). Click to expand details. |
| **Phase Pipeline** | assemble-state.md | 13-phase vertical pipeline with status badges. Active phase pulses. Failed phases show error. |
| **Active Agents** | Agent tool invocations | Grid of agent avatars currently running. Universe color-coded (Tolkien=gold, Marvel=red, DC=blue, etc.). |
| **Finding Scoreboard** | Phase logs | Real-time counters: Critical / High / Medium / Low. Grouped by domain (QA, Security, UX, Architecture, DevOps). |
| **Context Gauge** | `/context` output | Circular gauge showing token usage: green (<50%), yellow (50-70%), red (>70%). Updates per phase. |
| **PRD Coverage** | Prophecy Board | PRD sections as a checklist: complete, in-progress, blocked, not started. Percentage bar. |
| **Test Suite** | `npm test` output | Pass / Fail / Skip counts. Flaky test list (Huntress). Last run timestamp. |
| **Deploy Status** | deploy-log.json | Last deploy: URL, timestamp, target, health check status. Green dot = live. |
| **Version & Branch** | VERSION.md + git | Current version, branch, last commit. Sync status across main/scaffold/core. |
| **Cost Tracker** | Holo's data | Monthly cost per project. Budget alerts. |

**v10.0 Feature Panels (added as each feature ships):**

| Panel | Feature | What It Shows |
|-------|---------|---------------|
| **Confidence Heat Map** | Agent Confidence (#1) | Grid of findings color-coded by confidence score. Low-confidence findings pulsate. Click to see which agent escalated to whom. |
| **Debate Arena** | Agent Debates (#2) | Live and archived debates. Two agent avatars face each other. Transcript scrolls. Verdict badge (pending/resolved). Click to read full debate. |
| **PRD Challenge Log** | Adversarial PRD (#3) | Which PRD claims were challenged, which survived, which were modified. Risk flags. |
| **Infra Config** | Natural Language Deploy (#4) | Generated infrastructure config with cost estimate. "Approve" button. Diff against current. |
| **Bug Trace Timeline** | Build Archaeology (#6) | Click a production bug → visual timeline tracing it back through phases, agents, commits. Animated path through the pipeline. |
| **Global Lessons** | Cross-Project Memory (#7) | Lesson cards from all projects. Frequency badges. "This pattern broke in 3 of 5 projects." |
| **Experiment Dashboard** | A/B Testing (#8) | Active experiments. Side-by-side agent accuracy charts. Context cost comparison. |
| **Prophecy Graph** | Prophecy Visualizer (#9) | Interactive dependency graph. Nodes = PRD sections. Edges = dependencies. Color = status. Click to drill into missions and findings. |
| **PRD Drift View** | Living PRD (#10) | Side-by-side diff: original PRD vs current. Drift score. Highlighted evolution points. |

**Layout:** Responsive grid. Main area shows the active context (campaign timeline during campaign, phase pipeline during assemble, finding scoreboard during gauntlet). Sidebar shows persistent panels (context gauge, version, deploy status). Bottom ticker shows agent activity feed ("Maul probing /api/auth... Nightwing running test suite... Constantine found cursed code in utils.ts").

**Data Layer:** All panels read from existing files (campaign-state.md, assemble-state.md, phase logs, VERSION.md, deploy-log.json) via REST endpoints + WebSocket push for real-time updates. No new data storage — the War Room is a VIEW layer over existing state.

### 6. Build Archaeology

When debugging a production issue, trace it back through the build protocol. "This bug was introduced in Phase 4 (commit abc123), escaped QA in Phase 9 because Constantine's cursed-code check doesn't cover this pattern, and wasn't caught by the Gauntlet because Round 4 Crossfire focused on the wrong module." Post-mortem archaeology with actionable fixes to the methodology.

### 7. Cross-Project Agent Memory

When starting a new project, Wong queries lessons from ALL previous projects stored in `~/.voidforge/lessons-global.json` — not just the current project's `docs/LESSONS.md`. "You've built 3 Next.js apps with Stripe. Here's what broke every time: webhook signature verification in test mode, price ID mismatch between environments, and checkout session expiry." The global memory is opt-in and privacy-respecting (no source code, only lesson summaries).

### 8. Methodology A/B Testing

Run two versions of a methodology step on the same codebase and compare results. "Does the 17-agent QA pass find more real bugs than the 7-agent version? At what context cost?" Track true-positive rates per agent, per project type. Over time, tune the methodology based on data, not intuition. Wong manages the experiments; results feed into promotion analysis.

### 9. The Prophecy Visualizer

Render the campaign's Prophecy Board as a visual dependency graph in the browser. Nodes are PRD sections; edges are dependencies. Completed nodes are green, in-progress yellow, blocked red. Click a node to see which missions touched it, what agents reviewed it, and what findings remain. Sisko's war table, visualized.

### 10. The Living PRD

The PRD is currently static — read at Phase 0, checked at the end by Troi. Make it a living document that evolves with the build. Phase 4 reveals the schema needs a field the PRD didn't mention? The PRD's data model section updates. Feature gets BLOCKED? PRD marks it inline. Gauntlet finds the implementation deviates from the PRD? The user chooses: fix the code OR update the PRD. Troi's compliance check becomes a two-way sync, not a one-way audit. The PRD stays true because it evolves with reality instead of fossilizing at Phase 0.

### Campaign Missions

**Mission 1 — War Room Foundation (wizard code + methodology)**
- Create `wizard/ui/war-room.html` + `wizard/ui/war-room.js` + `wizard/ui/war-room.css`
- Core layout: responsive grid, main area + sidebar + bottom ticker
- 5 panels from existing data: Campaign Timeline, Phase Pipeline, Finding Scoreboard, Context Gauge, Version & Branch
- WebSocket integration for real-time updates (reuse Tower ws infrastructure)
- REST endpoints for reading campaign-state.md, assemble-state.md, phase logs
- Add War Room tab to Lobby navigation
- Update `docs/ARCHITECTURE.md`: add War Room to system diagram

**Mission 2 — War Room Extended Panels**
- 5 more panels: Active Agents (universe-colored avatars), PRD Coverage, Test Suite status, Deploy Status, Cost Tracker
- Agent activity ticker (bottom bar): parse agent tool invocations into "Maul probing /api/auth..." feed
- Hill + Jarvis data feed: phase completion timestamps, status summaries piped to War Room

**Mission 3 — Agent Confidence Scoring (#1)**
- Update all agent protocol sections: add confidence score (0-100) to finding format
- Update `docs/methods/GAUNTLET.md`: low-confidence findings (<60) escalated to second agent
- Create Confidence Heat Map panel for War Room
- Update finding log format across all method docs

**Mission 4 — Agent Debates (#2)**
- Update `docs/methods/SUB_AGENTS.md`: add Debate Protocol (Agent A states → Agent B responds → Agent A rebuts → Arbiter decides, 3 exchanges max)
- Update `docs/methods/ASSEMBLER.md`: when review agents disagree, trigger debate instead of listing both
- Create Debate Arena panel for War Room (live transcripts, verdict badges)
- Log debates as ADRs

**Mission 5 — Adversarial PRD Review (#3)**
- Create `.claude/commands/prd-challenge.md` or add `--challenge` flag to `/prd` command
- Update `docs/methods/CAMPAIGN.md`: optional PRD challenge before first mission
- Create PRD Challenge Log panel for War Room
- Define the adversarial agent (Boromir-PRD? "One does not simply ship this feature")

**Mission 6 — Natural Language Deploy (#4)**
- Update `/prd` command Act 5: deploy section accepts prose description
- Create infra-resolver logic: prose → frontmatter mapping (instance type, DNS, backup schedule)
- Create Infra Config panel for War Room (generated config, cost estimate, approve button)
- Update `docs/methods/DEVOPS_ENGINEER.md`: natural language deploy section

**Mission 7 — Build Archaeology (#6)**
- Create `/archaeology` command or `--trace` flag on `/debrief`
- Data model: link production bugs → git commits → build phases → agent findings
- Create Bug Trace Timeline panel for War Room (animated path through pipeline)
- Update `docs/methods/FIELD_MEDIC.md`: archaeology mode in debrief

**Mission 8 — Cross-Project Memory (#7)**
- Create `~/.voidforge/lessons-global.json` schema
- Update Wong's promotion analysis: after each debrief, write lesson summary to global store
- Update Phase 0 Orient: Wong loads global lessons matching current framework/domain
- Create Global Lessons panel for War Room (frequency badges, cross-project patterns)

**Mission 9 — Methodology A/B Testing (#8)**
- Create experiment framework: define experiment (agent count, protocol variant), run both, compare
- Track true-positive rates per agent per project type
- Create Experiment Dashboard panel for War Room (side-by-side accuracy charts)
- Update `docs/methods/FIELD_MEDIC.md`: experiment analysis in debrief

**Mission 10 — Prophecy Visualizer (#9)**
- Create interactive dependency graph renderer (vanilla JS + canvas or SVG)
- Parse campaign-state.md into node/edge graph
- Create Prophecy Graph panel for War Room (clickable nodes, color-coded status)
- Drill-down: click node → show missions, findings, agent reviews

**Mission 11 — The Living PRD (#10)**
- Update BUILD_PROTOCOL.md: Phase 4/6/8 gates include PRD update step when implementation deviates
- Update Troi's compliance check: two-way sync (fix code OR update PRD)
- Create PRD Drift View panel for War Room (side-by-side diff, drift score)
- Store Phase 0 PRD snapshot for diff comparison

### Estimated effort
8-12 sessions. 11 missions. The War Room foundation (Missions 1-2) ships first; frontier features (Missions 3-11) add panels incrementally.

---

### Deferred Indefinitely

| Proposal | Reason |
|----------|--------|
| Visual PRD Editor | Solved better by `/prd` command (v8.0). Identity risk — pushes VoidForge toward SaaS. Dependency explosion contradicts zero-dep philosophy. |
| Live Collaboration | Solved better by Git branching + existing scope boundaries in SUB_AGENTS.md. Architectural mismatch with single-process monolith. |

---

## Versioning Rules

- **MINOR** (4.0, 4.1, 4.2...) — new capabilities, new integrations, new commands
- **PATCH** (4.0.1, 4.0.2...) — bug fixes, doc improvements, methodology refinements
- **MAJOR** (5.0, 6.0, 7.0) — new paradigms, breaking changes to methodology structure

## Prioritization Principles

1. **Fix what breaks first.** Pre-deploy build step > fancy features.
2. **The user's next 5 minutes.** Each version should save the user time on their very next build.
3. **Methodology over tooling.** A new method doc that changes how Claude thinks is worth more than a new wizard screen.
4. **Ship small, ship often.** Each version should be shippable in 1-2 sessions.
5. **Security is not a feature.** It is the prerequisite. Every version that adds network exposure must ship its security layer in the same release — never "add auth later."
