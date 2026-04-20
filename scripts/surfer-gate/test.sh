#!/usr/bin/env bash
# Offline test harness for scripts/surfer-gate/{check,record-roster,bypass}.sh
# Committed to the repo (v23.8.18 — QA-003 fix: was at /tmp/test-check-sh.sh before).
#
# Run: bash scripts/surfer-gate/test.sh
# Exit 0 on all pass, 1 on any failure.

set -uo pipefail

SCAFFOLD="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHECK="$SCAFFOLD/scripts/surfer-gate/check.sh"
RECORD="$SCAFFOLD/scripts/surfer-gate/record-roster.sh"
BYPASS="$SCAFFOLD/scripts/surfer-gate/bypass.sh"

# Isolate tests from live state: use a temp HOME so the new helpers don't
# touch the real $HOME/.voidforge/gate/ state.
TEST_HOME="$(mktemp -d)"
trap 'rm -rf "$TEST_HOME"' EXIT

export HOME="$TEST_HOME"
unset XDG_RUNTIME_DIR  # force $HOME path for deterministic tests

TEST_SESSION="test-session-$$-$(date +%s)"
TEST_CWD="$TEST_HOME/fake-repo"
mkdir -p "$TEST_CWD"

PASS=0
FAIL=0

run() {
    local name="$1"; local expected="$2"; local input="$3"
    local actual
    echo "$input" | bash "$CHECK" 2>/dev/null
    actual=$?
    if [ "$actual" -eq "$expected" ]; then
        echo "  PASS  [$name] exit=$actual"
        PASS=$((PASS + 1))
    else
        echo "  FAIL  [$name] exit=$actual (expected $expected)"
        FAIL=$((FAIL + 1))
    fi
}

mock_input() {
    local tool="$1"; local subagent="${2:-}"; local cwd="${3:-$TEST_CWD}"
    printf '{"session_id":"%s","tool_name":"%s","tool_input":{"subagent_type":"%s"},"cwd":"%s"}' \
        "$TEST_SESSION" "$tool" "$subagent" "$cwd"
}

reset_state() {
    rm -rf "$HOME/.voidforge/gate" 2>/dev/null || true
}

echo "=== check.sh logic tests ==="

reset_state
run "Non-Agent tool (Bash)" 0 "$(mock_input Bash)"

reset_state
run "Silver Surfer self-launch" 0 "$(mock_input Agent 'Silver Surfer')"

reset_state
run "No roster, no bypass, blocks" 2 "$(mock_input Agent Picard)"

# Roster present -> allow. First fire Bash to create the pointer + session dir.
reset_state
echo "$(mock_input Bash)" | bash "$CHECK" >/dev/null 2>&1
SESSION_DIR="$HOME/.voidforge/gate/sessions/$TEST_SESSION"
mkdir -p "$SESSION_DIR"
echo '["Picard"]' > "$SESSION_DIR/surfer-roster.json"
run "Roster present, allows" 0 "$(mock_input Agent Picard)"

reset_state
echo "$(mock_input Bash)" | bash "$CHECK" >/dev/null 2>&1
mkdir -p "$SESSION_DIR"
echo "--light" > "$SESSION_DIR/surfer-bypass.flag"
run "Bypass flag, allows" 0 "$(mock_input Agent Picard)"

reset_state
run "Malformed JSON fails open" 0 "not-json"

reset_state
run "Missing session_id fails open" 0 '{"tool_name":"Agent","tool_input":{"subagent_type":"Picard"}}'

reset_state
echo "$(mock_input Bash)" | bash "$CHECK" >/dev/null 2>&1
mkdir -p "$SESSION_DIR"
echo '["Picard"]' > "$SESSION_DIR/surfer-roster.json"
touch -t "$(date -v-11M +%Y%m%d%H%M.%S 2>/dev/null || date -d '11 minutes ago' +%Y%m%d%H%M.%S)" "$SESSION_DIR/surfer-roster.json" 2>/dev/null || true
run "Stale roster (>10min) blocks" 2 "$(mock_input Agent Picard)"

echo ""
echo "=== Pointer file integration ==="

reset_state
echo "$(mock_input Bash)" | bash "$CHECK" >/dev/null 2>&1
REPO_HASH="$(printf '%s' "$TEST_CWD" | shasum -a 256 | cut -c1-12)"
POINTER="$HOME/.voidforge/gate/pointers/pointer-$REPO_HASH"
if [ -f "$POINTER" ] && [ "$(cat "$POINTER")" = "$TEST_SESSION" ]; then
    echo "  PASS  [check.sh writes pointer to new ADR-060 path]"
    PASS=$((PASS + 1))
else
    echo "  FAIL  [check.sh writes pointer — expected $POINTER containing $TEST_SESSION]"
    FAIL=$((FAIL + 1))
fi

echo ""
echo "=== record-roster.sh ==="

reset_state
echo "$(mock_input Bash)" | bash "$CHECK" >/dev/null 2>&1
(cd "$TEST_CWD" && CLAUDE_PROJECT_DIR="$TEST_CWD" bash "$RECORD" '{"test":"roster"}' >/dev/null 2>&1) || true

if [ -f "$SESSION_DIR/surfer-roster.json" ]; then
    echo "  PASS  [record-roster writes roster file]"
    PASS=$((PASS + 1))
else
    echo "  FAIL  [record-roster writes roster file]"
    FAIL=$((FAIL + 1))
fi

run "After record-roster, Agent allowed" 0 "$(mock_input Agent Picard)"

echo ""
echo "=== bypass.sh ==="

