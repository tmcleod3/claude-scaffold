# Lessons Learned

> Patterns that worked, patterns that failed, and decisions worth remembering. Updated after each project. When a lesson is confirmed across multiple projects, promote it into the relevant method doc.

## How to Use This File

1. After completing a project (or a significant phase), add entries below
2. Tag each lesson with the relevant agent and category
3. When a pattern proves reliable across 2+ projects, move it into the method doc
4. Delete lessons that turn out to be wrong or context-specific

## Template

```
### [Short title]
**Agent:** [Who discovered this] | **Category:** [pattern/antipattern/decision/gotcha]
**Context:** [What project/situation]
**Lesson:** [What we learned]
**Action:** [What to do differently / what to keep doing]
**Promoted to:** [method doc name, if promoted] or "Not yet"
```

---

## Lessons

### Inline analysis roleplaying agent perspectives is not a Muster
**Agent:** Bashir (Post-Mission) | **Category:** antipattern
**Context:** VoidForge v18.0 design — `/architect --muster` was invoked but agent presented inline analysis instead of launching sub-agents. User caught it. Real 3-wave Muster found 5 blockers the inline version missed.
**Lesson:** The agent will always prefer inline analysis (faster, less effort, stays in context). But parallel sub-processes find things sequential inline reasoning misses — 5 blockers in this case. When a flag says "launch agents," it means launch agents. Enforcement language must be explicit and unambiguous, matching the pattern already established in GAUNTLET.md and SYSTEMS_ARCHITECT.md.
**Action:** Added "AGENT DEPLOYMENT IS MANDATORY" enforcement block to MUSTER.md. Added "ENFORCEMENT: Must launch Agent tool sub-processes" to --muster flag in all 4 command files.
**Promoted to:** MUSTER.md (enforcement section), architect.md, campaign.md, build.md, gauntlet.md (flag descriptions)

### Stubs ship as features and never get implemented
**Agent:** Thanos (Assessment Gauntlet) | **Category:** antipattern
**Context:** VoidForge v17.0 pre-build assessment — 77 `throw new Error('Implement...')` calls across 8 adapter files, 1 freeze endpoint returning fake success, 1 AWS validation format-only stub, hollow heartbeat daemon handlers. All shipped between v11.0–v15.3 as if functional.
**Lesson:** When stubs are committed "to be implemented later," they almost never are. The codebase grows around them, tests don't cover them (they throw), and users or downstream systems encounter the stubs as production failures. The Cultivation Growth Engine had 13/28 files functional but was externally non-functional because every adapter was a stub. The architecture was sound; the implementation was absent.
**Action:** The No Stubs Doctrine (v17.0): never ship stub code. If a feature can't be fully implemented, don't create the file — document it in ROADMAP.md. Sandbox adapters with realistic fake data are full implementations. Enforcement added to BUILD_PROTOCOL, CAMPAIGN, GAUNTLET, ASSESS, and ARCHITECT method docs.
**Promoted to:** CLAUDE.md (Coding Standards), BUILD_PROTOCOL.md (Implementation Completeness Gate), CAMPAIGN.md (Rule 5.1), GAUNTLET.md (RC-STUB), SYSTEMS_ARCHITECT.md (ADR Implementation Scope), GROWTH_STRATEGIST.md (Rule 1.1), assess.md (detection target)

### Agents verify files in isolation — must follow the data across modules
**Agent:** Spock, Seven, Data (all three) | **Category:** antipattern
**Context:** Kongo.io Sprint 4 — 3 bugs escaped 4+ rounds of /review across parallel agents
**Lesson:** Review agents read files in the diff and check each against patterns, but never follow the data flow to the consumer. An avatar upload used key prefix `avatars/` but the asset proxy only allowed `uploads/`. An API returned a specific error but the UI displayed a generic fallback. A CSV import had no template for users to discover the schema. All three were caught by manual user testing.
**Action:** Added three mandatory rules: (1) Integration Tracing — when code produces URLs/keys/data consumed elsewhere, read the consumer. (2) Error Path Verification — verify the UI displays specific server errors, not generic fallbacks. (3) Error State Testing — test forms with intentionally invalid/conflicting input.
**Promoted to:** `/review` (integration tracing + error paths), `/ux` (error state testing), `/qa` (smoke tests), `/test` (integration tests)

### Static analysis cannot replace hitting the running server
**Agent:** Batman | **Category:** antipattern
**Context:** Kongo.io Sprint 4 — asset proxy 404 only discoverable at runtime
**Lesson:** Code review reads source files. But some bugs only manifest when the server processes an actual request — the asset proxy's `startsWith("uploads/")` check was invisible to static analysis because both the upload route and the proxy individually looked correct.
**Action:** Added Step 2.5 (Smoke Tests) to /qa — after build, execute actual HTTP requests against localhost for each new feature. Upload a file then fetch the URL. Submit valid then invalid data. Verify cross-module paths at runtime.
**Promoted to:** `/qa` (Step 2.5 — Smoke Tests)

