# ADR-037: Graceful Tier Degradation for Full-Tier Commands

## Status: Accepted

## Context

Full-tier commands (`/cultivation`, `/grow`, `/dangerroom`, `/treasury`, `/portfolio`, `/current`) require `wizard/` which only exists on the `main` branch. When scaffold/core users run these commands, a tier gate checks for `wizard/` and offers to pull it from upstream.

Three problems were identified during a /review integration trace (2026-04-03):

1. **Phantom directory bypass:** The scaffold branch cleanup (commit 33109f6) removed 216 wizard files from git, but `.DS_Store` remnants leave an empty `wizard/` directory on disk. The tier gate checks `if wizard/ does not exist` — the empty directory passes this check, skipping the auto-pull offer and sending users into dead-end installation steps.

2. **No methodology-only fallback:** `/grow` Phases 1-3 (reconnaissance, SEO foundation, content) are pure methodology — no wizard code needed. But there's no messaging that tells scaffold users "these phases work, phases 4-6 require wizard infrastructure." Users hit silent walls at Phase 4.

3. **`--audit-only` scope too narrow:** The flag caps at Phases 1-2, but Phase 3 (content strategy, copy audit, blog drafts) is also pure methodology and should be included.

## Decision

### 1. Sentinel file check replaces directory check

All Full-tier command prerequisites change from:
```
If `wizard/` does not exist
```
To:
```
If `wizard/server.ts` does not exist
```

`wizard/server.ts` is the wizard's entry point — if it exists, the wizard is genuinely installed. An empty directory, stale `.DS_Store`, or partial checkout won't trigger a false positive.

### 2. Methodology-only mode for /grow

`/grow` gets explicit phase gating based on wizard availability:
- **Without wizard:** Phases 1-3 run normally. At Phase 3.5/4 boundary, display: "Phases 1-3 complete. Phases 4-6 require wizard infrastructure. Run `/cultivation install` to enable paid acquisition, autonomous monitoring, and Kongo integration."
- **With wizard:** All 6 phases run as designed.

This is not a new mode or flag — it's graceful degradation at the phase boundary.

### 3. --audit-only expands to Phases 1-3

The flag changes from "Phase 1 only" to "Phases 1-3" (reconnaissance + foundation + content). All three phases are pure methodology with no wizard dependency.

### 4. /cultivation install gets methodology-only steps

Steps that ARE pure methodology (strategy planning, platform research) proceed. Steps that require wizard modules display a clear message: "This step requires the wizard server. Skipping. Run the auto-pull to enable." The install doesn't fail — it completes what it can and reports what was skipped.

### 5. Phantom directory cleanup

Add `wizard/` to scaffold/core `.gitignore` (it's already not tracked, but this prevents future phantom directories). Clean up `.DS_Store` remnants.

## Consequences

**Enables:**
- Scaffold users get real value from /grow Phases 1-3 without pulling wizard
- Clear messaging about what works and what doesn't — no silent failures
- Tier gate is robust against empty directories, partial checkouts, stale files
- /cultivation install can be run as a "planning pass" on scaffold

**Trade-offs:**
- Slightly more complex command files (phase boundary check)
- --audit-only scope change is a behavior change for existing users (expands, doesn't remove)

**Prevents:**
- Users hitting dead ends without explanation
- False positive tier gate bypasses from phantom directories
- Scaffold users abandoning /grow because Phase 4 failed, never knowing Phases 1-3 delivered value

## Alternatives

1. **Block all Full-tier commands on scaffold entirely** — Rejected. Phases 1-3 of /grow are genuinely useful on scaffold. Blocking everything wastes that value.
2. **Auto-pull wizard silently (no prompt)** — Rejected. Pulling 216 files + npm install is a significant action. User must consent.
3. **Create a separate `/grow-lite` command** — Rejected. Splitting commands fragments the mental model. Graceful degradation within one command is simpler.
4. **Check for multiple sentinel files** — Rejected. `wizard/server.ts` is sufficient. If the server entry point exists, the wizard is installed. Over-checking adds complexity without value.
