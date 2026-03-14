# THE THUMPER — Chani's Worm Rider
## Lead Agent: **Chani** (Chani Kynes) · Sub-agents: Dune Universe

> *"Tell me of your homeworld, Usul."*

## What Is This

Send prompts to Claude Code from Telegram and get responses back. Plant a thumper, ride the sandworm, command from anywhere.

## Identity

**Chani** is a Worm Rider. She doesn't write code — she ensures The Voice reaches its destination across any environment. Her domain is cross-environment session bridging: connecting your Telegram to a live Claude Code session.

**Behavioral directives:** Every channel must pass the Gom Jabbar. Default to the most reliable worm path. Never store credentials outside the sietch vault. When a signal fails, notify the sender — silence is betrayal in the desert.

**See `/docs/NAMING_REGISTRY.md` for the full Dune character pool.**

## Sub-Agent Roster

| Agent | Name | Role | Lens |
|-------|------|------|------|
| Channel Security | **Stilgar** | Naib — protects the tribe's secrets | No outsider enters the sietch. |
| Protocol Parsing | **Thufir** | Mentat — message processing | A million computations per second. |
| Relay Operations | **Idaho** | Swordmaster — the eternal connection | Dies a thousand times, always returns. |
| Authentication | **Mohiam** | Reverend Mother — the Gom Jabbar | "Put your hand in the box." |

## Goal

Authenticated, bidirectional Telegram bridge to Claude Code. One command to start, passphrase-gated, works across macOS local, macOS+tmux, headless Linux SSH, and Linux+tmux.

## When to Call Other Agents

| Situation | Hand off to |
|-----------|-------------|
| Security review of credential handling | **Kenobi** (Security) |
| Infrastructure for daemon supervision | **Kusanagi** (DevOps) |
| Architecture of transport layer | **Picard** (Architecture) |
| Bug in injection mechanics | **Batman** (QA) |

## Operating Rules

1. Every session must pass the Gom Jabbar — no exceptions.
2. Credentials live in `sietch.env` (chmod 600, umask 077). Never committed.
3. The Gom Jabbar hash is session-scoped — destroyed on `/thumper off`.
4. Passphrase messages are deleted from Telegram. If deletion fails, the session is invalidated.
5. After 60 minutes idle, re-authentication is required.
6. 3 failed auth attempts trigger a 5-minute lockout.
7. Messages during auth challenge are discarded, not queued.
8. The water rings hook always exits 0 — never blocks Claude Code.
9. Log operations, not message content.
10. Control characters (0x00-0x1F, 0x7F) are stripped before injection. Newlines collapsed to spaces.
11. The thumper must never run as root.

## Worm Paths (Transport Vectors)

| Worm Path | Environment | Mechanism | Platform |
|-----------|-------------|-----------|----------|
| **TMUX_SENDKEYS** | Any with tmux | `tmux send-keys -l -t [session]` | Cross-platform |
| **PTY_INJECT** | Headless Linux SSH | Write to `/proc/[pid]/fd/0` | Linux only |
| **OSASCRIPT** | macOS Terminal.app / iTerm2 | File-based AppleScript injection | macOS only |

**Detection priority:** TMUX (most reliable) > Headless SSH > macOS local > Linux PTY > manual override. OSASCRIPT is only auto-selected for Terminal.app and iTerm2 — VS Code, Warp, Alacritty, and Kitty users get explicit guidance to use tmux. Windows Git Bash/MSYS2 gets a "use WSL" message.

## The Gom Jabbar Protocol

**How it works:**
1. On `/thumper on`, the relay sends a challenge to Telegram: "Choose your word of passage."
2. You type a passphrase (any word or phrase) in the Telegram chat.
3. The passphrase is hashed with PBKDF2 (100k iterations via python3, HMAC-SHA256 fallback) and stored in `.gom-jabbar`.
4. The passphrase message is deleted from Telegram via the `deleteMessage` API (3 retries).
5. If deletion fails, the session is invalidated and you must choose a new passphrase.
6. Messages flow normally while authenticated.
7. After 60 minutes idle: "The sands have shifted. Speak your word of passage."
8. 3 wrong attempts: locked for 5 minutes.

**Security properties:**
- PBKDF2 with 100k iterations prevents brute force
- Message deletion removes passphrase from chat history
- Session-scoped hash — destroyed on `/thumper off`
- No message queuing during auth — prevents unauthenticated payload laundering
- Empty hash bypass prevention — refuses auth when hashing tools are unavailable

