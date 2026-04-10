# Campaign State — VoidForge Campaign 35 (v23.3 The Splitting)

## Campaign Info

**Version:** v23.3
**Codename:** The Splitting
**Mode:** default (autonomous + full roster, ADR-043)
**Source:** `ROADMAP.md` v23.3 section
**Started:** 2026-04-10
**Status:** IN PROGRESS

## Baseline

- 1340/1340 tests passing (120 test files)
- 152 source files, 0 TypeScript errors
- Top oversized files: treasury-heartbeat (1,495), heartbeat (1,067),
  projects.ts (769), aws-vps (663), provision (642), google-campaign (560)

## Mission Plan

| # | Mission | Scope | Status |
|---|---------|-------|--------|
| M1 | Split treasury-heartbeat.ts | 1,495 → ~4 modules | PENDING |
| M2 | Split heartbeat.ts | 1,067 → ~3 modules | PENDING |
| M3 | Split API routes | projects.ts (769) + provision.ts (642) | PENDING |
| M4 | Split provisioners | aws-vps (663) + railway (454) | PENDING |
| M5 | Split financial campaigns | google (560) + tiktok (478) + meta (413) | PENDING |
| M6 | Victory Gauntlet | All tests pass, no file >400 lines | PENDING |

**Execution order:** M1 → M2 → M3 + M4 + M5 (parallel) → M6

Missions completed: 0/6. Next checkpoint at: 4.

## BLOCKED Items

(none yet)
