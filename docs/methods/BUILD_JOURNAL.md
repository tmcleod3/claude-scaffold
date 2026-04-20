# BUILD JOURNAL — Persistent Logging & Audit Trail
## System Protocol · Used by: All Agents

> *Every agent produces output. Every phase leaves a record. Every decision is recoverable.*

## Purpose

The build journal is Claude Code's persistent memory across sessions. When context compresses or a new session starts, agents read journal files to recover state instead of re-deriving it. Every phase, every audit, every decision gets logged to disk.

## Journal Directory

```
docs/
  LEARNINGS.md                ← Project-scoped operational learnings (created on first use)
logs/
  build-state.md              ← Current phase, active agents, blockers, next steps
  phase-00-orient.md          ← Picard's PRD extraction, ADRs, gaps, assumptions
  phase-01-scaffold.md        ← Framework decisions, file structure, config choices
  phase-02-infrastructure.md  ← DB setup, Redis, env verification, boot status
  phase-03-auth.md            ← Auth implementation, Kenobi's review, test results
  phase-04-core.md            ← Core feature decisions, test results, verification
  phase-05-features.md        ← Each feature batch: decisions, tests, verification
  phase-06-integrations.md    ← Each integration: config, test mode results, Kenobi review
  phase-07-admin.md           ← Admin panel decisions, audit logging setup
  phase-08-marketing.md       ← Pages built, SEO, responsive verification
  phase-09-qa-audit.md        ← Batman's findings, bug tracker, test results
  phase-10-ux-audit.md        ← Galadriel's findings, a11y audit, issue tracker
  phase-11-security-audit.md  ← Kenobi's findings, remediation status, checklist
  phase-12-deploy.md          ← Infrastructure setup, deploy results, monitoring
  phase-13-launch.md          ← Launch checklist status, final verification
  decisions.md                ← Running log of all non-obvious decisions
  handoffs.md                 ← Every agent-to-agent handoff with context
  errors.md                   ← Every significant error encountered and resolution
  agent-activity.jsonl        ← Live agent dispatch log (JSONL — powers Danger Room ticker)
  surfer-gate-events.jsonl    ← Silver Surfer Gate events (JSONL) — written by PreToolUse hook and record-roster.sh per ADR-056. Cross-session, append-only.
```

### Silver Surfer Gate Events (ADR-056)

`logs/surfer-gate-events.jsonl` is a repo-persistent append-only log of every gate decision. The `PreToolUse` hook (`scripts/surfer-gate/check.sh`) writes one line per Agent tool call; `scripts/surfer-gate/record-roster.sh` writes one line when the orchestrator records the Surfer's roster.

**Schema** (canonical source is ADR-056; keep in sync):

```json
// ALLOW / BLOCK — written by check.sh
{"ts":"2026-04-20T20:00:00Z","session_id":"<uuid>","event":"ALLOW","subagent_type":"<name>","tool_name":"Agent","reason":"<human-readable>"}

// ROSTER_RECEIVED — Shape A (jq present AND valid-JSON roster)
{"ts":"...","session_id":"...","event":"ROSTER_RECEIVED","roster_parsed":true,"roster":{...},"roster_text":"{...}"}

// ROSTER_RECEIVED — Shape B/C (jq unavailable OR non-JSON roster)
{"ts":"...","session_id":"...","event":"ROSTER_RECEIVED","roster_parsed":false,"roster_text":"..."}
```

`event` values in use:
- `ALLOW` — hook allowed the Agent call (self-launch, bypass, or roster present)
- `BLOCK` — hook blocked the Agent call (no roster, no bypass, not Surfer)
- `ROSTER_RECEIVED` — orchestrator recorded a roster via `record-roster.sh`

**Discriminator:** `roster_parsed:true` → the `roster` field contains the structured JSON object. `roster_parsed:false` → read `roster_text` as an escape-encoded string (use `jq -r '.roster_text'` to decode).

**Cherry-pick detection:** count `ROSTER_RECEIVED` entries minus distinct non-Surfer `subagent_type` values under `ALLOW` in the same session. Non-zero deltas indicate rosters that weren't fully deployed. See ADR-056 for the full jq query.

A session-scoped copy also lives at `/tmp/voidforge-session-<session_id>/surfer-gate-events.jsonl` for per-session debugging alongside `gate.log`.

## Log Entry Format

Every log entry follows this structure:

```markdown
### [TIMESTAMP] [AGENT] — [ACTION]

**Phase:** [current phase]
**Status:** completed | in-progress | blocked | skipped
**Files changed:** [list]

**What happened:**
[2-3 sentences describing what was done and why]

**Decisions made:**
- [Decision]: [Rationale]

**Tests:**
- [test name]: pass/fail
- Coverage: [X%] for [area]

**Blockers/Issues:**
- [Issue]: [Status]

**Next steps:**
- [What the next agent or phase should do]
```

## Operational Learnings (`docs/LEARNINGS.md`)

