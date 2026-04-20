# ADR-054: Agent Model Tier Rebalance

## Status
In progress — 2026-04-20 (partial implementation in v23.8.13: Surfer → Haiku)

## Context
Agent model distribution before audit: ~78% Sonnet (206 agents), ~14% Haiku (38 agents), ~8% `inherit` (20 agents, leads). The Silver Surfer — highest-frequency agent in the fleet, fires before every gated command — was on Sonnet for what is essentially a classification and pattern-match task against agent YAML frontmatter.

Per Ducem Barr's token-economics audit: the Surfer is the single largest cost lever because it runs on every gated command, and it doesn't synthesize — it selects. Haiku 4.5 handles that class of task without quality regression.

## Decision

**Silver Surfer → Haiku 4.5** (shipped v23.8.13).

Additional rebalance targets (v23.9.0):
- `oracle-static-analysis` → Haiku (pattern scanning with fixed severity tags)
- `wong-documentation` → Haiku (presence checks)
- `black-canary-monitoring` → Haiku (threshold comparison)
- `bilbo-microcopy` → Haiku (short-string auditing)

**No Opus promotions** without documented quality failures on Sonnet. Leads use `model: inherit` which resolves to the orchestrator's model (Opus 4.7 when the orchestrator is Opus).

**Legitimate `inherit` semantics confirmed** (per Fern's compliance scan): Claude Code honors `inherit` by propagating the parent context's model. Twenty lead agents correctly use it.

## Consequences
**Positive:** ~5× cost reduction on Silver Surfer invocations. Largest single-command saving in the fleet.
**Negative:** Haiku's output style differs slightly from Sonnet — validate on next gauntlet that roster selection quality is preserved.
**Neutral:** fleet still heavily Sonnet (correct for specialists doing real reasoning).

## Alternatives Considered
- Uniform Sonnet (current) — wastes capability where Haiku suffices.
- Opus for Surfer (over-spec) — no evidence the selection task needs it.

## Related ADRs
ADR-044 (subagent materialization).

## Rollout
- v23.8.13: Surfer → Haiku.
- v23.9.0: Oracle, Wong, Black Canary, Bilbo → Haiku after cost/quality measurement on current Surfer change.
