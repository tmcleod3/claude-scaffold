# VoidForge — Failure Mode Analysis

**Version:** 15.2.1
**Last reviewed:** 2026-03-23

## Summary

| Component | Worst Case | Mitigated? | Gap |
|-----------|-----------|-----------|-----|
| Vault | Corrupted file, all creds lost | Yes (atomic writes) | No automatic backup |
| AWS provisioning | Orphaned resources, user billed | Yes (manifest + cleanup) | — |
| Anthropic API | Truncated PRD accepted as complete | No | Need incomplete detection |
| Project creation | Partial scaffold left on disk | No | Need cleanup on failure |
| Network | All external calls fail | Yes (timeouts + clear errors) | — |
| WebSocket | Terminal connection fails | Yes (ws library + dual-stack) | — |
| PTY sessions | Stale sessions fill MAX_SESSIONS | Yes (auto-cleanup on <2s failure) | — |
| Tower vault lock | Server restart clears in-memory password | Yes (inline unlock form) | — |
| Thumper | Bot token invalid or webhook timeout | Partial (clear errors) | No auto-recovery |
| Native modules | npm install changes .node while server runs | Yes (mtime detection + restart banner) | — |
| Vault brute-force | Attacker guesses vault password | Yes (rate limit: 5/min, lockout after 10) | — |
| Vault idle exposure | Vault stays unlocked indefinitely | Yes (auto-lock after 15 min idle) | — |
| TOTP clock skew | System clock jump locks user out | Yes (prune usedCodes when drift > ±3 steps) | — |
| Deploy SSH failure | SSH deploy fails mid-transfer | Yes (rollback via release-directory pattern) | — |
| Danger Room WS | Dashboard WebSocket disconnects | Yes (reconnection with retry ceiling) | — |
| Financial vault | Separate encrypted vault for financial data | Yes (scrypt KDF, 12-char minimum) | — |
| Heartbeat daemon | Background daemon crashes or hangs | Partial (PID management, signal handling) | No auto-restart |
| Autonomy controller | Kill switch or circuit breaker state lost | Yes (atomic write + serialization) | — |
| Experiment data | A/B test results lost on crash | Yes (serialized queue + fsync) | — |
| SSH security group | SSH open to internet after provision | Yes (restricted to deployer IP post-provision) | Non-fatal fallback |

## Detailed Analysis

### Vault File

| Scenario | What Happens | Mitigation |
|----------|-------------|------------|
| Corruption mid-write | Atomic write prevents (temp → fsync → rename) | ADR-002 |
| Deleted by user | Treated as fresh vault; re-enter all credentials | By design |
| Wrong password | GCM auth tag fails decryption; returns "wrong password" | Crypto guarantee |
| Process crash during read | No side effects (read-only) | Safe |
| Disk full during write | Temp file fails; original vault untouched | Atomic pattern |

### AWS Provisioning

| Scenario | What Happens | Mitigation |
|----------|-------------|------------|
| Process crash mid-provision | Manifest on disk lists created resources | ADR-001 |
| API error after partial creation | Resources tracked up to failure; cleanup available | Manifest + cleanup endpoint |
| Client disconnects mid-stream | Server continues to completion; manifest updated | Crash recovery on next startup |
| Cleanup fails (API error) | Error returned to user; manifest preserved for retry | Manual retry or AWS console |
| Security group delete before instances | Retry loop with 10s intervals (SG dependency) | Implemented |

### Anthropic API (PRD Generation)

| Scenario | What Happens | Mitigation |
|----------|-------------|------------|
| Invalid API key | 401 returned, clear error message | Key validation on storage |
| Timeout (>120s) | Error shown to user | Configurable timeout |
| Stream truncated (network loss) | **Gap:** Partial PRD accepted without warning | Need incomplete detection |
| API rate limited | Error shown with API message | User retries |
| Model unavailable | Fallback to `claude-sonnet-4-7` | Dynamic model resolution |

### Project Creation

| Scenario | What Happens | Mitigation |
|----------|-------------|------------|
| Directory already exists (non-empty) | Validation rejects before creation | Pre-check |
| Disk full mid-copy | **Gap:** Partial directory left behind | Need cleanup |
| Permission denied | Error returned to user | Standard OS error |
| Git init fails | Warning logged; project created without git | Best-effort git |

### Network / External APIs

| Scenario | What Happens | Mitigation |
|----------|-------------|------------|
| No internet | All external calls fail with timeout | 10-15s timeouts, clear messages |
| Slow connection | SSE keepalive prevents proxy timeout | ADR-004 (15s heartbeat) |
| API changed response format | safeJsonParse + optional chaining | ADR-003 |
| Corporate proxy blocks SSE | Keepalive comment prevents idle timeout | ADR-004 |

### WebSocket / Terminal

| Scenario | What Happens | Mitigation |
|----------|-------------|------------|
| WebSocket upgrade fails | Clear error in Tower; fallback to shell tab | ws library handles handshake |
| IPv6 not supported | Dual-stack `::` binding falls back to IPv4 | Field report #30 |
| node-pty ABI mismatch (wrong Node version) | "posix_spawnp failed" or "Session ended" immediately | `engines` field in package.json (>=20 <25) |
| MAX_SESSIONS reached (5 local, 20 remote) | Disconnected sessions auto-reaped; if all active, clear error | Implemented in pty-manager |
| Session fails within 2s of creation | Tab auto-removed, retry once | Tower stale session cleanup (v7.6) |
| Native modules changed on disk | Restart banner in Lobby; restart endpoint | Mtime detection (v7.7) |

