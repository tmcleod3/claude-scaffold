# VoidForge — Product Requirements Document

> This is the PRD for VoidForge itself — the methodology framework, not a project built with it.
> The template at `/docs/PRD.md` is for user projects.

---

## Frontmatter

```yaml
name: "VoidForge"
type: "full-stack"
framework: "express"
database: "none"
cache: "none"
styling: "vanilla-css"
auth: no
payments: none
workers: no
admin: no
marketing: no
email: none
deploy: "static"
```

---

## 1. Product Vision

- **Name:** VoidForge
- **One-liner:** From nothing, everything. A methodology framework for building full-stack applications with Claude Code.
- **Domain:** Developer tooling / AI-assisted development
- **What it does:** Drop in a PRD, and a named team of 170+ AI agents across 7 fictional universes builds your application through a 13-phase protocol. Works with any tech stack. Ships to any cloud.
- **Who it's for:** Developers using Claude Code who want a repeatable, quality-gated build process — from solo founders shipping MVPs to teams standardizing their AI-assisted workflow.
- **Brand personality:** Confident, cinematic, warm. The agents have personality. The methodology has teeth. The Holocron welcomes you in.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────┐
│                  User's Terminal                  │
│              (Claude Code CLI)                    │
└────────┬────────────────────────────┬────────────┘
         │                            │
    Slash Commands               Browser Wizards
    (/build, /campaign,          (Gandalf, Haku)
     /assemble, etc.)                 │
         │                    ┌───────┴───────┐
         │                    │  Express API   │
         │                    │  (localhost)   │
         │                    └───────┬───────┘
         │                            │
    Method Docs               ┌───────┴───────────┐
    (13 protocols)            │   Provisioners     │
         │                    │  ┌─────────────┐   │
    Code Patterns             │  │ AWS VPS     │   │
    (7 reference              │  │ Vercel      │   │
     implementations)         │  │ Railway     │   │
         │                    │  │ Cloudflare  │   │
    Build Journal             │  │ S3 Static   │   │
    (/logs/)                  │  │ Docker      │   │
         │                    │  └─────────────┘   │
    Character Registry        │   + GitHub + DNS   │
    (170+ agents)             │   + SSH Deploy     │
                              │   + S3 Upload      │
                              └────────────────────┘
                                       │
                              ┌────────┴────────┐
                              │  Encrypted Vault │
                              │  (~/.voidforge/) │
                              └─────────────────┘
