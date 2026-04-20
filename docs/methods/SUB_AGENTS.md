# SUB-AGENT ORCHESTRATOR
## System Protocol · Orchestrates: All Agents
## The Danger Room

> *"Assemble."*

## Purpose

Parallelize development across multiple Claude Code sessions. Each session runs a specialist. The orchestrator delegates, resolves conflicts, integrates changes.

**All orchestration uses the build journal.** Every delegation, handoff, and resolution is logged to `/logs/handoffs.md`. Agents read journal files to recover context. See `/docs/methods/BUILD_JOURNAL.md`.

**Full character roster: `/docs/NAMING_REGISTRY.md`** — all named characters across 9 universes. No duplicates allowed. All agents materialized as subagent definitions in `.claude/agents/`.

---

## The Full Roster

| Lead | Universe | Domain | Method Doc |
|------|----------|--------|-----------|
| **Galadriel** | Tolkien | Frontend, UX, Design | `PRODUCT_DESIGN_FRONTEND.md` |
| **Stark** | Marvel | Backend Engineering | `BACKEND_ENGINEER.md` |
| **Batman** | DC Comics | QA & Bug Hunting | `QA_ENGINEER.md` |
| **Kenobi** | Star Wars | Security Auditing | `SECURITY_AUDITOR.md` |
| **Picard** | Star Trek | Systems Architecture | `SYSTEMS_ARCHITECT.md` |
| **Kusanagi** | Anime | DevOps & Infrastructure | `DEVOPS_ENGINEER.md` |
| **Coulson** | Marvel | Release Management | `RELEASE_MANAGER.md` |
| **Bombadil** | Tolkien | Forge Sync & Updates | `FORGE_KEEPER.md` |
| **Chani** | Dune | Worm Rider (Telegram Bridge) | `THUMPER.md` |
| **Fury** | Marvel | The Initiative (Full Pipeline) | `ASSEMBLER.md` |

### Default Sub-Agents

