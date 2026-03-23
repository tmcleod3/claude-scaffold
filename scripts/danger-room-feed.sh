#!/bin/bash
# VoidForge Status Line Bridge — feeds context stats to the Danger Room dashboard.
#
# Claude Code sends session JSON via stdin after every assistant message.
# This script extracts key metrics and writes them atomically to a per-session file.
# The wizard server reads these files to power the context gauge + cost display.
#
# Setup: Add to ~/.claude/settings.json:
#   { "statusLine": { "type": "command", "command": "/path/to/danger-room-feed.sh" } }
#
# Or for global settings: ~/.claude/settings.json
#   { "statusLine": { "type": "command", "command": "danger-room-feed.sh" } }

set -euo pipefail

# Read JSON from stdin (Claude Code Status Line API)
input=$(cat)

# Ensure .voidforge directory exists
VOIDFORGE_DIR="${HOME}/.voidforge"
mkdir -p "${VOIDFORGE_DIR}"

# Extract session ID for per-session file naming (prevents concurrent write corruption)
# Sanitize: alphanumeric + hyphens only (prevents path traversal — Gauntlet Kenobi DR-06)
RAW_ID=$(echo "$input" | jq -r '.session_id // "default"' 2>/dev/null || echo "default")
SESSION_ID=$(echo "$RAW_ID" | tr -cd 'a-zA-Z0-9-' | head -c 64)
SESSION_ID="${SESSION_ID:-default}"
STATS_FILE="${VOIDFORGE_DIR}/context-stats-${SESSION_ID}.json"
TMP_FILE="${STATS_FILE}.tmp"

# Extract metrics and write atomically (write to .tmp, then rename)
echo "$input" | jq '{
  percent: (.context_window.used_percentage // null),
  tokens: (.context_window.current_usage.input_tokens // null),
  output_tokens: (.context_window.current_usage.output_tokens // null),
  window_size: (.context_window.context_window_size // null),
  model: (.model.display_name // null),
  cost: (.cost.total_cost_usd // null),
  session_id: (.session_id // null),
  updated_at: now
}' > "${TMP_FILE}" 2>/dev/null && mv "${TMP_FILE}" "${STATS_FILE}"

# Return status line display (shown in Claude Code UI)
pct=$(echo "$input" | jq -r '.context_window.used_percentage // "?"' 2>/dev/null || echo "?")
model=$(echo "$input" | jq -r '.model.display_name // "?"' 2>/dev/null || echo "?")
cost=$(echo "$input" | jq -r '.cost.total_cost_usd // 0' 2>/dev/null || echo "0")

echo "[${model}] ${pct}% | \$${cost}"
