#!/usr/bin/env bash
# check.sh — Silver Surfer Gate production enforcement (ADR-051)
#
# DO NOT WIRE INTO settings.json UNTIL Phase 5a (validate.sh) confirms the
# Claude Code runtime honors PreToolUse hooks and $CLAUDE_SESSION_ID is injected.
#
# Exit codes:
#   0 = allow the tool call
#   2 = block the tool call with a message on stderr
#   1 = reserved for infrastructure errors (we fail OPEN → exit 0)

set -uo pipefail  # -e intentionally omitted; we must never hard-crash

SESSION_DIR="/tmp/voidforge-session-${CLAUDE_SESSION_ID:-unknown}"
ROSTER_FILE="$SESSION_DIR/surfer-roster.json"
BYPASS_FILE="$SESSION_DIR/surfer-bypass.flag"
LOG_FILE="$SESSION_DIR/gate.log"

mkdir -p "$SESSION_DIR" 2>/dev/null || true

_log()       { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >> "$LOG_FILE" 2>/dev/null || true; }
_allow()     { _log "ALLOW: $*"; exit 0; }
_block()     { echo "[Silver Surfer Gate] $*" >&2; _log "BLOCK: $*"; exit 2; }
_fail_open() { _log "INFRA-ERROR (fail open): $*"; exit 0; }

# ── Read tool input from stdin ────────────────────────────────────
TOOL_INPUT=""
if ! [ -t 0 ]; then
    TOOL_INPUT="$(cat 2>/dev/null || true)"
fi

# ── Extract the agent name (if this is an Agent tool call) ───────
AGENT_NAME=""
if command -v python3 >/dev/null 2>&1 && [ -n "$TOOL_INPUT" ]; then
    AGENT_NAME="$(python3 -c "
import sys, json
try:
    d = json.loads(sys.stdin.read())
    inp = d.get('tool_input', d)
    # subagent_type is the documented parameter for sub-agent dispatch
    print(inp.get('subagent_type', inp.get('agent', inp.get('name', ''))))
except Exception:
    pass
" <<< "$TOOL_INPUT" 2>/dev/null || echo '')"
fi

# If we can't parse the JSON at all, fail open rather than block everything.
if [ -z "${CLAUDE_SESSION_ID:-}" ]; then
    _fail_open "CLAUDE_SESSION_ID not set in hook env"
fi

# ── Silver Surfer self-launch always allowed ─────────────────────
shopt -s nocasematch 2>/dev/null || true
case "$AGENT_NAME" in
    *silver*surfer*|*surfer*herald*|*herald*)
        _allow "Silver Surfer self-launch: $AGENT_NAME"
        ;;
esac

# ── Bypass flag (user passed --light or --solo) ──────────────────
if [ -f "$BYPASS_FILE" ]; then
    REASON="$(cat "$BYPASS_FILE" 2>/dev/null || echo 'unknown')"
    _allow "Bypass active: $REASON"
fi

# ── Roster present and fresh (< 10 min) ──────────────────────────
if [ -f "$ROSTER_FILE" ]; then
    ROSTER_AGE=$(( $(date +%s) - $(stat -f %m "$ROSTER_FILE" 2>/dev/null || stat -c %Y "$ROSTER_FILE" 2>/dev/null || echo 0) ))
    if [ "$ROSTER_AGE" -lt 600 ]; then
        _allow "Roster present (${ROSTER_AGE}s old): agent=$AGENT_NAME"
    else
        _log "Roster stale (${ROSTER_AGE}s) — treating as absent"
        rm -f "$ROSTER_FILE"
    fi
fi

# ── No roster, no bypass, not the Surfer ──────────────────────────
_block "ADR-048/ADR-051 VIOLATION — Silver Surfer has not returned a roster for this command. Launch the Silver Surfer sub-agent first, then deploy the roster. Use --light or --solo to bypass."
