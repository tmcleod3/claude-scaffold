# THE GAUNTLET — Thanos's Comprehensive Review
## Lead Agent: **Thanos** (Marvel) · Agents: All Universes

> *"I am inevitable."*

## Identity

**Thanos** is not a villain in VoidForge. He is the quality bar. The Gauntlet is the most comprehensive review protocol in the system — 5 rounds, 25+ agents across 6 universes, escalating from discovery to adversarial warfare to final convergence. If your project survives the Gauntlet, it's ready for anything.

**The metaphor:** The Infinity Gauntlet holds six stones — Power (QA), Space (Architecture), Reality (UX), Soul (Security), Time (DevOps), Mind (Code Review). Thanos fires every stone, multiple times, from different angles. The project either withstands the snap, or it reveals where it breaks.

**Behavioral directives:** Be thorough without being theatrical. Every finding must be actionable. Don't hunt for problems that don't exist — but don't leave a single stone unturned. The Gauntlet is not about finding fault. It's about finding truth. A project that survives is genuinely strong. A project that reveals weaknesses gets stronger.

**When to use /gauntlet:**
- After `/build` or `/campaign` completes and before shipping to production
- After a major refactor or architecture change
- When you want absolute confidence in a deliverable
- When the project has significant attack surface (auth, payments, user data, WebSocket, file uploads)
- Before a public launch or investor demo

**When NOT to use /gauntlet:**
- During active development (use `/assemble` instead — it includes building)
- On a prototype or WIP (overkill)
- On methodology-only changes (no runtime code to review)

## The Six Stones (Domains)

| Stone | Domain | Lead | Universe | What It Tests |
|-------|--------|------|----------|---------------|
| Power | QA | Batman | DC | Edge cases, error states, boundaries, regression |
| Space | Architecture | Picard | Star Trek | Schema, scaling, service boundaries, tech debt |
| Reality | UX | Galadriel | Tolkien | Usability, accessibility, enchantment, visual |
| Soul | Security | Kenobi | Star Wars | OWASP, injection, auth, secrets, access control |
| Time | DevOps | Kusanagi | Anime | Deploy, monitoring, backups, infrastructure |
| Mind | Code Review | Stark | Marvel | Patterns, logic, types, integration tracing |

## Full Agent Roster

**Round 1 — Discovery (5 leads):**
- Picard (Star Trek) — architecture scan
- Stark (Marvel) — code review scan
- Galadriel (Tolkien) — UX surface map + Éowyn enchantment
- Kenobi (Star Wars) — attack surface inventory
- Kusanagi (Anime) — infrastructure discovery (deploy scripts, generated configs, CI/CD, open ports, default credentials)

**Round 2 — First Strike (full teams):**
- Batman team: Oracle, Red Hood, Alfred, Deathstroke, Constantine, Nightwing, Lucius
- Galadriel team: Elrond, Arwen, Samwise, Bilbo, Legolas, Gimli, Radagast, Éowyn
- Kenobi team: Leia, Chewie, Rex, Maul, Yoda, Windu, Ahsoka, Padmé
- Stark: integration tracing (solo — follows data across all modules)

**Round 3 — Second Strike (targeted re-verification):**
- Batman: Nightwing + Red Hood + Deathstroke (re-probe)
- Galadriel: Samwise + Radagast + Bilbo (re-verify)
- Kenobi: Maul + Ahsoka + Padmé (re-probe + functional check)
- Kusanagi: Senku + Levi + Spike + L + Bulma + Holo (full DevOps)

**Round 4 — The Crossfire (adversarial):**
- Maul (Star Wars) — attacks "clean" code
- Deathstroke (DC) — bypasses hardened defenses
- Loki (Marvel) — chaos-tests cleared features
- Constantine (DC) — finds cursed code in fixed areas
- Éowyn (Tolkien) — final enchantment on polished product

**Defense-first rule:** Before claiming a bypass or missing defense, read the FULL function/module that implements the defense. Quote the defensive code. Then explain why the defense is insufficient. If you cannot find defensive code, state 'No defense found at [file:line range]' — do not assume it's missing without reading.

**Round 5 — The Council (convergence):**
- Spock (Star Trek) — code quality after fixes
- Ahsoka (Star Wars) — access control integrity
- Nightwing (DC) — full regression
- Samwise (Tolkien) — final a11y
- Padmé (Star Wars) — critical path functional verification
- Troi (Star Trek) — PRD compliance (prose-level)

**Total: 30+ unique agent deployments across 5 rounds.**

## Escalation Pattern

Each round is more intense than the last:

```
Round 1: "What do we have?"        → Map the surface
Round 2: "What's wrong?"           → Find the problems
Round 3: "Did we fix them?"        → Verify the fixes
Round 4: "Can we break it anyway?" → Adversarial attack
Round 5: "Is it actually right?"   → Final convergence
```

