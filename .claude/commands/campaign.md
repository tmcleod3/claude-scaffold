The Prophets have shown me the path. Time to execute the plan.

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

**Verdicts:**
- If assemble-state shows incomplete phases → run `/assemble --resume` first
- If build-state shows incomplete phases → resume `/build` first
- If uncommitted changes exist → ask: "Commit first, or continue?"
- If `/campaign --resume` was passed → resume from campaign-state's active mission
- If clear → proceed to Step 1

## Step 1 — Dax's Strategic Analysis

Read the PRD and diff against the codebase:

1. Read the PRD fully (`/PRD-VOIDFORGE.md` if it exists at root, otherwise `/docs/PRD.md`) — extract every feature, route, schema, integration
2. Scan the codebase — what exists? Routes, schema files, components, tests
3. Read PRD Section 16 (Launch Sequence) for user-defined phases
4. Read YAML frontmatter for skip flags (`auth: no`, `payments: none`, etc.)
5. Diff: what the PRD describes vs. what's implemented
6. Produce the ordered mission list — each mission is 1-3 PRD sections, scoped to be buildable in one `/assemble` run

**Priority cascade:**
1. Section 16 phases (if defined by user)
2. Dependency order: Auth → Core → Supporting → Integrations → Admin → Marketing
3. PRD section order as tiebreaker
4. Skip sections flagged as no/none in frontmatter

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
  Est. Phases: [Which /build phases apply]
═══════════════════════════════════════════
  Confirm? [Y/n/skip/override]
```

Wait for user confirmation before proceeding.

## Step 4 — Deploy Fury

On confirmation:
1. Run `/assemble` with the scoped mission description
2. If `$ARGUMENTS` includes `--fast`, pass `--fast` to assemble (skip Crossfire + Council)
3. Monitor context — if usage exceeds 70%, checkpoint and suggest `/campaign --resume`

## Step 5 — Debrief and Commit

After `/assemble` completes:
1. Run `/git` to commit and version the mission
2. Update `/logs/campaign-state.md` — mark mission complete, update stats
3. Check: are all PRD sections now implemented?
   - **No** → loop back to Step 1 (next mission)
   - **Yes** → Step 6

## Step 6 — Victory Condition

All PRD sections implemented:
1. Run `/assemble --skip-build` for one final full-project review
2. Report campaign summary: missions completed, total findings, total fixes
3. Sisko signs off: *"The Prophets' plan is fulfilled. The campaign is complete."*

## Arguments
- `--plan [description]` → planning mode: update PRD and/or ROADMAP.md with new ideas, don't build
- `--resume` → resume from campaign-state's active mission
- `--fast` → pass --fast to every /assemble call
- `--mission "Name"` → jump to a specific PRD section
- No arguments → start fresh or auto-detect state
