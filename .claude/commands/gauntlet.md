# /gauntlet — Thanos's Comprehensive Review

*"I am inevitable."*

The Gauntlet tests everything. Every domain. Multiple rounds. Escalating intensity. The project either survives or it doesn't. This is NOT a build command — it assumes code is already written. Run it after `/build` or `/campaign` to put the finished product through absolute hell.

## Context Setup
1. Read `/docs/methods/GAUNTLET.md` for operating rules
2. Read `/logs/build-state.md` — what was built, what phases completed
3. Read `/docs/PRD.md` — the source of truth for what the project should be

## Dynamic Dispatch (ADR-044)

Opus scans `git diff --stat` and matches changed files against the `description` fields of all agents in `.claude/agents/`. Matching specialists launch alongside the core agents below.

**Dispatch control:** `--light` skips dynamic dispatch (core only). `--solo` runs lead agent only.

## Silver Surfer Pre-Scan (ADR-048)

**MANDATORY — NO EXCEPTIONS.** Launch the Silver Surfer before deploying ANY other agents. This is not negotiable, not deferrable, and not skippable regardless of how simple the task appears. "The task is simple" is NOT a valid reason to skip — the Surfer catches cross-domain relevance that you cannot predict. "I already know which agents to use" is NOT a valid reason — the Surfer reads agent definitions you haven't loaded. Skipping the Surfer is a protocol violation equivalent to skipping the Victory Gauntlet. **If you find yourself thinking "I don't need the Surfer for this" — that is exactly when you need it most.**

Read the `heralding:` field from `.claude/agents/silver-surfer-herald.md` and announce it before launching.

**How to launch:** Use the Agent tool with these exact parameters:
- `description`: "Silver Surfer roster scan"
- `prompt`: "You are the Silver Surfer, Herald of Galactus. Read your instructions from .claude/agents/silver-surfer-herald.md, then execute your task. Command: /gauntlet. User args: <ARGS>. Focus: <FOCUS or 'none'>. Scan the .claude/agents/ directory, read agent descriptions and tags, and return the optimal roster for this command on this codebase."

**After the Surfer returns**, merge its roster with this command's hardcoded lead agents below. Leads are non-negotiable; the Surfer adds specialists.

**`--focus "topic"`** — include in the Surfer's prompt as the focus bias.
**`--light`** — skip the Surfer, use only hardcoded roster below.
**`--solo`** — skip Surfer and all sub-agents, lead only.

## Round 1 — Discovery (parallel)

**Thanos:** "Before I test, I must understand."

Use the Agent tool to run all five in parallel — these are read-only analysis:

- **Agent 1** `subagent_type: Picard` — Schema review, service boundaries, dependency graph, scaling assessment. Read the full `/architect` protocol but produce findings only (no ADRs — this is review, not design).
- **Agent 2** `subagent_type: Stark` — Pattern compliance, logic errors, type safety, cross-module data flow tracing. Read `/review` protocol. One pass across all source files.
- **Agent 3** `subagent_type: Galadriel` — Product surface map, usability walkthrough (Step 1.5), Éowyn's enchantment scan (Step 1.75). No fixes yet — discovery only.
- **Agent 4** `subagent_type: Kenobi` — List all endpoints, WebSocket handlers, file I/O, credential access points, user input parsing. Classify each by risk tier. No deep audit yet — just the map.
- **Agent 5** `subagent_type: Kusanagi` — Scan deploy scripts, generated configs, provisioning scripts, CI/CD templates. Classify each by risk: hardcoded credentials, open ports, missing auth on generated services. No deep audit yet — just the map.

Synthesize all five into a unified findings list. Log to `/logs/gauntlet-round-1.md`.

## Round 2 — First Strike (parallel)

**Thanos:** "Now I test every stone."

Use the Agent tool to run all four in parallel — full domain audits:

