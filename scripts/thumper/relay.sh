#!/bin/bash
# relay.sh — The Sandworm — Chani's message transport
# Polls Telegram for thumper beats and rides them into Claude Code
# Runs as a background daemon, started by thumper.sh
#
# Note: -e (errexit) intentionally omitted — a long-running daemon must not
# exit on transient curl failures or non-zero returns from inject_text.
set -uo pipefail

# Security: refuse to run as root
if [[ "$(id -u)" -eq 0 ]]; then
    echo "❌ Cannot run as root. Use a normal user account." >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONFIG_DIR="$PROJECT_ROOT/.voidforge/thumper"
CONFIG_FILE="$CONFIG_DIR/sietch.env"
CHANNEL_FLAG="$CONFIG_DIR/.thumper.active"
PID_FILE="$CONFIG_DIR/.worm.pid"
LOG_FILE="$CONFIG_DIR/worm.log"
LAST_ID_FILE="$CONFIG_DIR/.last_thumper_id"

# ─── Security: Input Sanitization ──────────────────────────────

MAX_MESSAGE_LENGTH=8192

sanitize_text() {
    # Strip ALL control chars (0x00-0x1F) and DEL (0x7F), collapse newlines to spaces
    # This includes tab (0x09) which can trigger autocomplete in terminals
    printf '%s' "$1" | tr -d '\000-\037\177' | tr '\n' ' '
}

# ─── Helpers ───────────────────────────────────────────────────

log() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*" >> "$LOG_FILE"
}

send_telegram() {
    local text="$1"
    curl -s --connect-timeout 5 --max-time 10 \
        -X POST \
        -d chat_id="$CHAT_ID" \
        --data-urlencode text="$text" \
        -d parse_mode="Markdown" \
        "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" >/dev/null 2>&1 || \
    curl -s --connect-timeout 5 --max-time 10 \
        -X POST \
        -d chat_id="$CHAT_ID" \
        --data-urlencode text="$text" \
        "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" >/dev/null 2>&1 || true
}

# ─── Startup Checks ───────────────────────────────────────────

if [[ ! -f "$CONFIG_FILE" ]]; then
    echo "❌ No sietch vault found. Run /thumper setup first." >&2
    exit 1
fi

source "$CONFIG_FILE"

if [[ "${SETUP_COMPLETE:-}" != "true" ]]; then
    echo "❌ Setup incomplete. Run /thumper setup." >&2
    exit 1
fi

if [[ -f "$PID_FILE" ]]; then
    existing_pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
    if [[ -n "$existing_pid" ]] && [[ "$existing_pid" != "$$" ]] && kill -0 "$existing_pid" 2>/dev/null; then
        echo "⚠️  Sandworm already riding (PID $existing_pid). Stop it first." >&2
        exit 1
    fi
fi

API_BASE="https://api.telegram.org/bot${BOT_TOKEN}"

echo "$$" > "$PID_FILE.tmp" && mv "$PID_FILE.tmp" "$PID_FILE"

# Rotate log if over 1MB
if [[ -f "$LOG_FILE" ]]; then
    log_size=$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null || echo "0")
    if [[ "$log_size" -gt 1048576 ]]; then
        mv "$LOG_FILE" "${LOG_FILE}.1"
    fi
fi
touch "$LOG_FILE"
chmod 600 "$LOG_FILE"

# ─── Cleanup on exit ──────────────────────────────────────────

cleanup() {
    rm -f "$PID_FILE"
    log "🔇 Sandworm dormant (PID $$)"
}
trap cleanup EXIT SIGTERM SIGINT

# ─── Offset Management ─────────────────────────────────────────

advance_offset() {
    LAST_ID="$1"
    echo "$LAST_ID" > "$LAST_ID_FILE.tmp" && mv "$LAST_ID_FILE.tmp" "$LAST_ID_FILE"
}

# ─── Source Gom Jabbar Protocol ────────────────────────────────

source "$SCRIPT_DIR/gom-jabbar.sh"

# ─── JSON Parsing (outputs: update_id \t msg_id \t chat_id \t text) ──

