Avengers, assemble. Full pipeline from architecture to launch — one command to rule them all.

## Context Setup
1. Read `/logs/assemble-state.md` — if it exists, resume from the last completed phase
2. If no assemble state exists, start fresh from Phase 1
3. Read `/docs/methods/ASSEMBLER.md` for operating rules

## Phase 1 — Architecture (Picard has the conn)
**Fury:** "Picard, you're up. Review the architecture before we build anything."

Run the full `/architect` protocol. If `$ARGUMENTS` includes `--skip-arch`, skip this phase.

**Gate:** ADRs written, no critical architectural concerns. Log to `/logs/assemble-state.md`.

## Phase 2 — Build (All hands on deck)
**Fury:** "Stark, Galadriel, Kusanagi — build it. The full protocol."

Run the full `/build` protocol (all 13 phases). If `$ARGUMENTS` includes `--skip-build`, skip this phase (for re-running the review pipeline on existing code).

**Gate:** All build phase gates pass, test suite green. Update assemble-state.

## Phase 3 — Review Round 1 (Spock + Seven + Data)
**Fury:** "Picard's team — first pass. Find everything."

Run `/review`. Fix all Must Fix and Should Fix items. Log findings count.

## Phase 4 — Review Round 2 (Re-verify)
**Fury:** "Again. Verify the fixes didn't break anything."

Run `/review` on all files modified in Phase 3. Fix any new issues.

## Phase 5 — Review Round 3 (Final clean pass)
**Fury:** "Last pass. I want zero Must Fix items."

Run `/review`. If any Must Fix items remain, fix them.

**Gate:** Zero Must Fix items. Update assemble-state.

## Phase 6 — UX Pass (Galadriel leads)
**Fury:** "Galadriel — the user doesn't care how clean the code is if the product is confusing."

Run the full `/ux` protocol. Skip if PRD frontmatter `type: api-only`.

**Gate:** Zero critical UX/a11y findings. Update assemble-state.

## Phase 7 — Security Round 1 (Kenobi leads)
**Fury:** "Kenobi, find what they missed. Think like the enemy."

Run the full `/security` protocol (Phases 1-3: parallel scans, sequential audits, remediation).

## Phase 8 — Security Round 2 (Maul re-probes)
**Fury:** "Maul — attack every fix. I want proof they hold."

Run `/security` Phase 4 only (Maul's re-verification). If new issues found, fix and re-verify.

**Gate:** Zero Critical or High security findings. Update assemble-state.

## Phase 9 — Infrastructure (Kusanagi leads)
**Fury:** "Kusanagi — make it deployable. Scripts, monitoring, backups."

Run the full `/devops` protocol.

**Gate:** Deploy scripts work, monitoring configured, post-deploy smoke tests defined. Update assemble-state.

## Phase 10 — QA (Batman leads)
**Fury:** "Batman — break everything. I want zero surprises in production."

Run the full `/qa` protocol (including Step 2.5 smoke tests).

**Gate:** All critical/high bugs fixed, regression checklist complete. Update assemble-state.

## Phase 11 — Test Suite (Batman writes)
**Fury:** "Now make it permanent. Every bug we found becomes a test."

Run the full `/test` protocol. Write missing unit tests, integration tests, and cross-module tests.

**Gate:** Test suite green, coverage acceptable. Update assemble-state.

## Phase 12 — The Crossfire (Multiverse challenge)
**Fury:** "Now the real test. Everyone attacks everyone else's work."

Use the Agent tool to run these in parallel — all are adversarial, read-only analysis:

- **Maul** (Star Wars) — attacks code that passed /review. Looks for exploits in "clean" code.
- **Deathstroke** (DC) — probes endpoints that /security hardened. Tests if remediations can be bypassed.
- **Loki** (Marvel) — chaos-tests features that /qa cleared. Finds what breaks under unexpected conditions.
- **Constantine** (DC) — hunts cursed code in FIXED areas specifically. Code that works by accident.

Synthesize findings. Fix all Must Fix items. If any fixes were applied, re-run the four agents on the fixed areas only.

**Gate:** All four adversarial agents sign off. Update assemble-state.

## Phase 13 — The Council (Convergence)
**Fury:** "Last call. One agent from each domain — verify nobody broke anyone else's work."

Use the Agent tool to run these in parallel:

- **Spock** (Star Trek) — Did any security/QA/UX fix break code patterns or quality?
- **Ahsoka** (Star Wars) — Did any review/QA fix introduce access control gaps?
- **Nightwing** (DC) — Did any fix cause a regression? Run the full test suite.
- **Samwise** (Tolkien) — Did any fix break accessibility?

If the Council finds issues:
1. Fix them
2. Re-run the Council (max 3 iterations)
3. If not converged after 3 rounds, present remaining findings to the user

**Gate:** All four Council members sign off. Zero cross-domain regressions. Update assemble-state.

## Completion
**Fury:** "The Initiative is complete."

Write final summary to `/logs/assemble-state.md`:
- Total phases completed
- Total findings across all passes (review + security + QA + crossfire + council)
- Total fixes applied
- Final test suite status
- Time span (first phase start → last phase end)

Present the summary to the user.

## Operating Rules
- Update `/logs/assemble-state.md` after EVERY phase completion
- If context gets heavy (50+ files read, 100+ tool calls), checkpoint and suggest a new session with `/assemble --resume`
- Each phase runs the FULL protocol of its command — no shortcuts
- Fixes happen BETWEEN rounds, not batched at the end
- The Crossfire (Phase 12) and Council (Phase 13) can be skipped with `/assemble --fast`
- `/assemble --resume` picks up from the last completed phase in assemble-state.md

## Handoffs
- If any phase is blocked by an issue outside its domain, log to `/logs/handoffs.md` and continue to the next phase
- At completion, note any outstanding handoffs for the user