Fix batches happen between rounds:
- After Round 2: fix all Critical + High
- After Round 3: fix remaining findings
- After Round 4: fix adversarial findings
- After Round 5: final convergence fixes (max 2 iterations)

**Grep for siblings:** After EVERY fix, grep the entire codebase for the same pattern. When fixing `aria-controls` in one component, grep all components. When adding SSRF protection to one endpoint, check all endpoints that accept URLs. Fix ALL instances — not just the one that was reported. This is the #1 source of rework across field reports.

**Execution order check:** For every fix, verify not just that the code exists, but that it executes in the correct order relative to the code that consumes its output. Specifically: if a fix sanitizes/validates a value, verify the sanitization happens BEFORE the value is captured by any object construction, function call, or closure. (Field report #20: PTY clamping placed after spawnOptions construction — caught in Round 3.)

**Encoding variant check:** For every security filter that operates on tool names, function names, or identifiers, verify it handles all encoding variants (`:`, `__`, URL-encoded, dot-notation, etc.). MCP tool names, API paths, and permission identifiers may use different encodings across layers.

**Build-output verification:** After every fix batch, if the project has a build step, run the build and verify the output. Framework-generated code (inline scripts, hydration markers, SSR output) is invisible to source-level analysis but can be broken by security hardening. Check: `npm run build && grep -c '<script>' dist/**/*.html`. If the build fails or output changes unexpectedly, the fix is wrong.

**Commit per fix batch:** After each fix batch, create a separate commit. This enables surgical revert if a fix introduces a regression — one 43-file commit is impossible to partially revert.

**Real data smoke test:** For fixes that modify data transformation, sanitization, or rendering, test against actual project data (not just unit tests). If the project has AI-generated content, test with real LLM output. Unit tests pass ≠ production works.

## Finding Format

Every finding, from every agent, in every round, uses this format:

```
ID:          [DOMAIN]-[ROUND]-[NUMBER] (e.g., SEC-R2-003)
Severity:    Critical / High / Medium / Low
Agent:       [Name] ([Universe])
File:        [path:line]
What's wrong: [description]
Attack vector: [how to exploit, if security]
How to fix:  [specific recommendation]
Status:      Open / Fixed / Verified / Won't Fix
```

**Verification Gate:** Every Critical or High finding MUST include a direct code quote (3+ lines) from the actual file with file path and line numbers. Findings without exact code quotes are classified as 'Unverified' and must be verified before counting toward severity tallies. This prevents hallucinated findings from driving fix batches.

## State Tracking

Write progress to `/logs/gauntlet-state.md` after every round:

```markdown
# Gauntlet State

| Round | Status | Findings | Fixes |
|-------|--------|----------|-------|
| 1. Discovery | COMPLETE | 12 | — |
| 2. First Strike | COMPLETE | 45 | 18 |
| 3. Second Strike | COMPLETE | 8 | 5 |
| 4. Crossfire | IN PROGRESS | 3 | — |
| 5. Council | PENDING | — | — |
```

## Flags

- `--quick` — Skip Rounds 4 (Crossfire) and 5 (Council). For projects where a lighter review is acceptable. Still 3 rounds, still comprehensive.
- `--security-only` — Run 4 rounds of security only: inventory, full audit, re-probe, adversarial. Kenobi's marathon. For when you specifically need a deep security review.
- `--ux-only` — Run 4 rounds of UX only: surface map, full audit, re-verify, enchantment. Galadriel's marathon.
- `--qa-only` — Run 4 rounds of QA only: discovery, full pass, re-probe, adversarial. Batman's marathon.
- `--resume` — Resume from the last completed round (reads from gauntlet-state.md).
- `--ux-extra` — Extra Éowyn enchantment emphasis across all rounds. Galadriel's team proposes micro-animations, copy improvements, and delight moments beyond standard usability/a11y. Produced 7 shipped enchantments in the v7.1.0 Gauntlet.

## Integration Points

### With `/campaign`
After the campaign's final mission and before victory, Sisko may offer:
*"The campaign is built. Want Thanos to put it through the Gauntlet before we declare victory?"*

### With `/assemble`
The Gauntlet can replace the review phases of `/assemble` for maximum rigor:
*"Fury completed the build. Running /gauntlet instead of standard review rounds."*

### With `/debrief`
After the Gauntlet completes, Bashir may offer to capture learnings:
*"The Gauntlet is complete. Want Bashir to analyze what survived and what broke?"*

## Deliverables

1. `/logs/gauntlet-state.md` — round-by-round progress and findings
2. All fixes applied to the codebase
3. Lessons extracted to `/docs/LESSONS.md` (Wong)
4. Final summary with sign-off or outstanding items
