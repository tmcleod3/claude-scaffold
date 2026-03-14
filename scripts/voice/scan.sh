#!/bin/bash
# scan.sh — Reading the sand — Chani's environment scanner
# Detects runtime environment, collects Telegram credentials, writes sietch vault

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONFIG_DIR="$PROJECT_ROOT/.voidforge/voice"
CONFIG_FILE="$CONFIG_DIR/sietch.env"

if ! command -v curl >/dev/null 2>&1; then
    echo "❌ curl is required but not found. Install curl and re-run."
    exit 1
fi

# ─── JSON Parsing Helper ──────────────────────────────────────

json_extract() {
    local json="$1" dotpath="$2"
    if command -v python3 >/dev/null 2>&1; then
        echo "$json" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    for key in sys.argv[1].split('.'):
        d = d[key] if isinstance(d, dict) else d[int(key)]
    print(d)
except Exception:
    pass
" "$dotpath" 2>/dev/null
    elif command -v jq >/dev/null 2>&1; then
        echo "$json" | jq -r ".$dotpath" 2>/dev/null
    else
        echo ""
    fi
}

# ─── Setup ─────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🏜️ Reading the Sand — Chani's Scanner"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [[ -f "$CONFIG_FILE" ]]; then
    echo "⚠️  Existing sietch vault found at $CONFIG_FILE"
    read -r -p "Overwrite? (yes/no): " OVERWRITE
    if [[ "$OVERWRITE" != "yes" ]]; then
        echo "Scan aborted. Sietch vault preserved."
        exit 0
    fi
fi

# ─── Step 1: Telegram Bot ─────────────────────────────────────

read -r -p "Do you have an existing Telegram bot? (yes/no): " HAS_BOT

if [[ "$HAS_BOT" != "yes" ]]; then
    echo ""
    echo "┌──────────────────────────────────────┐"
    echo "│  Summon Your Voice (Create a Bot)     │"
    echo "└──────────────────────────────────────┘"
    echo ""
    echo "  1. Open Telegram"
    echo "  2. Search for @BotFather and start a chat"
    echo "  3. Send the message: /newbot"
    echo "  4. Choose a name for your bot (display name)"
    echo "  5. Choose a username ending in 'bot' (e.g. mydev_bot)"
    echo "  6. BotFather will give you a token like: 123456:ABC-DEF..."
    echo "  7. Copy that token, then send ANY message to your new bot"
    echo "     (type \"hello\" — required before the bridge can find you)"
    echo ""
fi

read -r -p "Paste your bot token here: " BOT_TOKEN

if [[ -z "$BOT_TOKEN" ]]; then
    echo "❌ No token provided. Scan aborted."
    exit 1
fi

echo ""
echo "🔍 Validating your Voice..."
API_BASE="https://api.telegram.org/bot${BOT_TOKEN}"
VALIDATE=$(curl -s --connect-timeout 5 --max-time 10 "${API_BASE}/getMe" 2>/dev/null || echo "")

if echo "$VALIDATE" | grep -q '"ok":true'; then
    BOT_NAME=$(json_extract "$VALIDATE" "result.username" 2>/dev/null || echo "unknown")
    echo "✅ Voice validated: @${BOT_NAME}"
else
    echo "❌ Invalid bot token or Telegram unreachable."
    exit 1
fi

CHAT_ID=""
if [[ "$HAS_BOT" == "yes" ]]; then
    read -r -p "Do you know your chat ID? (yes/no): " KNOWS_CHAT_ID
    if [[ "$KNOWS_CHAT_ID" == "yes" ]]; then
        read -r -p "Enter your chat ID: " CHAT_ID
    fi
fi