- **Agent 1** `subagent_type: Batman` — Run the complete `/qa` protocol. Oracle + Red Hood + Alfred + Deathstroke + Constantine + Nightwing + Lucius. Every edge case, every error state, every boundary.
- **Agent 2** `subagent_type: Galadriel` — Run the complete `/ux` protocol. Elrond + Arwen + Samwise + Bilbo + Legolas + Gimli + Radagast + Éowyn. Usability, visual, a11y, copy, performance, edge cases, enchantment.
- **Agent 3** `subagent_type: Kenobi` — Run the complete `/security` protocol. Leia + Chewie + Rex + Maul parallel scans, then Yoda → Windu → Ahsoka → Padmé sequential audits.
- **Agent 4** `subagent_type: Stark` — For every API endpoint, trace the full data path: client request → validation → service → database → response. For every file upload, trace: upload → storage → retrieval → display. For every credential, trace: entry → vault → usage → cleanup.

Merge all findings. Deduplicate across domains.

**→ FIX BATCH 1:** Fix all Critical and High findings. Update finding status. **Build-output gate:** If the project has a build step, run the build after fixes and verify output — framework-generated inline scripts, hydration markers, and SSR output are invisible to source-level analysis but can be broken by security hardening (especially CSP changes). Check: `npm run build && grep -c '<script>' dist/**/*.html`.

## Round 2.5 — Runtime Smoke Test (Hawkeye)

If the project has a runnable server, start it and verify the full lifecycle:
1. Start the server (`npm run dev`, `python manage.py runserver`, etc.)
2. Hit every new/modified API endpoint with curl — verify HTTP status codes
3. If WebSocket endpoints exist, open a connection and verify handshake + data flow
4. If terminal/PTY features exist, create a session and verify it stays alive for 5 seconds
5. If the server cannot start (scaffold/methodology-only), skip with a note

This catches runtime bugs invisible to static analysis: IPv6 binding, native module ABI, WebSocket framing, browser caching.

## Round 3 — Second Strike (parallel)

**Thanos:** "The first wave reveals. The second wave breaks."

Use the Agent tool to run all four in parallel — targeted re-verification:

- **Agent 1** `subagent_type: Batman` — Nightwing re-runs the test suite. Red Hood re-probes fixed areas. Deathstroke tests new boundaries created by the fixes. Focus on regressions.
- **Agent 2** `subagent_type: Galadriel` — Samwise re-audits a11y on all modified components. Radagast re-checks edge cases on fixed flows. Bilbo re-checks microcopy on any changed UI.
- **Agent 3** `subagent_type: Kenobi` — Maul re-probes all remediated vulnerabilities. Ahsoka verifies access control across every role boundary. Padmé verifies the primary user flow still works (critical path smoke test).
- **Agent 4** `subagent_type: Kusanagi` — Run the complete `/devops` protocol with full team: Senku (provisioning), Levi (deploy), Spike (networking), L (monitoring), Bulma (backup), Holo (cost), Valkyrie (disaster recovery). Deploy scripts, monitoring, backups, health checks, page weight gate, security headers.

**→ FIX BATCH 2:** Fix remaining findings.

## Round 4 — The Crossfire (parallel — adversarial)

**Thanos:** "Now the real test. Everyone attacks everyone else's work."

Use the Agent tool to run all five in parallel — pure adversarial:

- `subagent_type: Maul` — Attacks code that passed /review. Looks for exploits in "clean" code.
- `subagent_type: Deathstroke` — Probes endpoints that /security hardened. Tests if remediations can be bypassed.
- `subagent_type: Loki` — Chaos-tests features that /qa cleared. What breaks under unexpected conditions?
- `subagent_type: Constantine` — Hunts cursed code in FIXED areas specifically. Code that only works by accident.
- `subagent_type: Eowyn` — Final enchantment pass on the polished, hardened product. Where can delight still be added without compromising security or stability?

**→ FIX BATCH 3:** Fix all adversarial findings. If any fix is applied, re-run the affected adversarial agent on the fixed area only.

## Round 5 — The Council (parallel — convergence)

**Thanos:** "One last look. Every domain. One voice."

Use the Agent tool to run all six in parallel:

