# VoidForge Roadmap

> The plan for the plan-maker.

**Current:** v4.5.0 (2026-03-15)
**Status:** Seamless release in progress. PRD-driven credentials, headless deploy, extension support.

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
Add Sentry as an optional integration in the Merlin wizard. If enabled, generate the Sentry SDK initialization code, configure source maps, and inject the DSN as an env var. Non-fatal — works without it.

### Structured deploy logs
Store deploy results to `~/.voidforge/deploys/` with timestamps, targets, URLs, and resource IDs. Users can run `voidforge deploys` to see their deploy history. Strange's Done screen links to the log.

### Cost estimation
Before AWS provisioning, estimate the monthly cost based on instance type, RDS, and ElastiCache choices. Display in the Strange confirm screen. Rough but useful: "Estimated: ~$45/month (t3.micro + db.t3.micro + cache.t3.micro)."

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

## v4.3 — The Resilience Release

*From "it works" to "it stays working."*

### Multi-environment support
Generate separate `.env.development`, `.env.staging`, `.env.production`. Strange wizard asks which environment to deploy. Platform deploys scope env vars per environment (Vercel already supports this — extend to Railway/Cloudflare).

### Preview deployments
For Vercel and Cloudflare Pages, configure PR preview deployments automatically. Each pull request gets a unique URL. Links posted as PR comments via GitHub API.

### Platform rollback
Vercel, Railway, and Cloudflare all support rollback via API. Add a `/api/provision/rollback` endpoint that reverts to the previous deployment. Surface in the Strange UI as a "Rollback" button on the Done screen.

### Database migration automation
Run `prisma migrate deploy` (or `rails db:migrate`, `python manage.py migrate`) as part of the deploy step. For VPS, include in the SSH deploy sequence before the symlink swap. For platforms, add as a build step.

### Backup automation
For VPS + RDS: generate a daily backup cron (`pg_dump` to S3). For Railway/Cloudflare D1: document the platform's built-in backup features. For S3 static: enable versioning on the bucket.

---

## v4.4 — The Imagination Release

*The forge creates images. The forge learns from its users.*

### `/imagine` command — Celebrimbor's Image Generation
New slash command and agent for AI image generation. Celebrimbor (Tolkien — greatest elven smith) reads the PRD for visual asset requirements (illustrations, portraits, OG images, hero art), derives a style prompt from the brand section, and generates images via OpenAI's image API. Manages an asset manifest for regeneration and auditing. Provider-abstracted (OpenAI default, extensible to Replicate/others).

Sub-agents: Nori (asset scanner), Ori (prompt engineer), Dori (integration checker) — dwarves from The Hobbit.

Command: `/imagine` (not `/forge` — avoids collision with VoidForge/Bombadil naming). Flags: `--scan`, `--asset "name"`, `--regen "name"`, `--style "override"`, `--provider model`.

### Wizard integration — OpenAI API key in Merlin
Add OpenAI API key as an optional credential in Merlin's Step 2 (Cloud Providers). Same vault, same AES-256-GCM encryption, same UX. Key name: `openai-api-key`. If not provided in wizard, `/imagine` prompts on first use. Non-blocking — projects work fine without it.

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

*From Merlin to live URL without leaving Claude Code.*

### PRD-driven credential collection
Merlin currently collects cloud provider credentials (AWS, Vercel, etc.) in Step 2. But project-specific API keys (WhatsApp, Mapbox, Google Places, Resend, etc.) must be manually added to `.env` later. After the PRD is pasted in Step 4, Merlin should parse the env var section, identify which keys are needed, and present a dynamic credential form (Step 4.5). All keys stored in the vault with the same AES-256-GCM encryption. Grouped by urgency: required for build, required for deploy, optional enrichment sources.

New API endpoint: `POST /api/prd/env-requirements` — parses PRD content and returns structured list of required credentials with labels, placeholders, and help text. New Merlin step between PRD and deploy target selection.

### Headless deploy mode (`--headless`)
Strange is a browser wizard. But `/build` Phase 12 already says "Kusanagi provisions and deploys." The vault has the credentials. The PRD has the target. There's no reason to context-switch to a browser. Add `npx voidforge deploy --headless` that runs the same provisioner code but outputs progress to terminal (stdout) instead of SSE to a browser. Phase 12 of `/build` calls this directly.

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

## v5.5 — Camelot Local

*Merlin builds Camelot. You never leave the browser.*

The insight: instead of reimplementing Claude Code's capabilities via the Anthropic API (custom tool executor, custom agentic loop), embed a real terminal in the browser. The user gets actual Claude Code — full tool access, 1M context window, interactive conversation — running inside an xterm.js terminal connected to the VoidForge server via WebSocket. After Merlin creates the project (Steps 1-6), the UI transitions to Camelot: a browser terminal that auto-launches Claude Code in the project directory. The user types `/build` or `/campaign` and the real 13-phase protocol executes. No terminal app needed. No context switch. And the terminal stays open after deploy — you can SSH into production, push hotfixes, run `/qa`, run `/debrief`, all from the same browser tab.

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

