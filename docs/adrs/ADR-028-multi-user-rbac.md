# ADR-028: Multi-User RBAC for Avengers Tower

**Status:** Accepted
**Date:** 2026-03-15
**Context:** v7.0 "The Penthouse" — Mission 11

## Decision

Extend Avengers Tower from single-admin to multi-user with role-based access control (RBAC).

### Architecture

**Three roles:** `admin` (full access), `deployer` (build/deploy assigned projects), `viewer` (read-only dashboards).

**User storage:** `~/.voidforge/users.json` (file permissions 0600, serialized writes). Separate from `auth.json` which remains the auth credential store. Users are referenced by username (unique, immutable after creation).

**Invitation flow (not self-registration):**
1. Admin creates invite → gets a one-time invite token
2. New user opens `/invite.html?token=<token>` → sets password + TOTP
3. Token is consumed, user is active

Why invitations, not self-registration: Avengers Tower controls cloud infrastructure, SSH keys, API secrets. Open registration is a non-starter. The admin explicitly decides who gets access.

**Session extension:** The `Session` interface gains a `role` field. `validateSession()` returns `{ username, role }` instead of just `username`. All downstream code receives user context.

**Request context propagation:** Server middleware extracts `{ username, role }` from the validated session and passes it through to API handlers. Handlers that need role checks call `requireRole()` which returns 404 (not 403) on unauthorized — no information leakage about resource existence.

**Audit enrichment:** All audit calls populate the `user` field from the request context. New event types: `user_create`, `user_remove`, `role_change`, `invite_create`, `invite_complete`, `access_denied`.

### Alternatives Considered

1. **JWT tokens with role claims** — Rejected. In-memory sessions are simpler, revocable immediately, and the server is stateful anyway (PTY processes). JWTs add complexity (signing keys, refresh flow) with no benefit for a single-server architecture.

2. **Database-backed users** — Rejected. VoidForge's zero-dependency philosophy. JSON file with serialized writes is sufficient for the expected user count (< 50 per instance).

3. **Fine-grained permissions (ABAC)** — Deferred. Three roles cover the v7.0 use cases. Per-project ACLs come in Mission 12 as a layer on top of roles.

### File Changes

| File | Change |
|------|--------|
| `wizard/lib/user-manager.ts` | NEW — user CRUD, roles, invitations |
| `wizard/api/users.ts` | NEW — user management endpoints |
| `wizard/lib/tower-auth.ts` | Extend — multi-user sessions, role in Session |
| `wizard/server.ts` | Extend — user context propagation, role middleware |
| `wizard/api/auth.ts` | Extend — invite completion, role in session response |
| `wizard/lib/audit-log.ts` | Extend — new event types |
| `wizard/ui/login.html` | Extend — invite completion UI |

### Security Invariants

- Admin role required for user management + vault unlock
- No self-registration (invitation-only)
- 404 not 403 on unauthorized resource access (no enumeration)
- Timing-safe username comparison (inherited from v6.5)
- Invite tokens: cryptographically random, single-use, 24h expiry
- Password requirements: minimum 12 chars (inherited from v6.5)
- TOTP mandatory for all users in remote mode (inherited from v6.5)
