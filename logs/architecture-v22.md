# Architecture Review — v22.0 The Scope

**Date:** 2026-04-08/09
**Type:** Full Muster (--muster flag)
**Agents deployed:** 17 across 3 waves (7 Vanguard, 6 Main Force, 4 Adversarial)
**Universes engaged:** Star Trek, Marvel, DC, Tolkien, Star Wars, Anime, Cosmere
**Input:** ADR-040, ROADMAP v22.0, vault-2026-04-08-2.md

## Summary

Full 3-wave Muster architecture review before Campaign 28 (v22.0 "The Scope"). Reviewed the project-scoping architecture for dashboards, financial data, daemon state, WebSocket, and UI. Found 6 CRITICAL blockers, 8 HIGH issues, 7 MEDIUM items. Plan revised from 6→7 missions with significant reordering.

## CRITICAL Findings

1. **Router exact-match only** — cannot do `/api/projects/:id/*`. Upgraded in M0.
2. **Zero project access control** on all 19 dashboard endpoints (13 danger-room + 7 war-room - 1 overlap). `resolveProject()` middleware designed.
3. **WebSocket auth gap** — LAN mode skips session auth entirely on upgrade. Fixed in M0.
4. **DaemonAggregator leaks all projects** unfiltered including filesystem paths. Filter at API layer.
5. **Dual-daemon split-brain** — no guard against global + per-project daemon running simultaneously.
6. **JSONL entries lack projectId** — migration and aggregation impossible without it. Added in M0.

## Key Decisions

| Decision | Choice | Source |
|----------|--------|--------|
| Router timing | Upgrade in M0, not M5 | Riker challenged Picard's query-param workaround |
| Financial migration | Clean break (genesis hash), not copy | Spock + Riker: copying creates false provenance |
| Mission ordering | M0→M1→M2→M3→M4→M5→M6 (sequential) | Riker: writes before reads; La Forge: split-brain risk |
| WebSocket model | Subscription rooms (Option B) | Kusanagi: no resource leak, simpler lifecycle |
| Access pattern | `resolveProject()` per handler, not global middleware | Tuvok: explicit, auditable, matches existing patterns |
| ProjectContext | Rich interface with derived paths | Spock: constructed once per request, threaded through |

## Conflicts Resolved

1. **Financial scope (per-project vs global):** Per-project wins. Stark/Riker dissent preserved — revisit if users report confusion.
2. **Query params vs URL params:** URL params from M0. One migration, not two.
3. **M2‖M3 parallelism:** Removed. M2 (daemon writes) strictly before M3 (financial reads).
4. **Mission count:** 7 missions honest, not 6 missions with hidden prerequisites.

## Deliverables

- [x] ROADMAP.md v22.0 section rewritten (7 missions, reordered)
- [x] ADR-041 written (9 amendments with rationale)
- [x] This architecture log

## Next: Campaign 28

Resume via `/campaign --blitz --muster` with revised plan.
