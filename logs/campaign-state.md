# Campaign State — VoidForge Campaign 33 (v23.1 The Injection)

## Campaign Info

**Version:** v23.1
**Codename:** The Injection
**Mode:** default (autonomous + full roster, ADR-043)
**Source:** `ROADMAP.md` v23.1 section
**Architecture:** ADR-045 (Knowledge Injection)
**Started:** 2026-04-09
**Status:** IN PROGRESS

## Mission Plan (Pike's reorder — M5 first for deadline)

| # | Mission | Scope | Status |
|---|---------|-------|--------|
| M1 | Distribution Fix | init/update/void code paths | **DONE** (in v23.0 assessment) |
| M5 | Scaffold Migration | scaffold branch void.md, deprecation, archive | **COMPLETE** |
| M2 | Lead Agent Knowledge Injection (20) | Method doc + learnings + lessons → agent defs | PENDING |
| M3 | Key Sub-Agent Injection (~40) | Field-report checks → agent defs | PENDING |
| M4 | Debrief Pipeline Update | FIELD_MEDIC, debrief cmd, Bashir/Wong agents | PENDING |
| M6 | Vault + Global Lessons | vault cmd, lessons-global.json | PENDING |
| M7 | Victory Gauntlet | Full consistency + flow verification | PENDING |

Missions completed: 2/7. Next checkpoint at: M4 (4th completed mission).

## Execution Order

~~M1~~ → M5 → M2+M3 (parallel) → M4 → M6 → M7

## BLOCKED Items

None.
