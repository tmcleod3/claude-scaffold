# ADR-013: Shared exec Utility for Child Process Operations

## Status: Accepted

## Context
v3.8.0 introduces two new patterns requiring child process execution:
1. `github.ts` needs `git init`, `git remote`, `git push`
2. `ssh-deploy.ts` needs `ssh` and `rsync` commands

All existing provisioners use only HTTP calls (or AWS SDK). There is no shared utility for child process execution with timeout, streaming, and abort signal support.

## Decision
Create `wizard/lib/exec.ts` — a thin wrapper around `child_process.execFile` providing:
- Explicit timeout (configurable, default 120s)
- `AbortSignal` integration for cancellation
- stdout/stderr capture and optional streaming via SSE emit callback
- Binary existence validation (`which git`, `which ssh`)
- No shell execution (use `execFile`, not `exec`) to prevent injection

## Consequences
- Single place to add logging, timeout handling, and signal integration
- Both `github.ts` and `ssh-deploy.ts` share the same execution model
- New dependency on local binaries (`git`, `ssh`, `rsync`) — validated at runtime
- No new npm dependencies

## Alternatives
1. **Inline execFile in each module:** Rejected — duplicates timeout/abort/streaming logic
2. **Use ssh2 npm package:** Rejected — adds dependency, VoidForge principle is zero external deps for core
3. **Use simple-git npm package:** Rejected — same reason
