#!/usr/bin/env bash
# check.sh — Silver Surfer Gate production enforcement (ADR-051 Phase 5b, ADR-060 state relocation)
#
# Intercepts PreToolUse for the Agent tool. Blocks sub-agent launches until
# the Silver Surfer has returned a roster in the current session, unless a
# bypass flag is present (user passed --light or --solo).
#
# State layout (ADR-060, post-v23.8.18):
#   $SURFER_GATE_DIR/                 per-user (XDG_RUNTIME_DIR or ~/.voidforge/gate)
#     pointers/pointer-<repo_hash>    session_id pointer (repo-scoped discovery)
#     sessions/<session_id>/
#       surfer-roster.json            presence = "roster received"
#       surfer-bypass.flag            presence = "--light/--solo active"
#       gate.log                      plain text audit trail
#       surfer-gate-events.jsonl      structured JSONL audit (session-scoped)
#
# Exit codes:
#   0 = allow the tool call
#   2 = block with a message on stderr
# Fail-open philosophy: infrastructure errors exit 0.

set -uo pipefail  # -e intentionally omitted — we must never hard-crash

# Source shared state-path helpers (ADR-060).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_paths.sh
. "$SCRIPT_DIR/_paths.sh" 2>/dev/null || {
    # _paths.sh missing — fail open.
    exit 0
}

# -------- Read stdin JSON --------
TOOL_INPUT=""
if ! [ -t 0 ]; then
    TOOL_INPUT="$(cat 2>/dev/null || true)"
fi

# -------- Parse required fields --------
# SEC-001 fix: pass path via argv, not source interpolation. Prevents Python
# injection even if a future caller uses a dynamic path argument.
parse_json() {
    local path="$1"
    python3 -c '
import sys, json
try:
    d = json.loads(sys.stdin.read())
    for k in sys.argv[1].split("."):
        d = d.get(k, "") if isinstance(d, dict) else ""
    print(d if isinstance(d, str) else "")
except Exception:
    pass
' "$path" <<< "$TOOL_INPUT" 2>/dev/null || echo ""
}

SESSION_ID="$(parse_json session_id)"
TOOL_NAME="$(parse_json tool_name)"
SUBAGENT_TYPE="$(parse_json tool_input.subagent_type)"
CWD="$(parse_json cwd)"

# Walk up from CWD to find the repo root (dir containing scripts/surfer-gate/).
# Emitted into the BLOCK message so orchestrators in subdirs copy-paste correctly.
_find_repo_root() {
    local dir="$1"
    while [ -n "$dir" ] && [ "$dir" != "/" ]; do
        if [ -d "$dir/scripts/surfer-gate" ]; then
            printf '%s' "$dir"
            return 0
        fi
        dir="$(dirname "$dir")"
    done
    printf '%s' "${1:-.}"  # fallback to original CWD
}
REPO_ROOT="$(_find_repo_root "$CWD" 2>/dev/null)"

# -------- Fail open if we can't identify the session --------
if [ -z "$SESSION_ID" ]; then
    exit 0
fi

# -------- Fail open if state dir is unresolvable --------
if [ -z "$SURFER_GATE_DIR" ]; then
    exit 0
fi

# Opportunistic reap of stale session dirs (mtime > 1h).
surfer_gate_reap_stale_sessions

# -------- Write session pointer (repo-scoped) --------
if [ -n "$CWD" ]; then
    POINTER_FILE="$(surfer_gate_pointer_file "$CWD")"
    if [ -n "$POINTER_FILE" ]; then
        # Fail-open on write failure. Helpers no-op without the pointer.
        printf '%s\n' "$SESSION_ID" > "$POINTER_FILE" 2>/dev/null || true
        chmod 0600 "$POINTER_FILE" 2>/dev/null || true
    fi
fi

# -------- Only gate Agent tool calls --------
if [ "$TOOL_NAME" != "Agent" ]; then
    exit 0
fi

# -------- Session state paths --------
SESSION_DIR="$(surfer_gate_session_dir "$SESSION_ID")"
if [ -z "$SESSION_DIR" ]; then
    exit 0  # fail open
fi
ROSTER_FILE="$SESSION_DIR/surfer-roster.json"
BYPASS_FILE="$SESSION_DIR/surfer-bypass.flag"
LOG_FILE="$SESSION_DIR/gate.log"
EVENTS_FILE="$SESSION_DIR/surfer-gate-events.jsonl"
ROSTER_TTL_SECONDS=600  # 10 minutes

mkdir -p "$SESSION_DIR" 2>/dev/null && chmod 0700 "$SESSION_DIR" 2>/dev/null || exit 0

_log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >> "$LOG_FILE" 2>/dev/null || true; }

