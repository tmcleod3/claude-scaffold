# Project Operational Learnings

Persistent knowledge from live operations. Things code reviews can't catch.
Updated: 2026-04-04 | Entries: 4/50

---

## API Behavior

### Kongo API covers all VoidForge integration needs without custom endpoints
The PRD assumed 6 new Kongo endpoints were needed (from-prd, bulk variants, batch-status, bandit lifecycle, growth-signal, 4 webhook events). None were needed. Existing endpoints handle everything: `POST /engine/pages` with `brief` field replaces from-prd, `POST /campaigns/:id/variants/generate` replaces bulk variants, campaign analytics + client-side z-test replaces growth-signal. Only `page.completed` and `page.failed` webhooks exist.

- **category:** api-behavior
- **verified:** 2026-04-01
- **scope:** wizard/lib/kongo/ (entire integration)
- **evidence:** Read actual API docs at kongo.io/docs/api. Compared against PRD-kongo-integration.md Section 6 endpoint table. All 6 "TO BUILD" endpoints had existing alternatives.
- **context:** User owns Kongo — API is malleable if custom endpoints are ever needed. But the current surface is sufficient for the full seed-to-conversion closed loop.

### Kongo uses API keys, not OAuth
Keys use `ke_live_` prefix, created at kongo.io/dashboard/api. No OAuth provider exists. API key management endpoints (`/api-keys`) require session auth (dashboard login), not API key auth. Webhook signing secrets are shown once at key creation and cannot be retrieved again.

- **category:** api-behavior
- **verified:** 2026-04-01
- **scope:** wizard/lib/kongo/provisioner.ts
- **evidence:** Read Kongo API docs "API Key Management" and "Authentication" sections. Confirmed `ke_live_` prefix in all example requests.
- **context:** PRD originally specified OAuth provisioning (ADR-036). Changed to manual API key entry during build. Provisioner validates prefix, verifies connection, stores in financial vault.

## Root Causes

### Statistical code passes tests but is mathematically wrong when tests validate buggy behavior
The growth signal z-test shipped with 3 Critical bugs: (1) control = worst variant instead of first by creation order, (2) normalCdf used as confidence instead of computing 1-pValue, (3) poll timeout 120s for 2-10 min generation. All tests passed because they asserted the buggy output. Only adversarial Gauntlet agents (Stark/Spock) caught the issues by reasoning about the math, not running tests.

- **category:** root-cause
- **verified:** 2026-04-01
- **scope:** wizard/lib/kongo/analytics.ts — computeGrowthSignal, twoProportionZTest
- **evidence:** Gauntlet R1 findings CODE-R1-001, CODE-R1-002, ARCH-R1-016. Fixed in commit dd00790.
- **context:** Statistical code needs review by an agent that understands the math, not just code quality. Tests are necessary but insufficient — a test that asserts `expect(brokenResult).toBe(brokenResult)` passes perfectly.

---

### Destructive git operations on multi-branch repos require branch verification
The v20.2 scaffold cleanup was correct in analysis (274 files should not be on scaffold) but wrong in execution — `git rm -r wizard/` ran on main instead of scaffold. No step verified `git branch --show-current` before deleting. The error went undetected for 10+ commits because subsequent work (/void, /debrief --inbox, /review) is methodology-only and never imports wizard modules. Caught only when the user asked to modify wizard/lib/kongo/seed.ts. Required full 272-file restoration from origin/main.

- **category:** root-cause
- **verified:** 2026-04-03
- **scope:** Multi-branch repos (main/scaffold/core) where branch-specific cleanup is needed
- **evidence:** Commit 33109f6 (scaffold cleanup on main), commit c88d532 (restoration). 10 commits between error and detection.
- **context:** Always run `git branch --show-current` before any destructive git operation. In multi-branch workflows, the working branch may not be the intended target. This is the git equivalent of "Verify Before Transact" for financial operations.

## Decisions

<!-- "We chose X over Y because Z" — prevents re-evaluation -->

## Environment Quirks

<!-- Platform, hosting, tooling behaviors specific to this project -->

## Vendor

<!-- Third-party service behaviors, gotchas, workarounds -->

## Workflow

<!-- Process discoveries, agent coordination patterns, build order dependencies -->

## Archived

<!-- Entries stale for 180+ days or no longer relevant. Kept for historical reference. -->