```

### Component Inventory

| Component | Purpose | Files |
|-----------|---------|-------|
| **Methodology** | Agent protocols, build phases, code patterns | CLAUDE.md, docs/methods/*.md, docs/patterns/*.ts |
| **Commands** | 15 slash commands as executable prompts | .claude/commands/*.md |
| **Gandalf Wizard** | Browser-based setup: vault, credentials, PRD, scaffolding | wizard/ui/app.js, wizard/api/*.ts |
| **Haku Wizard** | Browser-based deploy: provision infrastructure, deploy code | wizard/ui/deploy.js, wizard/lib/provisioners/*.ts |
| **Vault** | AES-256-GCM encrypted credential storage | wizard/lib/vault.ts |
| **Provisioners** | Create cloud resources for 6 deploy targets | wizard/lib/provisioners/*.ts |
| **GitHub Integration** | Create repos, push code, link to platforms | wizard/lib/github.ts |
| **SSH Deploy** | Release-directory deploy with rollback | wizard/lib/ssh-deploy.ts |
| **S3 Deploy** | Static file upload with MIME types | wizard/lib/s3-deploy.ts |
| **DNS** | Cloudflare zone lookup, record CRUD | wizard/lib/dns/*.ts |
| **Registrar** | Domain availability check + purchase | wizard/lib/dns/cloudflare-registrar.ts |
| **Manifest** | Crash recovery for provisioned resources | wizard/lib/provision-manifest.ts |
| **Thumper** | Telegram bridge for remote control | scripts/thumper-*.sh |
| **Distribution** | 3-tier branch model (main/scaffold/core) | Branch sync rules in CLAUDE.md |

---

## 3. Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Runtime | Node.js + TypeScript | Claude Code's native environment |
| API | Express (custom router) | Minimal, no framework dependency |
| UI | Vanilla JS + HTML | Zero build step for wizard UI |
| Styling | Vanilla CSS | No build tools needed |
| Encryption | Node crypto (AES-256-GCM) | Zero dependencies |
| HTTP | Node https (raw) | Zero dependencies |
| AWS | @aws-sdk/* (dynamic import) | Only loaded when AWS target selected |
| Testing | Jest/Vitest | Standard for TypeScript |
| Deploy | 6 cloud targets | User chooses in wizard |

**Dependency philosophy:** Zero runtime dependencies for core methodology. AWS SDK dynamically imported only when needed. No axios, no express (custom router), no ORM.

---

## 4. Core Features

### Feature 1: The Build Protocol

**User flow:**
1. User writes or generates a PRD
2. User runs `/build` (or `/campaign` for autonomous execution)
3. 13 phases execute: orient → scaffold → infra → auth → core → features → integrations → admin → marketing → QA → UX → security → deploy → launch
4. Each phase has a verification gate
5. Build journal logs every decision

**Key behaviors:**
- Conditional phase skipping based on PRD frontmatter
- Session recovery via build-state.md
- Small batches (max ~200 lines per change)
- Double-pass review on QA/UX/Security phases

### Feature 2: The Agent System

**User flow:**
1. Each slash command activates a lead agent with a personality and protocol
2. Lead agents spin up sub-agents from their universe's character pool
3. Sub-agents run in parallel where independent, sequential where dependent
4. Findings are tagged by agent name for traceability

**Key behaviors:**
- 11 leads across 7 universes (Tolkien, Marvel, DC, Star Wars, Star Trek, Dune, Anime)
- 170+ named characters with role-appropriate personalities
- No duplicate names across active sessions
- Character traits encode behavioral directives

### Feature 3: The Wizards (Gandalf + Haku)

**Gandalf (Setup) — Three-Act Flow (v7.1 redesign):**

The wizard is a conversation, not a form. Three natural acts: who are you, what are you building, how should it run. Each act has a distinct emotional register. Éowyn's enchantment principles: the first screen should feel like lighting a forge, the PRD step like describing a dream, the operations menu like choosing equipment before an adventure, and the creation moment like something coming to life.

*Act 1 — "Secure Your Forge" (Identity):*
1. Vault only. One password field, one button. The screen is mostly empty — dark background, a single glowing input. The subtitle fades in: "This password protects everything you build." When the vault unlocks, a subtle pulse ripples outward — the forge is lit. No progress bar yet. Just the moment.
2. Anthropic API key. One field. "Claude needs a key to help you build." Skip link for users who'll add it later. When the key is stored, the progress bar appears for the first time — Act 1 complete, two segments lit.

*Act 2 — "Describe Your Vision" (What you're building):*
3. Project identity. Name + directory only. Domain and hostname moved to Act 3 where they're contextually relevant. The heading changes from "Gandalf — VoidForge Setup" to "Gandalf — [Project Name]" the moment they type a name. The project is already becoming real.
4. PRD. Generate with Claude / paste / skip. If generating, the streaming response should feel like the project is being imagined into existence — not a loading spinner, but text flowing onto the screen like it's being written by hand. If the PRD defines env vars, Step 4b collects project-specific credentials (same as current).

*Act 3 — "Equip Your Project" (Operations menu):*
5. A single screen with expandable cards — NOT a sequence of steps. Each card is an independent choice. The user picks what they need and skips the rest. Cards are contextually smart: if the PRD says `deploy: "vercel"`, the deploy card is pre-selected and Vercel-specific options are shown.

   Cards:
   - **Deploy Target** — where does this ship? (Vercel / AWS / Railway / Cloudflare / S3 / Docker)
   - **Cloud Credentials** — only shown if deploy target needs keys not yet in the vault
   - **Domain & Hostname** — custom domain configuration (only shown if deploy target supports it)
   - **The Resilience Pack** — opt-in operational hardening (see below)
   - **Monitoring** — Sentry DSN, health endpoint (optional)

   The Resilience Pack card expands to show toggles with smart defaults:
   - Deploy resilience: multi-env, preview deploys, auto-rollback, migration automation, backups
   - Runtime resilience: health check endpoint, graceful shutdown, error boundaries, rate limiting, dead letter queue
   Each toggle shows a one-line explanation. Toggles are pre-set based on deploy target and framework.

   Footer: "[Skip All — I'll configure later]" and "[Continue to Review]"

*Finale:*
6. Review. Clean summary of all choices grouped by act. Edit buttons per section.
7. Create → Avengers Tower. The project is scaffolded, and the UI transitions to the terminal. The moment of creation should feel conclusive — not "redirecting..." but a brief animation of the project structure appearing, then the terminal filling the screen. You're home now.

The old simple/advanced toggle is eliminated. Every user gets the same flow — Act 3's menu means "advanced" users configure more cards, "simple" users click "Skip All." Same path, different depth.

**Haku (Deploy):**
1. Unlock vault, scan project
2. Confirm deploy settings
3. Provision infrastructure (SSE-streamed progress)
4. Push to GitHub → link to platform → poll until live
5. Wire DNS
6. Report live URL

### Feature 4: The Campaign System

**User flow:**
1. User runs `/campaign`
2. Sisko reads the PRD, diffs against codebase
3. Identifies next buildable mission (1-3 PRD sections)
4. Presents mission brief, user confirms
5. Hands to Fury → `/assemble` runs full pipeline
6. Commits, loops to next mission
7. Repeats until PRD fully implemented

**Key behaviors:**
- Finish-the-fight: always resumes in-progress work before starting new
- Prophecy Board tracks PRD coverage across sessions
- Dependency ordering (auth before payments, schema before API)
- Scoped missions (not the whole PRD at once)

### Feature 5: Remote Control (Thumper)

**User flow:**
1. User runs `/thumper setup` — creates Telegram bot, sets passphrase
2. `/thumper on` — starts the bridge daemon
3. User sends prompts from Telegram → Claude Code executes → responses sent back
4. Gom Jabbar re-authenticates after 60 minutes idle

### Feature 6: Avengers Tower (Browser Terminal + Multi-Project Operations Console)

**The vision:** Never leave the browser. Gandalf creates the project (Steps 1-6), then the UI transitions to Avengers Tower — a persistent browser workspace with real terminal sessions running Claude Code. The user types `/build`, `/campaign`, SSH commands, git pushes, everything — all inside the browser. After deploy, the terminal stays open. Avengers Tower is where you live.

**Why a real terminal, not API-based build:** Claude Code in a PTY gives you the full experience — 1M context window, all tools (Read, Write, Bash, Grep, etc.), interactive conversation, user intervention. Reimplementing this via the Anthropic API would produce a worse version at twice the code. The browser terminal (xterm.js + node-pty) is the same stack VS Code, Gitpod, and GitHub Codespaces use. It renders Claude Code's full ANSI output correctly because it IS a real terminal.

**Local mode (v5.5):**
- xterm.js in the browser, WebSocket to server-side PTY
- Auto-launches Claude Code in the project directory
- Multiple terminal tabs: Claude Code, SSH to production, shell
- Session persistence across page navigation
- Vault password required to establish PTY connection

**Multi-project mode (v6.0):**
- The Lobby: dashboard showing all projects with status, health, deploy URL, cost
- Each project is a "room" — click in for the full terminal workspace
- Project registry at `~/.voidforge/projects.json`
- Background health poller
- Shared vault: cloud credentials work across all projects without re-entry

**Remote mode (v6.5):**
- VoidForge deployed on a remote VPS, accessed via public URL
- 5-layer security: network (IP allowlist + rate limiting) → authentication (password + TOTP 2FA) → vault (separate password, auto-locks) → terminal sandboxing (non-root, resource limits) → audit trail (every action logged)
- Two-password architecture: login password ≠ vault password (compromised session can't read credentials)
- SSH keys never reach browser — server acts as jump host
- Accessible from phone, iPad, any browser

**Multi-user mode (v7.0):**
- Role-based access: admin / deployer / viewer
- Per-project permissions
- Linked services for monorepo orchestration
- Coordinated deploys with confirmation gates
- Rollback dashboard, cost tracker, agent memory

**New dependencies (only two):**
- `node-pty` (~2MB native) — PTY process spawning (same as VS Code)
- `xterm.js` (~200KB client) — browser terminal rendering (same as Gitpod)

---

## 5. Distribution Model

### Three Tiers

| Tier | Branch | Contents | Use Case |
|------|--------|----------|----------|
| **Full** | `main` | Everything: wizards, provisioners, vault, thumper | `npx voidforge init` |
| **Scaffold** | `scaffold` | Methodology only: commands, methods, patterns, HOLOCRON | Clone, add PRD, `/build` |
| **Core** | `core` | Ultra-light: commands, methods, patterns, registry | Drop into any project |

### Sync Rule
Changes to shared files must propagate to all branches:
- CLAUDE.md, .claude/commands/*, .claude/settings.json
- docs/methods/*, docs/patterns/*, docs/NAMING_REGISTRY.md
- HOLOCRON.md, VERSION.md, CHANGELOG.md, package.json

---

## 6. Roadmap (What to Build Next)

See `ROADMAP.md` for the full plan. Summary:

| Version | Codename | Focus |
|---------|----------|-------|
| **v4.0** | The Reliability Release | Pre-deploy build step, CI/CD generation, env validation, Railway API fix, credential scoping |
| **v4.1** | The Observability Release | Health monitoring, error tracking (Sentry), deploy logs, cost estimation |
| **v4.2** | The DX Release | Type generation, API docs, ERD, integration templates (Stripe/Resend/S3), database seeding |
| **v4.3** | The Resilience Pack | Opt-in operational hardening in Gandalf's Act 3 menu: multi-env, preview deploys, rollback, migrations, backups, health checks, graceful shutdown, error boundaries, rate limiting, DLQ |
| **v4.4** | The Imagination Release | `/imagine` (Celebrimbor — AI image generation) + `/debrief` (Bashir — post-mortem analysis, upstream feedback via GitHub issues) |
| **v4.5** | The Seamless Release | PRD-driven credential collection in Gandalf, headless deploy mode (`--headless`), PostgreSQL extension support |
| **v5.0** | The Intelligence Release | Lessons integration, build analytics, smart scoping, template marketplace |
| **v5.5** | Avengers Tower Local | Browser terminal (xterm.js + node-pty), never leave the browser, Claude Code in the wizard |
| **v6.0** | Avengers Tower Multi | Project registry, The Lobby dashboard, multi-terminal per project, health poller |
| **v6.5** | Avengers Tower Remote | Self-hosted mode, 5-layer security (network + auth + vault + sandbox + audit), TOTP 2FA, two-password architecture |
| **v7.0** | The Penthouse | Multi-user RBAC, per-project permissions, linked services, coordinated deploys, rollback dashboard, cost tracker, agent memory |
| **v7.1** | The Redesign | Three-act wizard flow, operations menu replaces simple/advanced toggle, Resilience Pack as opt-in card, Éowyn's enchantment layer |
| **v7.6** | The Vault Pipeline | `deploy --env-only`, standalone vault reader, campaign auto-injects vault → .env |
| **v8.0** | The Hive Mind | Agent Memory (active lessons read-back), Conflict Prediction (Phase 0.5), Auto-PRD generation (`/prd` command) |
| **v8.1** | The Evolution | Self-Improving Methodology (auto-draft from lesson clusters), Agent Specialization (custom sub-agents) |
| **v8.2** | The Autonomy | Autonomous Campaigns (`/campaign --autonomous` with guardrails and git checkpoints) |
| **v9.0+** | The Horizon | Pattern Evolution, Cross-Project Orchestration, Multi-Language Forge, The Forge Builds the Forge |
| **v10.0** | The War Room | Mission control dashboard, agent confidence scoring, agent debates, Living PRD, A/B testing, Prophecy Visualizer |
| **v11.0** | The Consciousness | 8th universe (Cosmere — Sanderson), `/grow` growth pipeline, `/treasury` financial ops, ad platforms, site optimization |

---

## 7. Security

### Current (v4.5 — local mode)
- **Vault:** AES-256-GCM, PBKDF2 100k iterations, SHA-512, atomic writes
- **Tokens:** Never touch disk. Git push via http.extraheader env var. Triple sanitization in error messages.
- **Path validation:** projectDir rejects `..` segments, requires absolute paths
- **Credential scoping:** Cleanup stores only target-specific keys
- **Gom Jabbar:** PBKDF2 hashed passphrase, message deletion, 60-min idle timeout, 3-attempt lockout
- **SSH:** Ed25519 key pairs, StrictHostKeyChecking=accept-new, .gitignore protection
- **SSE output:** Secret stripping loop removes any key containing password/secret/token

### Avengers Tower Local (v5.5)
- WebSocket requires vault password to establish PTY connection
- PTY idle timeout: 30 minutes (configurable)
- Max 5 concurrent terminal sessions
- Terminal output sanitization (XSS prevention if content reflected to HTML)
- PTY spawns as current user (never root)

### Avengers Tower Remote (v6.5) — Threat Model

**What's behind the door:** Remote Avengers Tower exposes Anthropic API keys, AWS credentials, GitHub tokens, Cloudflare tokens, all project-specific API keys, SSH access to every production server, source code for every project, database credentials, and a live terminal that can execute any command. This is root access to the user's entire digital infrastructure over HTTPS. A single password is wildly insufficient.

**Attack vectors and mitigations:**

| Vector | Risk | Mitigation |
|---|---|---|
| Brute force password | HIGH | Rate limiting (5/min), lockout (10 failures → 30 min ban) |
| Credential stuffing | HIGH | TOTP 2FA mandatory, unique username |
| Session hijacking | HIGH | HttpOnly + Secure + SameSite=Strict cookies, IP binding, single session |
| MITM on WebSocket | MEDIUM | WSS only (TLS via Caddy), HSTS |
| XSS in terminal output | MEDIUM | xterm.js renders raw bytes (safe); HTML reflections escaped |
| Vault file exfiltration | HIGH | AES-256-GCM encryption, separate vault password, auto-lock |
| Abandoned sessions | MEDIUM | 30-min idle timeout on PTYs, 8-hour session TTL |
| Lost device with saved password | HIGH | TOTP 2FA required, single active session |
| Shoulder surfing | MEDIUM | Vault password required for sensitive actions (separate from login) |

**5-layer security architecture (all mandatory):**
1. **Network:** IP allowlist (optional), rate limiting (mandatory), Caddy HTTPS
2. **Authentication:** Username + bcrypt password → TOTP 2FA → time-limited session
3. **Vault:** Separate vault password, auto-lock after 15 min, required for deploys/SSH/credential access
4. **Sandboxing:** Non-root PTY user, resource limits, per-project scoping, SSH proxy (keys never reach browser)
5. **Audit:** Every action logged to append-only `~/.voidforge/audit.log`, 90-day rotation, failed login alerting

### Multi-User (v7.0)
- Role-based access: admin / deployer / viewer
- Per-project access control lists
- User management requires admin + vault unlock
- Session isolation between users
- Cross-project credential access logged separately

---

## 8. Success Metrics

How to know VoidForge is working:

1. **Time to live URL** — from PRD paste to deployed app, measured in minutes not days
2. **Finding-to-fix ratio** — /assemble pipeline catches issues before users do
3. **Session recovery rate** — how often build-state.md successfully resumes a multi-session build
4. **Deploy success rate** — Haku provisions + deploys without manual intervention
5. **Browser-only success rate** (v5.5+) — % of builds completed without opening a separate terminal
6. **Zero-context-switch rate** (v5.5+) — from Gandalf wizard to live URL, entirely in one browser tab
7. **Remote build rate** (v6.5+) — builds initiated from non-development devices (phone, tablet, borrowed laptop)
8. **Multi-project health** (v6.0+) — % of deployed projects with passing health checks in The Lobby
9. **Security incident rate** (v6.5+) — zero tolerance for credential exposure or unauthorized access
5. **Branch sync consistency** — all 3 tiers have identical shared files at every release
