# ADR-059: Concurrency Model Reconciliation

## Status
Proposed — 2026-04-20

## Context
Two contradictory instructions:
- `CLAUDE.md` Silver Surfer Gate: *"If the Surfer returns 20 agents, your next action is 20 Agent tool calls (parallel where possible)."*
- `docs/methods/SUB_AGENTS.md:332`: *"Max 3 concurrent agents (hard cap)."*

The cap was written for older context windows where 15+ parallel findings tables thrashed context. Opus 4.7 with 1M context does not have this constraint — field report #270 observed 15+ parallel agents running at 15-25% context usage.

## Decision

**CLAUDE.md is authoritative. Update SUB_AGENTS.md lines 330-336 (per Seldon's rewrite):**

```
### Concurrency Rules
- Fan out the full roster in parallel for read-only analysis. Opus 4.7's 1M context handles 20+ concurrent findings tables without thrashing.
- No two concurrent agents may write to the same file — partition by domain, or serialize writes.
- Fix/build agents: batch into waves only when writes overlap. Independent files = parallel.
- Wait for ALL parallel agents before synthesizing (field report #300).
```

**The genuine caps:**
1. **Write collisions** — two agents writing to the same file must serialize.
2. **Sequential dependencies** — when agent B needs agent A's output, that's logic, not a concurrency rule.

## Consequences
**Positive:** contradiction eliminated. Predictable throughput with real cap documented.
**Negative:** existing references to "max 3 concurrent" in other docs may need updating (Mustang's cleanup sweep handles this in v23.9.0).

## Alternatives Considered
- Raise the cap to a higher fixed number (5, 10) — still arbitrary.
- Keep the cap for legacy compat — rejected, contradicts the documented enforcement.

## Related ADRs
ADR-048 (gate), ADR-043 (max by default).

## Rollout
v23.9.0 with SUB_AGENTS.md edit.
