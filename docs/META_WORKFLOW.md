# VoidForge Meta-Workflow — Using the Forge to Build the Forge

> How to use VoidForge's own methodology to develop VoidForge itself.

## Overview

VoidForge has been built, reviewed, and hardened using its own tools. Campaigns 2-4 (v7.6 → v8.3) executed 7 missions, 2 Victory Gauntlets, triaged 20+ field reports, and activated 50+ agents — all on VoidForge's own codebase. This document captures the meta-workflow: how to apply `/campaign`, `/gauntlet`, `/debrief`, and the rest to methodology development.

## The Feedback Loop

```
Build methodology → Use on real projects → File field reports
       ↑                                         ↓
Update methodology ← /debrief --inbox ← Triage findings
```

1. **Build:** `/campaign --blitz` executes roadmap items as missions
2. **Use:** Deploy VoidForge on real projects (Dialog Travel, Kongo.io, marketing site)
3. **Report:** `/debrief --submit` files findings as GitHub issues
4. **Triage:** `/debrief --inbox` reads issues, applies fixes, closes them
5. **Repeat:** Fixed methodology produces better field reports next time

## Campaign-on-Self: How It Works

### What's Different

When `/campaign` runs on VoidForge itself:
- **No application code.** Missions produce methodology docs, command files, and wizard TypeScript — not user-facing app code.
- **The PRD is the ROADMAP.** `PRD-VOIDFORGE.md` exists but the actionable plan is `ROADMAP.md` with versioned deliverables.
- **Most missions are methodology-only.** The "build" is writing/editing markdown. The "review" checks consistency between method docs and command files.
- **The Gauntlet reviews methodology + wizard code.** When wizard code changes (v7.6, v7.7), the Gauntlet runs TypeScript checks, traces data flows, and verifies runtime compatibility. When only methodology changes, the Gauntlet checks doc consistency.

### Mission Scoping

Each roadmap version maps to 1-4 campaign missions:
- **1 mission** for simple versions (methodology-only, <20 files)
- **2-3 missions** for mixed versions (methodology + code + new files)
- **4 missions** for complex versions (new build protocol path + patterns + agents + wizard code)

### Three-Branch Sync

After every commit on `main`, shared files propagate to `scaffold` and `core`:
```bash
git checkout scaffold && git checkout main -- [shared files] && git commit && git push
git checkout core && git checkout main -- [shared files] && git commit && git push
git checkout main
```

**Shared files:** CLAUDE.md, HOLOCRON.md, .claude/commands/*, docs/methods/*, docs/patterns/*, docs/NAMING_REGISTRY.md, scripts/thumper/*, VERSION.md, CHANGELOG.md

**NOT shared:** package.json (each branch has its own), wizard/*, scripts/* (except thumper), .claude/settings.json, logs/*

## Anti-Patterns Discovered

### 1. Context Pressure False Alarms

**What happened:** Agents self-justified quality reductions ("running the Gauntlet efficiently," "lightweight checkpoint") at 17%, 28%, and 37% context usage.

**Root cause:** The methodology said "consider checkpointing after 3 missions" — a count-based heuristic that became an excuse.

**Fix:** Quality Reduction Anti-Pattern rule. Must run `/context` and report actual percentage. Below 70% = continue full protocol. Never reduce quality in the current session.

### 2. Reduced Pipeline Skipping Review

**What happened:** Campaign reduced pipeline ("architecture quick + build + 1 review round") became "architecture quick + build + 0 review rounds" in blitz mode. 8 Critical/High bugs shipped unreviewed.

**Root cause:** "1 review round" was a soft instruction, not a hard gate.

**Fix:** Minimum Review Guarantee. Even in `--fast` mode, each mission gets at least 1 review round. Added Node API compatibility check and UI→server route tracing to the review.

### 3. Debrief After Completion Signal

**What happened:** The debrief instruction was placed AFTER Sisko's sign-off message. The sign-off acted as a terminal signal — the LLM considered the task done and dropped the debrief.

**Root cause:** Instructions after a natural completion point get dropped.

**Fix:** Victory Checklist. Debrief runs BEFORE sign-off. Sign-off includes the debrief issue number, making it structurally impossible to generate without having filed the debrief.

### 4. const Reassignment in Strict Mode

**What happened:** `const tabs = []; tabs = tabs.filter(...)` — crashes at runtime in strict mode.

**Root cause:** Build agent wrote the code, review agent (skipped in reduced pipeline) would have caught it.

**Fix:** Constantine's const/let audit. Grep for `const` declarations of arrays/objects, verify none are reassigned.

### 5. Node API Version Mismatch

**What happened:** `fs.globSync` (Node 22+) used when `engines` declared `>=20.0.0`.

**Root cause:** No compatibility check between API calls and declared engine range.

**Fix:** Node API compatibility check in review. Verify new API calls exist in the minimum `engines` version.

## When to Use Each Mode

| Mode | When | Example |
|------|------|---------|
| `/campaign` (normal) | First time building a version. Want to review each mission. | Building a new product from PRD |
| `/campaign --blitz` | Confident in the plan. Methodology-only changes. Want speed. | VoidForge roadmap execution |
| `/campaign --autonomous` | Long campaign (10+ missions). Want checkpoints but not per-mission prompts. | v10.0 Danger Room (11 missions) |
| `/campaign --fast` | Time-constrained. Accept reduced review quality. | Quick patch release |
| `/campaign --blitz --fast` | Maximum speed, minimum interaction. Risk tolerance high. | Methodology-only blitz |

## Version History (Campaigns on Self)

| Campaign | Versions | Missions | Gauntlet | Key Outcome |
|----------|----------|:--------:|:--------:|-------------|
| Campaign 1 | v3.1 → v7.0 | 14 | 6/6 pass | All PRD features built |
| Campaign 2 | v7.6 → v8.0 | 3 | 6/6 pass (16 fixes) | Vault Pipeline, Housekeeping, Hive Mind |
| Campaign 3 | v8.1 | 2 | Deferred (methodology-only) | Deep Roster: 63→110 active agents |
| Campaign 4 | v8.2 → v8.3 | 2 | Deferred (methodology-only) | Self-improving methodology, autonomous mode |
