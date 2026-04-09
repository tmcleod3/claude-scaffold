Bashir examines the patient. Time to diagnose.

## Context Setup
1. Read `/docs/methods/FIELD_MEDIC.md` for operating rules
2. Read `/logs/build-state.md`, `/logs/assemble-state.md`, `/logs/campaign-state.md`
3. Read recent git history: `git log --oneline -20`

## Step 0 — Reconstruct the Timeline

**Ezri** `subagent_type: ezri-session-analyst` reads the session's history and reconstructs what happened:

1. Read all `/logs/` files — build state, assemble state, campaign state, phase logs
2. Read `git log` — all commits from this session/campaign
3. Read any error patterns — repeated fixes, reverted changes, multiple attempts
4. Produce a timeline: what was attempted, what succeeded, what failed, what required multiple attempts

If `$ARGUMENTS` contains `--campaign`, analyze the full campaign history.
If `$ARGUMENTS` contains `--session`, analyze just this session.
Default: auto-detect scope from available logs.

## Step 1 — Investigate Root Causes

**O'Brien** `subagent_type: obrien-root-cause` investigates. For each failure, difficulty, or retry identified by Ezri:

Classify the root cause:
- **Methodology gap** — missing step, wrong order, blind spot in the protocol
- **Tooling limitation** — can't run the app, can't generate assets, missing capability
- **Communication failure** — agent missed context, wrong file read, lost state
- **Scope issue** — too much in one mission, wrong grouping, mixed requirement types
- **Framework-specific** — React render loop, route collision, state management bug
- **External dependency** — needs credentials, needs user input, needs design assets

Map each root cause to the VoidForge component responsible (which command, which agent, which method doc).

## Step 2 — Propose Solutions

**Nog** `subagent_type: nog-solutions` proposes a fix for each root cause that works within VoidForge's existing framework:

- New agent? → name it from the correct universe, define the role
- New step in existing command? → specify where it goes in the sequence
- New checklist item? → specify which agent gets it
- New pattern? → write it with code examples
- Method doc update? → specify the file and section

**Agent definition check:** For each finding, if it references a specific agent by name or domain, check if the corresponding `.claude/agents/{agent-id}.md` should be updated. Propose adding the finding to the agent's `## Operational Learnings` section if it's a reusable operational rule (not a one-off fix). Agent definitions are update targets alongside method docs, commands, and patterns.

**Constraint:** All proposals must reference existing VoidForge concepts (agents, phases, commands, patterns, agent definitions). No solutions that require reimagining the system.

## Step 2.5 — Operational Learning Extraction

After root cause analysis (Step 1) and before writing the report (Step 3), check if any findings are project-scoped operational learnings — facts that matter in future sessions but don't belong in cross-project methodology. See FIELD_MEDIC.md Step 2.5 for full extraction criteria and entry format.

For each candidate, draft a structured entry (title, category, verified date, scope, evidence, context). Present to user: *"Bashir found [N] operational learnings worth preserving. Review and approve for LEARNINGS.md?"*

Approved entries written to `docs/LEARNINGS.md` (created on first use). Hard cap: 50 active entries.

## Step 2.5b — Promotion Analysis

After extraction, **Wong** `subagent_type: wong-documentation` checks `docs/LESSONS.md` for lesson clusters AND checks `docs/LEARNINGS.md` for promotable entries (appeared in 2+ projects):
- If 3+ lessons share the same category AND target the same method doc → Wong drafts a specific method doc update
- Present for user approval: "Wong recommends promoting these lessons into [method doc] [section]: [proposed text]. Approve?"
- If approved: apply the change, mark lessons as "Promoted to: [doc]" in LESSONS.md
- If submitting upstream (`--submit`): include the proposed change in the GitHub issue body

## Step 3 — Write the Report

**Jake** `subagent_type: jake-reporter` produces a structured post-mortem:

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

**When `--submit` is specified:** Present the full report, then proceed directly to Step 5 without re-asking "shall I submit?" The flag already signals intent — showing the report fulfills the review obligation, and the user can interrupt with `[edit]` if they spot an issue. Do NOT skip the report presentation step — the user must always see the full report before it goes out. The `--submit` flag enables auto-proceed, not auto-skip.

## Step 5 — Submit to Starfleet (GitHub Issue)

If user approves submission:
1. Check for `gh` CLI authentication or `github-token` in vault
2. **Always submit to `tmcleod3/voidforge`.** Field reports are methodology feedback — they belong upstream regardless of which project found the issue. Use `--repo tmcleod3/voidforge` explicitly.
3. Create issue on `tmcleod3/voidforge` with:
   - Title: `Field Report: [one-line summary]`
   - Label: `field-report`
   - Body: the full post-mortem markdown
4. Confirm: "Report filed — Starfleet will review. Issue #XX"

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

## Step 6 — Inbox Mode (--inbox)

If `$ARGUMENTS` contains `--inbox`, skip Steps 0-5 and triage incoming field reports instead:

1. **Detect the current repository** via `gh repo view --json nameWithOwner`. Inbox mode reads from the current repo — when triaging, you work on whatever project you're in.
2. Fetch open field reports: `gh issue list --repo [current-repo] --label field-report --state open --json number,title,body,createdAt`
3. If no open reports → "Bashir's inbox is empty. No field reports pending."
4. For each report:
   - Read the full body
   - Extract: severity, root causes, proposed fixes
   - Check which fixes are already shipped (grep the codebase for the proposed changes)
   - Summarize in one line
5. Present the inbox:
   ```
   ═══════════════════════════════════════════
     BASHIR'S INBOX — Field Reports
   ═══════════════════════════════════════════

     [count] open field reports.

     #N  [Title] — [severity]
         Key finding: [one-line summary]
         Status: [N already fixed / N remaining]

     [triage #N / triage all]
   ═══════════════════════════════════════════
   ```
6. When user selects an issue to triage:
   - Read the full issue body
   - For each proposed fix, classify as:
     - `accept` — valid finding, should be implemented
     - `already-fixed` — check the codebase, this was already addressed
     - `wontfix` — edge case, not worth the complexity
     - `needs-info` — can't evaluate without more context
   - For accepted fixes: list the specific file changes with line-level detail
   - Present triage results to user
   - On user approval:
     - Apply accepted fixes (modify method docs, commands, patterns)
     - Comment on the GitHub issue with triage results
     - Close the issue if fully addressed: `gh issue close <number> --comment "Triaged and resolved."`
7. After all issues processed, summarize: "Inbox cleared. [N] issues triaged, [N] fixes applied."

## Arguments
- No arguments → full debrief of current session
- `--submit` → generate, present for review, then submit as GitHub issue after user approval
- `--inbox` → read incoming field reports from GitHub, triage and apply fixes (upstream repo only)
- `--campaign` → analyze the full campaign (all missions)
- `--session` → analyze just this session
- `--dry-run` → generate report but don't submit
