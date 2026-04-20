#!/usr/bin/env bash
# bypass.sh — Orchestrator helper for --light / --solo bypass (ADR-051 + ADR-060).
#
# Writes a session-scoped bypass flag that check.sh honors. Fail-closed on
# unknown flag values (SEC-003 fix) — only --light and --solo are valid.
#
# Usage:
#   bash scripts/surfer-gate/bypass.sh --light
#   bash scripts/surfer-gate/bypass.sh --solo
#
# Exit codes:
#   0 = bypass recorded, or hook inactive (no-op)
#   2 = rejected: unknown flag value (SEC-003 fail-closed)

set -uo pipefail

FLAG="${1:-}"

# SEC-003: validate BEFORE touching state. Unknown flags are rejected with a
# clear error and no bypass file is written. This closes the prompt-injection
# path where `bash bypass.sh --anything` would silently produce a bypass.
case "$FLAG" in
    --light|--solo) ;;  # valid — continue
    "")
        echo "[bypass] usage: bypass.sh --light | --solo" >&2
        exit 2
        ;;
    *)
        echo "[bypass] ERROR: unknown flag '$FLAG'. Only --light and --solo are valid." >&2
        exit 2
        ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_paths.sh
. "$SCRIPT_DIR/_paths.sh" 2>/dev/null || exit 0

REPO_PATH="${CLAUDE_PROJECT_DIR:-$PWD}"
REPO_PATH="${REPO_PATH%/}"  # normalize trailing slash (BE-002)

if [ -z "$SURFER_GATE_DIR" ]; then
    exit 0
fi

POINTER_FILE="$(surfer_gate_pointer_file "$REPO_PATH")"
if [ -z "$POINTER_FILE" ] || [ ! -f "$POINTER_FILE" ]; then
    # Hook not active — nothing to record. No-op.
    exit 0
fi

SESSION_ID="$(cat "$POINTER_FILE" 2>/dev/null)"
if [ -z "$SESSION_ID" ]; then
    exit 0
fi

SESSION_DIR="$(surfer_gate_session_dir "$SESSION_ID")"
[ -z "$SESSION_DIR" ] && exit 0

BYPASS_FILE="$SESSION_DIR/surfer-bypass.flag"

mkdir -p "$SESSION_DIR" 2>/dev/null && chmod 0700 "$SESSION_DIR" 2>/dev/null || exit 0
printf '%s\n' "$FLAG" > "$BYPASS_FILE" 2>/dev/null && chmod 0600 "$BYPASS_FILE" 2>/dev/null || exit 0

echo "[bypass] flag $FLAG recorded for session $SESSION_ID"