### Clamp values BEFORE constructing the object that consumes them
**Agent:** Batman (DC) | **Category:** gotcha
**Context:** VoidForge v7.1.0 Gauntlet — PTY cols/rows clamping placed after spawnOptions construction
**Lesson:** JavaScript objects capture values by-value at construction time. Reassigning the local variable AFTER the object is created does NOT update the object's field. The PTY spawned with unclamped values because the clamping was placed between `spawnOptions = { cols, rows }` and `pty.spawn(shell, [], spawnOptions)`. Moving the clamp BEFORE the object construction fixed it.
**Action:** When validating/sanitizing input, always do it BEFORE constructing any object or calling any function that uses the values. Never clamp between object construction and usage.
**Promoted to:** Not yet

### Synchronous lock acquisition before async work prevents TOCTOU in Node.js
**Agent:** Loki (Marvel) | **Category:** pattern
**Context:** VoidForge v7.1.0 Gauntlet — concurrent provisioning race condition
**Lesson:** The provisioning endpoint checked `if (activeProvisionRun)` then did async work (JSON parsing, credential loading) before setting `activeProvisionRun = runId`. Two requests arriving in the same event loop tick could both pass the check. Fix: set the lock IMMEDIATELY (synchronously) after the check, before any `await`.
**Action:** For single-process mutex patterns in Node.js, always check-and-set in the same synchronous block. Never put async work between the check and the set.
**Promoted to:** `docs/methods/BACKEND_ENGINEER.md` (Node.js Single-Process Mutex gotcha)

### CSS animation replay requires reflow between class removal and re-addition
**Agent:** Constantine (DC) | **Category:** gotcha
**Context:** VoidForge v7.1.0 Gauntlet — forge-lit pulse animation only fired once
**Lesson:** Adding a CSS class that triggers an animation only works the first time. Re-adding the same class is a no-op if it's already present. To replay: remove the class, force a reflow (`void element.offsetWidth`), then re-add the class. Without the reflow, the browser batches the remove+add and skips the animation.
**Action:** When CSS animations need to replay on repeated user actions, use the remove-reflow-add pattern.
**Promoted to:** Not yet

### Shell profiles can re-inject environment variables you filtered out
**Agent:** Deathstroke (DC) | **Category:** gotcha
**Context:** VoidForge v7.1.0 Gauntlet — ANTHROPIC_API_KEY removed from PTY env but shell profile could re-export it
**Lesson:** Filtering environment variables from a PTY's initial env only controls what's explicitly passed. If the PTY spawns a login shell that sources `.zshrc`/`.bashrc`, any `export` statements in the profile will re-inject variables. This is an accepted design tradeoff — you can't control user shell configuration without breaking their environment.
**Action:** Document this limitation. For true isolation, use containerized environments or non-login shells with `--noprofile --norc`.
**Promoted to:** Not yet

