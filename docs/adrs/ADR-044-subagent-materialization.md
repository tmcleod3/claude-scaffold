# ADR-044: Full Subagent Materialization — 259 Agents as Claude Code Definitions

## Status: Accepted

## Context

VoidForge has 259 named agents across 9 fictional universes, but they exist only as text in methodology docs. When a command deploys an agent, it launches a `general-purpose` subagent with an inline prompt: "You are Picard. Review this architecture..." The character, model, tools, and system prompt are recreated from scratch on every invocation.

This creates four problems:

1. **No model routing.** Every agent runs on the inherited model (Opus). Specialist analysis tasks — where a focused Sonnet prompt outperforms a broad Opus prompt — run on the most expensive model regardless.

2. **No tool restrictions.** Every agent gets full tool access. Review agents that should only read code can accidentally edit files. Adversarial agents that should probe can accidentally fix what they find.

3. **No persistent identity.** Agent prompts are written inline in command files and vary between invocations. There's no canonical "Kenobi system prompt" — each command writes its own version.

4. **Static dispatch.** ADR-042 added content-triggered tables to command files, but the selection logic is hardcoded patterns, not AI reasoning. Opus can't dynamically select from agents it doesn't know exist.

Claude Code's native subagent system (`.claude/agents/*.md`) solves all four problems. Each agent becomes a persistent definition with a model assignment, tool restrictions, focused system prompt, and a description field that Opus uses for dynamic dispatch.

## Decision

### Materialize all 259 agents as Claude Code subagent definitions

Every named agent in `docs/NAMING_REGISTRY.md` becomes a `.claude/agents/{name}.md` file shipped with the methodology package. Each file contains YAML frontmatter (name, description, model, tools) and a Markdown body (system prompt).

### Three-tier model assignment

| Tier | Model | Count | Role | Rationale |
|------|-------|-------|------|-----------|
| Lead | `inherit` (Opus) | ~18 | Command leads, orchestrators, synthesizers | Needs judgment, writing, decision-making |
| Specialist | `sonnet` | ~200 | Domain analysis, code review, spot-checks | Focused prompt + context isolation compensates. Faster in parallel. |
| Scout | `haiku` | ~40 | File search, classification, pattern matching | Simple tasks where speed matters most |

### Tool restrictions by function

| Function | Tools | Agents |
|----------|-------|--------|
| Builder | Read, Write, Edit, Bash, Grep, Glob | Stark, Galadriel (build phases), Kusanagi |
| Reviewer | Read, Bash, Grep, Glob | Most specialists — can run commands but not edit |
| Scout | Read, Grep, Glob | Exploration agents — pure read-only |
| Adversarial | Read, Bash, Grep, Glob | Crossfire agents — probe but don't fix |

### Description-driven dispatch (replaces ADR-042 tables)

Commands no longer maintain static dispatch tables. Instead:

1. Opus reads `git diff --stat` (minimal context cost)
2. Opus matches changed files against the `description` field of all available subagents
3. Opus launches matching specialists in parallel alongside the command's core agents
4. The `description` field IS the routing logic — Opus reasons about it semantically

This is genuinely dynamic. Opus decides at runtime which of the 259 agents are relevant to the specific code change, using AI reasoning rather than keyword pattern matching.

### Command integration

Commands change from:
```markdown
Launch Agent tool with subagent_type: general-purpose
Prompt: "You are Spock. Review schema..."
```

To:
```markdown
Launch Agent tool with subagent_type: spock-schema
```

The command file gets shorter. The agent definition is canonical, persistent, and version-controlled.

### Flag mapping

| Flag | Effect on dispatch |
|------|-------------------|
| (default) | Core agents + all matching specialists via description |
| `--light` | Core agents only, no dynamic specialist dispatch |
| `--solo` | Lead agent only, zero subagents |
| `--fast` | Fewer review rounds (unchanged — orthogonal to dispatch) |

### Methodology package distribution

```
voidforge-build-methodology
├── .claude/
│   ├── commands/     ← 28 slash commands
│   └── agents/       ← 259 subagent definitions (NEW)
```

Ships via `npx voidforge-build init`. Every project gets the full roster.

## Consequences

**Enables:**
- True dynamic dispatch via Opus + subagent descriptions (no static tables)
- Model-tiered execution: Opus for judgment, Sonnet for analysis, Haiku for search
- Tool safety: review agents can't edit, scouts can't write
- Persistent agent identity: canonical prompts, version-controlled
- Subscription-optimized: all models run within Claude Code billing, no API costs
- `--light` and `--solo` flags work naturally (control which agents are available)

**Requires:**
- Generate 259 `.claude/agents/*.md` files from NAMING_REGISTRY.md
- Update 28 command files to use subagent_type references instead of inline prompts
- Update SUB_AGENTS.md, MUSTER.md, GAUNTLET.md methodology docs
- Update methodology package build to include `.claude/agents/`
- ADR-042 Cross-Domain Triggers sections in method docs become redundant (remove)

**Trade-offs:**
- 259 files in the agents directory (~300KB total, manageable)
- Subagent definitions must stay in sync with NAMING_REGISTRY.md
- Users with custom `.claude/agents/` files may see name conflicts (higher-priority wins per Claude Code resolution order)

**Does NOT change:**
- The 259 character names, universes, roles, and lenses
- The Gauntlet round structure
- The Campaign mission planning
- Build phase sequencing
- Any runtime wizard code

## Alternatives Considered

1. **13 specialist subagents only (recommended in earlier draft).** Rejected by project owner — the full roster is the product. Partial materialization creates two classes of agents (defined vs inline) with no benefit.

2. **Haiku router subagent for dispatch.** Rejected — Opus is free on subscription and better at semantic matching. A router adds a round-trip for classification that Opus handles inline. Router adds value only at API billing scale.

3. **Advisor strategy (API-level Opus consultation).** Rejected for subscription users — inverts the cost model. Relevant only for API billing, documented as future alternative if VoidForge supports API-billed users.

4. **Keep ADR-042 static tables.** Rejected — tables are not dynamic, require maintenance, and Opus can't discover agents that aren't defined as subagents.
