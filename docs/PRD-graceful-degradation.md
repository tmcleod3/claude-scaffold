# PRD: Graceful Tier Degradation

---
version: "1.0"
status: approved
author: Picard (Architecture Review)
date: 2026-04-03
architecture: ADR-037
priority: high
---

## Problem

Scaffold/core users who run `/cultivation` or `/grow` hit silent dead ends because:
1. A phantom `wizard/` directory (empty, left by `.DS_Store`) bypasses the tier gate
2. No messaging tells users which phases work without wizard and which don't
3. `--audit-only` stops too early (Phase 1-2 only, but Phase 3 is also pure methodology)

The result: scaffold users think the growth commands are broken. They are not — Phases 1-3 deliver real value (SEO audit, analytics setup, content strategy, copy optimization) with zero wizard dependency. The problem is UX, not capability.

## Solution

### Requirement 1: Fix tier gate sentinel (all Full-tier commands)

**Files:** All 6 Full-tier command files in `.claude/commands/`:
- `cultivation.md`
- `grow.md`
- `dangerroom.md`
- `treasury.md`
- `portfolio.md`
- `current.md`

**Change:** Replace `If wizard/ does not exist` with `If wizard/server.ts does not exist` in the Prerequisites section of each command.

**Acceptance:** Empty `wizard/` directory on disk does NOT bypass the tier gate. Only the presence of actual wizard code (`wizard/server.ts`) passes the check.

### Requirement 2: /grow methodology-only fallback

**File:** `.claude/commands/grow.md`

**Change:** After Phase 3 completes, check for wizard availability before entering Phase 3.5/4. If wizard is not present:

```
═══════════════════════════════════════════
  GROWTH PHASES 1-3 COMPLETE
═══════════════════════════════════════════

  Reconnaissance, Foundation, and Content phases are done.
  Results saved to /logs/growth-*.md

  Phases 4-6 (Paid Acquisition, Compliance, Measure & Iterate)
  require the wizard server for:
  - Ad platform API integration
  - Financial vault and treasury
  - Heartbeat daemon for autonomous monitoring
  - Kongo landing page generation

  To enable: /cultivation install (pulls wizard from upstream)
  To review results so far: check /logs/growth-brief.md,
  /logs/growth-foundation.md, /logs/growth-content.md
═══════════════════════════════════════════
```

**Acceptance:** Scaffold user runs `/grow`, gets Phases 1-3 results, sees clear message about what's needed for Phases 4-6. No silent failures.

### Requirement 3: Expand --audit-only to Phases 1-3

**File:** `.claude/commands/grow.md`

**Change:** Update `--audit-only` from "Run Phase 1 (Reconnaissance) only" to "Run Phases 1-3 (Reconnaissance, Foundation, Content) — methodology-only growth audit without paid acquisition."

**Acceptance:** `--audit-only` completes Phase 3 content work before stopping.

### Requirement 4: /cultivation install graceful skip

**File:** `.claude/commands/cultivation.md`

**Change:** Each installation step that requires wizard modules should check for `wizard/server.ts` before executing. If absent, display:

```
Step N ([description]): Skipped — requires wizard server.
  To enable: answer Y to the wizard pull prompt, or run:
  git checkout origin/main -- wizard/ && npm install --prefix wizard
```

At the end, summarize what was installed vs skipped.

**Acceptance:** `/cultivation install` on scaffold doesn't fail. It completes what it can (strategy planning) and clearly reports what was skipped.

### Requirement 5: Phantom directory cleanup

**Files:** `.gitignore` (scaffold and core branches)

**Change:** Add `wizard/` to `.gitignore` on scaffold and core branches. Clean up `.DS_Store` remnants from `wizard/` and `wizard/lib/` on disk.

**Note:** This does NOT affect main branch where wizard/ is tracked.

**Acceptance:** `ls wizard/` on a fresh scaffold clone returns "No such file or directory."

### Requirement 6: Update GROWTH_STRATEGIST.md methodology doc

**File:** `docs/methods/GROWTH_STRATEGIST.md`

**Change:** Add a "Scaffold/Core Users" section documenting:
- Phases 1-3 work fully without wizard
- Phase 3.5 (Kongo) gracefully skips
- Phases 4-6 planning works, execution requires wizard
- How to pull wizard if they want full functionality

**Acceptance:** Method doc accurately describes the scaffold experience.

## Non-Goals

- No changes to wizard/ code itself
- No new commands or flags (except expanding --audit-only scope)
- No changes to how Full-tier commands work when wizard IS present
- No changes to /void sync behavior (already handled by Spring Cleaning migration)

## Test Plan

- [ ] Fresh scaffold clone: `wizard/` directory does not exist
- [ ] Run `/grow` on scaffold: Phases 1-3 complete, clear message at Phase 3.5/4 boundary
- [ ] Run `/grow --audit-only` on scaffold: Phases 1-3 complete (not just Phase 1)
- [ ] Run `/cultivation install` on scaffold without wizard pull: reports skipped steps clearly
- [ ] Create empty `wizard/` dir on scaffold: tier gate still fires (checks server.ts, not directory)
- [ ] Run `/grow` on main (wizard present): all 6 phases work unchanged