parse_updates() {
    local json="$1"
    if command -v python3 >/dev/null 2>&1; then
        echo "$json" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if data.get('ok') and data.get('result'):
        for update in data['result']:
            uid = update.get('update_id', 0)
            msg = update.get('message', {})
            msg_id = msg.get('message_id', 0)
            chat = msg.get('chat', {})
            chat_id = str(chat.get('id', ''))
            text = msg.get('text', '')
            if text:
                print(f'{uid}\t{msg_id}\t{chat_id}\t{text}')
except Exception:
    pass
" 2>/dev/null
    elif command -v jq >/dev/null 2>&1; then
        echo "$json" | jq -r '
            .result[]? |
            select(.message.text != null) |
            [.update_id, .message.message_id, (.message.chat.id | tostring), .message.text] |
            join("\t")
        ' 2>/dev/null
    else
        # Minimal grep/sed fallback — only processes the LAST update to avoid
        # row misalignment between separate grep extractions.
        # Install python3 or jq for reliable multi-message parsing.
        local uid text_val
        uid=$(echo "$json" | grep -o '"update_id":[0-9]*' | tail -1 | sed 's/"update_id"://')
        text_val=$(echo "$json" | grep -o '"text":"[^"]*"' | tail -1 | sed 's/"text":"//;s/"$//')
        if [[ -n "$uid" ]] && [[ -n "$text_val" ]]; then
            printf '%s\t0\t%s\t%s\n' "$uid" "$CHAT_ID" "$text_val"
        fi
    fi
}

# ─── Command Center (Inline Keyboard) ─────────────────────────

send_command_menu() {
    local keyboard='{"inline_keyboard":[
        [{"text":"🚀 Campaign","callback_data":"menu:campaign"},{"text":"🔨 Build","callback_data":"menu:build"},{"text":"🛡️ Gauntlet","callback_data":"menu:gauntlet"}],
        [{"text":"🦇 QA","callback_data":"menu:qa"},{"text":"🧝 UX","callback_data":"menu:ux"},{"text":"⚔️ Security","callback_data":"menu:security"}],
        [{"text":"🏗️ Architect","callback_data":"menu:architect"},{"text":"📦 DevOps","callback_data":"menu:devops"},{"text":"🧪 Test","callback_data":"menu:test"}],
        [{"text":"📋 Review","callback_data":"menu:review"},{"text":"🔖 Git","callback_data":"menu:git"},{"text":"🩺 Debrief","callback_data":"menu:debrief"}],
        [{"text":"🌀 Void","callback_data":"menu:void"},{"text":"🪱 Thumper","callback_data":"menu:thumper"},{"text":"🎨 Imagine","callback_data":"menu:imagine"}]
    ]}'
    curl -s --connect-timeout 5 --max-time 10 \
        -X POST "${API_BASE}/sendMessage" \
        -H "Content-Type: application/json" \
        -d "{\"chat_id\":\"$CHAT_ID\",\"text\":\"🏜️ *VoidForge Command Center*\n\nTap a command to see its options:\",\"parse_mode\":\"Markdown\",\"reply_markup\":$keyboard}" >/dev/null 2>&1 || true
}

