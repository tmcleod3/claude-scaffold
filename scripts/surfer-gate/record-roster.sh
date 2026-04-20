#!/usr/bin/env bash
# record-roster.sh — Orchestrator helper (ADR-051 + ADR-060).
#
# Called AFTER the Silver Surfer returns its roster. Discovers session_id via
# the pointer file check.sh wrote, then writes the roster sentinel + emits a
# ROSTER_RECEIVED JSONL event.
#
# Usage:
#   bash scripts/surfer-gate/record-roster.sh                     # minimal
#   bash scripts/surfer-gate/record-roster.sh "<roster-json>"     # with audit payload
#
# Exit codes:
#   0 = recorded, or hook inactive (no-op), or failed harmlessly
#   1 = not currently used — helper is fail-open by design

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_paths.sh
. "$SCRIPT_DIR/_paths.sh" 2>/dev/null || {
    echo "[record-roster] _paths.sh missing — no-op." >&2
    exit 0
}

# Prefer $CLAUDE_PROJECT_DIR over $PWD — check.sh hashes stdin's cwd which
# is $CLAUDE_PROJECT_DIR in practice (per ADR-051 empirical findings).
REPO_PATH="${CLAUDE_PROJECT_DIR:-$PWD}"
REPO_PATH="${REPO_PATH%/}"  # normalize trailing slash (BE-002)

if [ -z "$SURFER_GATE_DIR" ]; then
    # Hook can't run either — no-op.
    exit 0
fi

POINTER_FILE="$(surfer_gate_pointer_file "$REPO_PATH")"
if [ -z "$POINTER_FILE" ] || [ ! -f "$POINTER_FILE" ]; then
    echo "[record-roster] no session pointer at $POINTER_FILE — hook not active. No-op." >&2
    exit 0
fi

SESSION_ID="$(cat "$POINTER_FILE" 2>/dev/null)"
if [ -z "$SESSION_ID" ]; then
    echo "[record-roster] session pointer empty — no-op." >&2
    exit 0
fi

SESSION_DIR="$(surfer_gate_session_dir "$SESSION_ID")"
if [ -z "$SESSION_DIR" ]; then
    exit 0
fi
ROSTER_FILE="$SESSION_DIR/surfer-roster.json"
EVENTS_FILE="$SESSION_DIR/surfer-gate-events.jsonl"

mkdir -p "$SESSION_DIR" 2>/dev/null && chmod 0700 "$SESSION_DIR" 2>/dev/null || {
    echo "[record-roster] could not create $SESSION_DIR" >&2
    exit 0
}

# Construct the roster content. No backslash stripping — legitimate JSON
# escapes (\u0041, \", \n) must pass through. If no argument passed, use a
# minimal sentinel.
if [ "$#" -ge 1 ]; then
    ROSTER_CONTENT="$1"
else
    ROSTER_CONTENT='{"recorded":true}'
fi

printf '%s\n' "$ROSTER_CONTENT" > "$ROSTER_FILE" 2>/dev/null && chmod 0600 "$ROSTER_FILE" 2>/dev/null || {
    echo "[record-roster] could not write $ROSTER_FILE" >&2
    exit 0
}

# Emit ROSTER_RECEIVED event to both session-scoped and repo-persistent JSONL.
# Use jq for safe JSON construction (BE-003: avoids string-escape divergence).
# If $ROSTER_CONTENT is valid JSON, embed as nested object via --argjson.
# If not, embed as string via --arg (preserves lossless round-trip via fromjson).
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
JSONL_LINE=""
if command -v jq >/dev/null 2>&1; then
    # Try nested-object form first. --argjson requires valid JSON.
    JSONL_LINE="$(jq -cn --arg ts "$TS" --arg sid "$SESSION_ID" \
        --argjson roster "$ROSTER_CONTENT" \
        '{ts:$ts,session_id:$sid,event:"ROSTER_RECEIVED",roster:$roster}' 2>/dev/null)"
    if [ -z "$JSONL_LINE" ]; then
        # Roster isn't valid JSON — emit as string field for fidelity.
        JSONL_LINE="$(jq -cn --arg ts "$TS" --arg sid "$SESSION_ID" \
            --arg roster "$ROSTER_CONTENT" \
            '{ts:$ts,session_id:$sid,event:"ROSTER_RECEIVED",roster_text:$roster}' 2>/dev/null)"
    fi
fi
if [ -z "$JSONL_LINE" ]; then
    # jq unavailable — fall back to manual string escape.
    SAFE_ROSTER="$(printf '%s' "$ROSTER_CONTENT" | tr -d '\n' | sed 's/\\/\\\\/g; s/"/\\"/g')"
    JSONL_LINE="$(printf '{"ts":"%s","session_id":"%s","event":"ROSTER_RECEIVED","roster_text":"%s"}' \
        "$TS" "$SESSION_ID" "$SAFE_ROSTER")"
fi

# Session-scoped
printf '%s\n' "$JSONL_LINE" >> "$EVENTS_FILE" 2>/dev/null || true
# Repo-persistent (mkdir logs/ if missing — BE-005 fix)
mkdir -p "$REPO_PATH/logs" 2>/dev/null && \
    printf '%s\n' "$JSONL_LINE" >> "$REPO_PATH/logs/surfer-gate-events.jsonl" 2>/dev/null || true

echo "[record-roster] roster recorded for session $SESSION_ID"
