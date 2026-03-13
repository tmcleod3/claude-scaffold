# VoidForge — Scaling Assessment

**Version:** 2.7.0
**Last reviewed:** 2026-03-12

## Context

VoidForge is a local developer tool, not a hosted service. "Scaling" refers to handling more complex operations and use cases, not concurrent users.

## Tier 1 — Current (Single Developer)

- Single `node:http` server on `127.0.0.1:3141`
- One wizard session at a time
- One provisioning run at a time
- State: encrypted vault file + JSON manifests on disk
- **Ceiling:** Handles any single project. No bottleneck.
- **Cost:** $0 (local process). Cloud costs only during active provisioning.

## Tier 2 — Power User (Multi-Project)

If users need to manage multiple VoidForge projects simultaneously:

| Change | Effort | Impact |
|--------|--------|--------|
| Vault namespacing per project | Medium | Allows isolated credential sets |
| Project registry (`~/.voidforge/projects.json`) | Low | Track which projects exist |
| Concurrent provision tracking | Low | Run multiple provisions |

No architecture change required — same monolith, more structured state.

## Tier 3 — Team/SaaS (Not Recommended)

Would require a fundamentally different product:

- Authentication + multi-tenancy
- Database (not file vault)
- Queue-based provisioning with workers
- Hosted server infrastructure

**Verdict:** VoidForge should remain a local tool. If team features are needed, build a separate product. The methodology docs (CLAUDE.md, methods/, patterns/) are already shareable via git — the wizard is the local part.

## First Bottleneck

Not applicable. The tool is I/O-bound on external API calls (AWS, Anthropic), not on local computation. The server handles a single user with negligible resource usage.
