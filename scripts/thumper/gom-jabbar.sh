#!/bin/bash
# gom-jabbar.sh — The Test of Humanity
# Authentication protocol for Chani's worm rider
# Sourced by relay.sh — not run standalone
#
# "Put your hand in the box."

GOM_JABBAR_FILE="$CONFIG_DIR/.gom-jabbar"
GOM_JABBAR_IDLE_TIMEOUT=3600    # 60 minutes
GOM_JABBAR_MAX_ATTEMPTS=3
GOM_JABBAR_LOCKOUT=300           # 5 minutes
GOM_JABBAR_DELETE_RETRIES=3

# ─── Hashing ───────────────────────────────────────────────────

_gom_jabbar_hash() {
    local passphrase="$1"
    # Salt derived from bot token hash — unique per bot installation
    local salt="gom-jabbar-$(printf '%s' "$BOT_TOKEN" | openssl dgst -sha256 -hex 2>/dev/null | awk '{print substr($NF,1,16)}')"

    local result=""
    if command -v python3 >/dev/null 2>&1; then
        # PBKDF2 with 100k iterations — brute-force resistant (ADR-003)
        result=$(python3 -c "
import hashlib, sys
h = hashlib.pbkdf2_hmac('sha256', sys.argv[1].encode(), sys.argv[2].encode(), 100000)
print(h.hex())
" "$passphrase" "$salt" 2>/dev/null || echo "")
    elif command -v openssl >/dev/null 2>&1; then
        # Fallback: HMAC-SHA256 (less brute-force resistant — warn user)
        log "WARNING: python3 unavailable — using HMAC-SHA256 (install python3 for stronger hashing)"
        result=$(printf '%s' "$passphrase" | openssl dgst -sha256 -hmac "$salt" -hex 2>/dev/null | awk '{print $NF}')
    fi

    # SECURITY: empty hash must never be accepted — prevents auth bypass
    if [[ -z "$result" ]]; then
        log "FATAL: Cannot compute passphrase hash. Install python3 or openssl."
        send_telegram "❌ Cannot secure The Voice — python3 or openssl required."
        echo "HASH_FAILED"
        return
    fi
    echo "$result"
}

# ─── State Management ─────────────────────────────────────────

_gom_jabbar_read_state() {
    if [[ -f "$GOM_JABBAR_FILE" ]]; then
        source "$GOM_JABBAR_FILE"
    else
        GJ_HASH=""
        GJ_LAST_ACTIVITY=0
        GJ_STATE="PENDING"
        GJ_FAILED=0
        GJ_LOCK_UNTIL=0
    fi
}

_gom_jabbar_write_state() {
    # Atomic write: tmp file then rename (prevents corruption on crash)
    (
        umask 077
        {
            printf 'GJ_HASH=%q\n' "${GJ_HASH:-}"
            printf 'GJ_LAST_ACTIVITY=%q\n' "${GJ_LAST_ACTIVITY:-0}"
            printf 'GJ_STATE=%q\n' "${GJ_STATE:-PENDING}"
            printf 'GJ_FAILED=%q\n' "${GJ_FAILED:-0}"
            printf 'GJ_LOCK_UNTIL=%q\n' "${GJ_LOCK_UNTIL:-0}"
        } > "${GOM_JABBAR_FILE}.tmp"
    )
    mv "${GOM_JABBAR_FILE}.tmp" "$GOM_JABBAR_FILE"
}

# ─── Protocol Functions ───────────────────────────────────────

gom_jabbar_init() {
    _gom_jabbar_read_state

    if [[ -z "$GJ_HASH" ]]; then
        # First time — The Choosing
        GJ_STATE="PENDING"
        _gom_jabbar_write_state
        send_telegram "$(printf '%s\n\n%s\n\n%s\n\n%s\n%s' \
            '🔮 THE GOM JABBAR' \
            'You seek to command The Voice across the desert. First, you must prove you are human.' \
            'Choose a passphrase — any word or phrase you will remember.' \
            'Type it now in this chat.' \
            'It will be deleted from the conversation immediately.')"
    fi
    # If hash exists, relay loop handles idle checks via gom_jabbar_verify_active
}

gom_jabbar_verify_active() {
    _gom_jabbar_read_state

    local now
    now=$(date +%s)

    # Check lockout
    if [[ "$GJ_STATE" == "LOCKED" ]]; then
        if [[ $now -lt ${GJ_LOCK_UNTIL:-0} ]]; then
            echo "LOCKED"
            return
        fi
        # Lockout expired — move to challenge
        GJ_STATE="CHALLENGE"
        GJ_FAILED=0
        _gom_jabbar_write_state
    fi

    # Pending (first time, awaiting passphrase)
    if [[ "$GJ_STATE" == "PENDING" ]]; then
        echo "PENDING"
        return
    fi

    # Already in challenge mode
    if [[ "$GJ_STATE" == "CHALLENGE" ]]; then
        echo "CHALLENGE"
        return
    fi

    # Authenticated — check idle timeout
    if [[ "$GJ_STATE" == "AUTHENTICATED" ]]; then
        local elapsed=$((now - ${GJ_LAST_ACTIVITY:-0}))
        if [[ $elapsed -gt $GOM_JABBAR_IDLE_TIMEOUT ]]; then
            GJ_STATE="CHALLENGE"
            _gom_jabbar_write_state
            send_telegram "$(printf '%s\n\n%s\n%s' \
                '⏳ Session idle for 60+ minutes. Re-authentication required.' \
                '' \
                'Type your passphrase to continue.')"
            echo "CHALLENGE"
            return
        fi
        echo "AUTHENTICATED"
        return
    fi

    echo "PENDING"
}

gom_jabbar_check() {
    local passphrase="$1"
    _gom_jabbar_read_state

    local hash
    hash=$(_gom_jabbar_hash "$passphrase")

    # Reject if hashing failed (prevents empty-hash-equals-empty-hash bypass)
    if [[ -z "$hash" ]] || [[ "$hash" == "HASH_FAILED" ]]; then
        return 1
    fi

    if [[ "$GJ_STATE" == "PENDING" ]] && [[ -z "$GJ_HASH" ]]; then
        # First time — store the hash (The Choosing)
        GJ_HASH="$hash"
        GJ_STATE="AUTHENTICATED"
        GJ_LAST_ACTIVITY=$(date +%s)
        GJ_FAILED=0
        _gom_jabbar_write_state
        return 0
    fi

    if [[ "$hash" == "$GJ_HASH" ]]; then
        # Correct passphrase
        GJ_STATE="AUTHENTICATED"
        GJ_LAST_ACTIVITY=$(date +%s)
        GJ_FAILED=0
        _gom_jabbar_write_state
        return 0
    fi

    return 1
}

gom_jabbar_fail() {
    _gom_jabbar_read_state

    GJ_FAILED=$((${GJ_FAILED:-0} + 1))

    if [[ $GJ_FAILED -ge $GOM_JABBAR_MAX_ATTEMPTS ]]; then
        local now
        now=$(date +%s)
        GJ_STATE="LOCKED"
        GJ_LOCK_UNTIL=$((now + GOM_JABBAR_LOCKOUT))
        _gom_jabbar_write_state
        local unlock_time
        unlock_time=$(date -u -r "$GJ_LOCK_UNTIL" +"%H:%M UTC" 2>/dev/null || \
                      date -u -d "@$GJ_LOCK_UNTIL" +"%H:%M UTC" 2>/dev/null || \
                      echo "soon")
        send_telegram "$(printf '%s\n\n%s' \
            '🔒 Too many failed attempts. Locked for 5 minutes.' \
            "Locked until ${unlock_time}.")"
        log "LOCKED: $GJ_FAILED failed attempts. Locked until $GJ_LOCK_UNTIL"
    else
        _gom_jabbar_write_state
        send_telegram "$(printf '%s' \
            "⚠️ Incorrect passphrase. (Attempt ${GJ_FAILED} of ${GOM_JABBAR_MAX_ATTEMPTS})")"
        log "AUTH FAILED: attempt $GJ_FAILED of $GOM_JABBAR_MAX_ATTEMPTS"
    fi
}

gom_jabbar_touch() {
    GJ_LAST_ACTIVITY=$(date +%s)
    _gom_jabbar_write_state
}

gom_jabbar_delete_message() {
    local msg_id="$1"
    local attempt
    for attempt in $(seq 1 $GOM_JABBAR_DELETE_RETRIES); do
        local result
        result=$(curl -s --connect-timeout 5 --max-time 10 \
            -X POST \
            -d chat_id="$CHAT_ID" \
            -d message_id="$msg_id" \
            "${API_BASE}/deleteMessage" 2>/dev/null || echo "")

        if echo "$result" | grep -q '"ok":true'; then
            log "Message $msg_id erased from the sands"
            return 0
        fi
        sleep 1
    done

    # Deletion failed — invalidate session for safety (ADR-004)
    log "SECURITY: Failed to delete message $msg_id. Invalidating session."
    GJ_STATE="PENDING"
    GJ_HASH=""
    _gom_jabbar_write_state
    send_telegram "$(printf '%s\n%s\n\n%s' \
        '⚠️ Could not erase your word from the sands.' \
        'For safety, the session is invalidated.' \
        'Choose a new word of passage.')"
    return 1
}

gom_jabbar_cleanup() {
    rm -f "$GOM_JABBAR_FILE"
}
