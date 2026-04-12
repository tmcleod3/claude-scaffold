# /assess — Picard's Pre-Build Assessment

Evaluate an existing codebase before a rebuild, migration, or VoidForge onboarding. Chains architecture review, assessment-mode Gauntlet, and PRD gap analysis into a unified "State of the Codebase" report.

## Silver Surfer Pre-Scan (ADR-048)

**MANDATORY.** Before deploying any domain agents, launch the Silver Surfer as a sub-agent to select the optimal roster for this command. **Do NOT skip this step.**

**How to launch:** Use the Agent tool with these exact parameters:
- `description`: "Silver Surfer roster scan"
- `prompt`: "You are the Silver Surfer, Herald of Galactus. Read your instructions from .claude/agents/silver-surfer-herald.md, then execute your task. Command: /assess. User args: <ARGS>. Focus: <FOCUS or 'none'>. Scan the .claude/agents/ directory, read agent descriptions and tags, and return the optimal roster for this command on this codebase."

**After the Surfer returns**, merge its roster with this command's hardcoded lead agents below. Leads are non-negotiable; the Surfer adds specialists.

**`--focus "topic"`** — include in the Surfer's prompt as the focus bias.
**`--light`** — skip the Surfer, use only hardcoded roster below.
**`--solo`** — skip Surfer and all sub-agents, lead only.

## Context Setup
1. Read `/logs/build-state.md` if it exists — understand current project state
2. Read `/docs/methods/SYSTEMS_ARCHITECT.md`
3. Read `/docs/methods/GAUNTLET.md` (Flags section — `--assess`)
4. Read `/docs/PRD.md` if it exists

## The Sequence

### Step 1 — Picard's Architecture Scan
Run `/architect` — full bridge crew analysis. This maps the system: schema, integrations, security posture, service boundaries, tech debt.

### Step 2 — Thanos's Assessment Gauntlet
Run `/gauntlet --assess` — Rounds 1-2 only (Discovery + First Strike). No fix batches. Produces an assessment report grouped by root cause rather than domain.

**Key detection targets for pre-build:**
- **RC-STUB: Stub code** — Grep for `throw new Error('Implement`, `throw new Error('Not implemented`, `throw new Error('TODO`. Also detect functions returning `{ ok: true }` or `{ success: true }` without side effects, and handlers that log but perform no work. This is the #1 source of false functionality. (Field report: v17.0 assessment found 77 stub throws across 8 files.)
- **Abandoned migrations:** Duplicate implementations in competing directories (RC-1 pattern)
- **Stubs returning success:** Methods that return True/ok without side effects (RC-2 pattern)
- **Auth-free defaults:** HTTP endpoints with no authentication middleware (RC-3 pattern)
- **Dead code:** Services wired but never called, preferences stored but never read

### Step 3 — PRD Gap Analysis
If a PRD exists:
1. **Dax** `subagent_type: Dax` diffs PRD requirements against implemented features (structural + semantic)
2. **Troi** `subagent_type: Troi` reads PRD prose section-by-section and verifies claims against reality
3. Check for YAML frontmatter — if missing, flag it (see CAMPAIGN.md Step 1)

If no PRD exists:
1. Produce a "What Exists" inventory: routes, schema, components, integrations, test coverage
2. Flag areas that need a PRD before building can begin

### Step 4 — State of the Codebase Report

Produce a unified report in `/logs/assessment.md`:

```markdown
# State of the Codebase — [Project Name]
## Date: [date]

## Architecture Summary
[From Step 1 — schema, services, integrations, tech debt]

## Root Causes (grouped)
[From Step 2 — findings grouped by root cause, not by domain]

## PRD Alignment
[From Step 3 — what matches, what's missing, what contradicts]

## Remediation Plan
| Priority | Root Cause | Impact | Recommended Action |
|----------|-----------|--------|-------------------|

## Recommendation
[One of: "Ready to build", "Needs remediation first (Phase 0)", "Needs PRD first", "Needs migration completion first"]
```

### Step 5 — Debrief (optional)
If findings are methodology-relevant (patterns that VoidForge should catch but doesn't), offer: "Want Bashir to file a field report?"

## Arguments
- `--focus "topic"` → Bias Herald toward topic (natural-language, additive)

## When to Use
- Before onboarding an existing codebase to VoidForge
- Before a major version rebuild (v2 → v3)
- When inheriting a codebase from another team
- When the PRD assumes existing code works but you haven't verified

## When NOT to Use
- On a fresh project (nothing to assess — just run `/build`)
- On methodology-only changes (no runtime code)
- After a build (use `/gauntlet` instead — it includes fix batches)

(Field report #125: user chained `/architect → /gauntlet → /prd → /debrief` manually. This command formalizes that workflow.)
