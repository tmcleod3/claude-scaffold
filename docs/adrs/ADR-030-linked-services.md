# ADR-030: Linked Services & Coordinated Deploys

**Status:** Accepted
**Date:** 2026-03-15
**Context:** v7.0 "The Penthouse" — Mission 13

## Decision

Add bidirectional project linking and coordinated deploy orchestration.

### Architecture

**Linking model:** `linkedProjects: string[]` added to `Project` interface. Links are bidirectional — linking A to B adds B's ID to A's list AND A's ID to B's list. This avoids orphan references.

**Deploy coordination:** A new `deploy-coordinator.ts` module checks linked projects for pending changes and orchestrates sequential deploys. Deploy order follows array order. Each step requires confirmation.

**No graph cycles:** Linking is flat (array of IDs), not a dependency DAG. All linked projects are peers, not parent-child. This is simpler and matches the "monorepo services" use case (API + Workers + Web are peers).

### Alternatives Considered

1. **Dependency DAG with topological sort** — Rejected. Over-engineered for the use case. Peer services don't have strict dependency ordering.
2. **Centralized deploy manifest** — Rejected. The project registry already stores all needed data.
