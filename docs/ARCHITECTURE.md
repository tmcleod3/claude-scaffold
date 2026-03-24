# VoidForge — Architecture

**Version:** 15.2.1
**Last reviewed:** 2026-03-23

## Overview

VoidForge is a CLI-launched local web server with five subsystems:

- **Gandalf** (`voidforge init`) — Three-act setup wizard: vault, PRD generation, project scaffolding
- **Haku** (`voidforge deploy`) — Infrastructure provisioning for 6 deploy targets
- **Avengers Tower** — Browser-based operations console: PTY terminals, multi-project dashboard, RBAC
- **Danger Room** — Real-time mission control dashboard: build status, agent activity, growth campaigns, financial ops
- **Cultivation** — Growth engine: ad platform adapters, campaign state machine, spend execution, treasury

Single-process Node.js monolith. TypeScript strict mode. Vanilla JS frontend (no framework). Runtime dependencies: AWS SDK (lazy-loaded), `ws` (WebSocket), `node-pty` (terminal). Test suite: 91 vitest tests across 8 files. Three-tier access: local / LAN / remote.

## System Diagram

```
CLI (voidforge init | deploy | deploy --env-only)
  │
  ▼
Node.js HTTP Server (:::3141, dual-stack IPv4/IPv6)
  │
  ├─ Static files ──────── wizard/ui/ (HTML, JS, CSS)
  │
  ├─ /api/credentials ──── Vault (AES-256-GCM)
  ├─ /api/cloud ─────────── Vault + Provider APIs
  ├─ /api/prd ───────────── Anthropic API (SSE)
  ├─ /api/project ────────── File system (scaffold copy)
  ├─ /api/deploy ─────────── File system (project scan)
  ├─ /api/provision ──────── Provisioner interface (SSE)
  │       ├─ Docker ──────── File generation
  │       ├─ AWS VPS ─────── @aws-sdk (EC2/RDS/ElastiCache)
  │       ├─ Vercel ──────── HTTPS API
  │       ├─ Railway ─────── GraphQL API
  │       ├─ Cloudflare ──── HTTPS API
  │       ├─ Static S3 ───── @aws-sdk (S3)
  │       └─ DNS (post) ──── Cloudflare DNS API
  │
  ├─ /api/terminal ────────── PTY Manager (node-pty + ws)
  │       ├─ Sessions: max 5 local, 20 remote
  │       ├─ Auth: per-session HMAC-SHA256 token
  │       └─ Stale cleanup: auto-retry on <2s failure
  │
  ├─ /api/projects ────────── Project Registry (multi-project)
  ├─ /api/users ───────────── User Manager (RBAC)
  ├─ /api/auth ────────────── Tower Auth (TOTP 2FA) — split: tower-auth + tower-session + tower-rate-limit
  ├─ /api/danger-room ─────── Dashboard data (campaign, build, findings, experiments, deploy, drift)
  ├─ /api/war-room ──────────── Dashboard data (subset of Danger Room, legacy)
  └─ /api/server/status ───── Native module mtime detection

  Avengers Tower:
  ├─ The Lobby ──── Project grid, health badges, import/link
  ├─ Tower Room ─── xterm.js + WebSocket → PTY sessions
  ├─ Danger Room ── Real-time dashboard: build pipeline, agent ticker, growth tabs, financial ops
  ├─ War Room ────── Lightweight dashboard (legacy subset of Danger Room)
  └─ Login ────────── Remote mode authentication (TOTP 2FA)

State:
  ~/.voidforge/vault.enc           Encrypted credentials
  ~/.voidforge/runs/<runId>.json   Provision manifests
  ~/.voidforge/users.json          User accounts (remote mode)
  ~/.voidforge/projects.json       Project registry
  ~/.voidforge/deploys/            Deploy history
  ~/.voidforge/audit.log           Security audit trail
  ~/.voidforge/auth.json           User accounts (remote mode)
  ~/.voidforge/financial-vault.enc Financial vault (scrypt KDF)
  ~/.voidforge/experiments.json    A/B test experiments
  ~/.voidforge/autonomy-state.json Circuit breakers, kill switch
  ~/.voidforge/treasury/           Spend logs, revenue logs, budgets
```

## Key Design Decisions

| Decision | Rationale | ADR |
|----------|-----------|-----|
| File-based vault (not keychain/cloud) | Cross-platform, zero dependencies, user owns their data | — |
| Write-ahead provision manifest | Prevents orphaned AWS resources on crash | ADR-001 |
| Atomic vault writes | Prevents credential loss on crash | ADR-002 |
| Boundary validation on API responses | Defensive coding against API drift | ADR-003 |
| SSE keepalive for long operations | Survives proxies, VPNs, laptop sleep | ADR-004 |
| PRD-driven instance type selection | Right-sized EC2/RDS/ElastiCache from project scope | ADR-005 |
| DNS as post-provision step | Cross-cutting, needs provisioner outputs, non-fatal | ADR-006 |
| "hostname" for DNS, "domain" for business | Avoids ambiguity | ADR-007 |
| Dual-stack binding (::) | macOS resolves localhost to ::1 first; 127.0.0.1 fails | Field report #30 |
| ws library for WebSocket | Custom RFC 6455 implementation failed on Node v24 after 8 debugging commits | Field report #30 |
| node-pty for terminals | Same as VS Code, Gitpod. No alternative exists. | — |
| Three-act wizard (not form) | Eliminates simple/advanced toggle; same path, different depth | v7.1 |
| Monolith (not microservices) | Single user, single machine, same lifecycle | — |
| No frontend framework | Keeps bundle at zero, avoids dependency churn | — |
| Native module mtime detection | Detects when npm install changed .node files while server is running | Tech debt #11 |
| Tower auth 3-module split | Separate session, rate-limit, and auth logic for maintainability (636→424+149+87) | v15.2 |
| Provisioner registry | Single source of truth for provisioners, credential scoping, GitHub targets | v15.1 |
| Proxy modules for pattern imports | 6 barrel files break wizard/ → docs/patterns/ runtime dependency | v15.1 |
| Vault rate limiting | 5 attempts/min, 30-min lockout after 10 failures — separate from login rate limits | v15.1 |
| Vault auto-lock | 15-min idle timeout clears session password | v15.1 |
| Terminal HMAC key rotation | Per-boot random 32-byte key, not vault password | v15.1 |
| SSH SG restriction post-provision | Detect deployer IP, restrict SSH from 0.0.0.0/0 | v15.2 |
| LAN mode (3-tier access) | local (no auth), LAN (dashboard-only), remote (full TOTP 2FA) | v13.0 |
| sendJson consolidation | 10 duplicate implementations → 1 shared http-helpers.ts | v15.1 |
| Health poller batch writes | N individual → 1 batch registry update per poll cycle | v15.1 |

