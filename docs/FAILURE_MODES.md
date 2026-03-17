# VoidForge — Failure Mode Analysis

**Version:** 8.0.0
**Last reviewed:** 2026-03-16

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
| Model unavailable | Fallback to `claude-sonnet-4-6` | Dynamic model resolution |

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
npx voidforge deploy
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
2. Or manually: kill the VoidForge process and restart with `npx voidforge init`
