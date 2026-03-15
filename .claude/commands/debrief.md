Bashir examines the patient. Time to diagnose.

## Context Setup
1. Read `/docs/methods/FIELD_MEDIC.md` for operating rules
2. Read `/logs/build-state.md`, `/logs/assemble-state.md`, `/logs/campaign-state.md`
3. Read recent git history: `git log --oneline -20`

## Step 0 — Reconstruct the Timeline (Ezri)

Ezri reads the session's history and reconstructs what happened:

1. Read all `/logs/` files — build state, assemble state, campaign state, phase logs
2. Read `git log` — all commits from this session/campaign
3. Read any error patterns — repeated fixes, reverted changes, multiple attempts
4. Produce a timeline: what was attempted, what succeeded, what failed, what required multiple attempts

If `$ARGUMENTS` contains `--campaign`, analyze the full campaign history.
If `$ARGUMENTS` contains `--session`, analyze just this session.
Default: auto-detect scope from available logs.

## Step 1 — Investigate Root Causes (O'Brien)

For each failure, difficulty, or retry identified by Ezri:

Classify the root cause:
- **Methodology gap** — missing step, wrong order, blind spot in the protocol
- **Tooling limitation** — can't run the app, can't generate assets, missing capability
- **Communication failure** — agent missed context, wrong file read, lost state
- **Scope issue** — too much in one mission, wrong grouping, mixed requirement types
- **Framework-specific** — React render loop, route collision, state management bug
- **External dependency** — needs credentials, needs user input, needs design assets

Map each root cause to the VoidForge component responsible (which command, which agent, which method doc).

## Step 2 — Propose Solutions (Nog)

For each root cause, Nog proposes a fix that works within VoidForge's existing framework:

- New agent? → name it from the correct universe, define the role
- New step in existing command? → specify where it goes in the sequence
- New checklist item? → specify which agent gets it
- New pattern? → write it with code examples
- Method doc update? → specify the file and section

**Constraint:** All proposals must reference existing VoidForge concepts (agents, phases, commands, patterns). No solutions that require reimagining the system.

## Step 3 — Write the Report (Jake)

Produce a structured post-mortem:

```markdown
# Field Report — [Project Name]
## Filed by: Bashir (Post-Mission Analysis)
## Date: YYYY-MM-DD
## Scope: [campaign / session / specific mission]

### What Happened
[Timeline from Ezri]

### What Went Wrong
[Root causes from O'Brien — categorized by type]

### Proposed Fixes
[Solutions from Nog — with specific file/agent/command references]

### Severity Assessment
- Methodology flaw (affects all users) vs. edge case (specific project)
- Frequency: will this happen often or was it unusual?
- Impact: minutes, hours, or days of rework?

### Files That Should Change in VoidForge
| File | Proposed Change | Priority |
|------|----------------|----------|
```

## Step 4 — User Review

Present the full report. The user can:
- `[submit]` → create GitHub issue on tmcleod3/voidforge (Step 5)
- `[save]` → save to `/logs/debrief-YYYY-MM-DD.md`
- `[edit]` → user modifies before submitting
- `[skip]` → discard

## Step 5 — Submit to Starfleet (GitHub Issue)

If user approves submission:
1. Check for `gh` CLI authentication or `github-token` in vault
2. Create issue on `tmcleod3/voidforge` with:
   - Title: `Field Report: [one-line summary]`
   - Label: `field-report`
   - Body: the full post-mortem markdown
3. Confirm: "Report filed — Starfleet will review. Issue #XX"

If `$ARGUMENTS` contains `--dry-run`, generate report but skip submission.

## Privacy

The submitted report contains:
- Session timeline (what commands ran, what findings emerged)
- Root cause analysis (methodology gaps identified)
- Proposed solutions (specific VoidForge changes)

It does NOT contain:
- Source code from the user's project
- Credentials, API keys, or secrets
- File contents (only file names if relevant to the methodology issue)
- Personal information

The user reviews and approves every word before submission.

## Arguments
- No arguments → full debrief of current session
- `--submit` → generate, present for review, then submit as GitHub issue after user approval
- `--campaign` → analyze the full campaign (all missions)
- `--session` → analyze just this session
- `--dry-run` → generate report but don't submit
