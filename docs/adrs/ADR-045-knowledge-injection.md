# ADR-045: Knowledge Injection — Closing the Learning-to-Agent Gap

## Status: Accepted

## Context

ADR-044 materialized 263 agents as Claude Code subagent definitions. The definitions capture character identity and generic behavioral directives (~50 lines each). But the method docs contain 30+ campaigns of accumulated operational intelligence: specific grep patterns, mandatory gates, field-report-derived checks, exact thresholds, and multi-step protocols (~150-350 lines each).

An audit of the 5 lead agents reveals the definitions contain **3-12% of the operational knowledge** in their corresponding method docs. When an agent runs from its definition alone (e.g., via dynamic dispatch per ADR-044), it loses 85-97% of the battle-tested knowledge.

Additionally, six breaks exist in the knowledge flow:

### Break 1 (Critical): Agent definitions not distributed

The prepack script correctly bundles `.claude/agents/` into the npm package. But the three consumption points don't install them:

| Path | Copies Agents? |
|------|---------------|
| `project-init.ts` (npx voidforge-build init) | **No** |
| `updater.ts` (npx voidforge-build update) | **No** |
| FORGE_KEEPER.md (/void shared file list) | **No** |

Note: `new-project.sh` and `copy-assets.sh` were updated in v23.0 M8, but the TypeScript init/update paths were not.

### Break 2 (High): No learning-to-agent promotion path

The knowledge pipeline flows: Session → LEARNINGS.md → LESSONS.md → Method docs. Agent definitions are never a target. Wong's promotion analysis (FIELD_MEDIC.md Step 2.5b) only promotes lessons into method docs, not agent definitions.

### Break 3 (High): /debrief doesn't know about agent definitions

When Bashir files a debrief finding, Nog proposes fixes to method docs and commands. Neither knows `.claude/agents/` exists as an update target.

### Break 4 (Medium): Scaffold users have no migration path

The scaffold branch's void.md hardcodes `git fetch scaffold`. After branch deletion (2026-05-08), /void breaks with no guidance. No version of void.md on scaffold points to main or npm.

### Break 5 (Medium): /vault doesn't capture agent-level learnings

Vault files preserve decisions and failed approaches but never suggest agent definition updates.

### Break 6 (Low): `lessons-global.json` designed but not implemented

Wong's cross-project memory store is described in FIELD_MEDIC.md but no code reads or writes the file.

## Decision

### 1. Embed critical operational knowledge into agent definitions (Option C from assessment)

Each agent definition gets a `## Operational Learnings` section containing the critical 20% of its method doc's knowledge: mandatory gates, specific technical thresholds, field-report gotchas, and named patterns. The agent also retains a `## Required Context` reference to the full method doc.

**Why not just reference the method doc?** Dynamic dispatch launches agents without going through a command file's Context Setup. The agent must be effective standalone for the dispatch model to work.

**Why not embed 100%?** Method docs are 150-350 lines. Agent definitions shipping at 300+ lines each × 263 agents = 80K+ lines in the agents directory. The critical 20% (30-80 lines of operational rules per agent) provides 80% of the value at manageable file sizes.

**Who gets operational learnings:**
- 20 leads: Full `## Operational Learnings` section from method doc + LEARNINGS.md + LESSONS.md cross-reference
- ~40 sub-agents with specific field-report checks (Constantine, Nightwing, Yoda, Barton, etc.): Their parent method doc's section-specific checks
- Remaining ~200 agents: `## Required Context` reference only (they run under command orchestration that loads the method doc)

### 2. Add Wong's agent definition promotion path

Extend FIELD_MEDIC.md Step 2.5b: when a lesson targets a specific agent by name, Wong proposes an update to the agent definition's `## Operational Learnings` section in addition to the method doc update. Same 2+ project threshold for promotion.

The /debrief command gets a new check: "If finding references a specific agent (Batman, Kenobi, etc.), check if the agent definition needs updating."

### 3. Fix all six distribution breaks

Code changes to `project-init.ts` and `updater.ts`. Doc changes to FORGE_KEEPER.md, void.md, and debrief.md. Scaffold branch void.md updated to point to main before deletion.

### 4. Add `## Required Context` to all 263 agent definitions

Every agent definition gets a footer section:

```markdown
## Required Context

For the full operational protocol, load: `/docs/methods/QA_ENGINEER.md`
For project-scoped learnings: `/docs/LEARNINGS.md`
For cross-project lessons: `/docs/LESSONS.md`
```

This ensures that even if the orchestrating command doesn't load the method doc, the agent's own definition tells the executor what to read.

## Consequences

**Enables:**
- Agents are effective standalone for dynamic dispatch (ADR-044 works as designed)
- Knowledge from /debrief flows into agent definitions, not just method docs
- Distribution pipeline delivers agents to all users
- Scaffold users have a migration path
- The recursive knowledge loop is complete: build → debrief → learn → inject → build better

**Requires:**
- Inject operational learnings into ~60 agent definitions (20 leads + ~40 key sub-agents)
- Add `## Required Context` to all 263 definitions
- Update 2 TypeScript files (project-init.ts, updater.ts)
- Update 4 methodology files (FORGE_KEEPER.md, void.md, debrief.md, FIELD_MEDIC.md)
- Commit to scaffold branch before 2026-05-08 deletion

**Trade-offs:**
- Agent definitions grow from ~50 lines to ~80-150 lines (leads) or ~60-80 lines (key sub-agents)
- The `## Operational Learnings` section must be maintained alongside the method doc — two update targets instead of one. Wong's promotion path mitigates this by targeting both.
- Some knowledge duplication between method docs and agent definitions. Acceptable because the canonical source remains the method doc; the agent definition carries the operational extract.

**Does NOT change:**
- Method docs remain the authoritative source for full protocols
- The command file Context Setup still loads method docs when available
- LEARNINGS.md/LESSONS.md pipeline continues unchanged
- The 263 character identities, model tiers, and tool restrictions from ADR-044

## Alternatives Considered

1. **Option A: Embed everything.** Each agent definition becomes a self-contained protocol (150-350 lines). Rejected — 263 files × 200 average lines = 52K lines of methodology in the agents directory alone. Maintenance burden is unsustainable.

2. **Option B: Reference only.** Each agent definition just says "Read QA_ENGINEER.md before operating." Rejected — dynamic dispatch doesn't go through command files, so the reference may never be followed. Agents would operate with generic directives only.

3. **Keep agent definitions as-is, require method doc loading.** Rejected — this defeats the purpose of ADR-044. If agents always need the method doc loaded, the definitions are just dispatch targets with no standalone value.

4. **Generate agent definitions FROM method docs programmatically.** Considered for future automation. The extraction of "critical 20%" is a judgment call that benefits from human/AI review. Automation could handle the `## Required Context` section but not the operational learning selection.
