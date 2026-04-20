# ADR-052: Silver Surfer Gate Canonicalization

## Status
Proposed — 2026-04-20

## Context
The Silver Surfer Gate prose block is duplicated in 15 files: `CLAUDE.md`, `packages/methodology/CLAUDE.md`, and 14 gated command files under `.claude/commands/`. Every hardening cycle (twelve across v23.8.x) required edits to all 15. Drift is inevitable; v23.8.3 field report confirmed the command-file copies were out of sync with the root.

## Decision
**Single source of truth: `CLAUDE.md` Silver Surfer Gate section.** Command files replace their 14-line gate block with a one-line reference:

```markdown
> **Silver Surfer Gate (ADR-048, ADR-051) — see CLAUDE.md for protocol.** Launch the Silver Surfer before any other agents. `--light` skips, `--solo` runs lead only.
```

The Agent-tool launch parameters (which vary per command) stay in each command file. The protocol prose lives once.

## Consequences
**Positive:** one edit for any future gate refinement; drift becomes structurally impossible.
**Negative:** command file readers must follow a link to see full gate rationale.
**Neutral:** ADR-051 hook enforcement makes the prose advisory anyway.

## Alternatives Considered
- Build-time template expansion (hides intent from source readers — rejected).
- Symlinks to a shared fragment (fragile, poor git diff ergonomics — rejected).

## Related ADRs
ADR-048, ADR-051.

## Rollout
v23.9.0 alongside hook script.