### Browser terminal UI (`wizard/ui/camelot.html` + `wizard/ui/camelot.js`)
Uses xterm.js (the standard browser terminal renderer — same as VS Code web, Gitpod, Railway console). Renders full ANSI color, cursor positioning, scrollback. Fits to container with `xterm-addon-fit`. Clickable URLs with `xterm-addon-web-links`. Tabbed interface: multiple terminals per project. Tab bar shows session type: `[Claude Code] [SSH: prod] [Shell] [+ New]`.

### Navigation flow
After Merlin Step 6 (Review) → Step 7 (Create Project) → **Step 8: Camelot**. The wizard header changes from "Merlin — VoidForge Setup" to "Camelot — [Project Name]". The progress bar is replaced by a phase status indicator (for builds in progress). Back navigation goes to the Great Hall (in v6.0+) or Merlin (single-project mode). The Merlin wizard and Camelot share the same Express server, same port, same vault session.

### Security (local mode)
Local Camelot binds to `localhost:3141`. No external exposure. The threat model is the same as Claude Code itself: physical access to the machine. Mitigations:
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
- `wizard/ui/camelot.html` (~100 lines) — terminal page
- `wizard/ui/camelot.js` (~300 lines) — xterm.js setup, tab management, WebSocket client
- Update: `wizard/server.ts` (WebSocket upgrade handling), `wizard/ui/app.js` (transition to Camelot after project creation), `scripts/voidforge.ts` (serve camelot.html)

### Estimated effort
~850 lines (including security), 2-3 sessions.

---

## v6.0 — Camelot Multi

*Every project gets a room. The Great Hall shows them all.*

Camelot expands from a single-project terminal to a multi-project operations console. The landing page becomes the Great Hall: a dashboard showing all VoidForge projects with status, health, deploy URL, and quick actions. Each project is a "room" you click into — opening the full terminal workspace for that project.

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

No database — VoidForge stays zero-dep for core. Registry auto-populated when Merlin creates a project. Updated when builds complete and deploys succeed. File permissions: `0600` (owner read/write only).

### The Great Hall (`wizard/ui/hall.html` + `wizard/ui/hall.js`)
Dashboard landing page. Cards for each project showing: name, status (building/deployed/errored), deploy URL (clickable), framework badge, deploy target badge, estimated monthly cost, health indicator (green/yellow/red), last activity timestamp. Quick actions per card: Open Room, SSH (if VPS), Logs, Deploy. Bottom bar: "The Round Table" — vault credential count, total projects, aggregate monthly cost, links to Manage Vault and Deploy History.

"+ New Project" button launches Merlin wizard. On completion, returns to Great Hall with the new project card.

### Health Poller (`wizard/lib/health-poller.ts`)
Background service that pings each project's health check URL every 5 minutes. Updates project registry with last health status and timestamp. Runs only when the server is active. Non-blocking — uses `fetch` with 5-second timeout. Health states: `healthy` (200 OK), `degraded` (non-200 but responding), `down` (timeout or connection refused), `unchecked` (no health URL configured).

### Multi-terminal per project
Each project room supports N terminal sessions (default max 5). Tabs show session type and can be renamed. Sessions persist across page navigation (go to Great Hall, come back, terminals are still running). Closing a terminal tab sends SIGHUP to the PTY. Creating "SSH: production" tab auto-runs `ssh user@host` using the SSH key from the vault (key never reaches the browser — server executes the SSH connection through the PTY).

### Shared vault awareness
The vault is already global (not per-project) — AWS, GitHub, Cloudflare credentials work across all projects. Merlin's Step 4b (PRD-driven credentials) stores project-specific keys with `env:` prefix in the vault (e.g., `env:WHATSAPP_ACCESS_TOKEN`). When creating a second project that uses the same service (e.g., two projects both need Resend), the credential form pre-fills from the vault.

