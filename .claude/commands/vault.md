# /vault — Seldon's Time Vault

> *"I am Hari Seldon. The time I have is short, so I will not waste yours. What I have to say is important."*

Distill session intelligence into a portable, actionable briefing. The Time Vault preserves expensive analysis so the next session starts informed, not ignorant.

Read `/docs/methods/TIME_VAULT.md` for operating rules.

## Arguments

Parse the user's input for flags:

| Flag | Behavior |
|------|----------|
| (none) | Generate vault briefing + pickup prompt, then confirm |
| `--seal` | Auto-confirm, write without review |
| `--open` | Read and display the most recent vault file |
| `--list` | List all vault files with dates and summaries |
| `--for <target>` | Tailor the briefing for a specific audience: `campaign` (next campaign session), `colleague` (human handoff), `trigger` (Thumper/cron pickup) |

---

## Step 0 — Gather Persisted State (Gaal Dornick)

Gaal Dornick is the recorder. She gathers every source of persisted state before Seldon synthesizes.

**Read these files (skip any that don't exist):**

1. `/logs/build-state.md` — current build phase and progress
2. `/logs/campaign-state.md` — campaign prophecy board, mission status
3. `/docs/ROADMAP.md` — planned work, deferred items
4. `/docs/PRD.md` — frontmatter only (project identity, stack, deploy target)

**Run these commands:**

5. `git log --oneline -20` — recent commit history
6. `git diff --stat` — uncommitted changes
7. `git stash list` — stashed work

**Scan for session artifacts:**

8. Check `/logs/` for any phase logs modified today
9. Check `/logs/deep-current/` for situation model (if exists)
10. Check `/logs/deploy-state.md` for deploy status (if exists)

Log what was found and what was missing. Missing files are not errors — they indicate project maturity stage.

---

## Step 1 — Extract Session Intelligence (Seldon)

Seldon synthesizes. He includes what is **expensive to re-derive** and excludes what is **cheap to re-read**.

### Include (psychohistorical compression):

**Muster Findings** — Consolidated findings from any review agents that ran this session. Not the full finding tables — the actionable summary: what was found, what was fixed, what remains open.

**Decisions Made** — Architecture decisions, tradeoff resolutions, and "we chose X over Y because Z" moments. These are the most expensive items to re-derive because they require the full context that led to the decision.

**Failed Approaches** — What was tried and didn't work, with the specific reason it failed. Prevents the next session from re-attempting dead ends. Format: "Tried [approach]. Failed because [specific reason]. Instead, [what worked or what to try next]."

**Architecture Context** — Schema state, key relationships between modules, integration points, and any non-obvious wiring that a fresh session would need to trace through code to understand. Per-task file lists: which files were created/modified for each unit of work.

**Execution Plan** — What to do next. Ordered list of remaining work with dependencies noted. If a campaign is active, include the current mission status and what the next mission should be.

**Blocking Items** — Anything that prevents progress: missing credentials, unanswered PRD questions, external dependencies, known bugs without fixes.

**Test State** — Suite status (passing/failing), coverage gaps identified, any tests that were written but are currently skipped or failing.

### Exclude (cheap to re-read):

- Full file contents (the code is in git)
- Complete PRD text (it's in `/docs/PRD.md`)
- Method doc contents (they're in `/docs/methods/`)
- Pattern references (they're in `/docs/patterns/`)
- Agent rosters (they're in `/docs/NAMING_REGISTRY.md`)

---

## Step 1.5 — Operational Learnings Sync

Before sealing the vault, check for operational learnings from this session:

1. If `/debrief` ran and produced approved learnings → they're already in `docs/LEARNINGS.md`. Skip extraction. Note count in the vault's Open Items.
2. If no debrief ran, check the session for operational discoveries (API quirks, decision rationale, root causes that took multiple attempts). Flag candidates using the extraction criteria from FIELD_MEDIC.md Step 2.5.
3. Before writing, count `###` headings in `docs/LEARNINGS.md` (excluding `## Archived`). If >= 50, ask user to archive or promote before adding.
4. Before appending, grep the file for each candidate's title/description. Skip duplicates.
5. Present candidates to user for approval. Append approved entries to `docs/LEARNINGS.md` (created on first use).
6. Do NOT duplicate learnings content in the vault narrative — the vault references the file, not the entries.

See ADR-035 and `/docs/methods/TIME_VAULT.md` Section 7 for full protocol.

## Step 1.6 — Agent Definition Recommendations (ADR-045)

If the session produced findings that suggest agent behavioral changes:

1. Check if any session discovery maps to a specific agent (e.g., "Kenobi should check for X" → `kenobi-security.md`)
2. For each match, check if the agent's `## Operational Learnings` section already covers it
3. If not covered, add to the vault's **Open Items** as: "Agent update: `{agent-id}.md` — add `{learning}` to Operational Learnings"
4. These recommendations carry forward to the next session's /debrief or manual update

## Step 2 — Seal the Vault (Jake Sisko)

Jake Sisko writes the record. He produces two artifacts:

### Artifact 1: Vault File

Write to `/logs/vault-YYYY-MM-DD.md` (use today's date). If a vault file for today already exists, append a counter: `vault-YYYY-MM-DD-2.md`.

**Format:**

```markdown
---
sealed: YYYY-MM-DDTHH:MM:SSZ
project: [from PRD frontmatter or CLAUDE.md]
branch: [current git branch]
commit: [HEAD short hash]
session_focus: [1-line summary of what this session accomplished]
---

# Time Vault — [Date]

## Session Summary
[2-3 sentences: what was accomplished, what changed, what's next]

## Decisions
- [Decision]: [Rationale]

## Failed Approaches
- Tried [X]: [Why it failed]

## Architecture Context
[Key relationships, schema state, non-obvious wiring]

### Files Modified
[Per-task file lists]

## Open Items
- [ ] [Blocking item or remaining work]

## Test State
[Suite status, coverage notes]

## Next Session Plan
1. [First priority]
2. [Second priority]
3. [Third priority]
```

### Artifact 2: Pickup Prompt

Generate a pickup prompt that the next session can paste verbatim to recover context:

```
Read /logs/vault-YYYY-MM-DD.md for session context.
Then read /logs/build-state.md and /logs/campaign-state.md for operational state.
Resume from: [specific next action]
```

Print the pickup prompt to the console so the user can copy it.

---

## Step 3 — Confirm

If `--seal` was NOT passed:

1. Display the vault file contents
2. Display the pickup prompt
3. Ask: "Seal this vault? [Y/n]"
4. On confirm: write the file, print the pickup prompt one final time
5. On reject: ask what to change, revise, re-confirm

If `--seal` WAS passed:

1. Write the file immediately
2. Print the pickup prompt
3. Print: "Vault sealed. The Seldon Plan continues."

---

## `--open` Behavior

1. Find the most recent file matching `/logs/vault-*.md`
2. Read and display its full contents
3. Print the pickup prompt from that vault's metadata

## `--list` Behavior

1. List all `/logs/vault-*.md` files
2. For each: date, session_focus from frontmatter, commit hash
3. Print as a table

## `--for <target>` Tailoring

- **campaign**: Emphasize mission status, next objectives, PRD progress. Pickup prompt includes `/campaign --resume`.
- **colleague**: Write for a human reader. Include project context that an AI session wouldn't need. Expand abbreviations. Add a "Project Background" section.
- **trigger**: Minimal format optimized for automated pickup. No prose — structured data only. Pickup prompt is a single executable line.
