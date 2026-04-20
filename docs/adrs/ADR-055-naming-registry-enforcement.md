# ADR-055: Naming Registry Enforcement

## Status
Proposed — 2026-04-20

## Context
Two agent-registry issues surfaced during the v23.8.12 review:
1. **Prefix-match collision risk.** `wanda-state.md` (name: `Wanda`) and `wanda-seldon-validation.md` (name: `Wanda Seldon`) both begin with `Wanda`. If dispatch ever matches by prefix, the resolution is ambiguous. Fern confirmed the current `name:` field resolution uses exact-string matching, so the collision is latent — but the docs claim "no duplicates."
2. **Unvalidated `subagent_type:` references.** Every command file references sub-agents by `subagent_type: <name>`, but no check ensures the string resolves to exactly one `.claude/agents/*.md` file's `name:` field. Typos fail silently at dispatch time.

## Decision

1. **Keep exact-string resolution** (current behavior) — no prefix fallback.
2. **Add a pre-publish validator script** (`scripts/validate-agent-refs.sh`, specified by Hober Mallow) that:
   - Scans all `.claude/commands/*.md` for `subagent_type:` strings.
   - Extracts all `.claude/agents/*.md` `name:` field values.
   - Fails if any `subagent_type:` has zero or multiple matches.
3. **Run the validator in two places:** pre-commit hook (`.husky/pre-commit`) and Bombadil's `/void` sync.
4. **Rename `Wanda Seldon` → `WandaSeldon`** (no space) in `wanda-seldon-validation.md` to eliminate the Wanda-prefix ambiguity permanently. Update command references.

## Consequences
**Positive:** silent dispatch failures become CI errors. Name collisions become impossible.
**Negative:** one-time rename of `Wanda Seldon` requires grep-and-update across command files.

## Alternatives Considered
- Runtime validation only — too late, the command already failed.
- Accept prefix ambiguity as "future problem" — rejected, Naming Registry already claims no duplicates.

## Related ADRs
ADR-044 (subagent materialization), ADR-049 (agent heraldings — added another required field to validate).

## Rollout
v23.9.0.
