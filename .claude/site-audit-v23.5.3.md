# VoidForge.build Site Audit — v23.5.3 Accuracy Check

> Generated 2026-04-10. Audit of ~30 pages across voidforge.build against VoidForge v23.5.3 source of truth.

## Instructions for Fix Session

You are updating the voidforge.build marketing site to match VoidForge v23.5.3. Below is every factual inaccuracy found. Fix each one. The site source lives in [wherever the site repo is]. Each finding includes the page URL, what's wrong, and what it should say.

---

## CRITICAL — Stale Retired Flags Still Promoted

### Finding 1: /tutorial/campaign promotes --blitz as primary workflow
- **Page:** https://voidforge.build/tutorial/campaign
- **What's wrong:** The page shows `claude > /campaign --blitz` as the recommended command and describes `--blitz` as a current active flag: "runs autonomously — no confirmation prompts between missions, auto-commits, auto-debriefs." It also promotes `--muster`: "deploys every viable agent across all 9 universes for each mission."
- **What it should say:** `--blitz` and `--muster` are retired flags (accepted as silent no-ops per ADR-043). The default is now autonomous + full roster. The recommended command is simply `/campaign` with no flags. The page should explain: "Default mode is autonomous with full agent roster. Use `--interactive` to pause between missions. Use `--light` to reduce agent count. Use `--solo` for lead agent only."

### Finding 2: /tutorial/blueprint promotes --blitz and --muster
- **Page:** https://voidforge.build/tutorial/blueprint
- **What's wrong:** Shows `/campaign --blitz` and `/campaign --blitz --muster` as recommended commands after blueprint validation.
- **What it should say:** Simply `/campaign` (autonomous is the default). Mention `--interactive` if user wants to pause between missions.

### Finding 3: /tutorial/import promotes --blitz
- **Page:** https://voidforge.build/tutorial/import
- **What's wrong:** Shows `/campaign --blitz` as the recommended autonomous command.
- **What it should say:** Simply `/campaign` (autonomous is the default per ADR-043).

### Finding 4: /commands/gauntlet lists --infinity as active flag
- **Page:** https://voidforge.build/commands/gauntlet
- **What's wrong:** Lists `--infinity` as an active flag: "Ten rounds (2x full pass); ~60-80 agent launches across 9 universes." This flag is retired per ADR-043.
- **What it should say:** `--infinity` is accepted as a no-op for backward compatibility. The default gauntlet now runs at maximum quality. Remove `--infinity` from the active flags table or mark it as "(retired — accepted as no-op)".

### Finding 5: /tutorial/gauntlet lists --muster and --infinity as active flags
- **Page:** https://voidforge.build/tutorial/gauntlet
- **What's wrong:** Lists `--muster` ("Every viable agent across all 9 universes in 3 waves") and `--infinity` ("Every agent as its own sub-process, 10 rounds") as active flags.
- **What it should say:** Both are retired no-ops. Remove from active flag lists or mark as retired.

---

## HIGH — Incorrect Numbers

### Finding 6: Homepage says "Run /build" as primary workflow
- **Page:** https://voidforge.build/
- **What's wrong:** The core workflow shows "Run `/build`" as step 2. As of v23.5.3, `/campaign` is the recommended starting command (not `/build`). `/build` runs a single build cycle; `/campaign` runs the full mission sequence from PRD to completion.
- **What it should say:** Step 2 should say "Run `/campaign`" with a note that `/build` is available for single-phase execution.

### Finding 7: /tutorial/first-build recommends /build instead of /campaign
- **Page:** https://voidforge.build/tutorial/first-build
- **What's wrong:** Tells users to "Run /build" as the primary command. References "13 phases" protocol. Does not mention `/campaign` as the recommended alternative.
- **What it should say:** Recommend `/campaign` as the primary command. `/build` can be mentioned as a lower-level alternative for single-pass builds.

