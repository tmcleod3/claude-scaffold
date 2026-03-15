# SUB-AGENT ORCHESTRATOR
## The War Room

> *"Assemble."*

## Purpose

Parallelize development across multiple Claude Code sessions. Each session runs a specialist. The orchestrator delegates, resolves conflicts, integrates changes.

**All orchestration uses the build journal.** Every delegation, handoff, and resolution is logged to `/logs/handoffs.md`. Agents read journal files to recover context. See `/docs/methods/BUILD_JOURNAL.md`.

**Full character roster: `/docs/NAMING_REGISTRY.md`** — 170+ named characters across 7 universes. No duplicates allowed.

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

## Naming Rule

When spinning up agents, check NAMING_REGISTRY.md. First claim wins. No duplicates across sessions. Log active names.

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

## Anti-Patterns

1. Don't run all agents at once on fresh codebase. Start Picard + Stark, layer others.
2. Don't let agents refactor outside scope.
3. Don't skip handoff checklist.
4. Don't ignore conflicts between agents on same file.
5. Don't forget Batman. Every significant change gets QA.
6. Don't use parallel agents for work that touches the same files — merge conflicts waste more time than sequential work.
