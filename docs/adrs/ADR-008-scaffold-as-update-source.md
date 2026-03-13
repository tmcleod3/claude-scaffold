# ADR-008: Scaffold Branch as Update Source for /void

## Status: Accepted

## Context
The `/void` command needs a source of truth for the latest VoidForge methodology files. VoidForge ships on three branches: `main` (full wizard + provisioners), `scaffold` (methodology only), and `core` (ultra-light). When a project runs `/void`, it needs to know which branch to fetch updates from.

## Decision
Use the `scaffold` branch as the update source for all tiers.

Scaffold contains exactly the shared methodology files and nothing else — no wizard code, no provisioner TypeScript, no npm dependencies. This makes it the cleanest source for methodology-only updates regardless of which tier the user installed.

The command uses `git fetch <remote> scaffold` and `git show <remote>/scaffold:<path>` to extract individual files without merging or checking out the branch.

## Consequences

**Enables:**
- Clean file extraction — no filtering out wizard/provisioner code
- Works for all three tiers — main, scaffold, and core users all get methodology from the same source
- No npm/build step required — methodology files are plain text (Markdown, TypeScript patterns, JSON)

**Trade-offs:**
- Full-tier (`main`) users don't get wizard/provisioner updates via `/void` — they need `git pull` + `npm install` separately. This is intentional: wizard code is application code with dependencies, not methodology.
- Requires the scaffold branch to always be in sync with main's methodology files (enforced by existing branch sync rule in CLAUDE.md)

**Prevents:**
- Accidental injection of wizard code into scaffold/core-tier projects
- Dependency on npm/Node.js for core-tier users who may not have it installed

## Alternatives

1. **Use `main` branch as source** — Rejected. Would require filtering out wizard/, scripts/, package.json. More complex, more risk of leaking non-methodology files.
2. **Use GitHub API (REST) instead of git** — Rejected. Adds curl/network dependency, rate limiting concerns, and loses the benefit of git's delta transfer. Git is already available in any project that has VoidForge installed.
3. **Use git tags instead of branch** — Considered but deferred. Tags would allow pinning to specific versions, but the current semver comparison via VERSION.md achieves the same goal with less complexity. Could revisit if version pinning becomes a user need.
