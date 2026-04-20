# ADR-051: Structural Gate Enforcement (PreToolUse Hook)

## Status
Proposed — 2026-04-20

## Context

The Silver Surfer Gate (ADR-048) has been enforced entirely by prose in `CLAUDE.md` and repeated in every gated command file. Between v23.6.0 and v23.8.12 the gate has been hardened **twelve times** — each iteration adding more emphatic language in response to a specific skip incident:

- v23.6.0 — gate introduced.
- v23.7.1 — "launch as real Agent sub-process, not CLI shell-out."
- v23.7.2 — "explicit Agent tool invocation."
- v23.8.1 — anti-skip hardening in command files.
- v23.8.2 — gate lifted to CLAUDE.md root context after field report #300.
- v23.8.3 — "no cherry-picking from the roster."
- v23.8.4 — "wait for Surfer before starting work."
- v23.8.7 — absolutist language ("NO valid reason").
- v23.8.8 — gate on line 3 of every command.
- v23.8.9 — "Deploy means Agent tool calls, not thinking about agents."
- v23.8.10 — manual override flag introduced as `--ss`.
- v23.8.11 — flag renamed to `--surfer` because `--ss` was being parsed as "skip Surfer."

The failure cadence (approximately one incident per 2 days of active use) is structural evidence that **prompt-only enforcement has a ceiling it cannot break through.** Each iteration closes one rationalization; the model generates a new one.

The `--surfer` flag's own documentation states: *"This flag exists because the automatic gate has failed repeatedly."*

Prose is advisory. It cannot reliably enforce itself against a model that reasons from principle.

## Decision

**Move enforcement from prose instruction to a Claude Code `PreToolUse` hook.**

### Hook mechanism

Add to `.claude/settings.json`:

```json
"PreToolUse": [
  {
    "matcher": "Agent",
    "hooks": [
      { "type": "command", "command": "bash scripts/surfer-gate/check.sh" }
    ]
  }
]
```

The hook fires before any `Agent` tool call and checks session state for evidence that the Silver Surfer has returned a roster this turn.

### Session state

```
/tmp/voidforge-session-${CLAUDE_SESSION_ID}/
  surfer-roster.json   # written by orchestrator after Surfer returns
  surfer-bypass.flag   # written by orchestrator when --light or --solo is in effect
  gate.log             # append-only hook audit trail
```

The **orchestrator** writes the sentinel — not the Surfer sub-agent. This avoids the race condition where a sub-agent's `Bash` write may not complete before the parent's next `PreToolUse` fires (per Janeway's first-contact warning).

### Hook script (`scripts/surfer-gate/check.sh`)

The full script is specified in the implementation plan (Mission 3 of the remediation campaign). Key properties:

- **Fail OPEN on infrastructure errors** — missing python3, unwritable tmp, unset session id → exit 0 (allow). A hook that crashes all Agent calls is worse than a skipped gate.
- **Fail CLOSED on confirmed violation** — state dir accessible, roster file absent, bypass file absent, launching agent is not the Surfer → exit 2 with an instructive error on stderr.
- **Silver Surfer self-launch always passes** — the hook recognizes the Surfer's own Agent call and allows it unconditionally.
- **Bypass flags honored** — if `surfer-bypass.flag` exists, any Agent call passes (user used `--light` or `--solo`).
- **10-minute roster TTL** — stale rosters are deleted and treated as absent (prevents cross-command accidental bypass within a long session).

### Validation requirement before production

**Before committing the hook, run Janeway's first-contact test (NAV-004):** deploy a `PreToolUse` hook with `matcher: ".*"` that logs every invocation, confirm it fires, then narrow the matcher to `"Agent"`. This validates that Claude Code's runtime honors the matcher syntax before we trust it.

## Consequences

### Positive
- Closes the 12-commit hardening loop. Prose enforcement's inherent ceiling is bypassed.
- Every skip attempt is now a hook-level `BLOCK` with an audit log entry — violations become visible and countable.
- The CLAUDE.md gate prose can shrink from ~340 tokens to ~180 tokens (Gaal Dornick's rewrite applied).
- Scales to any future gated command by editing one list, not 14 command files.

### Negative
- **Environment dependency.** Hooks are a Claude Code CLI feature. Outside the CLI (Claude.ai web, API-only, IDE extensions without hook support), the hook does not fire and the prose is the only enforcement. Treebeard's long-term warning: do not assume hook support is universal.
- **Session-id drift risk.** `$CLAUDE_SESSION_ID` environment variable availability in hook processes is documented but not contractually guaranteed. Validate on each Claude Code upgrade.
- **Hook maintenance.** One more script to keep working across OS/shell combinations. Mitigation: script is ~60 lines of pure POSIX bash with defensive wrappers; no runtime dependencies beyond `python3` (used only for JSON parsing, with fallback).
- **New failure mode: hook crash.** Mitigated by fail-open-on-infra-error. Counter-risk: hook that always fails open is a no-op. Counter-mitigation: `gate.log` audit trail lets us detect no-op degradation.

### Neutral
- Prose in CLAUDE.md stays as the backstop (per Harah's protocol analysis). One day it may be retired; not this release.

## Alternatives Considered

### Rejected: continue hardening the prose
Twelve iterations have proven insufficient. The `--ss` → `--surfer` rename is the smoking gun — the flag name itself was being misread as permission to skip. No amount of prose can beat a control-flow decision the model owns.

### Rejected: transcript sentinel (orchestrator grep of conversation)
Cleaner than a filesystem sentinel for orchestrator self-enforcement, but invisible to `PreToolUse` hooks. The hook cannot read conversation transcripts. Use as a complement, not a replacement.

### Rejected: mandatory always-on blocking hook (no fail-open)
A blocking hook that crashes halts all Agent tool calls for the session. Unrecoverable without killing the process. Unacceptable for a methodology tool.

### Rejected: native `/agents` integration
Opus 4.7's native `/agents` management does not expose a gate-insertion API. The surface we can control is hooks; we use it.

## Related ADRs

- **ADR-048** — Silver Surfer Herald (defines the gate semantically; this ADR replaces the enforcement mechanism).
- **ADR-050** — Native Coexistence (the renamed `/engage` and `/sentinel` inherit gate enforcement).
- **ADR-056** (new) — Observability Bootstrapping (defines the `gate.log` JSONL schema).

## Rollout

- **v23.9.0 (minor):** ship the hook script as optional. Not yet wired into `settings.json`. Users can opt in. Prose remains primary.
- **v24.0.0 (major):** hook becomes opt-out, not opt-in. `.claude/settings.json` ships with the hook registered by default. Prose is still present as backstop.
- **v25.0.0 (future):** evaluate whether prose gate can be retired — requires zero skip incidents across two full minor versions with the hook active.
