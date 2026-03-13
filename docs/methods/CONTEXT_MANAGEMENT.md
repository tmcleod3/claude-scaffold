# CONTEXT WINDOW MANAGEMENT

> *Move fast without hitting the wall. Scope sessions, load on demand, checkpoint to disk.*

## The Problem

Claude Code has a finite context window. Long sessions accumulate tool results, file reads, and conversation history. When context fills, earlier information compresses or drops. This causes: lost decisions, repeated work, forgotten state, and slower responses.

## Core Strategy

1. **Scope sessions narrowly** — one phase or one agent domain per session
2. **Load on demand** — read method docs when you need them, not all upfront
3. **Write to disk, not memory** — decisions, state, and findings go in `/logs/` immediately
4. **Checkpoint before context fills** — write build-state.md and hand off
5. **New sessions read from disk** — build journal is the bridge between sessions

## File Size Discipline

| File Type | Max Lines | Action When Exceeded |
|-----------|-----------|---------------------|
| CLAUDE.md (root) | 120 | Move content to README or method docs |
| Per-directory CLAUDE.md | 50 | Split into multiple directories |
| Method docs | 200 | Extract sub-sections to separate files |
| Source files | 300 | Split into modules (services, utils, components) |
| Log files | 200 per phase | Archive completed sections, keep summary |
| build-state.md | 50 | Only current state — archive completed phases to phase logs |

## Session Scoping Guide

### What fits in one session

| Session Type | Scope | Typical Context Usage |
|-------------|-------|----------------------|
| Phase 0 (Orient) | Read PRD, extract architecture, write ADRs | Medium — PRD can be large |
| Single feature build | Schema + API + UI + tests for one feature | Medium-high |
| QA audit | Batman's full pass on existing codebase | High — reads many files |
| Security audit | Kenobi's full pass | Medium — focused reads |
| UX review | Galadriel's visual + a11y pass | Medium |
| Deploy setup | Kusanagi's full infrastructure | Medium |
| Bug fix | Investigate + fix + test one issue | Low |

### When to split into multiple sessions

- Building 3+ features → one session per feature
- Full build (Phase 0-13) → split at natural boundaries (see below)
- Large QA pass with 20+ findings → split: find bugs in session 1, fix in session 2
- Any session where you've read 15+ files → checkpoint and continue

### Natural session boundaries

```
Session 1: Phase 0 (Orient) + Phase 1 (Scaffold)
Session 2: Phase 2 (Infrastructure) + Phase 3 (Auth)
Session 3: Phase 4 (Core Feature)
Session 4: Phase 5 (Supporting Features) — one session per 2-3 features
Session 5: Phase 6 (Integrations)
Session 6: Phase 7-8 (Admin + Marketing)
Session 7: Phase 9 (QA Pass)
Session 8: Phase 10 (UX Pass)
Session 9: Phase 11 (Security Pass)
Session 10: Phase 12-13 (Deploy + Launch)
```

## Load-on-Demand Protocol

### Session start — always read:
1. `CLAUDE.md` (auto-loaded — ~120 lines)
2. `/logs/build-state.md` (~50 lines)

### Read only when needed:
- Method docs → when entering that agent's phase
- Pattern files → when writing code in that category
- NAMING_REGISTRY.md → only when spinning up named sub-agents
- TROUBLESHOOTING.md → only when something fails
- LESSONS.md → only during retrospective or when hitting a familiar problem

### Never read all at once:
- All method docs (12 files × ~100 lines = 1200 lines of instructions)
- All pattern files (5 files of code examples)
- NAMING_REGISTRY.md (360 lines — only need your universe's section)

## Context Checkpointing

When you sense context is getting full (many tool calls, large file reads, long conversation):

### Checkpoint procedure:
1. Update `/logs/build-state.md` with current state
2. Write current findings/progress to the active phase log
3. Log any pending decisions to `/logs/decisions.md`
4. If handing off to another agent, write to `/logs/handoffs.md`
5. Tell the user: "Context is getting heavy. I've checkpointed state to `/logs/build-state.md`. Start a new session and I'll pick up from there."

### Signs context is filling:
- You've read 15+ files in one session
- The conversation has 30+ tool calls
- You're re-reading files you already read earlier
- Responses are getting slower
- You can't remember earlier decisions (they've compressed)

## Efficient File Reading

### Read strategically:
- Read the **specific section** you need, not the whole file (use `offset` and `limit`)
- For large files (>200 lines), read the table of contents / headers first
- For pattern files, read the one that matches your current task
- For the naming registry, read only your universe's section

### Avoid re-reading:
- Extract what you need from a file and note it in your current work
- If you need to reference a decision, check `/logs/decisions.md` first
- If you need build state, check `/logs/build-state.md` — it's a summary

## Sub-Agent Context Management

When using the Agent tool to spin up sub-agents:

1. **Give each agent only the context it needs.** Don't say "read everything." Say "read `/docs/methods/SECURITY_AUDITOR.md` and scan `/src/lib/auth.ts`."
2. **Sub-agents inherit the parent's context.** Keep the parent lean so sub-agents have room to work.
3. **Sub-agent results are text.** They return findings, not files. Keep responses concise.
4. **Synthesize results in the parent.** Don't re-read everything the sub-agent already read.

## Per-Directory CLAUDE.md Strategy

Create per-directory CLAUDE.md files when:
- A directory has conventions that differ from the root (e.g., different patterns for API vs components)
- Multiple agents work in the same directory and need shared context
- A directory's conventions are stable and worth caching

Keep each under 50 lines. Include:
- Directory purpose (one sentence)
- Key conventions (3-5 bullet points)
- Pattern references (which pattern file applies here)
- Gotchas (things that trip up agents)

Example:
```markdown
# src/lib/CLAUDE.md
Services directory. Business logic lives here, not in route handlers.
- Follow /docs/patterns/service.ts for service structure
- All services export a const object, not a class
- Every user-scoped query includes ownerId filter
- Throw ApiError (from /lib/errors.ts), never raw Error
- Co-locate types at the top of the service file
```

## Emergency Context Recovery

If you're mid-session and realize you've lost important context:

1. Read `/logs/build-state.md` — 50 lines, recovers phase and blockers
2. Read the current phase log — recovers decisions and progress
3. Read `/logs/decisions.md` (last 10 entries) — recovers recent choices
4. Don't re-read method docs unless you need to execute a new step
5. Continue from the "Next steps" in build-state.md
