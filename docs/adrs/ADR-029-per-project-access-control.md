# ADR-029: Per-Project Access Control

**Status:** Accepted
**Date:** 2026-03-15
**Context:** v7.0 "The Penthouse" — Mission 12

## Decision

Extend the project registry with ownership and per-project access lists. Every project has an owner (the creator) and an access list of `{ username, role }` entries. Global admins have implicit access to all projects.

### Architecture

**Project schema extension:** `owner: string` and `access: Array<{ username: string; role: UserRole }>` added to `Project` interface. Legacy projects without these fields are migrated: `owner` defaults to empty string (admin-visible only until claimed).

**Access resolution order:**
1. Global admin → full access to all projects
2. Project owner → full access to owned project
3. Access list entry → role-specific access (deployer/viewer)
4. No match → 404 (not 403, no enumeration)

**Filtered queries:** `GET /api/projects` returns only projects the user owns or has access to (admins see all). `GET /api/projects/get` returns 404 for projects the user can't access.

**PTY user tracking:** `createSession()` accepts optional `username` for audit trail. Sessions are tagged with who created them.

### Alternatives Considered

1. **Separate ACL file** — Rejected. Adding fields to the existing project registry is simpler and keeps all project data in one place.
2. **Permission matrix table** — Rejected. The three-role model (admin/deployer/viewer) is sufficient for the current scale.

### Security Invariants

- 404 not 403 on unauthorized project access (no enumeration)
- Owner can manage access but cannot escalate beyond their own global role
- Access grant/revoke operations are audited
- Terminal sessions track which user created them