### NextAuth v5 authorize() throws are wrapped — use side-channel for error reasons
**Agent:** Batman (DC) | **Category:** gotcha
**Context:** Kongo.io v3.12 — email verification gate (field report #115)
**Lesson:** NextAuth v5 beta wraps all errors thrown from `authorize()` into a generic CredentialsSignin error. Custom error messages are lost. Auto-login after signup with verification required triggers duplicate emails. Verification redirects to authenticated routes can create apparent privilege escalation with existing sessions.
**Action:** Never throw custom errors from authorize() expecting them to reach the client. Use a separate API endpoint for specific error reasons. Never auto-login when email verification is required. Never redirect verification links to authenticated routes.
**Promoted to:** QA_ENGINEER.md (Nightwing auth flow end-to-end)

### Chat edits are invisible to saved state — JSX is the source of truth
**Agent:** Stark (Marvel) | **Category:** antipattern
**Context:** Kongo.io v3.11 — designSystem stale after chat CSS edit (field report #111)
**Lesson:** When any system stores a "snapshot" of generated output (designSystem, companyBrief), chat edits that modify the underlying JSX/HTML create a divergence. The saved snapshot is stale. Always extract from the current JSX (source of truth) rather than reading saved snapshots.
**Action:** After chat edits that modify CSS vars or design tokens, extract and re-save the designSystem from the current DOM/JSX. Saved state is a cache, not the authority.
**Promoted to:** CAMPAIGN.md (data source verification)

### CLAUDE.md is a contract — every claim must have a backing file
**Agent:** Troi (Star Trek) + Coulson (Marvel) | **Category:** antipattern
**Context:** VoidForge v10.0-v12.4.0 — /dangerroom listed in CLAUDE.md but no command file existed (field report #108)
**Lesson:** CLAUDE.md's slash command table, agent table, and docs reference table are contracts with the user. Every entry must have a corresponding file. The /dangerroom command was listed in the table for 30 versions and survived 3 Infinity Gauntlets undetected because no audit step verified table entries against actual files.
**Action:** (1) /git Step 5.5 now includes a CLAUDE.md command table integrity check. (2) Gauntlet Council Troi now verifies CLAUDE.md claims (commands, agents, docs) against the filesystem.
**Promoted to:** RELEASE_MANAGER.md (command table integrity check), GAUNTLET.md (Troi CLAUDE.md verification)

### Infrastructure credentials must survive .env edits
**Agent:** Kusanagi (DevOps) + Kira (Campaign) | **Category:** antipattern
**Context:** Dialog Travel Campaign 9 deploy failure (field report #103)
**Lesson:** SSH_HOST was written to `.env` by the provisioner during initial setup but was lost during subsequent `.env` edits across 9 campaigns. No redundant storage existed for infrastructure credentials. The `rsync --delete` then destroyed 250 VPS-only avatar files, and the recovery attempt cleared 251 DB fields unnecessarily.
**Action:** (1) Write deploy credentials to BOTH `.env` AND `~/.voidforge/projects.json`. (2) Validate SSH_HOST, SSH_KEY before any deploy. (3) NEVER `rsync --delete` without excluding VPS-only directories. (4) Before any destructive DB operation, check if the data can be restored from backup first.
**Promoted to:** CAMPAIGN.md (Step 0 credential check), DEVOPS_ENGINEER.md (rsync exclusion + credential pre-flight), TROUBLESHOOTING.md (destructive DB recovery checklist)

### Read the source before re-exporting from it
**Agent:** Spock (Star Trek) | **Category:** antipattern
**Context:** VoidForge v15.1 Campaign 17 — proxy module creation for pattern extraction (field report #148)
**Lesson:** When creating proxy/barrel re-export files, 4 phantom type names were exported that didn't exist in the source module (FinancialRecord, SpendRecord, refreshOAuthToken, checkTokenHealth). The re-exports were written from assumptions about what the pattern files exported, not from reading the actual export statements. TypeScript caught them, but they created noise in the Victory Gauntlet.
**Action:** ALWAYS `grep '^export' <source-file>` before writing re-export lines. Do not assume what a module exports based on its usage in consumers — consumers may import a subset, and type names may differ.
**Promoted to:** Not yet

### Read the function before testing it
**Agent:** Batman (DC) | **Category:** antipattern
**Context:** VoidForge v15.1 Campaign 17 — test suite creation (field report #148)
**Lesson:** ~30% of test cases failed on first run when expectations were based on assumed behavior. parseFrontmatter() returns {frontmatter, body} not a flat object. classifyTier threshold is 10000 not 2500. isPrivateIp doesn't cover link-local. Tests written after reading the implementation had <5% first-run failure rate.
**Action:** Every test case MUST be written after reading the function's implementation. Read signature, return type, and boundary conditions before the first expect().
**Promoted to:** Not yet

### Numeric context checks — cite the actual percentage
**Agent:** Sisko (Star Trek) | **Category:** antipattern
**Context:** VoidForge v15.1 Campaign 17 — blitz mode checkpoint at 27% (field report #148)
**Lesson:** At 267k/1000k (27%), suggested stopping the blitz. The CAMPAIGN.md rule says only checkpoint above 70%. Self-imposed caution overrode the protocol, costing the user time until they corrected it. The 1M context window allows ~40 agent launches before reaching 70%.
**Action:** Context checkpoint decisions MUST cite the actual percentage from /context. "Context is heavy" without a number is not valid justification.
**Promoted to:** Not yet

### Iframe stacking context defeats z-index
**Agent:** Galadriel (UX) | **Category:** gotcha
**Context:** Dialog Travel map overlay (field report #79)
**Lesson:** Iframes with `allow-same-origin` create impenetrable stacking contexts. z-index has no effect across stacking context boundaries — a `z-index: 9999` overlay inside the main document cannot appear above an iframe's stacking context.
**Action:** Use `createPortal(element, document.body)` for any overlay that coexists with iframes. See `docs/patterns/component.tsx` Portal Pattern.
**Promoted to:** docs/patterns/component.tsx (Portal Pattern)

### Slug generation must handle special characters
**Agent:** Bashir (Star Trek) | **Category:** gotcha
**Context:** Kongo v4.2.0 — apostrophes in names (T'Pol, O'Brien) broke filename-based lookups
**Lesson:** Centralize slug generation. Test with names containing apostrophes, dots, spaces, unicode.
**Action:** Always use a shared slugify function, never ad-hoc string replacement. Test edge cases.
**Promoted to:** Not yet

### HMAC key derivation from password prevents key-type confusion
**Agent:** Kenobi (Star Wars) | **Category:** pattern
**Context:** Kongo Campaign 18 — vault HMAC key derived separately from encryption key
**Lesson:** Derive HMAC authentication keys using HKDF with a distinct context string, never reuse the encryption key.
**Action:** Use separate HKDF derivations for encryption vs authentication.
**Promoted to:** Not yet