get_submenu() {
    local cmd="$1"
    case "$cmd" in
        campaign)
            echo '{"text":"🚀 *Campaign* — Sisko'\''s War Room\n\nBuild the entire PRD mission by mission.","keyboard":{"inline_keyboard":[
                [{"text":"/campaign","callback_data":"run:/campaign"}],
                [{"text":"/campaign --blitz","callback_data":"run:/campaign --blitz"}],
                [{"text":"/campaign --blitz --fast","callback_data":"run:/campaign --blitz --fast"}],
                [{"text":"/campaign --resume","callback_data":"run:/campaign --resume"}],
                [{"text":"/campaign --plan","callback_data":"run:/campaign --plan"}],
                [{"text":"← Back","callback_data":"menu:back"}]
            ]}}';;
        build)
            echo '{"text":"🔨 *Build* — Execute Protocol\n\nFull 13-phase build from PRD.","keyboard":{"inline_keyboard":[
                [{"text":"/build","callback_data":"run:/build"}],
                [{"text":"/build --phase 6-7","callback_data":"run:/build --phase 6-7"}],
                [{"text":"← Back","callback_data":"menu:back"}]
            ]}}';;
        gauntlet)
            echo '{"text":"🛡️ *Gauntlet* — Thanos'\''s Review\n\n5 rounds, 30+ agents, every domain.","keyboard":{"inline_keyboard":[
                [{"text":"/gauntlet","callback_data":"run:/gauntlet"}],
                [{"text":"/gauntlet --quick","callback_data":"run:/gauntlet --quick"}],
                [{"text":"/gauntlet --ux-extra","callback_data":"run:/gauntlet --ux-extra"}],
                [{"text":"/gauntlet --security-only","callback_data":"run:/gauntlet --security-only"}],
                [{"text":"← Back","callback_data":"menu:back"}]
            ]}}';;
        qa)
            echo '{"text":"🦇 *QA* — Batman'\''s Pass\n\nEvery edge case, every boundary.","keyboard":{"inline_keyboard":[
                [{"text":"/qa","callback_data":"run:/qa"}],
                [{"text":"← Back","callback_data":"menu:back"}]
            ]}}';;
        ux)
            echo '{"text":"🧝 *UX* — Galadriel'\''s Pass\n\nUsability, a11y, enchantment.","keyboard":{"inline_keyboard":[
                [{"text":"/ux","callback_data":"run:/ux"}],
                [{"text":"← Back","callback_data":"menu:back"}]
            ]}}';;
        security)
            echo '{"text":"⚔️ *Security* — Kenobi'\''s Audit\n\nOWASP, injection, auth, secrets.","keyboard":{"inline_keyboard":[
                [{"text":"/security","callback_data":"run:/security"}],
                [{"text":"← Back","callback_data":"menu:back"}]
            ]}}';;
        architect)
            echo '{"text":"🏗️ *Architect* — Picard'\''s Review\n\nSchema, scaling, boundaries.","keyboard":{"inline_keyboard":[
                [{"text":"/architect","callback_data":"run:/architect"}],
                [{"text":"/architect --plan","callback_data":"run:/architect --plan"}],
                [{"text":"← Back","callback_data":"menu:back"}]
            ]}}';;
        devops)
            echo '{"text":"📦 *DevOps* — Kusanagi'\''s Audit\n\nDeploy, monitor, backup.","keyboard":{"inline_keyboard":[
                [{"text":"/devops","callback_data":"run:/devops"}],
                [{"text":"← Back","callback_data":"menu:back"}]
            ]}}';;
        test)
            echo '{"text":"🧪 *Test* — Batman'\''s Test Mode\n\nCoverage, architecture, write tests.","keyboard":{"inline_keyboard":[
                [{"text":"/test","callback_data":"run:/test"}],
                [{"text":"← Back","callback_data":"menu:back"}]
            ]}}';;
        review)
            echo '{"text":"📋 *Review* — Picard'\''s Code Review\n\nPattern compliance, quality.","keyboard":{"inline_keyboard":[
                [{"text":"/review","callback_data":"run:/review"}],
                [{"text":"← Back","callback_data":"menu:back"}]
            ]}}';;
        git)
            echo '{"text":"🔖 *Git* — Coulson'\''s Release\n\nVersion, changelog, commit.","keyboard":{"inline_keyboard":[
                [{"text":"/git","callback_data":"run:/git"}],
                [{"text":"← Back","callback_data":"menu:back"}]
            ]}}';;
        debrief)
            echo '{"text":"🩺 *Debrief* — Bashir'\''s Analysis\n\nPost-mortem and upstream feedback.","keyboard":{"inline_keyboard":[
                [{"text":"/debrief","callback_data":"run:/debrief"}],
                [{"text":"/debrief --submit","callback_data":"run:/debrief --submit"}],
                [{"text":"/debrief --inbox","callback_data":"run:/debrief --inbox"}],
                [{"text":"/debrief --campaign","callback_data":"run:/debrief --campaign"}],
                [{"text":"← Back","callback_data":"menu:back"}]
            ]}}';;
        void)
            echo '{"text":"🌀 *Void* — Bombadil'\''s Sync\n\nUpdate methodology from upstream.","keyboard":{"inline_keyboard":[
                [{"text":"/void","callback_data":"run:/void"}],
                [{"text":"← Back","callback_data":"menu:back"}]
            ]}}';;
        thumper)
            echo '{"text":"🪱 *Thumper* — Bridge Control\n\nTelegram ↔ Claude Code.","keyboard":{"inline_keyboard":[
                [{"text":"/thumper on","callback_data":"run:/thumper on"}],
                [{"text":"/thumper off","callback_data":"run:/thumper off"}],
                [{"text":"/thumper status","callback_data":"run:/thumper status"}],
                [{"text":"← Back","callback_data":"menu:back"}]
            ]}}';;
        imagine)
            echo '{"text":"🎨 *Imagine* — Celebrimbor'\''s Forge\n\nAI image generation from PRD.","keyboard":{"inline_keyboard":[
                [{"text":"/imagine","callback_data":"run:/imagine"}],
                [{"text":"/imagine --scan","callback_data":"run:/imagine --scan"}],
                [{"text":"← Back","callback_data":"menu:back"}]
            ]}}';;
    esac
}

