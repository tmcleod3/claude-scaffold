#!/bin/bash
# thumper.sh — Main entrypoint for Chani's remote bridge
# The Bene Gesserit Voice — command through speech across the desert
# Routes commands to scan.sh (setup), relay.sh (sandworm daemon), and status

set -euo pipefail

# Security: refuse to run as root
if [[ "$(id -u)" -eq 0 ]]; then
    echo "❌ The Voice must not be wielded by the Emperor. Use a normal user account." >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONFIG_DIR="$PROJECT_ROOT/.voidforge/thumper"
CONFIG_FILE="$CONFIG_DIR/sietch.env"
CHANNEL_FLAG="$CONFIG_DIR/.thumper.active"
PID_FILE="$CONFIG_DIR/.worm.pid"
GOM_JABBAR_FILE="$CONFIG_DIR/.gom-jabbar"

usage() {
    cat <<'EOF'
🏜️ /thumper — Chani's Remote Bridge (The Voice)

Usage:
  /thumper setup    — First-time scan or re-configure
  /thumper on       — The Voice carries (open channel)
  /thumper off      — Silence in the desert (close channel)
  /thumper status   — Report channel state and worm path
EOF
}

ensure_config() {
    if [[ ! -f "$CONFIG_FILE" ]]; then
        echo "🏜️ No sietch vault found. Reading the sand..."
        bash "$SCRIPT_DIR/scan.sh"
    fi
}

is_worm_running() {
    if [[ -f "$PID_FILE" ]]; then
        local pid
        pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            return 0
        fi
    fi
    return 1
}

cmd_setup() {
    bash "$SCRIPT_DIR/scan.sh"
}

cmd_on() {
    ensure_config

    if [[ -f "$CHANNEL_FLAG" ]] && is_worm_running; then
        echo "🪱 The Voice already carries. Sandworm active."
        return 0
    fi

    # Clean up stale state
    rm -f "$CHANNEL_FLAG" "$PID_FILE" "$GOM_JABBAR_FILE"

    mkdir -p "$CONFIG_DIR"
    touch "$CHANNEL_FLAG"

    # Source config for display before starting daemon
    source "$CONFIG_FILE"

    # Start sandworm daemon (relay.sh writes its own PID file)
    nohup bash "$SCRIPT_DIR/relay.sh" >> "$CONFIG_DIR/worm.log" 2>&1 &

    # Brief pause for relay.sh to write its PID file
    sleep 1

    echo "🪱 The Voice carries. Sandworm active."
    echo "⚡ Worm path: $INJECT_METHOD"
    echo "🔮 The Gom Jabbar awaits in Telegram — prove you are human."
}

cmd_off() {
    rm -f "$CHANNEL_FLAG"

    if [[ -f "$PID_FILE" ]]; then
        local pid
        pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
            local i
            for i in 1 2 3; do
                kill -0 "$pid" 2>/dev/null || break
                sleep 1
            done
            kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
        fi
        rm -f "$PID_FILE"
    fi

    # Clean up Gom Jabbar state (passphrase hash is session-scoped)
    rm -f "$GOM_JABBAR_FILE"

    echo "🔇 Silence in the desert. Sandworm dormant."
}

cmd_status() {
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🏜️ Voice Status Report"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    if [[ ! -f "$CONFIG_FILE" ]]; then
        echo "Sietch:    ❌ No sietch vault found"
        echo "           Run /thumper setup to configure"
        return 0
    fi

    source "$CONFIG_FILE"
    echo "Sietch:    ✅ $CONFIG_FILE"
    echo "Worm path: $INJECT_METHOD"
    [[ -n "${TMUX_SESSION:-}" ]] && echo "Session:   $TMUX_SESSION"
    echo "Setup:     ${SETUP_DATE:-unknown}"

    if [[ -f "$CHANNEL_FLAG" ]]; then
        echo "Channel:   🟢 The Voice carries"
    else
        echo "Channel:   🔇 Silence in the desert"
    fi

    if [[ -f "$PID_FILE" ]]; then
        local pid
        pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            echo "Sandworm:  🪱 Running (PID $pid)"
        else
            echo "Sandworm:  ⚠️  Stale PID ($pid) — worm not running"
        fi
    else
        echo "Sandworm:  ⬚ No PID file"
    fi

    # Gom Jabbar state
    if [[ -f "$GOM_JABBAR_FILE" ]]; then
        source "$GOM_JABBAR_FILE"
        case "${GJ_STATE:-}" in
            AUTHENTICATED)
                local now elapsed
                now=$(date +%s)
                elapsed=$(( now - ${GJ_LAST_ACTIVITY:-0} ))
                local remaining=$(( 3600 - elapsed ))
                if [[ $remaining -gt 0 ]]; then
                    echo "Gom Jabbar: ✅ Authenticated (${remaining}s until re-test)"
                else
                    echo "Gom Jabbar: ⏳ Idle — re-test required"
                fi
                ;;
            PENDING)  echo "Gom Jabbar: 🔮 Awaiting word of passage" ;;
            CHALLENGE) echo "Gom Jabbar: 🔮 Re-test required" ;;
            LOCKED)   echo "Gom Jabbar: 💀 Locked (failed attempts)" ;;
            *)        echo "Gom Jabbar: ❓ Unknown state" ;;
        esac
    else
        echo "Gom Jabbar: ⬚ Not initialized"
    fi

    if [[ -f "$CONFIG_DIR/.last_thumper_id" ]]; then
        echo "Last beat: $(cat "$CONFIG_DIR/.last_thumper_id" 2>/dev/null || echo "unknown")"
    fi

    if [[ -f "$CONFIG_DIR/worm.log" ]]; then
        local log_size
        log_size=$(stat -f%z "$CONFIG_DIR/worm.log" 2>/dev/null || stat -c%s "$CONFIG_DIR/worm.log" 2>/dev/null || echo "?")
        if [[ "$log_size" =~ ^[0-9]+$ ]] && [[ "$log_size" -gt 1048576 ]]; then
            echo "Log:       ${log_size} bytes (⚠️ >1MB — rotates on next worm start)"
        elif [[ "$log_size" =~ ^[0-9]+$ ]]; then
            echo "Log:       ${log_size} bytes"
        fi
    fi

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

case "${1:-}" in
    setup)  cmd_setup ;;
    on)     cmd_on ;;
    off)    cmd_off ;;
    status) cmd_status ;;
    *)      usage ;;
esac
