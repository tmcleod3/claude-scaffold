# ADR-035: Project-Scoped Operational Learnings System
## Status: Accepted
## Context

Every multi-session VoidForge project suffers knowledge loss between sessions. Operational facts discovered during live testing — API rate limits, rejected architectural alternatives, root-caused bugs, environment quirks — are expensive to re-derive but have no persistent storage layer.

Existing persistence mechanisms each cover a different scope:
- `/vault` — session snapshot, ephemeral (overwritten per session)
- `docs/LESSONS.md` — cross-project code patterns, methodology-level
- CLAUDE.md memory — user preferences, 200-line index limit
- Field reports — upstream methodology feedback, filed and closed

None store project-specific, session-transcendent operational knowledge.

Validated by 11-agent Muster (2026-04-01): Picard, Sisko, Batman, Kusanagi, Seldon, Kelsier (Wave 1), Spock, Wong, Elrond (Wave 2), Riker, Constantine (Wave 3).

## Decision

Implement a `LEARNINGS.md` file convention with structured entries, integrated into existing commands rather than a new standalone slash command:

- **Write path:** `/debrief` proposes candidate learnings → user approves → written to `LEARNINGS.md`. If no debrief ran, `/vault` catches remaining candidates at session end.
- **Read path:** `/build` Phase 0, `/campaign` Step 1, `/architect` Step 0, `/assemble` Phase 0 — MUST read if file exists
- **Format:** Categorized markdown with inline metadata (category, verified date, scope, evidence)
- **Cap:** 50 active entries max. Pruning enforced on write.
- **Curation:** Manual only. Auto-extraction produces drafts for approval, never auto-commits.
- **Promotion:** Wong's pipeline — learning reoccurs in 2+ projects → promotes to `LESSONS.md` → pointer replaces original entry

## Consequences

- Sessions start with operational context; re-learning cost drops from 5-15 min to ~0
- No new slash command (28 stays at 28) — reduces command fatigue (Kelsier)
- Entries require human approval — prevents noise accumulation (Seldon)
- Stale entries mitigated by `verified:` dates + 90-day warnings at read time
- Projects that don't need it get zero overhead — file created only on first approved learning

## Alternatives Considered

1. **Standalone `/learnings` command** — Rejected: adds to command fatigue, overlaps with `/debrief` workflow (Kelsier)
2. **Extend vault with cumulative section** — Rejected: vault is narrative, not structured; no schema enforcement; grows unbounded (Riker raised, council rejected)
3. **Phase 1/2 split (file convention first, command later)** — Rejected: Phase 1 without write infrastructure is a filing cabinet nobody opens (Sisko, Picard, Kelsier unanimous)
4. **Auto-extraction without approval** — Rejected: captures what was loud, not important; degrades by session 30 (Seldon)
