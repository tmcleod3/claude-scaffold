# SUB-AGENT ORCHESTRATOR
## The War Room

> *"Assemble."*

## Purpose

Parallelize development across multiple Claude Code sessions. Each session runs a specialist. The orchestrator delegates, resolves conflicts, integrates changes.

**Full character roster: `/docs/NAMING_REGISTRY.md`** — 150+ named characters across 6 universes. No duplicates allowed.

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

### Default Sub-Agents

**Tolkien:** Gandalf, Aragorn, Legolas, Samwise, Elrond, Arwen, Gimli, Bilbo + 12 more
**Marvel:** Rogers, Banner, Strange, Barton, Romanoff, Thor, Fury + 18 more
**DC Comics:** Oracle, Red Hood, Alfred, Lucius, Nightwing + 20 more
**Star Wars:** Yoda, Windu, Ahsoka, Leia, Rex, Padmé, Chewie + 17 more
**Star Trek:** Spock, Scotty, Uhura, La Forge, Data + 19 more
**Anime:** Senku, Levi, Spike, L, Bulma, Holo + 66 more (from Tom's watch list)

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

1. **Data/schema** → Picard decides
2. **Security vs UX** → Kenobi decides (security wins default)
3. **Performance vs readability** → Stark decides (Picard review)
4. **Design vs implementation** → Galadriel decides (UX wins default)
5. **Everything else** → Orchestrator decides

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

## Anti-Patterns

1. Don't run all agents at once on fresh codebase. Start Picard + Stark, layer others.
2. Don't let agents refactor outside scope.
3. Don't skip handoff checklist.
4. Don't ignore conflicts between agents on same file.
5. Don't forget Batman. Every significant change gets QA.
