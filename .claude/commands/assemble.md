Avengers, assemble. Full pipeline from architecture to launch — one command to rule them all.

## Context Setup
1. Read `/logs/assemble-state.md` — if it exists, resume from the last completed phase
2. If no assemble state exists, start fresh from Phase 1
3. Read `/docs/methods/ASSEMBLER.md` for operating rules

**Hill** tracks phase completion — logs each gate pass to `assemble-state.md`. **Jarvis** provides status summaries between phases.

## Agent Deployment Manifest — The Full Initiative

When `/assemble` invokes each sub-command, it deploys the FULL roster for that command — not just the lead. The leads below are coordinators; they bring their complete teams.

| Phase | Lead | Full Team Deployed |
|-------|------|--------------------|
| Architecture | **Picard** | Spock, Uhura, Worf, Tuvok, Scotty, Kim, Janeway, Torres, La Forge, Data, Crusher, Archer, Pike, Riker, Troi |
| Build | **Stark + Galadriel + Kusanagi** | Full /build roster (~35 agents across 4 universes) |
| Smoke Test | **Hawkeye** | Solo — runtime verification |
| Code Review (×3) | **Picard** | Spock, Seven, Data + **Rogers, Banner, Strange, Barton, Thor, Romanoff, Wanda, T'Challa** + **Nightwing, Bilbo, Troi, Constantine, Samwise** (cross-domain) |
| UX | **Galadriel** | Elrond, Arwen, Samwise, Bilbo, Legolas, Gimli, Radagast, Éowyn, Celeborn, Aragorn, Faramir, Pippin, Boromir, Haldir, Frodo, Merry |
| Security (×2) | **Kenobi** | Leia, Chewie, Rex, Maul, Yoda, Windu, Ahsoka, Padmé, Han, Cassian, Sabine, Qui-Gon, Bo-Katan, Anakin, Din Djarin |
| DevOps | **Kusanagi** | Senku, Levi, Spike, L, Bulma, Holo, Valkyrie, Vegeta, Trunks, Mikasa, Erwin, Mustang, Olivier, Hughes, Calcifer, Duo |
| QA | **Batman** | Oracle, Red Hood, Alfred, Deathstroke, Constantine, Nightwing, Lucius, Cyborg, Raven, Wonder Woman, Flash, Green Lantern, Batgirl, Aquaman |
| Test | **Batman** | Oracle, Red Hood, Alfred, Nightwing (testing subset) |
| Crossfire | **Maul, Deathstroke, Loki, Constantine, Éowyn** | Adversarial — each attacks another domain's work |
| Council | **Spock, Ahsoka, Nightwing, Samwise, Padmé, Troi** | Final convergence — one voice per domain |

## Phase 1 — Architecture (Picard has the conn)
**Fury:** "Picard, you're up. Review the architecture before we build anything."

Run the full `/architect` protocol. If `$ARGUMENTS` includes `--skip-arch`, skip this phase.

**Gate:** ADRs written, no critical architectural concerns. Log to `/logs/assemble-state.md`.

## Phase 2 — Build (All hands on deck)
**Fury:** "Stark, Galadriel, Kusanagi — build it. The full protocol."

Run the full `/build` protocol (all 13 phases). If `$ARGUMENTS` includes `--skip-build`, skip this phase (for re-running the review pipeline on existing code).

**Gate:** All build phase gates pass, test suite green. Update assemble-state.

## Phase 2.5 — Smoke Test (Hawkeye)
**Fury:** "Hawkeye — hit every endpoint. I want proof it runs, not just proof it compiles."

Mandatory runtime verification BEFORE code review begins:
1. If the project has a runnable server (Express, FastAPI, Next.js, Django, Rails), start it
2. Hit every new/modified API endpoint with `curl` — verify HTTP status codes match expectations
3. For web apps: list all registered routes and **check for path collisions** (duplicate method+path across routers)
4. For React/frontend: trace the primary user flow through the component tree — follow state changes through the store, identify re-render cycles. For every `useEffect` with store values in its deps, verify the effect body doesn't trigger a store update that changes those same deps.
5. If the server cannot be started (scaffold branch, methodology-only), skip with a note

**Gate:** All endpoints return expected status codes. No route collisions. No infinite render loops detected. Update assemble-state.

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

Run the full `/ux` protocol in two sub-phases. Skip if PRD frontmatter `type: api-only`.

**6A — Usability Review:** Trace the primary user flow step by step. For each step: What does the user see? What do they click? What happens? Is it what they expected? Specifically check:
- Can the user complete the primary flow without confusion?
- Do inputs retain focus when typing?
- Do modals/panels close cleanly on first attempt?
- Is there visual feedback for every mutation (success AND failure)?
- Does every loading state resolve (no infinite spinners)?

