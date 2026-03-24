# ADR-032: No Stubs Doctrine
## Status: Accepted
## Date: 2026-03-24

## Context
Pre-build assessment of VoidForge v16.1 found 77 `throw new Error('Implement...')` calls across 8 adapter files, a freeze endpoint returning fake `{ ok: true }`, an AWS validation format-only stub, and hollow heartbeat daemon handlers. All shipped between v11.0-v15.3 as if functional. The Cultivation Growth Engine was architecturally complete (13/28 files functional) but externally non-functional — every adapter threw on every method. This class of technical debt accumulated undetected because stubs pass tests (they throw, tests don't cover them) and look correct in code review (the interface shape is right).

## Decision
VoidForge will never ship stub code. Enforcement is codified in 8 method docs (CLAUDE.md, BUILD_PROTOCOL, CAMPAIGN, GAUNTLET, ARCHITECT, ASSESS, GROWTH_STRATEGIST, LESSONS). Specifically:
- No function that returns hardcoded success without side effects
- No method body containing `throw new Error('Implement...')`
- No handler that logs but performs no work
- If a feature can't be fully implemented: don't create the file. Document it in ROADMAP.md.
- Sandbox adapters returning realistic fake data ARE full implementations (not stubs)

## Implementation Scope
Fully implemented in v17.0.

## Consequences
**Enables:** Cultivation pipeline works end-to-end. Every file in the codebase does what it claims. `/assess` can trust that the existence of a file means the feature works.
**Prevents:** Rapid prototyping by shipping interface-only files. Teams that want to "sketch" an adapter shape before implementing must use a separate branch or design doc.
**Trade-off accepted:** 8 planned adapter files (Meta, Google, TikTok, LinkedIn, Twitter, Reddit, Mercury, Brex) were deleted. The features they represent are documented in ROADMAP.md v17.1+ with explicit "blocked by developer account" status. No code artifact exists until the implementation is real.

## Alternatives
1. **Keep stubs with "unimplemented" markers** — Rejected. Five versions of growth infrastructure were built on top of stubs. The markers were ignored.
2. **Mock adapters** — Rejected as ambiguous. "Mock" implies temporary. "Sandbox" is a full implementation for a sandbox environment.
3. **Feature flags** — Rejected as over-engineering. The adapter registry's `implemented: false` serves the same purpose without runtime complexity.