### Tower / Avengers Tower

| Scenario | What Happens | Mitigation |
|----------|-------------|------------|
| Server restart clears vault password | "Vault is locked" error; no terminal access | Inline vault unlock form in Tower |
| Stale JavaScript cached in browser | Old UI shown after update | `Cache-Control: no-cache` headers |
| Page reload during PTY session | Session persists server-side; tab can reconnect | Session persistence |
| Multiple users in remote mode | Session isolation; users can't see each other's terminals | Per-user PTY access checks |

### Thumper (Telegram Bridge)

| Scenario | What Happens | Mitigation |
|----------|-------------|------------|
| Bot token invalid | Clear error on startup | Token validation |
| Webhook timeout (>30s) | Telegram retries; bot shows pending | Partial — long operations may time out |
| Gom Jabbar expired (60min idle) | Re-authentication required | By design |
| Bot process dies | Must be manually restarted | No auto-recovery daemon |

### Server

| Scenario | What Happens | Mitigation |
|----------|-------------|------------|
| Port 3141 in use | Clear error message, suggests VOIDFORGE_PORT env var | Implemented |
| Unhandled route error | Try/catch returns 500 with error message | Top-level handler |
| Unhandled server error | Logged, 500 returned if headers not sent | Process-level handler |
| SIGINT/SIGTERM | Graceful shutdown: stop poller, kill PTY sessions, 2s timeout | Signal handlers |

## Recovery Procedures

### Orphaned AWS Resources

```bash
npx voidforge-build deploy
# Haku will show orphaned runs on step 1

# Or via API
curl http://localhost:3141/api/provision/incomplete
curl -X POST http://localhost:3141/api/provision/cleanup -d '{"runId":"<id>"}'
```

### Lost Vault Password

No recovery mechanism. User must:
1. Delete `~/.voidforge/vault.enc`
2. Re-enter all credentials through the wizard

### Corrupt Vault File

GCM auth tag will detect corruption. Same recovery as lost password.

### Stale Native Modules

If the restart banner appears in the Lobby:
1. Click "Restart Now" — server gracefully shuts down and restarts
2. Or manually: kill the VoidForge process and restart with `npx voidforge-build init`

## v11.0+ Subsystems (added post-v8.0)

### Vault Security (v15.1)

| Scenario | What Happens | Mitigation |
|----------|-------------|------------|
| Brute-force vault password | Attacker rapid-fires unlock attempts | Rate limit: 5/min per IP, 30-min lockout after 10 consecutive failures |
| Vault left unlocked overnight | Session password in memory indefinitely | Auto-lock after 15 minutes of no vault operations |
| Terminal HMAC key leaked | Attacker forges terminal auth tokens | Per-boot random 32-byte key — server restart invalidates all tokens |
| TOTP clock jumps forward then back | Used codes block future valid codes | Prune usedCodes when drift exceeds ±3 steps |

### Deploy Engine (v15.0)

| Scenario | What Happens | Mitigation |
|----------|-------------|------------|
| SSH deploy fails mid-rsync | Partial code on server | Release-directory pattern: atomic symlink swap, old release preserved |
| Health check fails after deploy | New code is broken | Auto-rollback: restore previous release symlink |
| SSH SG open to internet | Port 22 reachable globally | Post-provision IP restriction via checkip.amazonaws.com |

### Danger Room Dashboard (v10.0+)

| Scenario | What Happens | Mitigation |
|----------|-------------|------------|
| WebSocket disconnects | Dashboard shows stale data | Reconnection with exponential backoff, retry ceiling (2 min) |
| WebSocket never connects | Dashboard uses HTTP polling fallback | 3 polling tiers: 5s (fast), 10s (campaign), 60s (slow) |
| Agent activity file missing | No live feed in dashboard | Graceful empty state: "Run /campaign to see activity" |

### Financial Vault + Treasury (v11.0+)

| Scenario | What Happens | Mitigation |
|----------|-------------|------------|
| Financial vault corruption | Treasury data lost | Atomic write (scrypt + temp + fsync + rename) |
| Kill switch reset on crash | Autonomy controller loses safety state | Atomic write + serialization queue (LOKI-001 fix) |
| Spend exceeds budget | Platform charges beyond VoidForge cap | Platform daily cap set 10% below VoidForge hard stop |
| Ad platform token expires | Campaign pauses with no refresh | Token health monitoring + refresh at 80% TTL |

### Heartbeat Daemon (v11.1+)

| Scenario | What Happens | Mitigation |
|----------|-------------|------------|
| Daemon PID stale after crash | Second instance can't start | PID file checked + stale detection (checkStalePid) |
| SIGTERM during job execution | Job interrupted mid-operation | Signal handler: finish current job, then exit |
| Laptop sleep during daemon run | Scheduled jobs missed | Sleep/wake detection on resume |
