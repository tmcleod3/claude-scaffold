#!/usr/bin/env bash
# validate.sh — Phase 5a PreToolUse hook validation test (ADR-051)
#
# DO NOT USE IN PRODUCTION. This is a no-op logger that confirms:
#   1. Claude Code's runtime actually fires PreToolUse hooks.
#   2. The matcher syntax filters tools as expected.
#   3. $CLAUDE_SESSION_ID is injected into hook env.
#   4. tool_input JSON is piped on stdin.
#
# Exits 0 in all cases. Never blocks a tool call.
#
# To enable: add settings-snippet.json's "validation" entry to
# .claude/settings.json under hooks.PreToolUse. Run a slash command in a
# clean session. Inspect /tmp/voidforge-hook-validate.log.

LOG="/tmp/voidforge-hook-validate.log"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
SESSION="${CLAUDE_SESSION_ID:-UNSET}"

# Read tool input from stdin (Claude Code pipes JSON here per docs)
TOOL_INPUT=""
if ! [ -t 0 ]; then
    TOOL_INPUT="$(cat 2>/dev/null || true)"
fi

# Extract tool name if python3 is available; otherwise log raw
TOOL_NAME="unknown"
if command -v python3 >/dev/null 2>&1 && [ -n "$TOOL_INPUT" ]; then
    TOOL_NAME="$(python3 -c "
import sys, json
try:
    d = json.loads(sys.stdin.read())
    print(d.get('tool_name', d.get('name', 'unknown')))
except Exception as e:
    print('parse-error:' + str(e)[:40])
" <<< "$TOOL_INPUT" 2>/dev/null || echo 'python-error')"
fi

# Log every invocation
{
    echo "[${TS}] session=${SESSION} tool=${TOOL_NAME} stdin_bytes=${#TOOL_INPUT}"
} >> "$LOG" 2>/dev/null || true

# Never block
exit 0