if [[ -z "$CHAT_ID" ]]; then
    echo ""
    echo "🔍 Scanning for your presence in the desert..."

    auto_detect_chat_id() {
        local updates
        updates=$(curl -s --connect-timeout 5 --max-time 15 "${API_BASE}/getUpdates?limit=10" 2>/dev/null || echo "")
        if command -v python3 >/dev/null 2>&1; then
            echo "$updates" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if data.get('ok') and data.get('result'):
        for update in data['result']:
            msg = update.get('message', {})
            chat = msg.get('chat', {})
            if chat.get('type') == 'private':
                print(chat['id'])
                break
except Exception: pass
" 2>/dev/null
        elif command -v jq >/dev/null 2>&1; then
            echo "$updates" | jq -r '[.result[]? | select(.message.chat.type == "private")] | first | .message.chat.id // empty' 2>/dev/null
        else
            echo "$updates" | grep -o '"chat":{"id":[0-9]*' | head -1 | sed 's/.*://'
        fi
    }

    CHAT_ID=$(auto_detect_chat_id)

    if [[ -z "$CHAT_ID" ]]; then
        echo "   No presence detected. Send any message to your bot now."
        read -r -p "   Press Enter when done..." _
        sleep 2
        CHAT_ID=$(auto_detect_chat_id)
    fi

    if [[ -z "$CHAT_ID" ]]; then
        echo "   ⚠️  Auto-detection failed."
        read -r -p "   Enter your chat ID manually: " CHAT_ID
    fi

    if [[ -z "$CHAT_ID" ]]; then
        echo "❌ No chat ID provided. Scan aborted."
        exit 1
    fi
fi

echo "✅ Presence confirmed. Chat ID: $CHAT_ID"

# ─── Step 2: Environment Scan ─────────────────────────────────

echo ""
echo "🏜️ Reading the sand..."

INJECT_METHOD=""
TMUX_SESSION_NAME=""
ENV_LABEL=""