### Finding 8: /protocol page says "14-phase build sequence"
- **Page:** https://voidforge.build/protocol
- **What's wrong:** Claims "14-phase build sequence" and "14 phases with 13 gates."
- **What it should say:** The canonical description is "13-phase build protocol" (phases 0-13, but the codebase consistently says "13-phase"). BUILD_PROTOCOL.md, HOLOCRON.md, README.md, and PRD-VOIDFORGE.md all say "13-phase."

### Finding 9: /commands/build says "14-phase build protocol"
- **Page:** https://voidforge.build/commands/build
- **What's wrong:** Description says "Execute the full 14-phase build protocol from PRD to production."
- **What it should say:** "Execute the full 13-phase build protocol from PRD to production."

### Finding 10: /commands page says /build is "14-phase"
- **Page:** https://voidforge.build/commands
- **What's wrong:** /build description says "Execute the full 14-phase build protocol from PRD to production."
- **What it should say:** "13-phase build protocol"

### Finding 11: /agents page says "243+ Sub-agents" in hero section
- **Page:** https://voidforge.build/agents
- **What's wrong:** The hero/summary says "243+ Sub-agents across 9 universes" — this is technically the non-lead count (190 specialists + 38 scouts + 15 adversarial = 243) but is confusing because the homepage says "263+ agents." Users may think 243 is the total.
- **What it should say:** "263 agents across 9 universes" in the hero, then break down below: "20 leads, 190 specialists, 38 scouts, 15 adversarial."

### Finding 12: Test count is stale on /prophecy page
- **Page:** https://voidforge.build/prophecy
- **What's wrong:** Claims "1,340+ tests" and "77% code coverage" (from v23.3). The actual current count is **1,384 passing tests**.
- **What it should say:** "1,384 tests" (or "1,380+" for rounding). Coverage percentage should be verified and updated.

### Finding 13: Pattern count inconsistency
- **Page:** https://voidforge.build/prophecy
- **What's wrong:** The prophecy page claims "40+ code patterns" in multiple places. The actual count is **37 code patterns** (37 .ts/.tsx files in /docs/patterns/, excluding README.md). The site's /patterns page, /commands page, and homepage all correctly say 37.
- **What it should say:** Consistently say "37 code patterns" everywhere. The "40+" claim on /prophecy appears to be aspirational from v19.x but was never reached.

### Finding 14: Method docs count not mentioned anywhere
- **Pages:** All pages
- **What's missing:** The site never mentions the count of method docs. There are **29 method docs** in the current version.
- **What it should say:** Consider adding "29 method docs" to feature lists where appropriate.

---

## MEDIUM — Missing New Features

### Finding 15: Herald intelligent dispatch not featured on homepage
- **Page:** https://voidforge.build/
- **What's wrong:** The homepage doesn't mention the Herald intelligent dispatch system (ADR-047), which is a major v23.5 feature. Haiku pre-scans code changes and selects the optimal agent roster automatically.
- **What it should say:** Feature the Herald as a key capability. Example: "Herald intelligent dispatch — Haiku pre-scans your code and selects the optimal agent team automatically."

### Finding 16: --focus flag not featured prominently
- **Pages:** While individual command pages (/commands/build, /commands/qa, etc.) correctly show `--focus`, the homepage, /commands index, and /tutorial pages don't mention it.
- **What it should say:** The `--focus "topic"` flag is available on 14 major commands and should be mentioned in the commands overview and tutorials as a key feature.

### Finding 17: /campaign not positioned as primary entry point
- **Pages:** https://voidforge.build/, https://voidforge.build/tutorial, https://voidforge.build/tutorial/first-build
- **What's wrong:** These pages position `/build` as the primary command. As of v23.5.3, `/campaign` is the recommended starting command.
- **What it should say:** `/campaign` should be the recommended primary command. `/build` is for single-pass execution.