### Security (multi-project)
- Project directory isolation: each PTY session is scoped to its project directory. The shell starts with `cd /path/to/project`. The user CAN navigate out (it's a real shell), but initial scope is correct.
- Project registry file permissions: `0600` (owner only)
- Health poller uses GET requests only (read-only, no credentials in polling)
- Per-project session limits (prevent one project from consuming all PTY slots)
- Terminal sessions namespaced by project ID in the PTY manager

### Files to create
- `wizard/lib/project-registry.ts` (~150 lines) — CRUD for projects.json
- `wizard/api/projects.ts` (~100 lines) — REST endpoints for project list, status, health
- `wizard/ui/hall.html` (~100 lines) — Great Hall dashboard
- `wizard/ui/hall.js` (~250 lines) — project cards, health indicators, navigation
- `wizard/lib/health-poller.ts` (~100 lines) — background health checks
- Update: `wizard/server.ts` (route hall.html as landing), `wizard/api/project.ts` (register project on creation), `wizard/ui/camelot.js` (back-to-hall navigation)

### Estimated effort
~900 lines (including security), 2-3 sessions.

---

## v6.5 — Camelot Remote

*Access your forge from anywhere. Phone, iPad, hotel business center, a friend's laptop.*

Deploy VoidForge itself on a remote server. Access Camelot through a public URL behind serious authentication. The server becomes your build machine, production host, operations console, and development environment — all accessible from any browser. You could build and deploy an entire application from your phone in an Uber.

### The architecture

```
Your device (just a browser)
  → https://forge.yourdomain.com (HTTPS + WSS)
    → Caddy (reverse proxy, auto-TLS, auth layer)
      → VoidForge Server (:3141)
        → Wizard API (Merlin), PTY Manager, Vault, Provisioners
        → Claude Code (installed on this server, runs in PTY sessions)
        → All projects live at /home/forge/projects/
      → Also proxies deployed apps:
        → dialog.travel → Dialog Travel (port 3000)
        → api.widgets.co → Widget API (port 3001)
```

One VPS (t3.medium recommended, $30/mo) serves as your build server, production host for VPS-targeted projects, and operations console for platform-targeted projects (Vercel, Railway, Cloudflare — managed via terminal).

### Threat model — what's behind the door

Remote Camelot exposes the following over the internet:
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

Two-password architecture. The login password gets you into Camelot (dashboard, terminals, project list). The vault password decrypts credentials. These are DIFFERENT passwords.

Why: if someone compromises the login (session hijack, XSS, shoulder surfing), they can see the dashboard and interact with terminals where Claude Code is already running, but they CANNOT:
- Read API keys or tokens
- SSH into production (SSH keys are in the vault)
- Deploy to new infrastructure (provisioners need vault credentials)
- Create new projects (Merlin needs vault for credential storage)
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
- `wizard/lib/camelot-auth.ts` (~300 lines) — login flow, session management, TOTP verification, rate limiting, lockout
- `wizard/api/auth.ts` (~150 lines) — login/logout/session endpoints
- `wizard/ui/login.html` + `wizard/ui/login.js` (~150 lines) — login page with password + TOTP fields
- `wizard/lib/audit-log.ts` (~100 lines) — append-only JSON lines logger
- `wizard/lib/provisioners/self-deploy.ts` (~200 lines) — VoidForge self-deploy provisioner
- Caddy config template for remote mode (~50 lines)
- Update: `wizard/server.ts` (auth middleware, session checks), `wizard/lib/pty-manager.ts` (sandboxing, audit integration), `scripts/voidforge.ts` (`--self` flag)

### Estimated effort
~1,200 lines (security is the majority), 3-4 sessions.

---

## v7.0 — The Round Table

*Multi-user, multi-project, coordinated operations.*

Camelot becomes a team tool. Multiple users, role-based access, per-project permissions, coordinated deploys across linked services, and a rollback dashboard. The Round Table is where the team manages their fleet.

### Role-based access
Three roles: `admin` (full access — create projects, manage users, deploy, access vault), `deployer` (can build and deploy assigned projects, cannot manage vault or users), `viewer` (read-only — can see dashboards, logs, health, but cannot execute commands or deploy).

User management stored in `~/.voidforge/users.json`. Each user: username, bcrypt password hash, TOTP secret (encrypted in vault), role, project access list, created timestamp, last login. Admin can create/remove users via Great Hall settings.

### Per-project access control
Each project in the registry has an `access` field: list of usernames with their role for that project. Admin has implicit access to all projects. A deployer might have access to "Dialog Travel" but not "Widget API". A viewer can see all projects in the Great Hall but only open rooms they have access to.

### Monorepo / linked services
Projects can be linked (via `linkedProjects` field in registry). Linked projects appear as sub-cards in the Great Hall. Coordinated deploys: when deploying "Dialog Travel — API", the system checks if "Dialog Travel — Workers" and "Dialog Travel — Web" also need redeployment (shared schema change, shared dependency update). Deploy order is configurable. Coordinated deploys require vault unlock + explicit confirmation for each service ("Deploy API first, then Workers, then Web? [Confirm all / Step through]").

### Rollback dashboard
Deploy history per project, visible in the project room. Each deploy entry: timestamp, git commit, deploy target, success/failure, URL. One-click rollback to any previous version. For VPS: symlink swap to previous release directory. For platforms: Vercel/Railway/Cloudflare API rollback. Rollback requires deployer role + vault unlock.

### Cost tracker
Aggregate monthly cost across all projects. Per-project breakdown. AWS billing API integration (optional — requires additional IAM permissions). For non-AWS targets: manual cost entry or platform API queries. Displayed in Great Hall footer and per-project room sidebar. Alerts when cost exceeds configurable threshold.

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
- Update: all auth and session code for role enforcement, PTY manager for user isolation, Great Hall for role-filtered views

### Estimated effort
~1,400 lines (including security), 3-4 sessions.

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
