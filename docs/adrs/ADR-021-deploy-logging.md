# ADR-021: Structured Deploy Logs

## Status: Accepted

## Context
After provisioning, deploy results vanish from the SSE stream. Users cannot look up past deploy URLs, resource IDs, or timestamps. Haku's Done screen is ephemeral.

## Decision
Persist every successful provision run to `~/.voidforge/deploys/<timestamp>-<target>.json`. Each log entry includes: runId, timestamp, target, projectName, deployUrl, resources created, and region. Integrate into provision.ts after the `complete` SSE event. Provide a GET endpoint `/api/deploys` to list history.

## Consequences
- Users can review past deploys without re-provisioning
- Deploy logs are local-only (not committed to repos)
- Logs grow unbounded — consider pruning in a future version
