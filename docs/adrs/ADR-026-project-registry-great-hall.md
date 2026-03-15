# ADR-026: Project Registry and Great Hall Architecture

## Status
Accepted

## Context
v5.5 Camelot Local provides a single-project browser terminal. v6.0 extends this to multi-project operations with a dashboard ("The Great Hall"), project registry, and background health monitoring.

## Decision

### Project Registry
- Store project metadata in `~/.voidforge/projects.json` (JSON file, no database)
- File permissions: 0600 (owner read/write only), consistent with vault storage
- Registry populated automatically on project creation via Merlin, manually via import
- Each entry stores: id, name, directory, deployTarget, deployUrl, framework, database, createdAt, healthCheckUrl, monthlyCost, lastBuildPhase, lastDeployAt, sshHost, healthStatus, healthCheckedAt
- CRUD operations exposed through `wizard/lib/project-registry.ts` module

### Great Hall
- `hall.html` becomes the server landing page (root `/` serves hall instead of Merlin)
- Merlin remains accessible at `/index.html` directly and via "New Project" button
- Project cards show real-time health status, deploy info, and quick actions
- Navigation: Hall → Room (Camelot terminal) → Back to Hall

### Health Poller
- Background `setInterval` service started with server, stopped on graceful shutdown
- Non-blocking `fetch` with 5-second timeout per project
- Four health states: healthy (200), degraded (non-200 response), down (timeout/error), unchecked (no URL)
- Updates project registry with status and timestamp
- 5-minute polling interval — balances freshness vs. resource usage

### Import Flow
- New `POST /api/projects/import` endpoint reuses scan patterns from `wizard/api/deploy.ts`
- Same path validation (absolute path, no `..` segments)
- Same framework detection (package.json, requirements.txt, Gemfile)
- Validates: directory exists, contains CLAUDE.md, not already registered
- Reads PRD frontmatter, .env, and build-state for metadata

## Alternatives Considered
1. **SQLite for registry** — Rejected. Adds dependency, overkill for <100 projects. JSON file matches vault approach.
2. **Polling from client** — Rejected. Server-side poller keeps health data fresh even when browser is closed.
3. **Keep Merlin as landing** — Rejected. Multi-project dashboard is the primary view once 2+ projects exist.

## Consequences
- Server startup now initializes health poller (must stop on shutdown before killing PTYs)
- Root `/` behavior changes — returning users see Great Hall instead of Merlin wizard
- PTY manager sessions must be namespaced by project ID for multi-project support (already supported)
