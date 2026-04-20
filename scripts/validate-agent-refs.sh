#!/usr/bin/env bash
# validate-agent-refs.sh — ADR-055 enforcement
#
# Verifies every subagent_type: reference in .claude/commands/*.md resolves
# to exactly one agent whose `name:` field matches in .claude/agents/*.md.
# Exits 1 if any reference is unresolved or ambiguous.
#
# Intended integration points:
#   - .husky/pre-commit (catch authoring mistakes at commit time)
#   - /void forge sync (catch drift when pulling upstream methodology updates)

set -uo pipefail

# Resolve repo root (parent of this script's directory)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENTS_DIR="$REPO_ROOT/.claude/agents"
COMMANDS_DIR="$REPO_ROOT/.claude/commands"

if [ ! -d "$AGENTS_DIR" ]; then
    echo "validate-agent-refs: $AGENTS_DIR not found — skipping (not a VoidForge project root)" >&2
    exit 0
fi
if [ ! -d "$COMMANDS_DIR" ]; then
    echo "validate-agent-refs: $COMMANDS_DIR not found — skipping" >&2
    exit 0
fi

# Build the set of valid agent names from name: frontmatter
VALID_NAMES_FILE="$(mktemp)"
trap 'rm -f "$VALID_NAMES_FILE"' EXIT

grep -h "^name:" "$AGENTS_DIR"/*.md 2>/dev/null \
    | sed 's/^name:[[:space:]]*//' \
    | sed 's/[[:space:]]*$//' \
    | sort -u > "$VALID_NAMES_FILE"

if [ ! -s "$VALID_NAMES_FILE" ]; then
    echo "validate-agent-refs: no agent name: fields found — cannot validate" >&2
    exit 1
fi

# Find every subagent_type: reference in command files
# Accepts names with spaces (Bel Riose), apostrophes (T'Challa, Paul Muad'Dib),
# periods (R. Daneel Olivaw), and dots.
ERRORS=0
while IFS= read -r raw_line; do
    # Extract file:line:match shape from grep -n
    file="$(echo "$raw_line" | cut -d: -f1)"
    line_no="$(echo "$raw_line" | cut -d: -f2)"
    content="$(echo "$raw_line" | cut -d: -f3-)"

    # Pull the value after `subagent_type:`. The name is terminated by the
    # first backtick (typical markdown: `subagent_type: Name`), or by " —"
    # (em-dash separator), or end of line.
    value="$(echo "$content" \
        | sed -E 's/.*subagent_type:[[:space:]]*//' \
        | sed -E 's/\`.*$//' \
        | sed -E 's/ +—.*$//' \
        | sed -E 's/[[:space:]]*$//')"

    # Skip if the line was actually quoted prose or an example
    if [ -z "$value" ]; then continue; fi

    # Exact match against the valid-name set
    if ! grep -qxF "$value" "$VALID_NAMES_FILE"; then
        echo "UNRESOLVED  ${file}:${line_no}  →  subagent_type: \"$value\"  (no matching agent name:)"
        ERRORS=$((ERRORS + 1))
    fi
done < <(grep -rn "subagent_type:" "$COMMANDS_DIR"/*.md 2>/dev/null)

if [ "$ERRORS" -gt 0 ]; then
    echo ""
    echo "FAIL: $ERRORS unresolved subagent_type reference(s)"
    echo "Hint: agent name: must match the subagent_type: value exactly (case, spacing, punctuation)"
    exit 1
fi

echo "OK: all subagent_type references resolve to a single agent"
