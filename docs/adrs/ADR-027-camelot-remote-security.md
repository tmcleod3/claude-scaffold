# ADR-027: Camelot Remote — 5-Layer Security Architecture

## Status
Accepted

## Context
v6.5 exposes VoidForge over the internet. Behind the door: Anthropic API keys, AWS credentials, GitHub tokens, SSH access to production servers, and a live terminal. This is root access to the user's digital infrastructure over HTTPS. A single password is wildly insufficient.

## Decision

### Two-Password Architecture
Login password gets you into Camelot (dashboard, terminals). Vault password decrypts credentials. These are DIFFERENT passwords stored in DIFFERENT systems.
- Login: bcrypt hash in `~/.voidforge/auth.json`
- Vault: PBKDF2-derived AES-256-GCM key (existing vault.ts)
- Compromised session cannot read API keys, SSH into production, or deploy

### 5 Mandatory Security Layers
1. **Network** — Caddy HTTPS, optional IP allowlist, rate limiting
2. **Authentication** — Username + bcrypt password → TOTP 2FA → session token
3. **Vault** — Separate password, auto-lock 15 min, required for sensitive ops
4. **Sandboxing** — Non-root PTY user, resource limits, SSH proxy
5. **Audit** — Append-only JSON lines log, every action recorded

### Session Management
- Crypto-random tokens (32 bytes hex)
- In-memory Map only — never written to disk
- Single active session per user (new login invalidates old)
- 8-hour TTL, IP binding (configurable)
- HttpOnly + Secure + SameSite=Strict cookies

### TOTP 2FA
- RFC 6238 standard, 30-second rotation
- Secret stored encrypted in vault during initial setup
- Compatible with Google Authenticator, 1Password, Authy
- Mandatory in remote mode, optional in local mode

### Remote Mode Detection
`isRemoteMode()` returns true when server binds to `0.0.0.0` (via `--remote` flag). In remote mode, auth middleware wraps all routes. In local mode (`127.0.0.1`), auth is skipped (same threat model as Claude Code itself).

### Self-Deploy
New provisioner deploys VoidForge itself to a VPS: Node.js, Caddy, PM2, forge-user account, initial auth setup with QR code for TOTP.

## Alternatives Considered
1. **Caddy basic auth only** — Rejected. No 2FA, no session management, no vault separation.
2. **OAuth/OIDC** — Rejected. Adds external dependency, complex for single-user.
3. **Client certificates** — Rejected. Complex setup, poor mobile support.

## Consequences
- All routes gated by auth in remote mode — must exempt login/setup/static
- CORS must allow the remote domain (not just localhost)
- CSP must allow WSS for remote WebSocket connections
- PTY manager needs user-switching capability for forge-user
- Audit log must start before first request (initialized on server boot)
