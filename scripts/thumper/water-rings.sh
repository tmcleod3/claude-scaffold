#!/bin/bash
# water-rings.sh — The Water Rings — Chani's stop hook
# Sends task completion signals to Telegram when Claude Code finishes
# "Among the Fremen, water rings record the dead — and the debts of the living."
#
# Note: -e (errexit) intentionally omitted — this hook must never fail
# with a non-zero exit that could affect Claude Code's operation.
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

# Read session data from stdin (with timeout to prevent blocking)
INPUT=""
if ! [ -t 0 ]; then
    # perl for timeout (ships on macOS+Linux); head -c bounds if perl absent
    INPUT=$(perl -e 'alarm 5; local $/; print <STDIN>' 2>/dev/null || head -c 65536 2>/dev/null || echo "")
fi

extract_message() {
    local input="$1"
    [ -z "$input" ] && return

    if command -v python3 >/dev/null 2>&1; then
        echo "$input" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if isinstance(data, list):
        messages = data
    elif isinstance(data, dict):
        messages = data.get('messages', [])
    else:
        messages = []

    assistant_msgs = [m for m in messages if m.get('role') == 'assistant']
    if not assistant_msgs:
        sys.exit(0)

    last = assistant_msgs[-1]
    content = last.get('content', '')

    if isinstance(content, list):
        text = ' '.join(
            block.get('text', '')
            for block in content
            if isinstance(block, dict) and block.get('type') == 'text'
        )
    else:
        text = str(content)

    if not text.strip():
        sys.exit(0)

    if len(text) > 3600:
        text = text[:3600] + '\n\n[...truncated, ' + str(len(text)) + ' chars total]'

    print(text)
except SystemExit:
    pass
except Exception:
    pass
" 2>/dev/null
    elif command -v jq >/dev/null 2>&1; then
        echo "$input" | jq -r '
            (if type == "array" then . else (.messages // []) end) |
            [.[] | select(.role == "assistant")] |
            last |
            .content |
            if type == "array" then
                [.[] | select(.type == "text") | .text] | join(" ")
            else
                tostring
            end
        ' 2>/dev/null | head -c 3600
    fi
}

MESSAGE=$(extract_message "$INPUT")

if [ -n "$MESSAGE" ]; then
    NOTIFICATION="$(printf '✅ Task complete\n\n%s\n\n─────────────────\n📡 Reply to continue' "$MESSAGE")"
else
    NOTIFICATION="$(printf '✅ Claude Code finished — no summary available.\n\n─────────────────\n📡 Reply to continue')"
fi

_send_notification() {
    local api_base="https://api.telegram.org/bot${BOT_TOKEN}"
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
