The Prophets have shown me the path. Time to execute the plan.

## Blitz Mode Check

**IMPORTANT: If `$ARGUMENTS` contains `--blitz`, this is BLITZ MODE.** In blitz mode:
- Do NOT ask for confirmation at mission briefs — proceed immediately
- Run full `/assemble` (do NOT imply `--fast` — blitz means autonomous, not reduced quality)
- Auto-continue to the next mission after each one completes
- Auto-debrief after each mission (`/debrief --submit`)
- Still run the Victory Gauntlet at Step 6 (non-negotiable)
- Still commit after each mission via `/git`
- Log mission briefs but do not wait for user input

**`--blitz` ≠ `--fast`.** Blitz skips human interaction. Fast skips review phases. They are independent flags and can be combined (`--blitz --fast`) if the user wants both.

**In blitz mode, make ALL decisions autonomously. Never ask the user a question. If uncertain, choose the option that preserves quality (e.g., run the Gauntlet, not skip it). The only human interaction in blitz mode is the final completion summary.**

**Blitz per-mission checklist** (verify ALL before continuing to next mission):
1. `/assemble` completed
2. `/git` committed
3. `/debrief --submit` filed (MANDATORY — not optional)
4. `campaign-state.md` updated with mission status + debrief issue number
5. Proceed to next mission