# Emit structured JSONL event (ADR-056). Uses jq when available for safe JSON
# encoding; falls back to manual sed-escaping otherwise. Non-fatal on any
# write failure.
_emit_jsonl() {
    local event="$1"; local reason="$2"
    local ts; ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    local line=""
    if command -v jq >/dev/null 2>&1; then
        line="$(jq -cn --arg ts "$ts" --arg sid "$SESSION_ID" \
            --arg event "$event" --arg sub "$SUBAGENT_TYPE" \
            --arg tn "$TOOL_NAME" --arg rsn "$reason" \
            '{ts:$ts,session_id:$sid,event:$event,subagent_type:$sub,tool_name:$tn,reason:$rsn}' 2>/dev/null)"
    fi
    if [ -z "$line" ]; then
        # Fallback: manual escaping.
        local safe_sub; safe_sub="$(printf '%s' "$SUBAGENT_TYPE" | sed 's/\\/\\\\/g; s/"/\\"/g')"
        local safe_reason; safe_reason="$(printf '%s' "$reason" | sed 's/\\/\\\\/g; s/"/\\"/g')"
        line="$(printf '{"ts":"%s","session_id":"%s","event":"%s","subagent_type":"%s","tool_name":"%s","reason":"%s"}' \
            "$ts" "$SESSION_ID" "$event" "$safe_sub" "$TOOL_NAME" "$safe_reason")"
    fi
    printf '%s\n' "$line" >> "$EVENTS_FILE" 2>/dev/null || true
    if [ -n "${CWD:-}" ]; then
        mkdir -p "$CWD/logs" 2>/dev/null && \
            printf '%s\n' "$line" >> "$CWD/logs/surfer-gate-events.jsonl" 2>/dev/null || true
    fi
}

_allow() { _log "ALLOW subagent=$SUBAGENT_TYPE: $*"; _emit_jsonl "ALLOW" "$*"; exit 0; }
_block() {
    echo "[Silver Surfer Gate] BLOCKED: $*" >&2
    _log "BLOCK subagent=$SUBAGENT_TYPE: $*"
    _emit_jsonl "BLOCK" "$*"
    exit 2
}

# -------- Rule 1: Silver Surfer self-launch always allowed --------
case "$SUBAGENT_TYPE" in
    "Silver Surfer"|"silver-surfer-herald"|"silver surfer"|"SilverSurfer")
        _allow "Silver Surfer self-launch"
        ;;
esac

# -------- Rule 2: Bypass flag present (--light or --solo) --------
if [ -f "$BYPASS_FILE" ]; then
    _allow "bypass active: $(cat "$BYPASS_FILE" 2>/dev/null || echo unknown)"
fi

# -------- Rule 3: Fresh roster present --------
if [ -f "$ROSTER_FILE" ]; then
    # Portable mtime: `stat -f %m` (BSD/macOS) returns mtime; `stat -f %m` on GNU means
    # something different (mount point) and succeeds silently with wrong output — so we
    # can't rely on `||` fallback. `date -r FILE +%s` works on both BSD and GNU.
    ROSTER_MTIME="$(date -r "$ROSTER_FILE" +%s 2>/dev/null || echo 0)"
    ROSTER_AGE=$(( $(date +%s) - ROSTER_MTIME ))
    if [ "$ROSTER_AGE" -lt "$ROSTER_TTL_SECONDS" ]; then
        _allow "roster present (age=${ROSTER_AGE}s)"
    else
        _log "roster stale (age=${ROSTER_AGE}s) — removing"
        rm -f "$ROSTER_FILE"
    fi
fi

# -------- Rule 4: No roster, no bypass, not the Surfer -> block --------
_block "Silver Surfer roster not recorded for this session (TTL ${ROSTER_TTL_SECONDS}s — rosters expire and must be re-recorded on long runs).

Required sequence (orchestrator):
  1. Launch the Silver Surfer sub-agent (subagent_type: 'Silver Surfer')
  2. After it returns a roster, record it:
       bash ${REPO_ROOT}/scripts/surfer-gate/record-roster.sh '<roster-json-inline>'
     The argument is a single-quoted JSON string on one line.
     If the JSON contains literal single quotes, pipe via stdin instead:
       bash ${REPO_ROOT}/scripts/surfer-gate/record-roster.sh <<<\"\$ROSTER_JSON\"
  3. Then launch the agents named in the roster.

Bypass (only if the user command included --light or --solo):
     bash ${REPO_ROOT}/scripts/surfer-gate/bypass.sh --light   # if user passed --light
     bash ${REPO_ROOT}/scripts/surfer-gate/bypass.sh --solo    # if user passed --solo

Full protocol: CLAUDE.md 'Silver Surfer Gate' (ADR-048, ADR-051, ADR-060)."