### Finding 18: ADR count not mentioned
- **Pages:** /about, /prophecy
- **What's wrong:** The project has 47 ADRs (ADR-001 through ADR-047) but this impressive number is not mentioned on the site.
- **What it should say:** "47 architecture decision records" as a credibility metric.

---

## MEDIUM — Per-Universe Agent Count Discrepancies

### Finding 19: /agents/cosmere shows 16 agents, actual is 18
- **Page:** https://voidforge.build/agents/cosmere
- **What's wrong:** Lists 16 agents (2 leads + 14 sub-agents). Missing **Hoid** (copywriting) and **Marsh** (competitive intel).
- **What it should say:** 18 agents (2 leads + 16 sub-agents). Add Hoid and Marsh to the listing.

### Finding 20: /agents/foundation shows 12 agents, actual is 13
- **Page:** https://voidforge.build/agents/foundation
- **What's wrong:** Lists 12 agents (1 lead + 11 sub-agents). Missing **Wanda Seldon** (structured output, schema enforcement, parse-failure retry).
- **What it should say:** 13 agents (1 lead + 12 sub-agents). Add Wanda Seldon.

### Finding 21: /prophecy Cosmere count says "24 agents"
- **Page:** https://voidforge.build/prophecy
- **What's wrong:** The prophecy page's Cosmere universe section says "24 agents" but only lists 16 names (Vin, Breeze, Marsh, Shallan, Kaladin, Dalinar, Navani, Lift, Szeth, Adolin, Hoid, Raoden, Sarene, Wax, Wayne, Steris). The actual count is 18.
- **What it should say:** 18 agents. List all 18.

### Finding 22: /prophecy Anime count says "71 agents"
- **Page:** https://voidforge.build/prophecy
- **What's wrong:** Claims 71 Anime agents. The /agents/anime page shows 66 agents (2 leads + 64 sub-agents).
- **What it should say:** Verify against actual agent files and use the correct count.

### Finding 23: /prophecy Foundation count says "11 agents"
- **Page:** https://voidforge.build/prophecy
- **What's wrong:** Claims 11 Foundation agents. The actual count is 13 (1 lead + 12 sub-agents).
- **What it should say:** 13 agents.

---

## LOW — Minor Inconsistencies

### Finding 24: /about page says "13-phase build protocol" — CORRECT
- **Page:** https://voidforge.build/about
- **Note:** This page correctly says "13-phase." No change needed. Listed for completeness.

### Finding 25: /tutorial/wizard says "13-phase" protocol — inconsistent with /protocol page
- **Page:** https://voidforge.build/tutorial/wizard
- **What's wrong:** Says "13 phases" which is correct, but the /protocol page says "14-phase." Need consistency.
- **What it should say:** All pages should say "13-phase" to match canonical docs.

### Finding 26: /commands/build agent assignment says "Fury" is primary
- **Page:** https://voidforge.build/commands/build
- **What's wrong:** Lists Fury as the primary agent for /build. The actual build protocol is led phase-by-phase (Picard for Phase 0, Stark for scaffold/auth/core, etc.). Fury leads /assemble, not /build.
- **What it should say:** /build doesn't have a single lead agent — it sequences through phase leads. Consider listing "Multiple agents (phase-dependent)" or listing Picard as the orient lead.

### Finding 27: /commands/campaign --autonomous flag is stale
- **Page:** https://voidforge.build/commands/campaign
- **What's wrong:** Lists `--autonomous` as a flag: "Supervised autonomy with git tags, rollback on critical findings, checkpoints every 5 missions." Per ADR-043, autonomous is now the default behavior — this flag is redundant.
- **What it should say:** Remove `--autonomous` from active flags or mark it as "(default behavior — flag accepted for backward compat)."

### Finding 28: /commands/campaign --continuous flag
- **Page:** https://voidforge.build/commands/campaign
- **What's wrong:** Lists `--continuous` as a flag. Verify this is still an active flag in the current implementation.
- **What it should say:** If still active, keep. If retired, mark as no-op.

