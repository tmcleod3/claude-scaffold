# ADR-060: Surfer Gate State Location

## Status
Accepted — 2026-04-20 (v23.8.18 — Assemble Hardening Phase 1, closes SEC-002)

## Context

ADR-051's PreToolUse hook stored gate state in `/tmp`:
- `/tmp/voidforge-gate/pointer-<repo_hash>` — session_id pointer (repo-scoped discovery)
- `/tmp/voidforge-session-<session_id>/` — roster, bypass flag, gate.log, JSONL events

On multi-tenant Unix hosts (shared dev boxes, CI runners, devcontainers), `/tmp` is world-writable with the sticky bit. A co-tenant process can enumerate active session UUIDs (`ls /tmp`) and pre-create a `surfer-roster.json` file inside a session directory before `check.sh` does. The hook reads that file, sees a fresh roster, allows Agent launches that should have been blocked. The fail-open philosophy (unwritable state → allow) amplifies this: any infrastructure anomaly effectively disables the gate.

SEC-002 (Kenobi, Gauntlet 40b) quantified the risk as MEDIUM — negligible on single-user macOS, meaningful on shared hosts.

## Decision

Relocate all gate state to per-user directories via a fallback chain:

1. **Preferred:** `$XDG_RUNTIME_DIR/voidforge-gate/` — Linux tmpfs with `0700` enforced by systemd. Per-user, cleared on logout.
2. **Fallback:** `$HOME/.voidforge/gate/` — macOS + non-systemd Linux + CI. Inherits `$HOME` permissions, unifies with the existing `.voidforge/` vault convention.
3. **No resolve:** helpers no-op; hook fails open (unchanged from ADR-051).

New layout:

```
$SURFER_GATE_DIR/                          # resolved per fallback chain
  pointers/pointer-<repo_hash>             # session pointer for repo discovery
  sessions/<session_id>/
    surfer-roster.json                     # roster sentinel (TTL 600s)
    surfer-bypass.flag                     # --light / --solo bypass
    gate.log                               # plain text audit trail
    surfer-gate-events.jsonl               # structured JSONL events (session-scoped)
```

Directories created with `mkdir -p` + explicit `chmod 0700`. Files created + `chmod 0600`. Defense against lax user umask.

Implementation: all three helpers (`check.sh`, `record-roster.sh`, `bypass.sh`) source a shared `scripts/surfer-gate/_paths.sh` which exports `SURFER_GATE_DIR`, `surfer_gate_session_dir()`, `surfer_gate_pointer_file()`, `surfer_gate_reap_stale_sessions()`.

Repo-persistent JSONL at `$CLAUDE_PROJECT_DIR/logs/surfer-gate-events.jsonl` remains unchanged — it's project-scoped, not per-user.

## Consequences

### Positive
- **SEC-002 closed:** `/tmp` enumeration no longer leaks session UUIDs. Pre-seed attacks require the same UID as the running session.
- **Unified state convention:** `$HOME/.voidforge/` already hosts the vault; gate state joins it under `gate/`. One directory to back up, reap, or audit.
- **Persistent across `/tmp` sweeps:** macOS clears `/tmp` on boot; `$HOME/.voidforge/gate/` survives. Stale sessions reaped by `surfer_gate_reap_stale_sessions()` (called opportunistically by `check.sh` on each fire — mtime > 1h).
- **Explicit permissions:** `0700` + `0600` defenses against lax umask.

### Negative
- **$HOME persistence requires reaping:** `$HOME/.voidforge/gate/sessions/` grows unbounded without the reaper. Mitigated by `surfer_gate_reap_stale_sessions()` on every hook fire.
- **Hook depends on `$HOME` being writable.** CI sandboxes without `$HOME` or `$XDG_RUNTIME_DIR` → fail open. Documented.
- **Backward-incompat with v23.8.17 state:** existing `/tmp/voidforge-*/` directories are orphaned on upgrade. Harmless — TTL expires and `/tmp` sweeps remove them. No migration script needed.

### Neutral
- Adds `_paths.sh` as a new shared helper file — one indirection but DRY.

## Alternatives Considered

- **Status quo `/tmp`** — rejected. SEC-002 unfixed.
- **`$HOME/.cache/voidforge-gate/`** — viable (XDG_CACHE_HOME convention) but fragments VoidForge state across two `$HOME` subdirs.
- **Symlink `/tmp/...` → `$HOME/...`** — rejected. Symlink races reintroduce the pre-seed vector.
- **Encrypt roster + bypass files** — rejected. Scope creep; the gate is a discipline mechanism, not a confidentiality boundary.

## Backward Compatibility

- Old `/tmp/voidforge-*` paths are orphaned on upgrade. Harmless; TTL + `/tmp` sweep cleanup.
- No user action required on upgrade.
- Upgrading during a live session requires re-launching the Silver Surfer (old pointer won't be found in new location). `record-roster.sh` also provides a migration path: call it directly to re-record a roster in the new location.

## Related ADRs
- **ADR-051** — original hook enforcement (state-location superseded by this ADR; everything else unchanged)
- **ADR-056** — observability bootstrapping (JSONL events now at `$SURFER_GATE_DIR/sessions/<id>/surfer-gate-events.jsonl`)

## Implementation Scope
- `scripts/surfer-gate/_paths.sh` — new shared helper (ADR-060)
- `scripts/surfer-gate/check.sh` — refactored to source _paths.sh
- `scripts/surfer-gate/record-roster.sh` — refactored
- `scripts/surfer-gate/bypass.sh` — refactored
- `scripts/surfer-gate/test.sh` — committed to repo (closes QA-003, previously at `/tmp/test-check-sh.sh`). 20 tests including QA-001/2/3 and SEC-003 coverage.
- `scripts/surfer-gate/README.md` — updated
- CLAUDE.md Silver Surfer Gate section — updated to reference new location
- packages/methodology/CLAUDE.md — mirrored

## Verification
- 20/20 offline tests pass (was 14/14 pre-ADR-060)
- Live hook verified in Assemble 41 session (this session) — pointer lands at `$HOME/.voidforge/gate/pointers/pointer-<hash>`, session state at `$HOME/.voidforge/gate/sessions/<session_id>/`
