# ADR-012: GitHub Repos Not Tracked for Cleanup

## Status: Accepted

## Context
The provision manifest tracks all created resources for crash recovery and cleanup. v3.8.0 creates GitHub repos as part of the deploy flow. Should they be tracked for cleanup?

## Decision
GitHub repos are recorded in the manifest as `github-repo` resources with status `created` for **idempotency only** — the cleanup function explicitly skips them. Deleting a GitHub repository destroys commit history, issues, PRs, and wiki content irreversibly.

This matches the precedent set by domain registration (ADR-010): "domain registration is NOT tracked for cleanup — it's irreversible."

## Consequences
- After cleanup, the GitHub repo persists (user can delete manually if desired)
- Re-running provisioning detects existing repo and pushes to it instead of failing
- Manifest grows by one entry per run (negligible)

## Alternatives
1. **Track and delete on cleanup:** Rejected — too destructive, data loss risk
2. **Don't track at all:** Rejected — loses idempotency; re-run would fail trying to create existing repo