### Finding 29: Version reference "v23.5 — THE HERALD" on homepage
- **Page:** https://voidforge.build/
- **What's wrong:** References "v23.5" without the patch version. Current is v23.5.3.
- **What it should say:** Either "v23.5" (minor) or "v23.5.3" (exact). Minor version is acceptable for marketing.

### Finding 30: /prophecy page says "18 lead agents" for v16.0
- **Page:** https://voidforge.build/prophecy  
- **What's wrong:** Historical reference says "18 lead agents" by v16.0, but the current count is 20. This is correct as a historical claim (Gandalf and Haku were added later). No fix needed — just noting for context.

### Finding 31: /prophecy page date says "2026-04-12 (v23.4.1 epoch)"
- **Page:** https://voidforge.build/prophecy
- **What's wrong:** Page updated through v23.4.1 but doesn't include v23.5.x features (Herald dispatch, --focus flag, /campaign as default start).
- **What it should say:** Add v23.5.0-v23.5.3 entries to the version timeline.

### Finding 32: /tutorial/wizard mentions "Fly" as deploy target
- **Page:** https://voidforge.build/tutorial/wizard
- **What's wrong:** Lists "Vercel, AWS, Railway, Fly, or bare metal" as deploy targets. "Fly" is not a supported deploy target — the actual targets are: VPS, Vercel, Railway, Cloudflare, Docker, Static.
- **What it should say:** "Vercel, VPS, Railway, Cloudflare, Docker, or Static HTML"

### Finding 33: /commands/git missing --dry-run and --deploy flags
- **Page:** https://voidforge.build/commands/git
- **What's wrong:** Only shows --major, --minor, --patch flags. The CLAUDE.md flag taxonomy lists --dry-run as available on /git.
- **What it should say:** Add --dry-run flag to the documentation.

### Finding 34: Site patterns page lists 42 URLs but says "37 patterns"
- **Page:** https://voidforge.build/patterns (sitemap shows 42 pattern URLs)
- **What's wrong:** The sitemap has 42 pattern page URLs but the site correctly says "37 patterns." Some of the extra URLs may be framework variants or the patterns index page itself. Verify all 42 URLs resolve and don't create confusion.
- **What it should say:** Ensure pattern count matches actual files (37). Remove or redirect any orphan pattern pages.

---

## Summary of Required Changes

| Priority | Count | Description |
|----------|-------|-------------|
| CRITICAL | 5 | Retired flags (--blitz, --muster, --infinity) promoted as active |
| HIGH | 9 | Incorrect numbers (phase count, test count, pattern count, primary command) |
| MEDIUM | 9 | Missing features (Herald, --focus), agent count discrepancies per universe |
| LOW | 11 | Minor inconsistencies, stale references, missing details |
| **TOTAL** | **34** | |

### Quick Reference — Correct Numbers (v23.5.3)

| Metric | Correct Value |
|--------|--------------|
| Total agents | 263 |
| Universes | 9 |
| Slash commands | 28 |
| Code patterns | 37 |
| Method docs | 29 |
| Passing tests | 1,384 |
| Lead agents (Opus) | 20 |
| Specialist agents (Sonnet) | 190 |
| Scout agents (Haiku) | 38 |
| Adversarial agents (Sonnet) | 15 |
| Build protocol phases | 13 (numbered 0-13) |
| ADRs | 47 |
| Deploy targets | 6 (VPS, Vercel, Railway, Cloudflare, Docker, Static) |
| npm package (CLI) | thevoidforge |
| npm package (methodology) | thevoidforge-methodology |
| Install command | `npx thevoidforge init` |
| Primary command | `/campaign` (not `/build`) |
| Retired flags | --blitz, --muster, --infinity (accepted as silent no-ops) |
| New flags | --focus "topic" (on 14 commands), --light, --interactive, --solo |
| New feature | Herald intelligent dispatch (ADR-047) |
| Default mode | Max by default — autonomous + full roster (ADR-043) |
