# ADR-056: Observability Bootstrapping

## Status
Proposed — 2026-04-20

## Context
`/logs/` exists with 29 files (not missing — prior review had a stale finding). But three observability gaps are real:

1. **No structured `surfer-gate-events.jsonl`.** Cherry-picking (Surfer returned N agents, orchestrator launched M < N) is undetectable from logs. Field report #68 documented the pattern without a machine-readable record.
2. **No `orchestration-metrics.jsonl`.** "Is the orchestration improving over time?" is unanswerable — `agent-activity.jsonl` is truncated at session start, destroying trend signal.
3. **Decision traceability is freeform.** `decisions.md` has no `agent:` or `command_context:` mandatory fields, so post-mortems can't trace a decision to its source.

## Decision

Add two append-only JSONL log files with defined schemas.

### `/logs/surfer-gate-events.jsonl`
```json
{"ts":"...","session_id":"...","command":"/engage","event":"GATE_LAUNCHED|ROSTER_RECEIVED|ROSTER_DEPLOYED|GATE_SKIPPED|DEPLOY_PARTIAL","roster_returned":["..."],"roster_deployed":["..."],"violation":false}
```

The delta `roster_returned MINUS roster_deployed` is the cherry-pick signal. PreToolUse hook (ADR-051) writes these events.

### `/logs/orchestration-metrics.jsonl`
```json
{"command":"/gauntlet","ts":"...","roster_count":18,"dispatched":18,"cherry_pick_delta":0,"findings":{"critical":2,"high":7},"duration_ms":142000,"protocol_violations":[]}
```

One entry per command completion. Rising `cherry_pick_delta` or `protocol_violations` → leading indicator of orchestration degradation.

### `agent-activity.jsonl` — stop truncating at session start
Replace truncation with `{"event":"session-start",...}` separator entries. Danger Room ticker filters to latest separator; history remains queryable.

### `decisions.md` — add mandatory fields
`agent:` (who decided) and `command_context:` (which command run / which round). Timestamp already present.

## Consequences
**Positive:** cherry-pick detection becomes automatic; quality trends become measurable.
**Negative:** append-only files grow unbounded — add rotation policy (10MB → archive).

## Alternatives Considered
- Structured logs in method-doc prose — rejected, unqueryable.
- Database-backed event store — over-engineered for solo-maintainer tooling.

## Related ADRs
ADR-051 (hook writes the events).

## Rollout
v23.9.0.
