# ADR-031: Observatory Features — Rollback, Cost, Agent Memory

**Status:** Accepted
**Date:** 2026-03-15
**Context:** v7.0 "The Penthouse" — Mission 14

## Decision

Add three complementary features that complete The Penthouse: deploy rollback UI, cost tracking, and cross-project agent memory.

### Architecture

**Cost tracker:** Reads `monthlyCost` from the existing project registry. No separate store — the data lives where it's already stored. Aggregation is computed on read.

**Agent memory:** New `~/.voidforge/lessons.json` file. Same patterns as vault/registry: serialized writes, atomic file ops, 0600 permissions. Lessons are append-only with read filtering. Never stores credentials or PII.

**Rollback UI:** A collapsible panel in the Tower (terminal room). Reads deploy history from `~/.voidforge/deploys/`. Rollback is a confirmation-gated action that calls the existing provisioner rollback mechanisms.

### Key Decisions

1. Cost data stays in the project registry (no separate store) — simplicity.
2. Lessons are global (not per-project) — the value is cross-project pattern recognition.
3. Rollback is per-project, displayed in the Tower room (not The Lobby) — context-appropriate.