**6B — Accessibility Audit:** ARIA, keyboard nav, focus management, contrast, screen reader, reduced motion — the existing checklist.

**Gate:** Zero critical usability or a11y findings. Update assemble-state.

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

Synthesize findings. **Conflict detection:** If any two agents produce conflicting findings on the same code (one says "fix," another says "by design" or "not exploitable"), trigger the debate protocol instead of listing both. See SUB_AGENTS.md "Agent Debate Protocol": Agent A states finding → Agent B responds → Agent A rebuts → Arbiter (Picard or user) decides. 3 exchanges max. Log the debate transcript as an ADR. Fix all Must Fix items. If any fixes were applied, re-run the four agents on the fixed areas only.

**Gate:** All four adversarial agents sign off. All conflicts resolved via debate (no unresolved disagreements). Update assemble-state.

## Phase 13 — The Council (Convergence)
**Fury:** "Last call. One agent from each domain — verify nobody broke anyone else's work."

Use the Agent tool to run these in parallel:

- **Spock** (Star Trek) — Did any security/QA/UX fix break code patterns or quality?
- **Ahsoka** (Star Wars) — Did any review/QA fix introduce access control gaps?
- **Nightwing** (DC) — Did any fix cause a regression? Run the full test suite.
- **Samwise** (Tolkien) — Did any fix break accessibility?
- **Troi** (Star Trek) — PRD compliance: read the PRD prose section-by-section, verify every claim against the implementation. Not just "does the route exist?" but "does the component render what the PRD describes?" Check numeric claims, visual treatments, copy accuracy. Flag asset gaps as BLOCKED. (Troi runs on the final Council iteration, or always when `--skip-build` is used for campaign victory gates.)

**Conflict detection:** If Council members disagree (e.g., Spock says a fix broke patterns but Ahsoka says it's necessary for access control), trigger the debate protocol. Do not list both opinions — resolve via debate. Arbiter: Picard for code/architecture conflicts, Troi for PRD compliance conflicts.

If the Council finds issues:
1. Fix code discrepancies. Flag asset requirements as BLOCKED.
2. Resolve conflicts via debate protocol (see SUB_AGENTS.md). Log debate transcripts as ADRs.
3. Re-run the Council (max 3 iterations)
4. If not converged after 3 rounds, present remaining findings to the user

**Gate:** All five Council members sign off. Zero cross-domain regressions. Update assemble-state.

## Completion
**Fury:** "The Initiative is complete."

Write final summary to `/logs/assemble-state.md`:
- Total phases completed
- Total findings across all passes (review + security + QA + crossfire + council)
- Total fixes applied
- Final test suite status
- Time span (first phase start → last phase end)

Present the summary to the user.

**IMPORTANT: Include this disclaimer in the completion message:**
"All phases analyze source code and trace data flows. If this project has a runnable UI, manual testing of the deployed application is still recommended before shipping to users — runtime interaction bugs (render loops, endpoint collisions, focus management) can pass static analysis."

## Lessons Extraction (Wong)
After the summary, Wong extracts learnings for future builds:

1. Review all findings from Phases 3-13. For each pattern that appeared 2+ times or took 2+ fix iterations, distill into a lesson.
2. Append new entries to `/docs/LESSONS.md` using the existing format:
   ```
   ### [Short title]
   **Agent:** [who discovered it] | **Category:** pattern/antipattern/decision/gotcha
   **Context:** [this project name and phase]
   **Lesson:** [what we learned]
   **Action:** [what to do differently]
   **Promoted to:** Not yet
   ```
3. Check existing lessons — if a lesson from a PREVIOUS project was confirmed again, add a note: "Confirmed in [project]. Promote to method doc." If the lesson was already promoted, note: "Promoted lesson held — no regressions."
4. If any lesson appears in 3+ projects, promote it: add the rule to the relevant method doc and update the lesson's "Promoted to" field.

## Operating Rules
- Update `/logs/assemble-state.md` after EVERY phase completion
- If you notice context pressure symptoms (re-reading files, forgetting decisions), ask user to run `/context`. Only checkpoint if usage exceeds 70%.
- Each phase runs the FULL protocol of its command — no shortcuts
- Fixes happen BETWEEN rounds, not batched at the end
- The Crossfire (Phase 12) and Council (Phase 13) can be skipped with `/assemble --fast`
- `/assemble --resume` picks up from the last completed phase in assemble-state.md

## Handoffs
- If any phase is blocked by an issue outside its domain, log to `/logs/handoffs.md` and continue to the next phase
- At completion, note any outstanding handoffs for the user
