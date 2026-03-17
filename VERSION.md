# Version

**Current:** 7.5.3

## Versioning Scheme

This project uses [Semantic Versioning](https://semver.org/):

- **MAJOR** — Breaking changes to method doc structure, agent naming conventions, build protocol phases, or distribution model
- **MINOR** — New method docs, new agents/characters, new features to VoidForge
- **PATCH** — Typo fixes, clarifications, minor doc improvements

## Version History

| Version | Date | Summary |
|---------|------|---------|
| 7.5.3 | 2026-03-16 | Triage #42-#44 — vault key naming, outbound URL safety, accordion a11y, v7.7 roadmap |
| 7.5.2 | 2026-03-16 | HOLOCRON credentials flow docs + v7.6 Vault Pipeline roadmap |
| 7.5.1 | 2026-03-16 | 19 fixes from #36-#40 — vault awareness, anonymity invariant, deployment verification, cross-file deps, WCAG contrast |
| 7.5.0 | 2026-03-16 | Thumper Command Center — inline keyboard, bot personalization, water-rings fix, command↔doc sync |
| 7.4.1 | 2026-03-16 | 15 fixes from #31-#34 — thumper sync, parallel agents, cascade review, crypto check, proxy SSRF, campaign end debrief |
| 7.4.0 | 2026-03-16 | The Field Hardening — 20 methodology fixes from 5 field reports, runtime smoke test, first-run checklist, campaign-mode pipeline |
| 7.3.2 | 2026-03-16 | 13 methodology fixes from field reports #21-#25 — blitz gate, tier UI audit, auth retrofit, timestamps |
| 7.3.1 | 2026-03-16 | Blitz auto-debrief — /campaign --blitz files field reports after every mission |
| 7.3.0 | 2026-03-16 | Avengers Tower Overhaul — ws library, vault unlock, build-state Lobby, /campaign --blitz, IPv6 fix |
| 7.2.1 | 2026-03-15 | Fix Avengers Tower terminal crash on Node.js v24 (node-pty 1.1.0 → 1.2.0-beta.12) |
| 7.2.0 | 2026-03-15 | The Gauntlet Forging — 31 code fixes, 11 methodology fixes, 7 enchantments, WCAG AA, v8.0+ roadmap |
| 7.1.0 | 2026-03-15 | The Redesign — three-act wizard flow, operations menu, Resilience Pack, simple/advanced eliminated |
| 7.0.1 | 2026-03-15 | Three-act wizard redesign plan, Resilience Pack reclassification, 9 methodology fixes from field reports |
| 7.0.0 | 2026-03-15 | The Penthouse — multi-user RBAC, per-project ACLs, linked services, coordinated deploys, rollback, cost tracker, agent memory |
| 6.5.1 | 2026-03-15 | The Arthurian Retcon — Merlin→Gandalf, Camelot→Avengers Tower, Great Hall→The Lobby, Round Table→The Penthouse |
| 6.5.0 | 2026-03-15 | Avengers Tower Remote — 5-layer security, TOTP 2FA, self-deploy, audit trail, two-password architecture |
| 6.0.0 | 2026-03-15 | Avengers Tower Multi — The Lobby dashboard, project registry, health poller, import flow, SSRF protection |
| 4.4.0 | 2026-03-15 | The Imagination Release — /imagine (Celebrimbor), /debrief (Bashir), 2 new leads, 7 new sub-agents |
| 4.2.0 | 2026-03-14 | The DX Release — Prisma types, OpenAPI docs, ERD generation, integration templates, database seeding |
| 4.1.0 | 2026-03-14 | The Observability Release — deploy logs, cost estimation, health monitoring, Sentry integration |
| 4.0.0 | 2026-03-14 | The Reliability Release — pre-deploy build step, CI/CD generation, env validation, Railway API migration, credential scoping |
| 3.9.1 | 2026-03-14 | Roadmap + VoidForge PRD + /campaign --plan mode for roadmap updates |
| 3.9.0 | 2026-03-14 | Sisko's War Room — /campaign command, autonomous PRD-to-product mission sequencing, 11th lead agent |
| 3.8.0 | 2026-03-14 | Haku's Last Mile — end-to-end deploy automation for all 6 targets, GitHub integration, SSH deploy with rollback |
| 3.7.0 | 2026-03-14 | Fury's Initiative — /assemble full pipeline, /thumper Telegram bridge, Dune universe, 10 leads, 12 commands |
| 3.6.0 | 2026-03-14 | Chani's Worm Rider — /thumper Telegram bridge, Dune universe, Kongo.io methodology upgrades |
| 3.5.3 | 2026-03-14 | /thumper rename + cross-methodology hardening + Kongo.io lessons |
| 3.5.0 | 2026-03-14 | Chani's Worm Rider — /thumper Telegram bridge with Gom Jabbar auth, Dune universe (9th lead), 170+ characters |
| 3.4.0 | 2026-03-13 | 1M Context Adaptation — double-pass reviews, 3 new sub-agents, /test and /review commands, parallelized analysis |
| 3.3.1 | 2026-03-13 | Fix silent PRD truncation — model-aware max tokens, truncation detection and UI warning |
| 3.3.0 | 2026-03-13 | The Last Mile Complete — async resource polling, domain registration, security hardening (43 review findings resolved) |
| 3.2.0 | 2026-03-13 | Bombadil's Forge Sync — /void self-update command, Forge Keeper method doc, 8th lead agent |
| 3.1.0 | 2026-03-13 | The Last Mile — EC2 instance sizing, Cloudflare DNS wiring, platform domain registration |
| 3.0.0 | 2026-03-12 | The VoidForge Holocron, three-tier distribution (main/scaffold/core), README as system reference |
| 2.8.0 | 2026-03-12 | Gandalf/Haku wizard split, architecture review docs, security audit with SG hardening |
| 2.7.0 | 2026-03-12 | Real provisioning for all 6 targets, hardened infra scripts, SSE keepalive, crash recovery loop complete |
| 2.6.0 | 2026-03-12 | Auto-provisioning — Docker, AWS VPS (EC2/RDS/ElastiCache), config stubs, crash recovery manifest, atomic vault writes |
| 2.5.0 | 2026-03-12 | /git command — Coulson's version & release management with semver, changelog, and commit automation |
| 2.4.0 | 2026-03-12 | Wizard cloud providers, deploy targets, security hardening, UI overhaul |
| 2.3.0 | 2026-03-12 | Interactive setup wizard — browser-based onboarding with encrypted credential vault, PRD generation, project scaffolding |
| 2.2.0 | 2026-03-12 | Rename project to VoidForge — "from nothing, everything" |
| 2.1.1 | 2026-03-12 | Fix PostToolUse hook format — migrate from flat `command` to nested `hooks` array per Claude Code schema |
| 2.1.0 | 2026-03-10 | Build journal, context management, enriched slash commands, specific verification gates, test timeline, framework adaptations, rollback strategy, conflict resolution, new patterns (job-queue, multi-tenant, error-handling), regression checklist template, first-deploy checklist, dedup CLAUDE.md/README, parallel phase marking, Batman scope clarification |
| 2.0.0 | 2026-03-10 | Slash commands, testing protocol, code patterns, conditional build phases, Agent tool orchestration, troubleshooting, hooks, MCP guide, personality calibration, feedback loop, PRD frontmatter, CLAUDE.md restructure |
| 1.1.0 | 2026-03-10 | Rename DevOps lead agent from Motoko to Kusanagi |
| 1.0.0 | 2026-03-10 | Initial release — 6 agent protocols, 150+ named characters, 13-phase build protocol |
