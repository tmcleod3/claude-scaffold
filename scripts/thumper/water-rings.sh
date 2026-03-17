#!/bin/bash
# water-rings.sh — The Water Rings — Chani's stop hook
# Sends Claude Code's response to Telegram when a turn completes.
# "Among the Fremen, water rings record the dead — and the debts of the living."
#
# The Stop hook receives JSON on stdin with `last_assistant_message` — the
# actual response text. No need to read transcript files.
#
# Note: -e (errexit) intentionally omitted — this hook must never fail.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONFIG_DIR="$PROJECT_ROOT/.voidforge/thumper"
CONFIG_FILE="$CONFIG_DIR/sietch.env"
CHANNEL_FLAG="$CONFIG_DIR/.thumper.active"

# Silent exit if not configured or channel closed
[ -f "$CONFIG_FILE" ] || exit 0
[ -f "$CHANNEL_FLAG" ] || exit 0

source "$CONFIG_FILE"
[ "${SETUP_COMPLETE:-}" = "true" ] || exit 0

# Read stop hook metadata from stdin
HOOK_INPUT=""
if ! [ -t 0 ]; then
    HOOK_INPUT=$(perl -e 'alarm 5; local $/; print <STDIN>' 2>/dev/null || head -c 65536 2>/dev/null || echo "")
fi

# Extract last_assistant_message directly from hook metadata
MESSAGE=""
if [ -n "$HOOK_INPUT" ]; then
    if command -v python3 >/dev/null 2>&1; then
        MESSAGE=$(echo "$HOOK_INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    text = data.get('last_assistant_message', '')
    if text:
        if len(text) > 3600:
            text = text[:3600] + '\n\n[...truncated]'
        print(text)
except Exception:
    pass
" 2>/dev/null)
    elif command -v jq >/dev/null 2>&1; then
        MESSAGE=$(echo "$HOOK_INPUT" | jq -r '.last_assistant_message // empty' 2>/dev/null | head -c 3600)
    fi
fi

if [ -n "$MESSAGE" ]; then
    NOTIFICATION="$(printf '✅ Task complete\n\n%s\n\n─────────────────\n📡 Reply to continue' "$MESSAGE")"
else
    NOTIFICATION="$(printf '✅ Claude Code finished — no summary available.\n\n─────────────────\n📡 Reply to continue')"
fi

_send_notification() {
    local api_base="https://api.telegram.org/bot${BOT_TOKEN}"
    # Try with Markdown first, fall back to plain text
    curl -s --connect-timeout 5 --max-time 10 \
        -X POST \
        -d chat_id="$CHAT_ID" \
        --data-urlencode text="$NOTIFICATION" \
        -d parse_mode="Markdown" \
        "${api_base}/sendMessage" >/dev/null 2>&1 || \
    curl -s --connect-timeout 5 --max-time 10 \
        -X POST \
        -d chat_id="$CHAT_ID" \
        --data-urlencode text="$NOTIFICATION" \
        "${api_base}/sendMessage" >/dev/null 2>&1 || true
}

_send_notification &

exit 0
