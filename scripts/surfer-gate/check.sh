#!/usr/bin/env bash
# check.sh — Silver Surfer Gate production enforcement (ADR-051, Phase 5b)
#
# Intercepts PreToolUse for the Agent tool. Blocks sub-agent launches until
# the Silver Surfer has returned a roster in the current session, unless a
# bypass flag is present (user passed --light or --solo).
#
# Contract with the orchestrator (documented in CLAUDE.md Silver Surfer Gate):
#   - After the Silver Surfer returns its roster, run:
#       bash scripts/surfer-gate/record-roster.sh
#   - When the user's command includes --light or --solo, run:
#       bash scripts/surfer-gate/bypass.sh --light     # (or --solo)
#
# Both helpers locate the current session_id via a pointer file that THIS hook
# writes on every invocation. The pointer is keyed by the repo directory
# (hashed from stdin's cwd field) to isolate parallel sessions on different
# repos and to prevent cross-project leakage.
#
# Exit codes:
#   0 = allow the tool call
#   2 = block with a message on stderr
#
# Fail-open philosophy: infrastructure errors (can't parse JSON, unwritable
# tmp, missing python3) exit 0. A broken hook is worse than a skipped gate.

set -uo pipefail  # -e intentionally omitted — we must never hard-crash

# -------- Read stdin JSON --------
TOOL_INPUT=""
if ! [ -t 0 ]; then
    TOOL_INPUT="$(cat 2>/dev/null || true)"
fi

# -------- Parse required fields --------
# Uses python3; silent fallback to empty string on any failure.
parse_json() {
    local path="$1"
    python3 -c "
import sys, json
try:
    d = json.loads(sys.stdin.read())
    for k in '$path'.split('.'):
        d = d.get(k, '') if isinstance(d, dict) else ''
    print(d if isinstance(d, str) else '')
except Exception:
    pass
" <<< "$TOOL_INPUT" 2>/dev/null || echo ""
}

SESSION_ID="$(parse_json session_id)"
TOOL_NAME="$(parse_json tool_name)"
SUBAGENT_TYPE="$(parse_json tool_input.subagent_type)"
CWD="$(parse_json cwd)"

# -------- Fail open if we can't identify the session --------
if [ -z "$SESSION_ID" ]; then
    exit 0
fi

# -------- Write session pointer (repo-scoped) --------
# Every hook fire updates the pointer so orchestrator helpers can discover
# the current session_id without the orchestrator knowing it directly.
# Key on hash(cwd) to isolate repos from each other.
if [ -n "$CWD" ] && command -v shasum >/dev/null 2>&1; then
    REPO_HASH="$(printf '%s' "$CWD" | shasum -a 256 2>/dev/null | cut -c1-12)"
    if [ -n "$REPO_HASH" ]; then
        POINTER_DIR="/tmp/voidforge-gate"
        POINTER_FILE="${POINTER_DIR}/pointer-${REPO_HASH}"
        mkdir -p "$POINTER_DIR" 2>/dev/null && \
            printf '%s\n' "$SESSION_ID" > "$POINTER_FILE" 2>/dev/null || true
    fi
fi

# -------- Only gate Agent tool calls --------
# Everything else (Read, Bash, Edit, Glob, Grep, Write, etc.) passes unconditionally.
if [ "$TOOL_NAME" != "Agent" ]; then
    exit 0
fi

# -------- Session state paths --------
SESSION_DIR="/tmp/voidforge-session-${SESSION_ID}"
ROSTER_FILE="$SESSION_DIR/surfer-roster.json"
BYPASS_FILE="$SESSION_DIR/surfer-bypass.flag"
LOG_FILE="$SESSION_DIR/gate.log"
ROSTER_TTL_SECONDS=600  # 10 minutes — long enough for any single command turn

mkdir -p "$SESSION_DIR" 2>/dev/null || exit 0  # unwritable tmp -> fail open

_log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >> "$LOG_FILE" 2>/dev/null || true; }

# Emit structured JSONL event (ADR-056) to both session-scoped and repo-persistent
# locations. Non-fatal: any emit failure is swallowed and the gate still works.
_emit_jsonl() {
    local event="$1"; local reason="$2"
    local ts; ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    # Escape quotes in subagent_type and reason for JSON safety.
    local safe_sub; safe_sub="$(printf '%s' "$SUBAGENT_TYPE" | sed 's/\\/\\\\/g; s/"/\\"/g')"
    local safe_reason; safe_reason="$(printf '%s' "$reason" | sed 's/\\/\\\\/g; s/"/\\"/g')"
    local line
    line="$(printf '{"ts":"%s","session_id":"%s","event":"%s","subagent_type":"%s","tool_name":"%s","reason":"%s"}' \
        "$ts" "$SESSION_ID" "$event" "$safe_sub" "$TOOL_NAME" "$safe_reason")"
    # Session-scoped (ephemeral, per-session debugging). Newline appended via format.
    printf '%s\n' "$line" >> "$SESSION_DIR/surfer-gate-events.jsonl" 2>/dev/null || true
    # Repo-persistent (survives sessions, for long-term cherry-pick trend analysis).
    if [ -n "${CWD:-}" ] && [ -d "$CWD/logs" ]; then
        printf '%s\n' "$line" >> "$CWD/logs/surfer-gate-events.jsonl" 2>/dev/null || true
    fi
}

_allow() { _log "ALLOW subagent=$SUBAGENT_TYPE: $*"; _emit_jsonl "ALLOW" "$*"; exit 0; }
_block() { echo "[Silver Surfer Gate] $*" >&2; _log "BLOCK subagent=$SUBAGENT_TYPE: $*"; _emit_jsonl "BLOCK" "$*"; exit 2; }

# -------- Rule 1: Silver Surfer self-launch always allowed --------
case "$(echo "$SUBAGENT_TYPE" | tr '[:upper:]' '[:lower:]')" in
    *"silver surfer"*|*"silver-surfer"*|*"surfer herald"*|*"surfer-herald"*)
        _allow "Silver Surfer self-launch"
        ;;
esac

# -------- Rule 2: Bypass flag present (--light or --solo) --------
if [ -f "$BYPASS_FILE" ]; then
    _allow "bypass active: $(cat "$BYPASS_FILE" 2>/dev/null || echo unknown)"
fi

# -------- Rule 3: Fresh roster present --------
if [ -f "$ROSTER_FILE" ]; then
    ROSTER_MTIME="$(stat -f %m "$ROSTER_FILE" 2>/dev/null || stat -c %Y "$ROSTER_FILE" 2>/dev/null || echo 0)"
    ROSTER_AGE=$(( $(date +%s) - ROSTER_MTIME ))
    if [ "$ROSTER_AGE" -lt "$ROSTER_TTL_SECONDS" ]; then
        _allow "roster present (age=${ROSTER_AGE}s)"
    else
        _log "roster stale (age=${ROSTER_AGE}s) — removing"
        rm -f "$ROSTER_FILE"
    fi
fi

# -------- Rule 4: No roster, no bypass, not the Surfer -> block --------
_block "ADR-048/ADR-051 violation — Silver Surfer has not returned a roster. Launch the Silver Surfer first, then run: bash scripts/surfer-gate/record-roster.sh. Use --light or --solo to bypass via: bash scripts/surfer-gate/bypass.sh --light"
