# _paths.sh — Shared state-directory resolver for surfer-gate helpers (ADR-060).
#
# This file is sourced (not executed) by check.sh, record-roster.sh, bypass.sh.
# It exports the gate state directory per the ADR-060 fallback chain:
#
#   1. $XDG_RUNTIME_DIR/voidforge-gate/  — Linux tmpfs, per-user 0700 (systemd)
#   2. $HOME/.voidforge/gate/            — macOS + non-systemd Linux fallback
#   3. Unset — caller must fail-open per ADR-051 philosophy.
#
# Rationale: v23.8.17's /tmp-based state was vulnerable to multi-tenant
# pre-seed attacks (SEC-002). XDG_RUNTIME_DIR is per-user tmpfs; $HOME is
# per-user persistent. Neither is world-writable.
#
# SURFER_GATE_DIR  — root of all gate state
# SURFER_GATE_SESSIONS_DIR — per-session subdirs (sessions/<session_id>/)
# SURFER_GATE_POINTER_DIR  — repo-scoped pointer files (pointer-<hash>)

surfer_gate_resolve_state_dir() {
    if [ -n "${XDG_RUNTIME_DIR:-}" ] && [ -d "$XDG_RUNTIME_DIR" ] && [ -w "$XDG_RUNTIME_DIR" ]; then
        printf '%s/voidforge-gate' "$XDG_RUNTIME_DIR"
    elif [ -n "${HOME:-}" ] && [ -d "$HOME" ] && [ -w "$HOME" ]; then
        printf '%s/.voidforge/gate' "$HOME"
    else
        # Neither resolvable — caller fails open.
        printf ''
    fi
}

SURFER_GATE_DIR="$(surfer_gate_resolve_state_dir)"

if [ -n "$SURFER_GATE_DIR" ]; then
    # Create with 0700 perms to prevent co-tenant access even if umask is lax.
    mkdir -p "$SURFER_GATE_DIR" 2>/dev/null && chmod 0700 "$SURFER_GATE_DIR" 2>/dev/null || true
    SURFER_GATE_SESSIONS_DIR="$SURFER_GATE_DIR/sessions"
    SURFER_GATE_POINTER_DIR="$SURFER_GATE_DIR/pointers"
    mkdir -p "$SURFER_GATE_SESSIONS_DIR" "$SURFER_GATE_POINTER_DIR" 2>/dev/null || true
    chmod 0700 "$SURFER_GATE_SESSIONS_DIR" "$SURFER_GATE_POINTER_DIR" 2>/dev/null || true
else
    SURFER_GATE_SESSIONS_DIR=""
    SURFER_GATE_POINTER_DIR=""
fi

# Per-session directory for a given session_id.
surfer_gate_session_dir() {
    local sid="$1"
    [ -z "$SURFER_GATE_SESSIONS_DIR" ] && return 1
    [ -z "$sid" ] && return 1
    printf '%s/%s' "$SURFER_GATE_SESSIONS_DIR" "$sid"
}

# Repo-scoped pointer file for a given absolute repo path.
# Uses sha256 of normalized path (trailing slash stripped) as the key.
surfer_gate_pointer_file() {
    local repo_path="$1"
    [ -z "$SURFER_GATE_POINTER_DIR" ] && return 1
    [ -z "$repo_path" ] && return 1
    # Normalize: strip trailing slashes, resolve to absolute via `cd` if possible
    local normalized="${repo_path%/}"
    local hash
    hash="$(printf '%s' "$normalized" | shasum -a 256 2>/dev/null | cut -c1-12)"
    [ -z "$hash" ] && return 1
    printf '%s/pointer-%s' "$SURFER_GATE_POINTER_DIR" "$hash"
}

# Reap stale session dirs (mtime > 1 hour old). Called opportunistically by check.sh.
surfer_gate_reap_stale_sessions() {
    [ -z "$SURFER_GATE_SESSIONS_DIR" ] && return 0
    [ ! -d "$SURFER_GATE_SESSIONS_DIR" ] && return 0
    # find with -mmin requires -mindepth 1 on some platforms; use a conservative invocation
    find "$SURFER_GATE_SESSIONS_DIR" -maxdepth 1 -type d -mmin +60 -exec rm -rf {} + 2>/dev/null || true
}