- `subagent_type: Spock` — Did any QA/security/UX fix break code patterns or quality?
- `subagent_type: Ahsoka` — Did any fix introduce access control gaps?
- `subagent_type: Nightwing` — Full regression: run the entire test suite. Any failures?
- `subagent_type: Samwise` — Final accessibility audit on all modified components.
- `subagent_type: Padme` — Critical path functional verification. Open the app, complete the main task, verify output.
- `subagent_type: Troi` — PRD compliance: read the PRD prose section-by-section, verify every claim against the implementation. Numeric claims, visual treatments, copy accuracy.

If the Council finds issues:
1. Fix code discrepancies. Flag asset requirements as BLOCKED.
2. Re-run the Council (max 2 iterations).
3. If not converged after 2 rounds, present remaining findings to the user.

## The Snap — Thanos's Verdict

**If all domains sign off:**
> *"I am inevitable. The project survives the Gauntlet."*

Present the final summary:
- Total findings across all 5 rounds
- Total fixes applied
- Findings by domain (QA, UX, Security, Architecture, DevOps)
- Test suite status
- Outstanding items (if any)

**Wong extracts lessons:** Append notable patterns to `/docs/LESSONS.md`.

**If findings remain:**
Present them with severity and recommendation. The user decides whether to ship or iterate.

## Arguments (ADR-043: Max by Default)

Default is now maximum intensity (was `--infinity`). Flags opt out.

- No arguments → 10-round Infinity Gauntlet with full roster (~60-80 agent launches). **ENFORCEMENT: Must launch Agent tool sub-processes. Inline analysis is not a Gauntlet.**
- `--fast` → 3 rounds only (skip Round 4 Crossfire + Round 5 Council). (formerly `--quick` — renamed v17.3 for cross-command consistency)
- `--light` → 5-round standard gauntlet with core agents only (pre-ADR-043 default behavior)
- `--security-only` → 4 rounds of security only (Kenobi marathon)
- `--ux-only` → 4 rounds of UX only (Galadriel marathon)
- `--qa-only` → 4 rounds of QA only (Batman marathon)
- `--focus "topic"` → Bias Herald toward topic (natural-language, additive)
- `--resume` → resume from last completed round (reads gauntlet state from logs)
- `--ux-extra` → Extra Éowyn enchantment emphasis across all rounds. Galadriel's team proposes micro-animations, copy improvements, and delight moments beyond standard usability/a11y.
- `--assess` → **Pre-build assessment.** Rounds 1-2 only (Discovery + First Strike), no fix batches. Produces assessment report grouped by root cause.
- `--solo` → Lead agent per domain only, no sub-agents (quick spot-check).
- `--infinity` → **Retired (no-op).** Default is now maximum intensity.
- `--muster` → **Retired (no-op).** Default is now full roster.

## Operating Rules
- Update `/logs/gauntlet-state.md` after EVERY round
- The Gauntlet does NOT build code — it reviews and hardens existing code
- Fixes happen BETWEEN rounds, not batched at the end
- **Confidence scoring is mandatory.** Every finding must include: ID, severity, confidence score (0-100), file, description, fix recommendation. Format: `[ID] [SEVERITY] [CONFIDENCE: XX] [FILE] [DESCRIPTION]`. See GAUNTLET.md "Agent Confidence Scoring" for ranges.
- **Low-confidence escalation:** Findings below 60 confidence MUST be escalated to a second agent from a different universe before inclusion. If the second agent disagrees, drop the finding. If the second agent agrees, upgrade to medium confidence.
- **High-confidence fast-track:** Findings at 90+ confidence skip re-verification in Pass 2.
- If context pressure symptoms appear, ask user to run `/context`. Only checkpoint at >70%. NEVER reduce Gauntlet rounds, skip agents, or "run efficiently" based on self-assessed context pressure. See CAMPAIGN.md "Quality Reduction Anti-Pattern" — this is a hard rule.
- The Gauntlet is the final test before shipping. Treat it with appropriate gravity.

## Handoffs
- If architecture changes are needed → log for Picard
- If new tests are needed → log for Batman (`/test`)
- If deploy config changes are needed → log for Kusanagi (`/devops`)
- At completion, offer Bashir (`/debrief`) to capture session learnings