Unlike build logs (which are session-scoped), `LEARNINGS.md` is project-scoped and accumulates across sessions. It stores operational facts that code review can't catch — API quirks, decision rationale, root causes, environment constraints.

- **Created:** On first approved learning (via `/debrief` Step 2.5 or `/vault` session-end sync)
- **Read by:** `/build` Phase 0, `/campaign` Step 1, `/architect` Step 0, `/assemble` Phase 0
- **Written by:** `/debrief` (proposes candidates) → user approves → `/vault` (appends)
- **Cap:** 50 active entries. Promoted learnings replaced with pointers to `LESSONS.md`
- **Staleness:** Entries with `verified` older than 90 days flagged as potentially stale at read time

See ADR-035 for the full design rationale.

## build-state.md — The Master State File

This is the most important file. It's read at the start of every session. Keep it under 50 lines.

```markdown
# Build State

**Project:** [name]
**Current Phase:** [X]
**Last Updated:** [timestamp]
**Active Agent:** [name]

## Phase Status
| Phase | Status | Gate Passed |
|-------|--------|-------------|
| 0 | complete | yes |
| 1 | complete | yes |
| 2 | in-progress | — |
| 3-13 | not started | — |

## Current Blockers
- [none or list]

## Deployment
- **Target:** [Vercel / Railway / VPS / none yet]
- **Method:** [CLI (`npx vercel --prod`) / Git integration / manual]
- **Last deployed commit:** [hash or "not yet deployed"]
- **Production URL:** [url or "N/A"]

## Recent Decisions
- [last 3-5 decisions with rationale]

## Next Steps
1. [immediate next action]
2. [after that]
```

## When to Write

| Event | Write to | What |
|-------|----------|------|
| Phase starts | `phase-XX-*.md` + `build-state.md` | Agent, scope, plan |
| Non-obvious decision | `decisions.md` + phase log | Decision, rationale, alternatives considered |
| Phase gate passed | `build-state.md` + phase log | Gate criteria met, test results |
| Phase gate failed | `build-state.md` + phase log + `errors.md` | What failed, root cause, recovery plan |
| Agent handoff | `handoffs.md` | From agent, to agent, context, files, blockers |
| Bug found | Phase log + QA bug tracker | Severity, repro, root cause |
| Error encountered | `errors.md` + phase log | Error, diagnosis, resolution |
| Test results | Phase log | Pass/fail, coverage delta |
| Session ending | `build-state.md` | Current state, what's done, what's next |

## When to Read

| Event | Read | Why |
|-------|------|-----|
| Session starts | `build-state.md` | Know where you are |
| Starting a new phase | Previous phase log + `build-state.md` | Understand context from prior work |
| Agent receives handoff | `handoffs.md` + relevant phase log | Get context from handing-off agent |
| Debugging a failure | `errors.md` + relevant phase log | Check if this has happened before |
| Context is compressed | `build-state.md` + current phase log | Recover full state |
| Resuming after interruption | `build-state.md` | Pick up exactly where you left off |

## Logging Rules

1. **Write after every meaningful action.** Don't wait until the end of a phase to log.
2. **Log decisions in real-time.** If you're choosing between approaches, log the choice and why.
3. **Log failures immediately.** The diagnosis process is valuable — capture it.
4. **Keep build-state.md under 50 lines.** It's loaded every session. Archive completed phases to their individual logs.
5. **Log test results with every verification.** Pass/fail, coverage numbers, which tests are new.
6. **Every handoff gets a log entry.** The receiving agent should be able to start from the handoff entry alone.
7. **Never delete log entries.** Append or update status. The history is the point.
8. **Log what you tried, not just what worked.** Failed approaches save future sessions from repeating them.

## Agent-Specific Logging

Each agent produces domain-specific log output:

| Agent | Extra Log Content |
|-------|------------------|
| **Picard** | ADRs, architecture diagrams, tradeoff analysis |
| **Stark** | API route inventory, schema changes, integration configs |
| **Galadriel** | Screen inventory, a11y findings, component state audit |
| **Batman** | Bug tracker table, test coverage report, regression checklist |
| **Kenobi** | Security findings with severity, remediation status, checklist |
| **Kusanagi** | Server inventory, deploy results, health check status, cost log |

## Deliverables Logging

When an agent produces a deliverable (BACKEND_AUDIT.md, SECURITY_CHECKLIST.md, etc.), log it:

```markdown
### [TIMESTAMP] [AGENT] — Deliverable produced

**File:** /docs/SECURITY_AUDIT.md
**Type:** Security audit report
**Findings:** 3 critical, 7 high, 12 medium, 5 low
**Status:** Critical items remediated, high items in progress
```

## Recovery Protocol

When starting a new session after context compression or interruption:

1. Read `/logs/build-state.md` — know current phase and blockers
2. Read the current phase log — understand what's been done
3. Read `/logs/decisions.md` (last 10 entries) — understand recent choices
4. If resuming someone else's work, read `/logs/handoffs.md` for context
5. Continue from the "Next steps" in build-state.md
6. First action: update build-state.md with your session start