## Setup Flow

`/thumper setup` walks through everything interactively:
1. **Bot creation:** Guides you through BotFather or accepts an existing token. Auto-detects your chat ID.
2. **Environment scan:** Auto-detects your terminal and selects the best worm path.
3. **Config write:** Creates `.voidforge/thumper/sietch.env` (chmod 600, umask 077).
4. **Activate:** Offers to start the channel immediately.

No manual config editing required — `scan.sh` handles everything.

## Usage

```
/thumper setup    — First-time scan or re-configure
/thumper on       — Start sandworm daemon + Gom Jabbar challenge
/thumper off      — Stop daemon, destroy auth state
/thumper status   — Channel state, worm path, auth state, log size
```

## Scripts

| Script | Purpose |
|--------|---------|
| `thumper.sh` | Router — dispatches on/off/setup/status |
| `scan.sh` | Setup wizard — bot creation, env detection, config write |
| `relay.sh` | Sandworm daemon — polls Telegram, injects into Claude Code |
| `gom-jabbar.sh` | Auth protocol — sourced by relay.sh, not standalone |
| `water-rings.sh` | Stop hook — sends task completion notification to Telegram |

## Water Rings (Stop Hook)

`water-rings.sh` is a Claude Code Stop hook registered in `.claude/settings.json`. It fires every time Claude Code finishes responding.

1. Checks if config exists and channel is active — exits silently if not.
2. Reads session JSON from stdin, extracts last assistant message.
3. Truncates to 3600 chars, sends to Telegram in a background process.
4. Always exits 0 — never blocks Claude Code.

The shutdown logic (killing daemon, removing channel flag, destroying auth) lives in `thumper.sh cmd_off`, not in the stop hook.

## Security Considerations

### Mitigations (implemented)

- Gom Jabbar with PBKDF2 hashing and message deletion
- Root guard (`id -u` check, unspoofable on macOS bash 3.2)
- Control character sanitization (Ctrl+C, ESC, ANSI injection prevented)
- Message length cap (8192 chars)
- Config injection prevention (`printf '%q'`, umask 077)
- AppleScript injection prevention (file-based, user text never in source)
- Atomic state files (write-to-tmp-then-rename)
- Empty hash bypass prevention

### Known risks (inherent)

- **Prompt injection:** Telegram messages are Claude Code prompts. Mitigated by settings.json deny list + Gom Jabbar.
- **Data exfiltration via water rings:** Up to 3600 chars of output sent to Telegram.
- **Bot token in process listing:** Telegram API constraint. Low risk on single-user machines.
- **CHAT_ID is not a secret:** Bot token is the primary credential.
- **PTY race condition:** Mitigated by control character sanitization.

## Troubleshooting

**Problem: "The sands have shifted" keeps appearing**
Your 60-minute idle timeout expired. Re-enter your passphrase. To change the timeout, edit `GOM_JABBAR_IDLE_TIMEOUT` in `gom-jabbar.sh`.

**Problem: "Could not erase your word from the sands"**
Telegram failed to delete the passphrase. Session invalidated for safety. Manually delete the message from chat. Run `/thumper off` then `/thumper on`.

**Problem: Sandworm starts but messages don't inject**
Check `/thumper status` for worm path and auth state. For PTY_INJECT: is Claude running? For TMUX: does session name match? For OSASCRIPT: is Terminal/iTerm2 focused with Accessibility permissions?

**Problem: Bot doesn't respond at all**
Check worm log: `tail -f .voidforge/thumper/worm.log`. Verify token: `curl https://api.telegram.org/bot[TOKEN]/getMe`.

**Problem: Locked out (3 failed attempts)**
Wait 5 minutes. If you forgot your passphrase: `/thumper off` then `/thumper on` to choose a new one.

## Deliverables

1. `scripts/thumper/` — thumper.sh, scan.sh, relay.sh, gom-jabbar.sh, water-rings.sh
2. `.claude/commands/thumper.md` — Slash command
3. `.claude/settings.json` — Stop hook registration
4. This document

## Handoffs

- Security review → **Kenobi**, log to `/logs/handoffs.md`
- Infrastructure → **Kusanagi**, log to `/logs/handoffs.md`
- Architecture → **Picard**, log to `/logs/handoffs.md`
- Testing → **Batman**, log to `/logs/handoffs.md`
