# CONTEXT WINDOW MANAGEMENT

> *Move fast without hitting the wall. Scope sessions, load on demand, checkpoint to disk.*

## The Problem

Claude Code has a finite context window. Long sessions accumulate tool results, file reads, and conversation history. When context fills, earlier information compresses or drops. This causes: lost decisions, repeated work, forgotten state, and slower responses.

## Core Strategy

1. **Pre-load active domain** — load the active agent's method docs at session start (~4% of 1M context)
2. **Application code on demand** — read source files when you need them, not all upfront
3. **Write to disk, not memory** — decisions, state, and findings go in `/logs/` immediately
4. **Checkpoint before context fills** — write build-state.md and hand off
5. **New sessions read from disk** — build journal is the bridge between sessions

## Pre-Loading Budget (1M Context)

At 1M tokens, methodology docs consume ~4% of context. Pre-load strategically:

| Pre-load at session start | Approximate tokens |
|--------------------------|-------------------|
| CLAUDE.md | ~2K |
| Active agent's method doc | ~2-4K |
| Related agent method docs (if cross-cutting) | ~4-8K |
| PRD.md | ~5-10K |
| build-state.md | ~1K |
| **Total pre-load** | **~15-25K (1.5-2.5% of 1M)** |

**Load on demand:** Application source code, pattern files, other agents' method docs, naming registry, log files, test output.

## File Size Discipline

| File Type | Max Lines | Action When Exceeded |
|-----------|-----------|---------------------|
| CLAUDE.md (root) | 130 | Move content to README or method docs |
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

- Building 5+ features → one session per 2-3 features
- Full build (Phase 0-13) → split at natural boundaries (see below)
- Large QA pass with 30+ findings → split: find bugs in session 1, fix in session 2
- **Context pressure symptoms appear** → ask user to run `/context`, checkpoint if above 70%

### Natural session boundaries (1M context)

With 1M context, sessions can span more phases than before:

```
Session 1: Phase 0 (Orient) + Phase 1 (Scaffold) + Phase 2 (Infrastructure)
Session 2: Phase 3 (Auth) + Phase 4 (Core Feature)
Session 3: Phase 5 (Supporting Features) — 2-4 features per session
Session 4: Phase 6 (Integrations) + Phase 7-8 (Admin + Marketing)
Session 5: Phases 9-11 (QA + UX + Security — double-pass review cycle)
Session 6: Phase 12-13 (Deploy + Launch)
```

Small-to-medium projects (≤5 features, ≤20 source files) may complete phases 0-8 in a single session.

## Loading Protocol

### Session start — always read:
1. `CLAUDE.md` (auto-loaded — ~120 lines)
2. `/logs/build-state.md` (~50 lines)
3. Active agent's method doc (~100-150 lines)
4. PRD.md (if building — varies)

### Pre-load when entering a domain:
- Related agent method docs (e.g., QA_ENGINEER.md + TESTING.md when running /qa)
- Pattern files relevant to current work
- Cross-cutting method docs if doing review passes (QA + Security + UX)

### Read only when needed:
- NAMING_REGISTRY.md → only when spinning up named sub-agents
- TROUBLESHOOTING.md → only when something fails
- LESSONS.md → only during retrospective or when hitting a familiar problem
- Other agents' method docs → only when cross-cutting work requires it

### Still avoid reading all at once:
- All source code files (application code is high-volume)
- Full git history or log files
- Test output (ephemeral, high-volume)

## Context Checkpointing

When context is genuinely running low, checkpoint to disk so the next session can resume.

### How to detect context pressure (symptom-based, not count-based):

**Watch for these symptoms:**
- You're re-reading files you already read earlier (compression dropped them)
- You can't recall decisions made earlier in the session
- Responses are getting slower or less coherent

**When symptoms appear:**
1. Ask the user to run `/context` to check actual usage
2. If usage is **below 70%** — symptoms may be from other causes. Continue working.
3. If usage is **above 70%** — checkpoint and suggest a new session.

**What is NOT a sign of context pressure:**
- High file read count or tool call count alone — these are normal for ambitious sessions
- Long conversations — 1M context supports extended work sessions
- Multiple /assemble runs — these are expected in /campaign mode

**Never preemptively suggest checkpoints based on file counts or tool calls.** The model cannot check its own context usage — only the user can via `/context`. Don't guess.

### Checkpoint procedure:
1. Update `/logs/build-state.md` with current state
2. Write current findings/progress to the active phase log
3. Log any pending decisions to `/logs/decisions.md`
4. If handing off to another agent, write to `/logs/handoffs.md`
5. Tell the user: "Context may be getting tight. Run `/context` to check. I've checkpointed state to `/logs/build-state.md` just in case."

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