handle_callback_query() {
    local callback_id="$1" data="$2" message_id="$3"

    # Acknowledge the callback immediately (removes loading spinner)
    curl -s --connect-timeout 5 --max-time 5 \
        -X POST "${API_BASE}/answerCallbackQuery" \
        -d "callback_query_id=$callback_id" >/dev/null 2>&1 || true

    if [[ "$data" == "menu:back" ]]; then
        # Edit message back to main menu
        local keyboard='{"inline_keyboard":[
            [{"text":"🚀 Campaign","callback_data":"menu:campaign"},{"text":"🔨 Build","callback_data":"menu:build"},{"text":"🛡️ Gauntlet","callback_data":"menu:gauntlet"}],
            [{"text":"🦇 QA","callback_data":"menu:qa"},{"text":"🧝 UX","callback_data":"menu:ux"},{"text":"⚔️ Security","callback_data":"menu:security"}],
            [{"text":"🏗️ Architect","callback_data":"menu:architect"},{"text":"📦 DevOps","callback_data":"menu:devops"},{"text":"🧪 Test","callback_data":"menu:test"}],
            [{"text":"📋 Review","callback_data":"menu:review"},{"text":"🔖 Git","callback_data":"menu:git"},{"text":"🩺 Debrief","callback_data":"menu:debrief"}],
            [{"text":"🌀 Void","callback_data":"menu:void"},{"text":"🪱 Thumper","callback_data":"menu:thumper"},{"text":"🎨 Imagine","callback_data":"menu:imagine"}]
        ]}'
        curl -s --connect-timeout 5 --max-time 10 \
            -X POST "${API_BASE}/editMessageText" \
            -H "Content-Type: application/json" \
            -d "{\"chat_id\":\"$CHAT_ID\",\"message_id\":$message_id,\"text\":\"🏜️ *VoidForge Command Center*\n\nTap a command to see its options:\",\"parse_mode\":\"Markdown\",\"reply_markup\":$keyboard}" >/dev/null 2>&1 || true

    elif [[ "$data" == menu:* ]]; then
        # Show submenu for the selected command
        local cmd="${data#menu:}"
        local submenu_json
        submenu_json=$(get_submenu "$cmd")
        if [[ -n "$submenu_json" ]]; then
            local sub_text sub_keyboard
            sub_text=$(echo "$submenu_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['text'])" 2>/dev/null)
            sub_keyboard=$(echo "$submenu_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d['keyboard']))" 2>/dev/null)
            curl -s --connect-timeout 5 --max-time 10 \
                -X POST "${API_BASE}/editMessageText" \
                -H "Content-Type: application/json" \
                -d "{\"chat_id\":\"$CHAT_ID\",\"message_id\":$message_id,\"text\":\"$sub_text\",\"parse_mode\":\"Markdown\",\"reply_markup\":$sub_keyboard}" >/dev/null 2>&1 || true
        fi

    elif [[ "$data" == run:* ]]; then
        # Send the command as a text message, then inject into Claude Code
        local run_cmd="${data#run:}"
        log "COMMAND CENTER: $run_cmd"
        send_telegram "⚡ Sending: \`$run_cmd\`"
        local sanitized
        sanitized=$(sanitize_text "$run_cmd")
        if [[ -n "$sanitized" ]]; then
            inject_text "$sanitized"
        fi
    fi
}

# Parse callback queries from updates (outputs: update_id \t callback_id \t message_id \t data)
parse_callback_queries() {
    local json="$1"
    if command -v python3 >/dev/null 2>&1; then
        echo "$json" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if data.get('ok') and data.get('result'):
        for update in data['result']:
            cb = update.get('callback_query')
            if cb:
                uid = update.get('update_id', 0)
                cb_id = cb.get('id', '')
                msg = cb.get('message', {})
                msg_id = msg.get('message_id', 0)
                cb_data = cb.get('data', '')
                if cb_data:
                    print(f'{uid}\t{cb_id}\t{msg_id}\t{cb_data}')
except Exception:
    pass
" 2>/dev/null
    fi
}

# ─── Transport Vector Injection ────────────────────────────────

