# /architect — Picard's Architecture Review

**AGENT DEPLOYMENT IS MANDATORY.** Steps 1 and 4 specify parallel agent launches via the Agent tool. You MUST actually launch these agents as separate sub-processes — do NOT shortcut to inline analysis, even if you think you can answer faster by reading files directly. The agents exist because parallel analysis catches things sequential reading misses. Skipping agent deployment is a protocol violation. (Field report #68)

## Dynamic Dispatch (ADR-044)

Opus scans `git diff --stat` and matches changed files against the `description` fields of all agents in `.claude/agents/`. Matching specialists launch alongside the core agents below.

**Dispatch control:** `--light` skips dynamic dispatch (core only). `--solo` runs lead agent only.

**Promoted agent:** **Riker** `subagent_type: Riker` runs on every ADR written — challenges trade-offs.

## Silver Surfer Pre-Scan (ADR-048)

**MANDATORY — NO EXCEPTIONS.** Launch the Silver Surfer before deploying ANY other agents. This is not negotiable, not deferrable, and not skippable regardless of how simple the task appears. "The task is simple" is NOT a valid reason to skip — the Surfer catches cross-domain relevance that you cannot predict. "I already know which agents to use" is NOT a valid reason — the Surfer reads agent definitions you haven't loaded. Skipping the Surfer is a protocol violation equivalent to skipping the Victory Gauntlet. **If you find yourself thinking "I don't need the Surfer for this" — that is exactly when you need it most.**

Read the `heralding:` field from `.claude/agents/silver-surfer-herald.md` and announce it before launching.

**How to launch:** Use the Agent tool with these exact parameters:
- `description`: "Silver Surfer roster scan"
- `prompt`: "You are the Silver Surfer, Herald of Galactus. Read your instructions from .claude/agents/silver-surfer-herald.md, then execute your task. Command: /architect. User args: <ARGS>. Focus: <FOCUS or 'none'>. Scan the .claude/agents/ directory, read agent descriptions and tags, and return the optimal roster for this command on this codebase."

**After the Surfer returns**, deploy the FULL roster — every agent the Surfer selected. Do NOT cherry-pick "key specialists" from the list. The Surfer already curated it. Launch all of them alongside this command's hardcoded leads.

**`--focus "topic"`** — include in the Surfer's prompt as the focus bias.
**`--light`** — skip the Surfer, use only hardcoded roster below.
**`--solo`** — skip Surfer and all sub-agents, lead only.

## Context Setup
1. Read `/logs/build-state.md` — understand current project state
2. Read `/docs/methods/SYSTEMS_ARCHITECT.md`
3. Read `/docs/PRD.md` (System Architecture + Tech Stack sections)

## Pre-Analysis — Conflict Scan
Before any deep analysis, scan the PRD frontmatter for structural contradictions (see SYSTEMS_ARCHITECT.md Conflict Checklist). Check: auth+database, payments+auth, websockets+deploy, workers+deploy, database+deploy, cache+deploy, admin+auth, email+credentials. Flag any contradictions immediately — these cost hours if caught late.

## Agent Deployment Manifest

**Lead:** `subagent_type: Picard`
**Full bridge crew:** `spock-schema`, `uhura-integration`, `worf-security-arch`, `tuvok-deep-current`, `scotty-infrastructure`, `kim-api-design`, `janeway-novel-arch`, `torres-site-scanner`, `la-forge-reliability`, `data-tech-debt`, `crusher-diagnostics`, `archer-greenfield`, `pike-bold-decisions`, `riker-review`, `troi-prd-compliance`

## Step 0 — System Discovery
- **Crusher** `subagent_type: Crusher` — System health baseline: test coverage, build time, dependency age, code complexity.
- **Archer** `subagent_type: Archer` — (greenfield only) Initial directory structure, module boundaries, naming conventions.

Produce: system identity, component inventory, data flow diagram (ASCII), dependency graph.
Write to `/logs/` (phase-00 if during orient, or a dedicated architecture log).

## Step 1 — Parallel Analysis
Use the Agent tool to run these in parallel — they are independent analysis tasks:

- **Agent 1** `subagent_type: Spock` — Schema review: normalization, index/query alignment, nullable fields, audit fields, PII isolation, data lifecycle, backup/recovery.
- **Agent 2** `subagent_type: Uhura` — Integration review: service inventory (purpose, failure mode, fallback, cost, lock-in), API version pinning, response validation, abstraction layers.
- **Agent 3** `subagent_type: Worf` — Security implications of architectural decisions: PII colocation, unauthenticated internal state access, permissive service boundaries. Audits *design*, not code.
- **Agent 4** `subagent_type: Tuvok` — Security architecture: auth flow design, token storage, session architecture, encryption at rest vs in transit. Where Worf flags implications, Tuvok designs solutions.

Synthesize findings from all four agents.

## Step 2 — Service Architecture + API Design
- **Scotty** `subagent_type: Scotty` — Boundary assessment, monolith vs services, async vs sync decisions.
- **Kim** `subagent_type: Kim` — API surface review: REST conventions, error shapes, pagination, versioning.
- **Janeway** `subagent_type: Janeway` — (conditional) When standard monolith doesn't fit: event-sourcing, CQRS, serverless, edge computing.
- Informed by Spock's schema, Uhura's integrations, and Worf/Tuvok's security findings.

## Step 3 — Scaling + Performance
- **Scotty** `subagent_type: Scotty` — First bottleneck identification, three-tier scaling plan (current → 10x vertical → 100x horizontal), cost estimates.
- **Torres** `subagent_type: Torres` — Performance architecture: N+1 patterns, missing indexes, connection pool sizing, caching strategy gaps.

## Step 4 — Parallel Analysis
Use the Agent tool to run these in parallel — they are independent analysis tasks:

- **Agent 1** `subagent_type: La Forge` — Failure analysis: for each component, answer "What happens when this fails?" (DB down, cache down, API down, worker crash).
- **Agent 2** `subagent_type: Data` — Tech debt catalog: wrong/missing abstraction, premature optimization, deferred decisions, dependency debt, documentation debt. Severity table with impact/risk/effort/urgency.

## Step 5 — ADRs + Decision Review
Write Architecture Decision Records to `/docs/adrs/` for every non-obvious choice. After writing, **Riker** `subagent_type: Riker` reviews: challenges trade-offs, verifies alternatives were truly considered, checks for second-order effects.
```
# ADR-001: [Title]
## Status: Accepted
## Context: [Why this decision was needed]
## Decision: [What was decided]
## Consequences: [Trade-offs, what this enables, what this prevents]
## Alternatives: [What else was considered and why it was rejected]
```

## Conflict Resolution
When architectural decisions conflict with other agents:
1. Check the PRD — product requirements take precedence
2. If PRD is silent, present trade-offs to the user with a recommendation
3. Document the resolution as an ADR
4. Log to `/logs/decisions.md`

For specific conflicts:
- **Picard vs Kusanagi (infra can't support arch):** Picard adjusts architecture to match real constraints
- **Picard vs Stark (implementation disagrees with design):** Present options, Picard decides, document as ADR
- **Picard vs Kenobi (security vs simplicity):** Security wins. Find the simplest secure architecture.

## Deliverables
1. ARCHITECTURE.md
2. /docs/adrs/ directory with decision records
3. SCALING.md
4. TECH_DEBT.md
5. FAILURE_MODES.md
6. All findings logged to appropriate `/logs/` file

## Arguments
- `--plan [description]` → Planning mode: analyze and recommend without executing. Present findings and proposed changes for review.
- `--focus "topic"` → Bias Herald toward topic (natural-language, additive)
- `--muster` → *(retired — accepted as no-op per ADR-043. Full roster is now the default. Use `--light` to reduce.)*

## Handoffs
- API/DB implementation → Stark, log to `/logs/handoffs.md`
- UI impacts → Galadriel, log to `/logs/handoffs.md`
- Security implications → Kenobi, log to `/logs/handoffs.md`
- Infrastructure constraints → Kusanagi, log to `/logs/handoffs.md`