## Context Setup
1. Read `/logs/campaign-state.md` — if it exists, we're mid-campaign
2. Read `/docs/methods/CAMPAIGN.md` for operating rules
3. Read the PRD — check `/PRD-VOIDFORGE.md` first (VoidForge's own roadmap, root-level), fall back to `/docs/PRD.md` (user project PRD)

## Planning Mode (--plan)

If `$ARGUMENTS` contains `--plan`, skip execution and update the plan instead:

1. Read the current PRD (`/PRD-VOIDFORGE.md` or `/docs/PRD.md`) and `ROADMAP.md` (if it exists)
2. Parse what the user wants to add from `$ARGUMENTS` (everything after `--plan`)
3. **Dax analyzes** where it fits:
   - Is it a new feature? → Add to the PRD under the right section (Core Features, Integrations, etc.)
   - Is it a bug fix or improvement? → Add to ROADMAP.md under the appropriate version
   - Is it a new version-worth of work? → Create a new version section in ROADMAP.md
   - Does it change priorities? → Reorder the roadmap accordingly
4. **Odo checks** dependencies: does this new item depend on something not yet built? Flag it.
5. Present the proposed changes to the user for review before writing
6. On confirmation, write the updates to the PRD and/or ROADMAP.md
7. Do NOT start building — planning mode only updates the plan

After planning mode completes, the user can run `/campaign` (no flags) to start executing.

---

## Execution Mode (default)

## Step 0 — Kira's Operational Reconnaissance

Check for unfinished business:

1. Read `/logs/campaign-state.md` — campaign progress
2. Read `/logs/build-state.md` — in-progress builds
3. Read `/logs/assemble-state.md` — in-progress assemblies
4. Run `git status` — uncommitted changes
5. Check auto-memory for project context
6. Check for VoidForge vault: `~/.voidforge/vault.enc`
   - If vault exists → check provisioning state (`~/.voidforge/runs/*.json`)
   - If vault exists + not provisioned → flag: "Run `voidforge deploy` before continuing."
   - If vault exists + provisioned → verify `.env` is populated. If not, suggest re-running provisioner.
   - If no vault → proceed normally

**Verdicts:**
- If assemble-state shows incomplete phases → run `/assemble --resume` first
- If build-state shows incomplete phases → resume `/build` first
- If uncommitted changes exist → ask: "Commit first, or continue?"
- If `/campaign --resume` was passed → resume from campaign-state's active mission
- If campaign-state has unresolved BLOCKED items → present them: "These items from previous missions are still blocked: [list]. Resolve now, skip, or continue?"
- If vault exists but `.env` is sparse → offer: "The vault has credentials but infrastructure isn't provisioned. Run `voidforge deploy` now?" In `--blitz` mode: auto-run provisioner.
- If clear → proceed to Step 0.5

## Step 0.5 — Vault Auto-Inject

If vault exists and `.env` is sparse (missing keys that the vault has):
1. Run `voidforge deploy --env-only` to write vault credentials to `.env`
2. In `--blitz` mode: auto-run without confirmation
3. In normal mode: show what will be written, ask for confirmation
4. This runs BEFORE Dax's full analysis so the populated `.env` is visible

## Step 1 — Dax's Strategic Analysis

Read the PRD and diff against the codebase:

1. Read the PRD fully (`/PRD-VOIDFORGE.md` if it exists at root, otherwise `/docs/PRD.md`) — extract every feature, route, schema, integration
2. Scan the codebase — what exists? Routes, schema files, components, tests
3. Read PRD Section 16 (Launch Sequence) for user-defined phases
4. Read YAML frontmatter for skip flags (`auth: no`, `payments: none`, etc.)
5. **Classify every requirement by type:** Code (buildable), Asset (needs external generation — images, illustrations, OG cards), Copy (text accuracy), Infrastructure (DNS, env vars, dashboards)
6. Diff: what the PRD describes vs. what's implemented — **structural AND semantic** (not just "does the route exist?" but "does the component render what the PRD describes?")
7. Produce the ordered mission list — each mission is 1-3 PRD sections, scoped to be buildable in one `/assemble` run
8. **Pike challenges the ordering:** "Should we attempt a harder mission first while context is fresh?" Bold counterbalance to Dax's dependency-based ordering. If Pike's argument is stronger, reorder.
9. **Separately list BLOCKED items** — asset/infrastructure requirements that code can't satisfy

**Priority cascade:**
1. Section 16 phases (if defined by user)
2. Dependency order: Auth → Core → Supporting → Integrations → Admin → Marketing
3. Complexity-first: within a dependency tier, build the hardest features first (most integrations, most edge cases, most schema relationships). Hard things when energy is fresh, polish later.
4. PRD section order as tiebreaker when complexity is equal
5. Skip sections flagged as no/none in frontmatter
6. Asset/infrastructure requirements → flag as BLOCKED, don't include in code missions

## Step 2 — Odo's Prerequisite Check

For the next mission on the list:
- Are dependencies met? (e.g., Payments needs Auth)
- Are credentials needed? (e.g., Stripe key for payments)
- Are schema changes needed before building?
- Any blockers from previous missions?

Flag blockers. Suggest resolutions. If blocked, check the mission after.

## Step 3 — Sisko's Mission Brief

Present to the user:
```
═══════════════════════════════════════════
  MISSION BRIEF — [Mission Name]
═══════════════════════════════════════════
  Objective:  [What gets built]
  PRD Scope:  [Which sections]
  Prereqs:    [Met / Blocked]
  BLOCKED:    [Asset/infra items that won't be built — flag for user]
  Est. Phases: [Which /build phases apply]
═══════════════════════════════════════════
  Confirm? [Y/n/skip/override]
```

If `$ARGUMENTS` contains `--blitz`, skip confirmation and proceed immediately. Otherwise, wait for user confirmation before proceeding.

## Step 4 — Deploy Fury

On confirmation (or immediately in `--blitz` mode):
1. Run `/assemble` with the scoped mission description
   When running from within `/campaign`, use a reduced pipeline: architecture (quick) + build + 1 review round + security (if new endpoints). Defer UX, DevOps, QA, Test, Crossfire, and Council to the Victory Gauntlet. This keeps per-mission cost manageable across multi-mission campaigns.
2. If `$ARGUMENTS` includes `--fast`, pass `--fast` to assemble (skip Crossfire + Council). Note: `--blitz` does NOT imply `--fast`.
3. Monitor for context pressure symptoms (re-reading files, forgetting decisions). If noticed, ask user to run `/context` — only checkpoint if usage exceeds 70%.

## Step 4.5 — Gauntlet Checkpoint (Thanos)

After every 4th mission (missions 4, 8, 12, etc.), run a Gauntlet checkpoint before continuing:

1. **Count completed missions** in this campaign. If `completedMissions % 4 === 0`, trigger checkpoint.

**ENFORCEMENT:** After committing each mission, increment your mission counter. Check: if completedMissionsThisCampaign is divisible by 4, trigger the checkpoint. In blitz mode, this check is mandatory and automatic — do not skip or defer it. Log the count in campaign-state.md after each mission: "Missions completed: N. Next checkpoint at: N+X."

2. **Run `/gauntlet --quick`** (3 rounds: Discovery → First Strike → Second Strike). This catches cross-module integration bugs that individual `/assemble` runs miss — each `/assemble` only reviews its own changeset, but the Gauntlet reviews the **combined system**.
3. **Fix all Critical and High findings** before proceeding to the next mission.
4. **Commit fixes** via `/git` with message: `Gauntlet checkpoint after mission N: X fixes`
5. If `$ARGUMENTS` includes `--fast`, skip the checkpoint gauntlets (but NOT the final gauntlet in Step 6).

**Why every 4 missions:** Individual `/assemble` runs catch 95% of issues within their scope. The remaining 5% are cross-cutting: missing imports between modules, inconsistent auth enforcement across endpoints built in different missions, CORS/CSP gaps for new connection patterns. Catching these every 4 missions prevents compounding — a bug in mission 2 that affects mission 6 is caught at mission 4, not at the end.

## Step 5 — Debrief and Commit

After `/assemble` completes:
1. Run `/git` to commit and version the mission
2. Update `/logs/campaign-state.md` — mark mission complete, update stats. When updating, include the debrief issue number: "Debrief: #XX" or "Debrief: SKIPPED (not blitz)" or "Debrief: N/A (normal mode)".
3. **BLITZ GATE:** If `$ARGUMENTS` contains `--blitz`, run `/debrief --submit` NOW. Do not proceed to the next step until the debrief is filed. This is non-negotiable — blitz captures learnings while context is fresh. Log the debrief issue number in campaign-state.md.
   **Lightweight alternative:** ONLY if `/context` shows actual usage above 70% (~700k tokens), append a 3-line summary to `/logs/campaign-debriefs.md` instead (mission name, finding counts, key lesson). You MUST report the actual context percentage to justify this. "Context is heavy" without a number is not valid justification.
4. **Collect BLOCKED items** from this mission (assets, infrastructure, copy issues). For each:
   - If it's a future feature → append to `ROADMAP.md` under the appropriate version
   - If it's a missing asset the user must provide → add to a `## Blocked Items` section in campaign-state.md with what's needed and who can unblock it
   - If it's a PRD requirement that can't be satisfied by code → flag in the Prophecy Board as BLOCKED with the reason
5. Check: are all PRD requirements COMPLETE or BLOCKED?
   - **No** → loop back to Step 1 (next mission)
   - **Yes** → Step 6

**Context pressure check:** Do NOT checkpoint based on mission count. Check actual context usage via `/context`. Only checkpoint when usage exceeds 70% (~700k tokens). Never pause a blitz based on mission count alone.

## Step 6 — Victory Condition (Gauntlet + Troi's Compliance Check)

All PRD requirements are COMPLETE or explicitly BLOCKED:

1. **Run `/gauntlet` (full 5 rounds)** — mandatory final Gauntlet on the complete codebase. This is non-negotiable, even with `--fast`. The Gauntlet tests the combined system across all domains: architecture, code review, UX, security, QA, DevOps, adversarial crossfire, and council convergence. Individual `/assemble` runs review one mission at a time; the Gauntlet reviews everything together.
2. **Fix all Critical and High findings** from the Gauntlet.
3. **Troi reads the PRD section-by-section** (runs as part of the Gauntlet Council round) — verifies every prose claim against the implementation. Not just "does the route exist?" but "does the component render what the PRD describes?" Checks numeric claims, visual treatments, copy accuracy, asset gaps.
4. Fix code discrepancies. Flag asset requirements as BLOCKED.
5. Report: COMPLETE items, BLOCKED items (with reasons), deviations from PRD
6. Victory only if: Gauntlet Council signs off AND user acknowledges all BLOCKED items
7. Sisko signs off: *"The Prophets' plan is fulfilled. The campaign is complete."*

8. **Run `/debrief --submit`** — mandatory end-of-campaign post-mortem covering all missions together. Captures cross-cutting learnings that per-mission debriefs miss. In blitz mode, auto-submits per FIELD_MEDIC.md rule 2 exception. This is non-negotiable, like the Victory Gauntlet itself. (Field report #31)

**Victory ≠ "everything built." Victory = "everything buildable was built correctly, survived the Gauntlet, and everything unbuildable is explicitly acknowledged."**

## Arguments
- `--plan [description]` → planning mode: update PRD and/or ROADMAP.md with new ideas, don't build
- `--resume` → resume from campaign-state's active mission
- `--fast` → pass --fast to every /assemble call (skip Crossfire + Council per-mission). Minimum: 1 review round per mission even in --fast mode. Never 0.
- `--blitz` → full autonomous mode: skips mission confirmation prompts, auto-continues between missions, auto-debriefs after each mission. Does NOT imply `--fast` — full review quality is preserved. Combine with `--fast` explicitly if you want reduced reviews. Use when you want to walk away and come back to a built project.
- `--autonomous` → supervised autonomy: same as blitz PLUS `git tag` before each mission, critical-finding rollback, 5-mission human checkpoints. Safer for 10+ mission campaigns. See CAMPAIGN.md "Autonomous Mode" for full guardrails.
- `--continuous` → after Victory, auto-start the next roadmap version. Combinable: `--blitz --continuous` blitzes all remaining versions. Victory Gauntlet still runs between versions — it's the gate.
- `--mission "Name"` → jump to a specific PRD section
- No arguments → start fresh or auto-detect state

**VICTORY GAUNTLET IS NEVER SKIPPED.** Not for methodology-only campaigns. Not for "no code changes." The Gauntlet checks methodology consistency (cross-references, command↔doc sync, agent assignments, version drift) in addition to code. Five campaigns (v8.1-v9.2) shipped without Gauntlets — this is a protocol violation.
