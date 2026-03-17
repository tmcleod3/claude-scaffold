# VoidForge — Scaling Assessment

**Version:** 8.0.0
**Last reviewed:** 2026-03-16

## Context

VoidForge is a local developer tool, not a hosted service. "Scaling" refers to handling more complex operations and use cases, not concurrent users.

## Tier 1 — Current (Single Developer)

- Single `node:http` server on `:::3141` (dual-stack IPv4/IPv6)
- Avengers Tower: up to 5 PTY sessions simultaneously (local mode)
- Multi-project support: unlimited projects in registry, one active Tower room at a time
- State: encrypted vault file + JSON manifests + project registry on disk
- **Ceiling:** Handles any single developer workflow. The practical limit is PTY sessions (MAX_SESSIONS=5 in local mode).
- **Cost:** $0 (local process). Cloud costs only during active provisioning.

## Tier 2 — Power User / Small Team (Multi-User, Multi-Project)

Already shipped in v7.0 (The Penthouse):

| Feature | Status | Notes |
|---------|--------|-------|
| Multi-project registry | Shipped (v6.0) | `~/.voidforge/projects.json` — unlimited projects |
| Multi-user RBAC | Shipped (v7.0) | 3 roles: admin, deployer, viewer |
| Per-project ACLs | Shipped (v7.0) | Users see only assigned projects |
| Linked services | Shipped (v7.0) | Coordinated deploys across related projects |
| Rollback dashboard | Shipped (v7.0) | Deploy history with one-click rollback |
| Remote mode | Shipped (v6.5) | Deploy VoidForge to a VPS, access from browser/phone |
| Remote PTY sessions | Shipped (v6.5) | 20 max (5 per project), per-user isolation |
| Cost tracker | Shipped (v7.0) | Per-project cost aggregation |

**Ceiling:** A small team (3-5 people) can share a remote VoidForge instance. The PTY session limit (20 remote) is the practical ceiling. Beyond that, network latency to the remote server becomes the bottleneck for terminal responsiveness.

**Cost:** Remote server hosting (~$20-50/month for a t3.small running VoidForge itself).

## Tier 3 — Team/SaaS (Not Recommended)

Would require a fundamentally different product:

- Authentication + multi-tenancy
- Database (not file vault)
- Queue-based provisioning with workers
- Hosted server infrastructure

**Verdict:** VoidForge should remain a local tool. If team features beyond Tier 2 are needed, build a separate product. The methodology docs (CLAUDE.md, methods/, patterns/) are already shareable via git — the wizard is the local/small-team part.

## First Bottleneck

PTY sessions. Each `node-pty` session spawns a real shell process with its own memory footprint. On a 2GB t3.small, 20 concurrent PTY sessions (each running Claude Code) would consume ~1.5GB. This is the hard ceiling for remote mode.

Mitigation: Idle session timeout (30 minutes). Disconnected sessions auto-reaped when new ones are requested.
