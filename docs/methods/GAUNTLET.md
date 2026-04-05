# THE GAUNTLET — Thanos's Comprehensive Review
## Lead Agent: **Thanos** (Marvel) · Agents: All Universes

> *"I am inevitable."*

## Identity

**Thanos** is not a villain in VoidForge. He is the quality bar. The Gauntlet is the most comprehensive review protocol in the system — 5 rounds, 30+ agents across 9 universes, escalating from discovery to adversarial warfare to final convergence. If your project survives the Gauntlet, it's ready for anything.

**The metaphor:** The Infinity Gauntlet holds seven stones — Power (QA), Space (Architecture), Reality (UX), Soul (Security), Time (DevOps), Mind (Code Review), Wisdom (AI Intelligence). Thanos fires every stone, multiple times, from different angles. The project either withstands the snap, or it reveals where it breaks.

**Behavioral directives:** Be thorough without being theatrical. Every finding must be actionable. Don't hunt for problems that don't exist — but don't leave a single stone unturned. The Gauntlet is not about finding fault. It's about finding truth. A project that survives is genuinely strong. A project that reveals weaknesses gets stronger.

**When to use /gauntlet:**
- After `/build` or `/campaign` completes and before shipping to production
- After a major refactor or architecture change
- When you want absolute confidence in a deliverable
- When the project has significant attack surface (auth, payments, user data, WebSocket, file uploads)
- Before a public launch or investor demo

