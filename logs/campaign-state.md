# Campaign State — VoidForge Campaign 29 (v22.0.x The Scope Hardening)

## Campaign Info

**Version:** v22.0.x
**Codename:** The Scope Hardening
**Mode:** `--blitz --muster`
**Source:** `ROADMAP.md` v22.0.x section + post-build Muster assessment
**Architecture:** ADR-041 (Muster amendments)
**Started:** 2026-04-09
**Status:** COMPLETE

## Mission Plan

| # | Mission | Scope | Status | Debrief |
|---|---------|-------|--------|---------|
| P0-A | RBAC Bypass on Freeze | Add role check in freeze handler, update ROUTE_ROLES | **COMPLETE** | — |
| P0-B | Old UI Legacy API Paths | Backward-compat routes for danger-room.js/war-room.js | **COMPLETE** | — |
| P0-C | Prepack Pattern Sync | Sync docs/patterns/financial-transaction.ts with wizard version | **COMPLETE** | — |
| P1-A | Daemon CLI Wiring | --project-dir in voidforge.ts heartbeat command | **COMPLETE** | — |
| P1-B | Remove Old WebSocket Paths | WebSocket upgrade passes projectId for filtering | **COMPLETE** | — |
| P1-C | Remove Token Fallback | 503 if per-project token missing, no global fallback | **COMPLETE** | — |
| P2-A | Unit Tests | dashboard-data, project-scope, treasury-reader, router | **COMPLETE** | — |
| P2-B | Treasury Migration CLI | voidforge migrate treasury --project=<id> | DEFERRED to v22.1 | — |
| P2-C | Treasury Summary File | Daemon writes treasury-summary.json | DEFERRED to v22.1 | — |
| P3 | Minor Hardening | Skip link, WS maxPayload, stale directory check | **COMPLETE** | — |

Missions completed: 8/10. 2 deferred to v22.1 (migration CLI + treasury summary).

## Results

- 4/4 CRITICAL findings: FIXED (RBAC bypass, legacy UI paths, prepack sync, daemon CLI wiring)
- 4/4 HIGH findings: 3 FIXED (WS filtering, token fallback, unit tests), 1 deferred (migration CLI)
- All LOW findings: FIXED (skip link, WS maxPayload, stale dir check)
- 696/696 tests passing (21 new tests)
- 0 type errors

## BLOCKED Items

- P2-B (Treasury Migration CLI): Deferred to v22.1 — existing users with global treasury data need migration path
- P2-C (Treasury Summary File): Deferred to v22.1 — O(n) JSONL scan still used, O(1) summary file not yet implemented