## Subsystem: Avengers Tower

### The Lobby (`wizard/ui/lobby.js`)
Project grid showing all registered projects with health badges (Live, Building, New). Import existing projects via directory path. Link related projects for coordinated deploys. Role-filtered views per user (admin sees all, deployer sees assigned, viewer sees read-only). Restart banner appears when native modules change on disk.

### Tower Room (`wizard/ui/tower.js`)
Real terminal in the browser: xterm.js frontend → WebSocket → node-pty backend. Auto-launches Claude Code on project open. Multiple tabs: Claude Code, SSH, shell. Session persistence across page navigation. Vault password required to establish PTY connection. Auto-cleanup: sessions failing within 2s are removed and retried once.

### The Penthouse (RBAC + Multi-User)
Three roles: admin (full access), deployer (build and deploy assigned projects), viewer (read-only). Per-project access control. Coordinated deploys across linked services. Rollback dashboard with deploy history. Cost tracker per project. Added in v7.0.

## Provisioner Interface

All deploy targets implement:

```typescript
interface Provisioner {
  validate(ctx: ProvisionContext): Promise<string[]>;
  provision(ctx: ProvisionContext, emit: ProvisionEmitter): Promise<ProvisionResult>;
  cleanup(resources: CreatedResource[], credentials: Record<string, string>): Promise<void>;
}
```

Adding a new deploy target = implement this interface + register in `wizard/lib/provisioner-registry.ts`.

## Security Model

- Credentials encrypted at rest with AES-256-GCM (PBKDF2 key derivation, 100k iterations for vault / 210k for auth)
- Financial vault uses scrypt KDF (N=131072, r=8, p=1) with 12-char minimum password
- Session password held in memory only — auto-locks after 15 minutes idle
- Vault unlock rate-limited: 5 attempts/min, 30-min lockout after 10 consecutive failures
- Server binds to `::` (dual-stack) locally, `0.0.0.0` in remote mode
- CORS scoped to wizard's own origin
- CSRF protection via X-VoidForge-Request header on all POST requests
- Directory traversal prevented via `resolve()` + prefix check + symlink resolution
- Generated infrastructure scripts include: fail2ban, SSH hardening, HSTS, firewall lockdown
- Remote mode: 5-layer security (network + TOTP 2FA + vault + sandboxing + audit trail)
- PTY sessions: per-session HMAC-SHA256 auth tokens (keyed with per-boot random secret, NOT vault password), user isolation in multi-user mode
- SSH security groups restricted to deployer's IP post-provisioning (was 0.0.0.0/0)
- Vault key naming: hyphenated keys for global creds, `env:`-prefixed for project-specific

## External Dependencies

| Package | Purpose | Loaded |
|---------|---------|--------|
| `@aws-sdk/client-ec2` | EC2 provisioning | Lazy (VPS/S3 targets only) |
| `@aws-sdk/client-rds` | RDS provisioning | Lazy (VPS target only) |
| `@aws-sdk/client-elasticache` | Redis provisioning | Lazy (VPS target only) |
| `@aws-sdk/client-s3` | S3 provisioning | Lazy (S3 target only) |
| `@aws-sdk/client-sts` | Credential validation | Lazy (AWS targets only) |
| `ws` | WebSocket server | Always (Tower terminals) |
| `node-pty` | PTY process spawning | Always (Tower terminals) |
| `tsx` | TypeScript execution | Dev only |
| `typescript` | Type checking | Dev only |
| `vitest` | Test framework (91 tests, --pool forks) | Dev only |

### Infrastructure Dependency Exception

The "zero runtime dependencies" principle applies to **business logic** — no ORM, no HTTP framework, no utility libraries for things Node.js handles natively. It does NOT apply to **protocol infrastructure**:

- **WebSocket:** Use `ws` library (same as VS Code). Custom RFC 6455 implementations are tech debt.
- **Terminal:** Use `node-pty` (same as VS Code, Gitpod). No alternative.
- **Crypto:** Use Node.js built-in `crypto` module. Never homegrown.

Custom implementations of standard protocols save one dependency and cost days of debugging. (Field report #30: 200 lines of RFC-correct custom WebSocket code replaced by 2-line `ws` import after 8 debugging commits.)

### Node.js Compatibility

Engine requirement: `>=20.11.0 <25.0.0`. See `docs/COMPATIBILITY.md` for tested versions and the v7.2→v7.3 node-pty ABI incident.