reset_state
echo "$(mock_input Bash)" | bash "$CHECK" >/dev/null 2>&1
(cd "$TEST_CWD" && CLAUDE_PROJECT_DIR="$TEST_CWD" bash "$BYPASS" --light >/dev/null 2>&1) || true

if [ -f "$SESSION_DIR/surfer-bypass.flag" ]; then
    echo "  PASS  [bypass.sh writes flag file]"
    PASS=$((PASS + 1))
else
    echo "  FAIL  [bypass.sh writes flag file]"
    FAIL=$((FAIL + 1))
fi

run "After bypass, Agent allowed" 0 "$(mock_input Agent Picard)"

echo ""
echo "=== SEC-003: bypass.sh fail-closed on unknown flag ==="

bash "$BYPASS" --invalid-flag >/dev/null 2>&1
BYPASS_INVALID_EXIT=$?
if [ "$BYPASS_INVALID_EXIT" -eq 2 ]; then
    echo "  PASS  [bypass.sh rejects unknown flag with exit 2]"
    PASS=$((PASS + 1))
else
    echo "  FAIL  [bypass.sh exit=$BYPASS_INVALID_EXIT on unknown flag (expected 2)]"
    FAIL=$((FAIL + 1))
fi

bash "$BYPASS" >/dev/null 2>&1
BYPASS_EMPTY_EXIT=$?
if [ "$BYPASS_EMPTY_EXIT" -eq 2 ]; then
    echo "  PASS  [bypass.sh rejects empty flag with exit 2]"
    PASS=$((PASS + 1))
else
    echo "  FAIL  [bypass.sh exit=$BYPASS_EMPTY_EXIT on empty flag (expected 2)]"
    FAIL=$((FAIL + 1))
fi

echo ""
echo "=== QA-001: CLAUDE_PROJECT_DIR discovery from subdirectory ==="

reset_state
# Simulate orchestrator calling from a subdir with CLAUDE_PROJECT_DIR pointing
# to the repo root. The helper should discover the correct pointer.
SUBDIR="$TEST_CWD/packages/foo"
mkdir -p "$SUBDIR"
echo "$(mock_input Bash)" | bash "$CHECK" >/dev/null 2>&1
(cd "$SUBDIR" && CLAUDE_PROJECT_DIR="$TEST_CWD" bash "$RECORD" '{"from":"subdir"}' >/dev/null 2>&1) || true
if [ -f "$SESSION_DIR/surfer-roster.json" ]; then
    echo "  PASS  [record-roster discovers session via CLAUDE_PROJECT_DIR from subdir]"
    PASS=$((PASS + 1))
else
    echo "  FAIL  [record-roster couldn't find session when called from subdir]"
    FAIL=$((FAIL + 1))
fi

echo ""
echo "=== QA-002: JSONL escape preservation for complex roster JSON ==="

reset_state
echo "$(mock_input Bash)" | bash "$CHECK" >/dev/null 2>&1
# Roster with literal backslashes, quotes, and newlines — must round-trip.
COMPLEX_ROSTER='{"key":"val with \"quotes\" and \\backslash","nested":{"a":1}}'
(cd "$TEST_CWD" && CLAUDE_PROJECT_DIR="$TEST_CWD" bash "$RECORD" "$COMPLEX_ROSTER" >/dev/null 2>&1) || true

# Verify sentinel file has the raw roster
if grep -q 'backslash' "$SESSION_DIR/surfer-roster.json" 2>/dev/null; then
    echo "  PASS  [sentinel preserves complex roster content]"
    PASS=$((PASS + 1))
else
    echo "  FAIL  [sentinel missing or corrupted for complex roster]"
    FAIL=$((FAIL + 1))
fi

# Verify JSONL event is parseable
if command -v jq >/dev/null 2>&1; then
    if [ -f "$SESSION_DIR/surfer-gate-events.jsonl" ] && \
       tail -1 "$SESSION_DIR/surfer-gate-events.jsonl" | jq . >/dev/null 2>&1; then
        echo "  PASS  [JSONL event parses as valid JSON with complex roster]"
        PASS=$((PASS + 1))
    else
        echo "  FAIL  [JSONL event not parseable by jq]"
        FAIL=$((FAIL + 1))
    fi
fi

echo ""
echo "=== QA-003: repo-persistent logs/ directory auto-created ==="

reset_state
echo "$(mock_input Bash)" | bash "$CHECK" >/dev/null 2>&1
# TEST_CWD has no logs/ dir initially
rm -rf "$TEST_CWD/logs"
(cd "$TEST_CWD" && CLAUDE_PROJECT_DIR="$TEST_CWD" bash "$RECORD" '{"test":1}' >/dev/null 2>&1) || true
if [ -f "$TEST_CWD/logs/surfer-gate-events.jsonl" ]; then
    echo "  PASS  [record-roster auto-creates logs/ and writes JSONL]"
    PASS=$((PASS + 1))
else
    echo "  FAIL  [logs/surfer-gate-events.jsonl not created]"
    FAIL=$((FAIL + 1))
fi

echo ""
echo "=== record-roster with no hook active ==="

reset_state
rm -rf "$HOME/.voidforge/gate/pointers"
(cd "$TEST_CWD" && CLAUDE_PROJECT_DIR="$TEST_CWD" bash "$RECORD" >/dev/null 2>&1)
NOOP_EXIT=$?
if [ "$NOOP_EXIT" -eq 0 ]; then
    echo "  PASS  [record-roster is no-op when hook inactive]"
    PASS=$((PASS + 1))
else
    echo "  FAIL  [record-roster exit=$NOOP_EXIT when hook inactive]"
    FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Results ==="
echo "Pass: $PASS"
echo "Fail: $FAIL"
[ "$FAIL" -eq 0 ]
