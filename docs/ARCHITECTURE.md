# VoidForge — Architecture

**Version:** 2.7.0
**Last reviewed:** 2026-03-12

## Overview

VoidForge is a CLI-launched local web server that provides two browser-based wizards:

- **Merlin** (`voidforge init`) — Project setup: credential vault, PRD generation, scaffold creation
- **Strange** (`voidforge deploy`) — Infrastructure provisioning for 6 deploy targets

Single-process Node.js monolith. TypeScript strict mode. No framework (vanilla JS frontend). Zero runtime dependencies beyond AWS SDK.

## System Diagram

```
CLI (voidforge init | deploy)
  │
  ▼
Node.js HTTP Server (127.0.0.1:3141)
  │
  ├─ Static files ──── wizard/ui/ (HTML, JS, CSS)
  │
  ├─ /api/credentials ── Vault (AES-256-GCM)
  ├─ /api/cloud ──────── Vault + Provider APIs
  ├─ /api/prd ────────── Anthropic API (SSE)
  ├─ /api/project ────── File system (scaffold copy)
  ├─ /api/deploy ─────── File system (project scan)
  └─ /api/provision ──── Provisioner interface (SSE)
         ├─ Docker ────── File generation
         ├─ AWS VPS ───── @aws-sdk (EC2/RDS/ElastiCache)
         ├─ Vercel ────── HTTPS API
         ├─ Railway ───── GraphQL API
         ├─ Cloudflare ── HTTPS API
         └─ Static S3 ── @aws-sdk (S3)

State:
  ~/.voidforge/vault.enc           Encrypted credentials
  ~/.voidforge/runs/<runId>.json   Provision manifests
```

## Key Design Decisions

| Decision | Rationale | ADR |
|----------|-----------|-----|
| File-based vault (not keychain/cloud) | Cross-platform, zero dependencies, user owns their data | — |
| Write-ahead provision manifest | Prevents orphaned AWS resources on crash | ADR-001 |
| Atomic vault writes | Prevents credential loss on crash | ADR-002 |
| Boundary validation on API responses | Defensive coding against API drift | ADR-003 |
| SSE keepalive for long operations | Survives proxies, VPNs, laptop sleep | ADR-004 |
| Monolith (not microservices) | Single user, single machine, same lifecycle | — |
| No frontend framework | Keeps bundle at zero, avoids dependency churn | — |

## Provisioner Interface

All deploy targets implement:

```typescript
interface Provisioner {
  validate(ctx: ProvisionContext): Promise<string[]>;
  provision(ctx: ProvisionContext, emit: ProvisionEmitter): Promise<ProvisionResult>;
  cleanup(resources: CreatedResource[], credentials: Record<string, string>): Promise<void>;
}
```

Adding a new deploy target = implement this interface + register in `wizard/api/provision.ts`.

## Security Model

- Credentials encrypted at rest with AES-256-GCM (PBKDF2 key derivation, 100k iterations)
- Session password held in memory only — never written to disk
- Server binds to 127.0.0.1 only — not exposed to network
- CORS scoped to wizard's own origin
- Directory traversal prevented via `resolve()` + prefix check
- Generated infrastructure scripts include: fail2ban, SSH hardening, HSTS, firewall lockdown

## External Dependencies

| Package | Purpose | Loaded |
|---------|---------|--------|
| `@aws-sdk/client-ec2` | EC2 provisioning | Lazy (VPS/S3 targets only) |
| `@aws-sdk/client-rds` | RDS provisioning | Lazy (VPS target only) |
| `@aws-sdk/client-elasticache` | Redis provisioning | Lazy (VPS target only) |
| `@aws-sdk/client-s3` | S3 provisioning | Lazy (S3 target only) |
| `@aws-sdk/client-sts` | Credential validation | Lazy (AWS targets only) |
| `tsx` | TypeScript execution | Dev only |
| `typescript` | Type checking | Dev only |