detect_environment() {
    # Priority 1: tmux (most reliable, cross-platform)
    if command -v tmux >/dev/null 2>&1 && [[ -n "${TMUX:-}" ]]; then
        INJECT_METHOD="TMUX_SENDKEYS"
        TMUX_SESSION_NAME=$(tmux display-message -p '#S' 2>/dev/null || echo "0")
        ENV_LABEL="TMUX session ($TMUX_SESSION_NAME)"
        return
    fi

    # Priority 2: Headless Linux SSH
    if [[ -z "${DISPLAY:-}" ]] && [[ -z "${WAYLAND_DISPLAY:-}" ]] && \
       [[ "$(tty 2>/dev/null || echo "")" == /dev/pts/* ]] && \
       [[ "${OSTYPE:-}" == linux* ]] && [[ -d "/proc" ]]; then
        INJECT_METHOD="PTY_INJECT"
        ENV_LABEL="Headless desert (SSH)"
        return
    fi

    # Priority 3: macOS with supported terminal (Terminal.app or iTerm2 only)
    if [[ "${OSTYPE:-}" == darwin* ]] && [[ -z "${SSH_CLIENT:-}" ]] && [[ -z "${SSH_TTY:-}" ]]; then
        local tp="${TERM_PROGRAM:-}"
        if [[ "$tp" == "Apple_Terminal" ]] || [[ "$tp" == "iTerm.app" ]] || [[ "$tp" == "iTerm2" ]]; then
            INJECT_METHOD="OSASCRIPT"
            ENV_LABEL="Local oasis ($tp)"
            return
        fi
        # macOS with unsupported terminal (VS Code, Warp, Alacritty, Kitty, etc.)
        if [[ -n "$tp" ]]; then
            INJECT_METHOD=""
            ENV_LABEL="macOS — $tp (OSASCRIPT not supported for this terminal)"
            echo ""
            echo "⚠️  Your terminal ($tp) is not supported by OSASCRIPT injection."
            echo "   OSASCRIPT only works with Terminal.app and iTerm2."
            echo ""
            echo "   Recommended: install tmux and run Claude Code inside a tmux session."
            echo "   Then re-run /voice setup — tmux will be auto-detected."
            echo ""
            # Don't return — fall through to manual selection
        fi
    fi

    # Priority 4: Linux with /proc
    if [[ "${OSTYPE:-}" == linux* ]] && [[ -d "/proc" ]]; then
        INJECT_METHOD="PTY_INJECT"
        ENV_LABEL="Linux desert"
        return
    fi

    # Priority 5: Windows (Git Bash, MSYS2, Cygwin) — not supported
    if [[ "${OSTYPE:-}" == msys* ]] || [[ "${OSTYPE:-}" == cygwin* ]]; then
        echo ""
        echo "⚠️  Windows native terminals (Git Bash, MSYS2) are not supported."
        echo "   The Voice requires a Unix PTY for message injection."
        echo ""
        echo "   Recommended: use WSL (Windows Subsystem for Linux) with tmux."
        echo "   Claude Code in WSL + tmux will be auto-detected."
        echo ""
    fi

    INJECT_METHOD=""
    ENV_LABEL="Unknown terrain"
}

detect_environment

if [[ -z "$INJECT_METHOD" ]]; then
    echo "⚠️  Cannot determine a viable worm path."
    echo ""
    echo "   Supported terrain:"
    echo "   1. Any platform with tmux         (TMUX_SENDKEYS)"
    echo "   2. Headless Linux over SSH         (PTY_INJECT)"
    echo "   3. macOS local terminal            (OSASCRIPT)"
    echo "   4. Linux with /proc filesystem     (PTY_INJECT)"
    echo ""
    read -r -p "   Select manually (1-4) or 'q' to abort: " MANUAL_CHOICE
    case "$MANUAL_CHOICE" in
        1) INJECT_METHOD="TMUX_SENDKEYS"; read -r -p "   tmux session name: " TMUX_SESSION_NAME ;;
        2|4) INJECT_METHOD="PTY_INJECT" ;;
        3) INJECT_METHOD="OSASCRIPT" ;;
        *) echo "Scan aborted."; exit 1 ;;
    esac
fi

echo "🔍 Terrain: $ENV_LABEL"
echo "⚡ Worm path: $INJECT_METHOD"

read -r -p "Does this look right? (yes/no): " CONFIRM_ENV

if [[ "$CONFIRM_ENV" != "yes" ]]; then
    echo ""
    echo "Select worm path:"
    echo "  1. TMUX_SENDKEYS — tmux send-keys (requires tmux)"
    echo "  2. PTY_INJECT    — Direct PTY write (Linux with /proc)"
    echo "  3. OSASCRIPT     — macOS keystroke injection"
    read -r -p "Choice (1-3): " MANUAL_CHOICE
    case "$MANUAL_CHOICE" in
        1) INJECT_METHOD="TMUX_SENDKEYS"; read -r -p "tmux session name: " TMUX_SESSION_NAME ;;
        2) INJECT_METHOD="PTY_INJECT" ;;
        3) INJECT_METHOD="OSASCRIPT" ;;
        *) echo "Invalid choice."; exit 1 ;;
    esac
fi

# ─── Step 3: Write Sietch Vault ────────────────────────────────

mkdir -p "$CONFIG_DIR"
chmod 700 "$CONFIG_DIR"

if [[ ! "$BOT_TOKEN" =~ ^[0-9]+:[A-Za-z0-9_-]+$ ]]; then
    echo "⚠️  Warning: Bot token format is unusual. Verify it's correct."
fi

(
    umask 077
    {
        echo "# Sietch vault — generated by Chani's scanner"
        echo "# WARNING: Contains credentials. Never commit this file."
        printf 'BOT_TOKEN=%q\n' "$BOT_TOKEN"
        printf 'CHAT_ID=%q\n' "$CHAT_ID"
        printf 'INJECT_METHOD=%q\n' "$INJECT_METHOD"
        printf 'TMUX_SESSION=%q\n' "${TMUX_SESSION_NAME:-}"
        printf 'TERM_PROGRAM=%q\n' "${TERM_PROGRAM:-}"
        printf 'SETUP_COMPLETE=%q\n' "true"
        printf 'SETUP_DATE=%q\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
        printf 'CONFIG_VERSION=%q\n' "1"
    } > "$CONFIG_FILE"
)
chmod 600 "$CONFIG_FILE"

# ─── Step 4: Summary ──────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🏜️ Sietch Vault Sealed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Bot token: ****...${BOT_TOKEN: -4}"
echo "  Chat ID:   $CHAT_ID"
echo "  Worm path: $INJECT_METHOD"
echo "  Vault:     $CONFIG_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

read -r -p "Speak The Voice now? (yes/no): " START_NOW

if [[ "$START_NOW" == "yes" ]]; then
    bash "$SCRIPT_DIR/voice.sh" on
else
    echo "Run /voice on when you're ready. The desert waits."
fi