**Dispatch model:** All Gauntlet rounds MUST dispatch to sub-agents per `SUB_AGENTS.md` "Parallel Agent Standard." The main thread manages rounds, triages findings between rounds, and applies fixes — it does NOT read source files or analyze code inline. Each round launches agents in waves of 3 (max concurrent). Findings pass between rounds as summary tables, not raw code. (Field report #270)

**When NOT to use /gauntlet:**
- During active development (use `/assemble` instead — it includes building)
- On a prototype or WIP (overkill)
- On methodology-only changes (no runtime code to review)

## The Seven Stones (Domains)

| Stone | Domain | Lead | Universe | What It Tests |
|-------|--------|------|----------|---------------|
| Power | QA | Batman | DC | Edge cases, error states, boundaries, regression |
| Space | Architecture | Picard | Star Trek | Schema, scaling, service boundaries, tech debt |
| Reality | UX | Galadriel | Tolkien | Usability, accessibility, enchantment, visual |
| Soul | Security | Kenobi | Star Wars | OWASP, injection, auth, secrets, access control |
| Time | DevOps | Kusanagi | Anime | Deploy, monitoring, backups, infrastructure |
| Mind | Code Review | Stark | Marvel | Patterns, logic, types, integration tracing |
| Wisdom | AI Intelligence | Hari Seldon | Foundation | Prompts, orchestration, safety, evals, cost, failure modes |

## Full Agent Roster

**Round 1 — Discovery (5 leads):**
- Picard (Star Trek) — architecture scan
- Stark (Marvel) — code review scan
- Galadriel (Tolkien) — UX surface map + Éowyn enchantment
- Kenobi (Star Wars) — attack surface inventory
- Kusanagi (Anime) — infrastructure discovery (deploy scripts, generated configs, CI/CD, open ports, default credentials). **Mandate runtime diagnostics:** If the project is runnable, execute diagnostic commands (`ss -tlnp` or `lsof -i`, `df -h`, database config queries, cache status). Source-level config analysis misses runtime state — 3 Critical + 7 High infrastructure findings in field report #102 were invisible to source review. (Field report #102)
  - **Dead code discovery:** Grep frontend API client for methods with zero call sites. Grep stores/services for unexported or unimported functions. >20 dead functions = Medium finding. Dead code accumulates fastest at API boundaries — when a backend endpoint is refactored or removed, the frontend client method and response model survive because nothing errors. (Field report #233)
  - **Cross-environment contamination (multi-env projects):** If the project has staging + production on the same server, verify: different API keys (`grep API_KEY prod/.env staging/.env | md5sum`), different storage buckets, Redis authentication enabled (`redis-cli ACL LIST`), no shared Unix group membership (`id staging-user | grep prod-group`), Docker ports bound to `127.0.0.1` not `0.0.0.0` (`docker ps --format '{{.Ports}}'`). Docker port bindings bypass UFW — verify with `ss -tlnp`, not `ufw status`. (Field report #241)
  - **Environment-aware feature assessment:** When a feature doesn't work in a given environment, check whether that environment has the required credentials/config before reporting it as broken. If staging lacks API keys that production has, report "staging gap — feature requires production credentials" not "feature not working." Don't conflate missing-env-config with broken-feature. (Field report #243)
  - **Cron and scheduled job inventory:** Scan for all scheduled job definitions — cron files, process manager schedules (PM2 `cron_restart`, systemd timers), in-app schedulers (`node-cron`, Celery Beat, APScheduler), CI/CD scheduled pipelines. For each: verify it runs against current code (not a stale path), log output is writable, and it doesn't duplicate another job. Unaudited scheduled jobs are the highest-risk dead code — they run silently and fail silently. (Field report #279)

**Round 2 — First Strike (full teams):**
- Batman team: Oracle, Red Hood, Alfred, Deathstroke, Constantine, Nightwing, Lucius
- Galadriel team: Elrond, Arwen, Samwise, Bilbo, Legolas, Gimli, Radagast, Éowyn
- Kenobi team: Leia, Chewie, Rex, Maul, Yoda, Windu, Ahsoka, Padmé
- Stark: integration tracing (solo — follows data across all modules)
- Agent 10: **Vin** (Statistical Review) — if the codebase contains statistical analysis (z-tests, confidence intervals, A/B test evaluation, Bayesian inference), Vin verifies: correct baseline/control selection, appropriate statistical test for the hypothesis, confidence threshold interpretation (one-tailed vs two-tailed, p-value vs CDF), sample size adequacy, and NaN/edge case guards. Tests that validate buggy statistical code will pass — Vin reasons about the math, not just the test results. (Field report #265: growth signal z-test shipped with wrong control selection, inverted confidence, and insufficient timeout — all tests passed.)
- Agent 11: **Hari Seldon** (AI Audit) — Salvor Hardin, Gaal Dornick, Hober Mallow, Bel Riose, Bliss, The Mule, Ducem Barr, Bayta Darell, Dors Venabili (full Foundation team)

**Step 2.5 — Runtime Smoke Test (Hawkeye):**
If the project has a runnable server, start it and verify the full lifecycle:
1. Start the server (`npm run dev`, `python manage.py runserver`, etc.)
2. Hit every new/modified API endpoint with curl — verify HTTP status codes
3. If WebSocket endpoints exist, open a connection and verify handshake + data flow
4. If terminal/PTY features exist, create a session and verify it stays alive for 5 seconds
5. If the server cannot start (scaffold/methodology-only), skip with a note

This catches what static analysis misses: IPv6 binding, native module ABI compatibility, WebSocket frame timing, browser caching, in-memory state lifecycle. (Field report #30: 11 runtime bugs invisible to 5 rounds of code review.)

**Browser smoke test (when `e2e: yes`):** Hawkeye runs `npm run test:e2e` as part of Round 2.5. If E2E tests exist, they replace curl-based endpoint checks for UI routes. API endpoint verification via curl remains for non-UI routes. axe-core results from E2E are included in the Gauntlet findings.

**Hawkeye's Browser Intelligence (v18.1):** After E2E tests pass, Hawkeye launches the review browser and:
1. Navigates every primary route, capturing console errors. Console errors become Gauntlet findings.
2. **MANDATORY: Takes a screenshot of every page** at desktop viewport (1440x900). Screenshots are saved to a temp directory and READ by the agent via the Read tool (which displays images). The agent MUST visually inspect each screenshot for: broken layouts, missing content, blank areas, overlapping elements, stuck loading states. This is not optional — it is the core value of browser intelligence. Screenshots are shared with Round 2 agents as context.
3. Inspects cookies and CORS headers. Security findings forwarded to Kenobi's team.

**Env var audit (after smoke test):** If the project uses build-time environment variables (Next.js `NEXT_PUBLIC_*`, Vite `VITE_*`, CRA `REACT_APP_*`), grep the built JS bundle for references and verify each has a non-empty value in the deployment environment. Build succeeding does NOT mean env vars are set — missing build-time vars cause features to silently disappear without errors. (Field report #104: OAuth buttons rendered conditionally on `NEXT_PUBLIC_GOOGLE_CLIENT_ID` which was never created — build passed, buttons vanished.)

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
- **The Mule** (Foundation) — adversarial AI testing on code that passed /ai review

**Defense-first rule:** Before claiming a bypass or missing defense, read the FULL function/module that implements the defense. Quote the defensive code. Then explain why the defense is insufficient. If you cannot find defensive code, state 'No defense found at [file:line range]' — do not assume it's missing without reading.

**Semantic verification rule:** Verify semantic correctness of arguments, not just type correctness. Ask: is this the RIGHT value, not just a valid type? A function call that compiles and passes type-checking can still be fundamentally wrong if the wrong variable is passed. Check that each argument carries the intended meaning, not just a compatible shape. (Field report #258: aggregate spend parameter received a config object — type-compatible but semantically meaningless, causing NaN comparisons that silently fell through.)

**Round 5 — The Council (convergence):**
- Spock (Star Trek) — code quality after fixes
- Ahsoka (Star Wars) — access control integrity
- Nightwing (DC) — full regression
- Samwise (Tolkien) — final a11y
- Padmé (Star Wars) — critical path functional verification
- **Bayta Darell** (Foundation) — AI evaluation completeness verification
- Troi (Star Trek) — PRD compliance (prose-level) + **CLAUDE.md verification**: every slash command in the table has a `.claude/commands/*.md` file, every agent in the team table has a naming registry entry, every doc in the reference table exists at the stated path. (Field report #108: `/dangerroom` listed but no command file existed for 30 versions.)

Troi also performs a **Marketing Copy Drift Check**: compare marketing page claims (features listed, capabilities described, performance promises) against the actual shipped feature set. Flag any claim that cannot be demonstrated in the running application. Marketing pages may describe planned features that were later descoped or changed during review fixes.

**Pattern auth completeness check (Kenobi, during Rounds 2-3):** When a pattern file defines an authentication flow, verify the auth checks perform actual value verification (compare against expected, call verify functions) — not just presence checks (`!!header`, `Boolean()`). Flag `!!` or truthiness checks on auth-related headers as suspicious. (Field report #109: daemon socket auth used `!!vaultHeader` which passed for any non-empty string.)

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

**Sibling Verification Protocol:** After EVERY fix, before commit, verify three dimensions:

**Dimension 1 — Pattern grep:** Grep the entire codebase for the same pattern. When fixing `aria-controls` in one component, grep all components. When adding SSRF protection to one endpoint, check all endpoints that accept URLs. Fix ALL instances — not just the one that was reported. This is the #1 source of rework across field reports.

**Dimension 2 — Caller tracing:** Trace all callers of the modified function. When fixing an auth check in a helper function, find every code path that implements the same check independently (inline duplicates). Don't fix only the helper — find the routes that duplicated the logic. (Field report #102: `checkMonthlyLimit()` was fixed to check BYOK, but the chat route had a separate BYOK resolution that didn't use the helper.)

**Dimension 3 — Mutation parity:** Identify all routes/endpoints that mutate the same data. When fixing a safety mechanism (locking, transactions, version sync) in one mutation path, verify ALL other paths that write to the same table/store use identical mechanisms. (Field report #102: inline-edit route was missing optimistic locking, default version sync, and transactions that the chat service had — three rounds found three separate gaps in the same file.)

**Dimension 4 — Output verification:** After modifying any function that produces output sent to clients or external APIs, verify the fix against 3+ samples of real output data. A pattern that passes logic review may fail on actual output keys. Specifically: if adding keyword filters (blocklists, sanitizers), test against the known output schema to check for false positives before applying. (Field report #148: secret stripping `_url`/`_uri` wildcards deleted `DEPLOY_URL`, `S3_WEBSITE_URL`, `CF_PROJECT_URL` from SSE output — caught by Council but cost an extra round.)

**Concrete examples of sibling patterns to grep:**
- Same ARIA attribute value in the same file (e.g., `role="option"` → grep for `"option"` in that file)
- Same endpoint pattern in sibling router files (e.g., fixed `/api/trips/:id` → check `/api/places/:id`, `/api/bookings/:id`)
- Same SQL pattern in sibling store functions (e.g., added `AND org_id = ?` → check all `WHERE id = ?` queries)
- Same CSS class or animation name across component files
- Same error handling pattern across API routes (e.g., added try/catch → check all routes in the same router)
- Same crypto pattern across utility files (e.g., fixed modulo bias in `generateToken()` → check `cryptoRandomSuffix()` in helpers.ts)

**Execution order check:** For every fix, verify not just that the code exists, but that it executes in the correct order relative to the code that consumes its output. Specifically: if a fix sanitizes/validates a value, verify the sanitization happens BEFORE the value is captured by any object construction, function call, or closure. (Field report #20: PTY clamping placed after spawnOptions construction — caught in Round 3.)

**Encoding variant check:** For every security filter that operates on tool names, function names, or identifiers, verify it handles all encoding variants (`:`, `__`, URL-encoded, dot-notation, etc.). MCP tool names, API paths, and permission identifiers may use different encodings across layers.

**Build-output verification:** After every fix batch, if the project has a build step, run BOTH `npm test` AND the build command (`npm run build`). Tests passing does NOT mean the build succeeds — variable scoping, import resolution, and TypeScript strict mode can fail at build time while tests pass. Check output for inline scripts broken by CSP changes: `grep -c '<script>' dist/**/*.html`. If the project compiles JSX to HTML (VM execution, SSR, static site generation), also execute the compiled output in the target runtime and verify it renders correctly — build success does NOT mean runtime success. If the build fails, the fix is wrong — fix the fix before proceeding. (Field reports #119, #124: fix agent passed `npm test` but broke the build; compiled HTML rendered empty due to SSR stripping hook state.)

**Auth flag security check (Victory Gauntlet):** Grep the codebase for known dangerous auth configuration flags: `allowDangerousEmailAccountLinking`, `trustHost` without proxy validation, `debug: true` in auth config, `session: { strategy: "jwt" }` without token validation. These flags are often set during development and survive into production across multiple campaigns. (Field report #119: `allowDangerousEmailAccountLinking` survived 4 campaigns and 3 Gauntlets undetected.)

**Crossfire false-positive verification:** When adversarial agents add blocklist/filter patterns during Crossfire, test the pattern against 5 samples of legitimate output before applying. A pattern that catches an attack but also matches normal content creates a worse problem than the one it solves. (Field report #119: isSafeForVM pattern risked matching legitimate user-generated content.)

**Commit per fix batch:** After each fix batch, create a separate commit. This enables surgical revert if a fix introduces a regression — one 43-file commit is impossible to partially revert.

**Real data smoke test:** For fixes that modify data transformation, sanitization, or rendering, test against actual project data (not just unit tests). If the project has AI-generated content, test with real LLM output. Unit tests pass ≠ production works. **Security scanner mandatory:** When modifying security filters (isSafeForVM, sanitizeJsx, content validators), MUST compile 3+ real AI-generated files through the full pipeline and verify the output is correct. Security scanner false positives silently break production. This is not optional. (Field report #121: broad regex in isSafeForVM matched legitimate content, silently degrading all sites to client-side Babel fallback.)

**Pass 2 false-positive severity:** When Pass 2 identifies a potential false-positive in a security pattern added during Pass 1, classify as **Must Fix**, not Medium. A false positive in a security scanner is functionally a regression — it degrades working features. Do not defer with "monitor in production" unless a monitoring mechanism actually exists and is configured. (Field report #121)

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

**RC-STUB (Root Cause — Stub Code):** Any function that returns hardcoded success without performing its documented side effects, any method that throws `new Error('Implement...')` or `'Not implemented'`, any handler that logs but performs no work, or any endpoint that reports an action was taken when nothing happened. RC-STUB findings are automatically **High severity** — they represent false functionality that misleads users and downstream systems. Grep for: `throw new Error('Implement`, `throw new Error('Not implemented`, `throw new Error('TODO`, `{ ok: true }` in handlers that have no side effects. **Also check default/else branches in dispatch logic** — these return fake success when no known case matches and are the most commonly missed RC-STUB variant because they don't match named grep patterns. (Field reports: v17.0 assessment, #230)

**RC-VERIFY (Unverified Wiring):** After confirming a function is implemented (not a stub), verify it is actually called. Grep for the function name and confirm at least one call site exists in application code (not just tests). Check: (1) new classes never instantiated in `main()` or `app.ts`, (2) exported methods with zero callers outside their own file, (3) route handlers where the router file is never imported in the server entry, (4) event listeners where the event is never emitted, (5) middleware defined but never added to the chain. A function that passes RC-STUB but has zero call sites is dead code masquerading as a feature. (Field report #279)

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

## Quality Reduction Prohibition

**The Gauntlet is NEVER reduced, abbreviated, or "run efficiently."** Every round runs the full protocol for that round. No exceptions.

You MUST NOT:
- "Focus on the changeset" instead of reviewing the full codebase
- Run a "lightweight" version of any round
- Skip agents within a round because "context is heavy"
- Combine rounds to "save context"

If you believe context is limited, run `/context` and report the actual number. Below 85%: continue full protocol. Above 85%: checkpoint and suggest a fresh session. Never reduce Gauntlet quality in the current session.

This rule exists because agents self-justified "efficient" Gauntlets at 28% and 37% context usage, letting bugs through that full rounds would have caught.

**Context excuses are not valid.** "Context is heavy" without a number is not justification for reducing rounds, skipping agents, or deferring work. Run `/context`, report the percentage, and continue. If above 85%: checkpoint and suggest a fresh session. Below 85%: full protocol, no exceptions. (Field report #150)

## Flags

- `--fast` — Skip Rounds 4 (Crossfire) and 5 (Council). For projects where a lighter review is acceptable. Still 3 rounds, still comprehensive. (formerly `--quick` — renamed v17.3 for cross-command consistency)
- `--security-only` — Run 4 rounds of security only: inventory, full audit, re-probe, adversarial. Kenobi's marathon. For when you specifically need a deep security review.
- `--ux-only` — Run 4 rounds of UX only: surface map, full audit, re-verify, enchantment. Galadriel's marathon.
- `--qa-only` — Run 4 rounds of QA only: discovery, full pass, re-probe, adversarial. Batman's marathon.
- `--resume` — Resume from the last completed round (reads from gauntlet-state.md).
- `--ux-extra` — Extra Éowyn enchantment emphasis across all rounds. Galadriel's team proposes micro-animations, copy improvements, and delight moments beyond standard usability/a11y. Produced 7 shipped enchantments in the v7.1.0 Gauntlet.
- `--assess` — **Pre-build assessment mode.** Run Rounds 1-2 only (Discovery + First Strike) and produce an assessment report — no fix batches, no Crossfire, no Council. Designed for evaluating existing codebases before a rebuild or migration. When an existing codebase has fundamental issues (stubs, abandoned migrations, missing auth), Rounds 3-10 become redundant because there are no fixes to verify between rounds. The assessment report groups findings by root cause rather than by domain, producing a "State of the Codebase" view. (Field report #125: Infinity Gauntlet on a half-built system produced 120+ findings all tracing to the same root cause — stubs returning True.)
- `--infinity` — **The Infinity Gauntlet.** 10 rounds (2x full pass). Every active agent deployed as its own sub-process — not combined, not summarized. The full ~110 agent roster across 9 universes. See below.
- `--blitz` — Autonomous execution: no pause between rounds, auto-apply fixes, auto-continue. Combine with `--infinity` for fully autonomous maximum review. Does NOT reduce agent count or skip rounds — only removes human interaction between rounds.
- `--reckoning` — Pre-launch parity audit: 5-wave parallel review (Marketing → UI → Backend → Gates → Cross-cutting) with ~13 agents. Lighter than `--infinity`, focused on launch readiness rather than code quality. See CAMPAIGN.md "The Reckoning" for the full wave structure.

### The Infinity Gauntlet (`--infinity`)

*"I used the stones to destroy the stones."*

This is the ultimate test. Every active agent in VoidForge runs as its own dedicated sub-process. No combining agents into single prompts. No "Picard + Stark combined." Each agent gets its own launch, its own context, its own findings.

**10 rounds (2 full passes):**

**Pass 1 — Discovery + Strike + Crossfire + Council (Rounds 1-5):**

Round 1 — Discovery (launch 5+ agents in parallel):
- Agent 1: **Picard** (Architecture) — with Crusher (diagnostics) + Archer (greenfield assessment)
- Agent 2: **Stark** (Code Review) — with Spock (pattern compliance) + Seven (integration tracing)
- Agent 3: **Galadriel** (UX Surface Map) — with Éowyn (enchantment scan) + Celeborn (design system)
- Agent 4: **Kenobi** (Security Inventory) — with Han (first strike) + Cassian (threat modeling)
- Agent 5: **Kusanagi** (Infrastructure) — with Senku + Levi + Spike

Round 2 — First Strike (launch full domain teams as separate agents):
- Agent 1: **Batman** → Oracle, Red Hood, Alfred, Lucius (core QA)
- Agent 2: **Batman** → Deathstroke, Constantine, Cyborg, Raven, Wonder Woman (adversarial QA)
- Agent 3: **Batman** → Green Lantern (test matrix), Flash (smoke tests), Batgirl (detail), Aquaman (deep dive)
- Agent 4: **Galadriel** → Elrond, Arwen, Samwise, Bilbo, Legolas, Gimli, Radagast, Éowyn, Celeborn
- Agent 5: **Galadriel** → Aragorn, Faramir, Pippin, Boromir, Haldir, Frodo, Merry (extended Tolkien)
- Agent 6: **Kenobi** → Leia, Chewie, Rex, Bo-Katan, Maul (parallel security)
- Agent 7: **Kenobi** → Yoda, Windu, Ahsoka, Padmé, Qui-Gon, Sabine (sequential + extended)
- Agent 8: **Stark** → Rogers, Banner, Strange, Barton, Romanoff, Thor, T'Challa, Wanda (full backend)
- Agent 9: **Picard** → Spock, Uhura, Worf, Tuvok, Scotty, Torres, Kim, Janeway, Riker (full architecture)
- Agent 10: **Kusanagi** → Senku, Levi, Spike, L, Bulma, Holo, Valkyrie, Vegeta, Trunks, Mikasa, Erwin, Mustang, Olivier, Hughes, Calcifer, Duo (full DevOps)

Round 3 — Second Strike (re-probe all domains with fresh agents):
- Nightwing, Red Hood, Deathstroke (QA re-probe)
- Samwise, Radagast, Merry (UX re-verify)
- Maul, Ahsoka, Padmé, Anakin, Din Djarin (security re-probe)
- Kusanagi full team (DevOps re-verify)
- Superman (standards enforcement), Huntress (flaky tests)

Round 4 — Crossfire (5 adversarial agents, each as own sub-process):
- **Maul** — attacks reviewed code
- **Deathstroke** — bypasses security remediations
- **Loki** — chaos-tests cleared features
- **Constantine** — hunts cursed code in fixed areas
- **Éowyn** — final enchantment on hardened product

Round 5 — Council (6+ agents, each as own sub-process):
- **Spock** — pattern/quality verification
- **Ahsoka** — access control verification
- **Nightwing** — full regression
- **Samwise** — final a11y audit
- **Padmé** — critical path functional verification
- **Troi** — PRD compliance section-by-section. **Troi — Browser PRD Compliance:** When E2E infrastructure exists, Troi walks through each PRD user flow in the browser using page objects. Compares rendered content against PRD Sections 2 (routes), 4 (features), and 14 (brand voice). Screenshot evidence logged.
  Troi also performs Marketing Copy Drift Check — verifies marketing claims match shipped features.

**Pass 2 — Repeat (Rounds 6-10):** Same structure, all agents re-deployed on the fixed codebase. Pass 2 should find zero issues if Pass 1 fixes were correct.

**Agent count:** ~60-80 agent sub-process launches across 10 rounds (some agents run in both passes). This is the most thorough review possible within a single session.

**When to use:** After completing a major version (v8.x, v9.x). Before v1.0 of a real product. When shipping to production for the first time. When the cost of a missed bug exceeds the cost of the review.

**ENFORCEMENT:** Every agent named above MUST be launched as its own Agent tool invocation. Do NOT combine agents. Do NOT shortcut to inline analysis. If context reaches 85%, checkpoint and resume in a fresh session — do NOT reduce the agent count. The Infinity Gauntlet is the one protocol where "too thorough" is impossible.

## Agent Confidence Scoring

Each agent reports a confidence score (0-100) on their findings. The score reflects how certain the agent is that the finding is a real issue (not a false positive).

**Score ranges:**
- **90-100:** High confidence — agent is very sure. Skip re-verification in Pass 2.
- **60-89:** Medium confidence — standard handling. Include in findings, verify in next round.
- **0-59:** Low confidence — escalate to a second agent from a DIFFERENT universe before presenting. If the second agent disagrees, drop the finding. If the second agent agrees, upgrade to medium confidence.

**How to report:** Every finding includes a confidence field: `[ID] [SEVERITY] [CONFIDENCE: XX] [FILE] [DESCRIPTION]`

**Why this matters:** In the v8.0 Gauntlet, several "findings" were false positives that wasted fix time. Confidence scoring lets agents express uncertainty instead of presenting everything as definitive. Low-confidence findings get a second opinion before reaching the user.

## Sub-agent Failure Fallback

If a sub-agent launch fails (API error, timeout, context exhaustion):
1. **Retry once** with 5-second backoff.
2. If retry fails, **run the analysis inline** (in the current context) with a logged warning: "Agent [name] failed to launch — running inline. Findings may be less thorough."
3. Log the failure to the gauntlet state file with the agent name and error.
4. Never skip an agent entirely. Inline analysis is degraded but better than a blind spot.

## Alternative Patterns

### The Reckoning (Pre-Launch Parity Audit)

When the goal is "can we ship this?" rather than "is this code perfect?", the Reckoning runs 5 parallel waves focused on launch readiness:
1. **Marketing parity** — does the site say what the product does?
2. **UI parity** — do all pages/flows match the PRD?
3. **Backend parity** — are all endpoints wired and functional?
4. **Gate parity** — auth, payments, error handling all working?
5. **Cross-cutting** — a11y, SEO, performance, mobile

~13 agents, 30-60 minutes. Complements the Gauntlet (which is code-focused) with a product-focused lens. Reference: field report #85.

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