**Tolkien:** Radagast, Aragorn, Legolas, Samwise, Elrond, Arwen, Gimli, Bilbo + 12 more
**Marvel:** Rogers, Banner, Strange, Barton, Romanoff, Thor, Hill, Loki + 17 more
**DC Comics:** Oracle, Red Hood, Alfred, Lucius, Nightwing, Deathstroke, Constantine + 18 more
**Star Wars:** Yoda, Windu, Ahsoka, Leia, Rex, Padmé, Chewie, Maul + 16 more
**Star Trek:** Spock, Scotty, Uhura, La Forge, Data + 19 more
**Dune:** Stilgar, Thufir, Idaho, Mohiam + 16 more
**Anime:** Senku, Levi, Spike, Bulma, Vegeta, Goku + 66 more (from Tom's watch list)

---

## When to Deploy Which Agent

| Task | Primary | May Also Involve |
|------|---------|-----------------|
| New frontend feature | Galadriel | Stark (API), Picard (if architectural) |
| New API endpoint | Stark | Galadriel (UI), Batman (testing) |
| Fix a bug | Batman | Stark or Galadriel (depending on location) |
| Security audit | Kenobi | All (review their domains) |
| Architecture decision | Picard | Stark, Kusanagi (implementation) |
| Deploy to production | Kusanagi | Batman (smoke test), Kenobi (security) |
| Performance issue | Stark or Galadriel | Picard (if arch), Kusanagi (if infra) |
| Database migration | Stark (Banner) | Picard (Spock review), Batman (verify) |

---

## Scope Boundaries (Example)

```
Galadriel: /src/app/, /src/components/, /src/styles/, /src/hooks/
Stark:     /src/lib/, /src/workers/, /src/types/, /prisma/
Batman:    Cross-cutting (reads everything, writes fixes)
Kenobi:    Cross-cutting (reads everything, writes fixes)
Picard:    /docs/ (ADRs, architecture), reviews all schemas
Kusanagi:    /scripts/, config files, /docs/RUNBOOK.md
```

Cross-cutting changes (shared types, DB schema, utils) require orchestrator approval.

---

## Conflict Resolution

### Single-domain conflicts
1. **Data/schema** → Picard decides
2. **Security vs UX** → Kenobi decides (security wins default)
3. **Performance vs readability** → Stark decides (Picard review)
4. **Design vs implementation** → Galadriel decides (UX wins default)

### Multi-agent conflicts (two agents disagree, both are right)
1. **Check the PRD.** If the PRD specifies a requirement, it wins. No agent overrides the PRD.
2. **If the PRD is silent:** Both agents present trade-offs to the user with a recommendation. Include: option A (agent 1's approach), option B (agent 2's approach), consequences of each, recommended path.
3. **Document the resolution** as an ADR in `/docs/adrs/` and log to `/logs/decisions.md`.

### Common multi-agent conflicts

| Conflict | Resolution |
|----------|-----------|
| Picard (microservices) vs Kusanagi (VPS can't support it) | Picard adjusts architecture to match real infrastructure constraints |
| Stark (convenience) vs Kenobi (security) | Security wins. Find the simplest *secure* approach. |
| Galadriel (UX ideal) vs Stark (backend limitation) | Present trade-offs. If UX is degraded, document as tech debt. |
| Batman (needs refactor to fix) vs timeline | Fix the bug with smallest safe change. Log the deeper refactor as tech debt. |
| Picard (ideal architecture) vs PRD (feature requires compromise) | PRD wins. Picard documents the compromise as an ADR with future migration path. |

---

## Agent Activity Logging (Danger Room Ticker)

When dispatching an agent via the Agent tool, append a JSONL entry to `logs/agent-activity.jsonl` **before** the tool call:

```json
{"agent":"Picard","task":"scanning architecture","timestamp":"2026-03-22T12:00:00Z"}
```

This powers the Danger Room's live agent ticker. The wizard server watches this file and broadcasts events via WebSocket. Without these entries, the ticker shows "Sisko standing by..." permanently.

**Rules:**
- One line per agent dispatch (JSON, no pretty-printing)
- `agent` field uses the character name (Picard, Batman, Galadriel — not "Agent 1")
- `task` field is a 3-5 word summary of the agent's assignment
- Truncate the file at the start of each `/campaign` or `/gauntlet` run (historical entries from previous sessions are not meaningful for the live ticker)
- If the file exceeds 1MB, truncate to the most recent 100 entries

This is **methodology-driven logging**, not hook-driven. Hooks cannot extract agent identity from tool input — the orchestrator must write the log entry explicitly. (Field report #128, architectural review)

## Delegation Template

```
AGENT: [Name]
TASK: [One sentence]
SCOPE: [Files/directories]
CONTEXT: [What to know from other agents]
ACCEPTANCE: [What "done" looks like]
CONSTRAINTS: [What NOT to touch]
```

## Response Template

```
AGENT: [Name]
STATUS: Done / Blocked / Needs Review
CHANGES: [Files modified, one-line each]
DECISIONS: [Non-obvious choices with rationale]
ASSUMPTIONS: [Needs confirmation]
RISKS: [Side effects]
REGRESSION: [How to verify]
```

## Agent Debate Protocol

When two agents disagree on a finding, run a structured debate instead of listing both opinions:

1. **Agent A states the finding** with evidence (file, line, reasoning)
2. **Agent B responds** with counter-evidence or alternative interpretation
3. **Agent A rebuts** — addresses Agent B's counter-evidence
4. **Arbiter decides** — Picard (for architecture), Batman (for QA), Kenobi (for security), or the user

**3 exchanges maximum.** If not resolved after the rebuttal, the arbiter decides.

**Log the debate** as an ADR in `/docs/adrs/` with both positions, evidence, and the decision. This is better than a one-line finding because future developers can understand WHY the decision was made.

**When to trigger:** When `/review`, `/qa`, or `/security` produces conflicting findings on the same code — e.g., Spock says "this is correct" and Kenobi says "this is a vulnerability." Don't debate on matters of fact (a missing import is a missing import). Debate on matters of judgment (is this pattern secure enough? is this abstraction worth the complexity?).

## Custom Sub-Agents

Users can create project-specific sub-agents that carry domain knowledge. Define them in `docs/CUSTOM_AGENTS.md`:

```markdown
### Jarvis-Tailwind
**Universe:** Marvel | **Reports to:** Galadriel
**Domain:** Tailwind CSS v4 configuration, PostCSS, source() directive
**Behavioral directives:** Always check for v3→v4 migration issues. Verify @config path.
**Reference docs:** tailwindcss.com/docs/upgrade-guide
```

**Rules:**
- Custom agents run alongside built-in agents, not instead of them
- Names must NOT collide with the naming registry — check `docs/NAMING_REGISTRY.md` before creating
- Use the format `[BaseName]-[Specialty]` to avoid collisions (e.g., `Jarvis-Tailwind`, not just `Jarvis`)
- Custom agents are loaded during Phase 0 Orient when the orchestrator reads `docs/CUSTOM_AGENTS.md`
- They participate in the review rounds of their lead's domain (e.g., a Galadriel custom agent runs during UX reviews)

**When to create a custom agent:** When a project has a domain-specific pattern that the built-in agents miss repeatedly. If the same lesson appears 3+ times in LESSONS.md about the same technology, that's a signal for a custom agent rather than more method doc checklist items.

## Subagent Definitions (ADR-044)

All agents are materialized as `.claude/agents/{name}.md` files. Commands now use `subagent_type: {agent-id}` instead of inline prompts. Each definition contains the agent's identity, behavioral directives, domain expertise, and output format.

### The `.claude/agents/` Directory

Each file is a standalone subagent definition that Claude Code's native subagent system can invoke. File naming convention: `{lowercase-name}.md` (e.g., `picard.md`, `batman.md`, `red-hood.md`).

### Model Tiering

| Tier | Model | Count | When |
|------|-------|-------|------|
| Lead | `inherit` (Opus) | ~20 | Domain leads who orchestrate, write fixes, make decisions |
| Specialist | `sonnet` | ~200 | Domain experts who analyze, review, report findings |
| Scout | `haiku` | ~43 | Lightweight reconnaissance, grep patterns, quick checks |

Leads inherit the main session's model (Opus). Specialists run on Sonnet for cost efficiency without sacrificing analysis quality. Scouts run on Haiku for fast, cheap reconnaissance.

### Tool Restrictions

| Profile | Tools | Agents |
|---------|-------|--------|
| Builder | Full (Read, Edit, Write, Bash, Grep, Glob) | Leads who write code, fixes, ADRs, logs |
| Reviewer | Read, Bash, Grep, Glob | Specialists who analyze and report but don't write |
| Scout | Read, Grep, Glob | Lightweight agents that only read |
| Adversarial | Read, Bash, Grep, Glob | Red-team agents who probe and test |

### Description-Driven Dispatch

Commands no longer use static dispatch tables (the old ADR-042 Cross-Domain Triggers). Instead, when Opus processes a command, it:

1. Scans `git diff --stat` to identify changed files
2. Matches changed file paths against the `description` fields of all agents
3. Launches matching specialists automatically alongside core agents

This means a security audit that touches database migrations automatically picks up Spock (schema) without a hardcoded trigger table. The descriptions in `.claude/agents/*.md` ARE the dispatch rules.

See `docs/AGENT_CLASSIFICATION.md` for the full classification manifest and `docs/adrs/ADR-044-subagent-materialization.md` for the architecture.

## Naming Rule

When spinning up agents, check NAMING_REGISTRY.md AND `docs/CUSTOM_AGENTS.md` (if it exists). First claim wins. No duplicates across sessions. Log active names.

---

## Single-Session Parallelism (Agent Tool)

Claude Code's built-in Agent tool can run sub-agents within a single session. Use this for parallelizing independent work without separate terminal windows.

### When to Use the Agent Tool

| Situation | Approach |
|-----------|----------|
| Independent audits (Oracle + Red Hood + Alfred) | Parallel agents — no dependencies |
| Independent reviews (Spock schema + Uhura integrations) | Parallel agents — no dependencies |
| Sequential dependencies (schema → API → UI) | Sequential — each depends on previous |
| Cross-cutting changes (shared types, DB schema) | Sequential — conflict risk |

### Agent Tool Pattern

```
Use the Agent tool to run these in parallel:
  - Agent 1 (Oracle): Scan /src/lib/ for logic flaws, missing awaits, type mismatches
  - Agent 2 (Red Hood): Test all API endpoints with malformed inputs
  - Agent 3 (Alfred): Run npm audit and review package.json dependencies
  - Agent 4 (Deathstroke): Adversarial probing — bypass validations, exploit business logic
  - Agent 5 (Constantine): Hunt cursed code — dead branches, impossible conditions
```

Each agent runs in its own context, reports back, and results are synthesized by the lead agent.

### Double-Pass Review Pattern

With 1M context, review phases use a double-pass pattern to catch fix-induced regressions:

```
Pass 1 (parallel): All review agents analyze → findings
Fix batch: Resolve all critical/high findings
Pass 2 (parallel): Verification agents re-probe fixed areas → confirm
```

This pattern applies to:
- Batman's QA (Nightwing + Red Hood + Deathstroke re-verify)
- Galadriel's UX (Samwise + Radagast re-verify)
- Kenobi's Security (Maul re-probes remediations)

**Important distinction:** The Agent tool enables **parallel analysis**, not parallel coding. Sub-agents return text findings — the lead agent then implements code changes sequentially. This is still faster than sequential analysis, but don't expect parallel file edits.

### Multi-Session Parallelism (Separate Terminals)

For larger projects where agents need to make code changes simultaneously, use separate Claude Code sessions in different terminal windows. Each session works on separate files within defined scope boundaries.

**Git coordination for multi-session:** Each session works on a feature branch. Merge to main after verification. If two sessions modify the same file, resolve conflicts before proceeding.

**Rule of thumb:** Read-only analysis → Agent tool (parallel). Code changes on separate files → separate sessions (parallel). Code changes on same files → single session (sequential).

---

### Parallel Agent Coordination

When launching parallel background agents that modify overlapping concerns, the orchestrator MUST specify:
1. **Schema ownership:** Only ONE agent may modify shared schemas (Prisma, SQL migrations, TypeScript interfaces). Other agents consume the schema, they don't change it.
2. **Naming conventions:** Specify casing and format for shared values (e.g., "tab values are lowercase", "enum values are UPPER_SNAKE"). Agents working in isolation will choose different conventions.
3. **Required fields:** List fields that MUST appear in shared data shapes (e.g., "all user selects must include isAnonymous"). Otherwise each agent cherry-picks different fields.

Without this lock, ~30% of cross-agent MUST FIX findings are convention conflicts, not logic bugs. (Field report #33)

### Mode Instructions Must Replace, Not Append

When an AI system has modal behavior (e.g., different output types, deck modes, project types), each mode's instructions must COMPLETELY REPLACE the default instructions — not append a footnote. A one-line override ("no scrolling") gets ignored when the default 11-section architecture contradicts it. Each mode needs its own complete specification. (Field report #27: one-line mode instructions were ignored because they contradicted the default architecture.)

## Parallel Agent Standard (ADR-036)

**All heavy work MUST be dispatched to sub-agents. The main thread is an orchestrator, not a worker.**

Proven in production: a full `/assemble --muster` (11 phases, 15+ agents) ran entirely through background sub-agents. Context stayed at 15-25% (vs 80%+ inline). 3x faster review phases. Better findings from parallel perspectives. (Field report #270)

### Main Thread Responsibilities

| Does | Does NOT |
|---|---|
| Plan agent dispatch | Read source files |
| Launch agents with structured briefs | Analyze code inline |
| Triage agent results | Write/edit source files directly |
| Make decisions at gates | Generate findings from raw code |
| Track status, report to user | Do work an agent could do |
| Git operations (commit, push) | Launch agent-to-agent dispatch |

### Standard Agent Brief

Every agent launch MUST include a structured brief:

```
AGENT: [Name] ([Universe])
ROLE: [One sentence]
MISSION: [One sentence]
SCOPE:
  READ: [files/directories]
  WRITE: [files] or NONE (read-only)
CONTEXT: [2-5 sentences from prior phases — NOT raw file contents]
DELIVERABLE FORMAT: [findings-table | change-report | position-statement | build-report]
CONSTRAINTS: [list]
```

### Structured Deliverables (mandatory)

| Agent Type | Deliverable |
|---|---|
| Review / QA / Security | Findings Table: severity, file:line, finding, fix recommendation |
| Fix agents | Change Report: finding ref, file, what changed, verified |
| Architecture / Council | Position Statement: assessment, concerns, sign-off |
| Build agents | Build Report: files created/modified, tests added, decisions made |

### Concurrency Rules (ADR-059)

- **Fan out the full roster in parallel for read-only analysis.** Opus 4.7's 1M context window handles 20+ concurrent findings tables without thrashing. Field report #270 confirmed 15+ parallel agents at 15-25% context usage.
- **No two concurrent agents may write to the same file** — partition by domain/concern, or serialize writes.
- **Fix/build agents:** batch into waves only when writes overlap. Independent files = parallel.
- **Wait for ALL parallel agents before synthesizing** (field report #300).
- Partition strategies: by domain (frontend/backend), by concern (security/UX), or read-only vs. write.

### Context Passing Between Phases

- Pass **findings summaries** between phases, not raw file contents
- The orchestrator distills what matters for the next phase
- Each agent gets only the context it needs, not the full conversation history

### Orchestration Loop

```
PLAN → LAUNCH → WAIT → TRIAGE → DECIDE → REPORT → NEXT
```

### Command-Level Dispatch Specs

| Command | Main Thread | Agents | Parallelism |
|---|---|---|---|
| `/review` | Partition files, triage findings | 2-3 review agents per round, fix agents | Domain-parallel reads, sequential fixes |
| `/security` | Route findings, manage fixes | Kenobi (full audit), Maul (re-probe) | Sequential (Maul needs Kenobi's fixes) |
| `/qa` | Triage bugs, prioritize | Batman QA + Batman Test | Parallel (different focus) |
| `/assemble` | Full pipeline orchestration | ALL phases dispatched | Wave-batched per phase |
| `/gauntlet` | Round management | 5-8 agents per round | Waves of 3 |
| `/build` | Phase sequencing | Build agents per mission | 2-3 parallel when independent |

### Exception: Trivial Operations

Do NOT dispatch for: <3 files, <10 lines of analysis, single-file edits, git operations, user-facing questions. The 10-second agent launch overhead exceeds the value for trivial ops.

## Anti-Patterns

1. Don't run all agents at once on fresh codebase. Start Picard + Stark, layer others.
2. Don't let agents refactor outside scope.
3. Don't skip handoff checklist.
4. Don't ignore conflicts between agents on same file.
5. Don't forget Batman. Every significant change gets QA.
6. Don't use parallel agents for work that touches the same files — merge conflicts waste more time than sequential work.
7. **Don't do inline analysis when an agent could do it.** Reading 50 files fills context with raw code instead of synthesized findings. Dispatch to an agent, get back a findings table. (Field report #270)
8. **Don't let agents dispatch other agents.** The main thread is the hub. Agent-to-agent dispatch creates coordination chaos.
9. **Don't implement while agents are running.** When agents are deployed in parallel, wait for ALL to return before beginning implementation. Synthesize all findings first, then implement in one batch. Starting early means you miss findings and do rework. (Field report #300)
