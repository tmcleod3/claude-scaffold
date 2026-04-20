# Silver Surfer Gate — Hook Enforcement

Implementation of ADR-051 (Structural Gate Enforcement via PreToolUse Hook).

## Files

- `validate.sh` — **Phase 5a: validation test.** No-op logger. Run this BEFORE trusting `check.sh`. Confirms Claude Code's runtime actually fires `PreToolUse` hooks and the `matcher` syntax works.
- `check.sh` — **Phase 5b: production gate.** Enforces the Silver Surfer Gate. Do not wire this into `settings.json` until Phase 5a has validated the runtime.
- `settings-snippet.json` — Copy-paste JSON to add into `.claude/settings.json` under `hooks.PreToolUse`. Provides both the validation and the production entries (comment one out as you progress).

## Phase 5a — Validation test procedure

1. In a clean Claude Code session (not the one developing this), open `.claude/settings.json`.
2. Add the **validation** entry from `settings-snippet.json` to `hooks.PreToolUse`. The matcher is `".*"` — fires on every tool call.
3. Run any command in that session (e.g., `/engage --light`).
4. After the session ends, inspect `/tmp/voidforge-hook-validate.log`.
   - **Success:** log has one line per tool call, showing `tool_name` and timestamp.
   - **Partial:** log exists but only shows some tools — matcher syntax may differ from expected. Investigate.
   - **Failure:** log is empty or missing — `PreToolUse` hooks are not being honored. Abort the ADR-051 plan; retreat to prose-only enforcement.
5. If successful, change the matcher from `".*"` to `"Agent"` and re-run. Confirm the log only records Agent tool calls.
6. If that also succeeds, Phase 5a is complete. Proceed to Phase 5b (wire `check.sh` as the production hook).

## Phase 5b — Production gate (AFTER Phase 5a validates)

Once Phase 5a confirms the runtime behavior, replace the validation entry with the production entry in `settings-snippet.json`. The production hook runs `check.sh` which:

- Allows the Silver Surfer's self-launch.
- Allows any Agent call after the orchestrator has written `/tmp/voidforge-session-${CLAUDE_SESSION_ID}/surfer-roster.json`.
- Allows any Agent call if `surfer-bypass.flag` exists (for `--light`, `--solo`).
- Blocks other Agent calls with an instructive error.
- Fails OPEN on infrastructure errors (missing python3, unwritable tmp, etc.) — never blocks agents due to its own bugs.

## Orchestrator-side work (CLAUDE.md addition required for Phase 5b)

For `check.sh` to work, the orchestrator (Claude Code itself) must write the sentinel file after the Surfer returns. A one-line addition in the CLAUDE.md Silver Surfer Gate section handles this:

> After the Silver Surfer sub-agent returns its roster, write the roster to `/tmp/voidforge-session-${CLAUDE_SESSION_ID}/surfer-roster.json` before launching any further Agent calls. If the user's command included `--light` or `--solo`, write the flag name to `/tmp/voidforge-session-${CLAUDE_SESSION_ID}/surfer-bypass.flag` instead.

This addition is deferred until Phase 5b.

## Environment requirements

- `$CLAUDE_SESSION_ID` — Claude Code must inject this env var into hook processes. Not officially documented; Janeway flagged this as a first-contact unknown. Phase 5a's validation log will reveal whether it's populated.
- `python3` — used for JSON parsing with fallback. `check.sh` fails open if missing.
- Writable `/tmp` — used for session state. `check.sh` fails open if unavailable.