inject_text() {
    local text="$1"
    case "$INJECT_METHOD" in
        PTY_INJECT)
            local claude_pid
            claude_pid=$(pgrep -f "node.*claude" 2>/dev/null | head -1 || true)
            [[ -z "$claude_pid" ]] && claude_pid=$(pgrep -f "claude" 2>/dev/null | head -1 || true)
            if [[ -z "$claude_pid" ]]; then
                log "ERROR: Cannot locate Claude process"
                send_telegram "⚠️ The Voice finds no one to command. Is Claude Code running?"
                return 1
            fi
            local tty_path
            tty_path=$(readlink "/proc/$claude_pid/fd/0" 2>/dev/null || echo "")
            if [[ "$tty_path" != /dev/pts/* ]] && [[ "$tty_path" != /dev/tty* ]]; then
                log "ERROR: TTY path not a terminal device: $tty_path"
                send_telegram "⚠️ Worm path error: invalid TTY for PID $claude_pid"
                return 1
            fi
            printf '%s\n' "$text" > "$tty_path"
            ;;
        TMUX_SENDKEYS)
            local session="${TMUX_SESSION:-0}"
            if ! tmux has-session -t "$session" 2>/dev/null; then
                log "ERROR: tmux session '$session' not found"
                send_telegram "⚠️ tmux session '$session' not found. Is tmux running?"
                return 1
            fi
            tmux send-keys -l -t "$session" "$text"
            tmux send-keys -t "$session" Enter
            ;;
        OSASCRIPT)
            local tmpfile
            tmpfile=$(mktemp)
            printf '%s' "$text" > "$tmpfile"
            local term="${TERM_PROGRAM:-Terminal}"
            local osascript_ok=0
            if [[ "$term" == "iTerm.app" ]] || [[ "$term" == "iTerm2" ]]; then
                osascript <<APPLESCRIPT 2>/dev/null && osascript_ok=1
set textContent to read POSIX file "$tmpfile" as «class utf8»
tell application "iTerm2"
    tell current session of current window
        write text textContent
    end tell
end tell
APPLESCRIPT
            else
                osascript <<APPLESCRIPT 2>/dev/null && osascript_ok=1
set textContent to read POSIX file "$tmpfile" as «class utf8»
tell application "Terminal"
    activate
    tell application "System Events"
        keystroke textContent
        key code 36
    end tell
end tell
APPLESCRIPT
            fi
            rm -f "$tmpfile"
            if [[ "$osascript_ok" -ne 1 ]]; then
                log "ERROR: osascript injection failed"
                send_telegram "⚠️ The Voice cannot reach your terminal."
                return 1
            fi
            ;;
        *)
            log "ERROR: Unknown worm path: $INJECT_METHOD"
            return 1
            ;;
    esac
}

# ─── Initialize Offset ────────────────────────────────────────

LAST_ID=0
if [[ -f "$LAST_ID_FILE" ]]; then
    LAST_ID=$(cat "$LAST_ID_FILE" 2>/dev/null || echo "0")
fi

if [[ "$LAST_ID" = "0" ]]; then
    INIT_RESPONSE=$(curl -s --connect-timeout 5 --max-time 10 \
        "${API_BASE}/getUpdates?offset=-1" 2>/dev/null || echo "")
    if command -v python3 >/dev/null 2>&1; then
        LAST_ID=$(echo "$INIT_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    updates = data.get('result', [])
    if updates:
        print(updates[-1].get('update_id', 0))
    else:
        print(0)
except Exception:
    print(0)
" 2>/dev/null || echo "0")
    fi
fi

CONSECUTIVE_ERRORS=0
MAX_BACKOFF=60

log "🪱 Sandworm awakened (worm path: $INJECT_METHOD, PID: $$)"

# Initialize Gom Jabbar
gom_jabbar_init

# ─── Main Loop ─────────────────────────────────────────────────

while true; do
    if [[ ! -f "$CHANNEL_FLAG" ]]; then
        log "Voice silenced. Shutting down."
        break
    fi

    RESPONSE=$(curl -s --connect-timeout 10 --max-time 40 \
        "${API_BASE}/getUpdates?offset=$((LAST_ID + 1))&timeout=30" 2>/dev/null || echo "")

    if [[ -z "$RESPONSE" ]]; then
        CONSECUTIVE_ERRORS=$((CONSECUTIVE_ERRORS + 1))
        if [[ $CONSECUTIVE_ERRORS -ge 3 ]]; then
            backoff=$((CONSECUTIVE_ERRORS * 5))
            [[ $backoff -gt $MAX_BACKOFF ]] && backoff=$MAX_BACKOFF
            log "WARNING: $CONSECUTIVE_ERRORS consecutive failures. Backing off ${backoff}s."
            sleep "$backoff"
        fi
        continue
    fi

    if echo "$RESPONSE" | grep -q '"ok":false'; then
        error_code=$(echo "$RESPONSE" | grep -o '"error_code":[0-9]*' | head -1 | sed 's/.*://')
        if [[ "$error_code" = "401" ]]; then
            log "FATAL: Bot token rejected (401). Re-run /thumper setup."
            break
        fi
        CONSECUTIVE_ERRORS=$((CONSECUTIVE_ERRORS + 1))
        log "ERROR: API error (code: ${error_code:-unknown})"
        continue
    fi

    CONSECUTIVE_ERRORS=0

    while IFS=$'\t' read -r update_id msg_id msg_chat_id text; do
        [[ -z "$update_id" ]] && continue
        [[ -z "$text" ]] && continue

        if [[ "$msg_chat_id" != "$CHAT_ID" ]]; then
            log "REJECTED: Unauthorized thumper beat (update $update_id)"
            advance_offset "$update_id"
            continue
        fi

        if [[ "$text" == /thumper* ]]; then
            log "SKIPPED: /thumper command (loop prevention)"
            advance_offset "$update_id"
            continue
        fi

        # ─── Gom Jabbar Gate ────────────────────────────────────
        auth_state=$(gom_jabbar_verify_active)

        case "$auth_state" in
            LOCKED)
                advance_offset "$update_id"
                continue
                ;;
            PENDING|CHALLENGE)
                # This message might be the passphrase — do NOT sanitize
                # (passphrase may intentionally contain special chars)
                if gom_jabbar_check "$text"; then
                    # Delete passphrase from chat — if deletion fails,
                    # gom_jabbar_delete_message invalidates the session (ADR-004).
                    # Only send success if deletion succeeded.
                    if gom_jabbar_delete_message "$msg_id"; then
                        if [[ "$auth_state" == "PENDING" ]]; then
                            send_telegram "$(printf '%s\n%s\n\n%s' \
                                '✅ Passphrase accepted.' \
                                'Your message has been deleted from this chat.' \
                                'The Voice carries. 🪱')"
                        else
                            send_telegram "✅ You are human. The Voice carries. 🪱"
                        fi
                    fi
                    # If delete failed, session was invalidated — no success msg
                else
                    gom_jabbar_delete_message "$msg_id"
                    gom_jabbar_fail
                fi
                # ADR-002: No message queuing during auth — drop, don't queue
                advance_offset "$update_id"
                continue
                ;;
            AUTHENTICATED)
                gom_jabbar_touch
                ;;
        esac

        # ─── Sanitize and validate ──────────────────────────────
        if [[ ${#text} -gt $MAX_MESSAGE_LENGTH ]]; then
            log "REJECTED: oversized thumper beat (${#text} chars, update $update_id)"
            advance_offset "$update_id"
            continue
        fi

        text=$(sanitize_text "$text")

        if [[ -z "$text" ]]; then
            log "SKIPPED: empty after sanitization (update $update_id)"
            advance_offset "$update_id"
            continue
        fi

        if [[ ! -f "$CHANNEL_FLAG" ]]; then
            break
        fi

        log "THUMPER BEAT received (update $update_id, ${#text} chars)"

        # Intercept /help — show command center instead of injecting into Claude
        if [[ "$text" == "/help" ]] || [[ "$text" == "/help@"* ]]; then
            log "COMMAND CENTER requested (update $update_id)"
            send_command_menu
            advance_offset "$update_id"
            continue
        fi

        if inject_text "$text"; then
            log "VOICE CARRIED via $INJECT_METHOD (update $update_id)"
            advance_offset "$update_id"
        else
            log "VOICE FAILED (update $update_id) — will retry"
            break
        fi

    done < <(parse_updates "$RESPONSE")

    # Process callback queries (inline keyboard button taps)
    while IFS=$'\t' read -r cb_update_id cb_id cb_msg_id cb_data; do
        [[ -z "$cb_update_id" ]] && continue
        [[ -z "$cb_data" ]] && continue
        handle_callback_query "$cb_id" "$cb_data" "$cb_msg_id"
        advance_offset "$cb_update_id"
    done < <(parse_callback_queries "$RESPONSE")
done
