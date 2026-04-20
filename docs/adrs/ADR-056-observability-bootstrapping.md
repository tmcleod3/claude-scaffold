# ADR-056: Observability Bootstrapping

## Status
Accepted — 2026-04-20 (shipped v23.8.15 Mission 9a; schema reconciled again in v23.8.19 after Gauntlet 41 Round 1 caught residual drift)

## Context
`/logs/` exists and is writable. Three observability gaps were real before v23.8.15:

1. **No structured `surfer-gate-events.jsonl`.** Cherry-picking was undetectable from logs. Field report #68 documented the pattern without a machine-readable record.
2. **No `orchestration-metrics.jsonl`.** "Is the orchestration improving over time?" was unanswerable.
3. **Decision traceability is freeform.** `decisions.md` has no `agent:` or `command_context:` mandatory fields.

## Decision

Add structured JSONL event logging. Shipped and stabilized incrementally.

### `/logs/surfer-gate-events.jsonl` — SHIPPED (v23.8.15, schema stable as of v23.8.19)

Three event types emitted by the gate pipeline:

**`ALLOW` / `BLOCK`** (written by `scripts/surfer-gate/check.sh`):

```json
{"ts":"2026-04-20T20:00:00Z","session_id":"<uuid>","event":"ALLOW","subagent_type":"<name>","tool_name":"Agent","reason":"<human-readable>"}
{"ts":"2026-04-20T20:00:01Z","session_id":"<uuid>","event":"BLOCK","subagent_type":"<name>","tool_name":"Agent","reason":"<human-readable>"}
```

**`ROSTER_RECEIVED`** (written by `scripts/surfer-gate/record-roster.sh`):

The roster field has a **discriminated schema** using `roster_parsed` as the discriminator. This avoids the v23.8.15–v23.8.18 ghost-field drift where ADR docs said `roster_json` but code emitted `roster`/`roster_text`.

Shape A — jq available AND input is valid JSON:

```json
{"ts":"...","session_id":"...","event":"ROSTER_RECEIVED","roster_parsed":true,"roster":{...},"roster_text":"{...}"}
```

Shape B — jq available but input is NOT valid JSON (e.g., freeform Surfer prose):

```json
{"ts":"...","session_id":"...","event":"ROSTER_RECEIVED","roster_parsed":false,"roster_text":"some text"}
```

Shape C — jq unavailable (fallback, manual escaping):

```json
{"ts":"...","session_id":"...","event":"ROSTER_RECEIVED","roster_parsed":false,"roster_text":"..."}
```

**Consumer contract:**
- `roster_text` is ALWAYS present and contains the verbatim roster content (as a JSON string; decode with `jq -r '.roster_text'`).
- `roster` is present ONLY when `roster_parsed:true`. It's the parsed JSON structure.
- Cherry-pick detection counts events; it doesn't need to read `roster`/`roster_text` at all.

**Paths:**
- Session-scoped: `$SURFER_GATE_DIR/sessions/<session_id>/surfer-gate-events.jsonl` (per ADR-060)
- Repo-persistent: `$CLAUDE_PROJECT_DIR/logs/surfer-gate-events.jsonl`

**Cherry-pick detection query:**

```bash
jq -s '
  group_by(.session_id) | map({
    session: .[0].session_id,
    rostered: (map(select(.event == "ROSTER_RECEIVED")) | length),
    allowed:  (map(select(.event == "ALLOW" and .subagent_type != "Silver Surfer"))
               | [.[].subagent_type] | unique | length)
  })
' logs/surfer-gate-events.jsonl
```

If `rostered > 0` and `allowed < expected_roster_size`, that's a cherry-pick signal.

**Schema change history:**
- v23.8.15 initial emit (roster_json ghost field in ADR, never in code)
- v23.8.16 first reconcile attempt — still had string/object divergence
- v23.8.18 hardening pass — jq emission introduced but two shapes weren't discriminable
- **v23.8.19 stabilized** — `roster_parsed` boolean discriminator added; `roster_text` always present for schema parity across jq and fallback paths (BE-001 fix, SCHEMA-002 fix).

### `/logs/orchestration-metrics.jsonl` — Mission 9b (deferred)

Per-command-completion metrics. Requires an orchestrator-side contract (when is a command "done"?). Not a hook event. Deferred until that contract is designed.

Proposed schema (when built):

```json
{"command":"/gauntlet","ts":"...","roster_count":18,"dispatched":18,"cherry_pick_delta":0,"findings":{"critical":2,"high":7},"duration_ms":142000,"protocol_violations":[]}
```

### `agent-activity.jsonl` — session-start separator (Mission 9c, deferred)

Replace truncation with `{"event":"session-start",...}` separator entries. Blocks on Danger Room ticker active development.

### `decisions.md` — mandatory fields (deferred)

Add `agent:` (who decided) and `command_context:` (which command / which round). Documentation hygiene, separate commit.

## Consequences
**Positive:** cherry-pick detection is automatic for surfer-gate events as of v23.8.15. Schema stable as of v23.8.19.
**Negative:** append-only file in `logs/` grows unbounded. Rotation policy deferred; low priority at current event rate.

## Alternatives Considered
- TypeScript `log()` helper in methodology package — rejected (YAGNI; no TypeScript caller).
- Single nested `roster` field with null fallback — rejected, ambiguous between "no roster" and "roster is null".
- Structured logs in method-doc prose — rejected, unqueryable.

## Related ADRs
- **ADR-051** — Phase 5b hook is the primary JSONL writer.
- **ADR-060** — state location (JSONL lives under `$SURFER_GATE_DIR/sessions/`).

## Rollout
- **v23.8.15:** Mission 9a shipped — `surfer-gate-events.jsonl` live.
- **v23.8.16 / v23.8.18:** schema reconciliation attempts.
- **v23.8.19:** schema stabilized with `roster_parsed` discriminator; `roster_text` always present for jq/fallback parity. Cherry-pick `jq` query documented.
- **v23.9.x (future):** Mission 9b orchestration metrics.
- **v23.9.x (future):** Mission 9c agent-activity.jsonl separator.
