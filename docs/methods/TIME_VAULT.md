# TIME VAULT — Seldon's Session Intelligence Preservation
## Lead Agent: **Hari Seldon** (Foundation) · Sub-agent: **Gaal Dornick** (Foundation)

> *"The future is already written. I merely ensure the right people can read it."*

## Identity

**Hari Seldon** invented psychohistory — the science of predicting the behavior of large populations. In VoidForge, his Time Vault distills the expensive analysis from one session into a portable briefing that lets the next session skip the re-derivation. Seldon compresses, Jake Sisko writes, Gaal Dornick gathers the raw materials.

## Goal

Preserve expensive analysis across session boundaries. A new session with a vault briefing should reach productive work in under 60 seconds. Without one, recovering context costs 5-15 minutes of re-reading and re-tracing.

## Operating Rules

### 1. Include What's Expensive to Re-Derive

These items require synthesis, tracing, or multi-file analysis to produce. They cannot be recovered by reading a single file:

- **Decisions and rationale** — "We chose X over Y because Z" requires the full context that led to the decision
- **Failed approaches** — Knowing what didn't work (and why) prevents repeated dead ends
- **Cross-module relationships** — Which files connect to which, non-obvious wiring, integration points
- **Agent findings** — Consolidated results from review passes (not the full tables — the actionable summary)
- **Execution plan** — Ordered next steps with dependencies, derived from current state analysis
- **Test state** — What passes, what fails, what's missing, what was skipped

### 2. Exclude What's Cheap to Re-Read

These items are stored in well-known locations and can be loaded on demand:

- Full file contents (git)
- PRD text (`/docs/PRD.md`)
- Method doc contents (`/docs/methods/`)
- Pattern references (`/docs/patterns/`)
- Agent naming registry (`/docs/NAMING_REGISTRY.md`)
- Build journal entries (`/logs/` — read directly when needed)

### 3. Psychohistorical Compression

Seldon doesn't transcribe — he compresses. A 3-hour session that produced 47 findings across 6 agents becomes:

> "Security pass found 3 Critical (all fixed): CSRF on /api/settings, missing rate limit on /auth/login, leaked stack trace in error handler. UX pass found 12 issues (10 fixed, 2 deferred): focus management in modal, contrast on muted text. QA found the modal fix broke keyboard nav — re-fixed in Pass 2. Next: deploy checklist, then Phase 13 launch verification."

Not 47 rows. The signal, compressed.

### 4. Per-Task File Lists

For each unit of work completed in the session, list the files created or modified. This lets the next session quickly scope what changed without running `git log --stat` across dozens of commits:

```
### Auth middleware refactor
- src/middleware/auth.ts (modified — added rate limiting)
- src/middleware/rate-limit.ts (created)
- tests/middleware/auth.test.ts (modified — 4 new tests)
```

### 5. Vault File Format

Files live at `/logs/vault-YYYY-MM-DD.md` with YAML frontmatter:

```yaml
---
sealed: 2026-03-26T14:30:00Z
project: my-app
branch: main
commit: abc1234
session_focus: Security pass + UX fixes for Phase 10-11
---
```

The frontmatter enables programmatic reading by other commands (`/campaign`, `/current`, `/thumper`).

### 6. Pickup Prompt

Every vault produces a pickup prompt — a copyable block that the next session pastes to recover context immediately:

```
Read /logs/vault-2026-03-26.md for session context.
Then read /logs/build-state.md and /logs/campaign-state.md for operational state.
Resume from: Phase 12 deploy checklist — all review passes complete.
```

The pickup prompt is the vault's delivery mechanism. It's printed to console, not buried in a file.

## Integration Points

| Command | How It Uses the Vault |
|---------|----------------------|
| `/campaign` | Reads most recent vault at Step 0 (state recovery). Seals a vault at campaign pause/end. |
| `/debrief` | Vault provides session context for Bashir's post-mortem analysis. |
| `/thumper` | `--for trigger` format enables automated session pickup via Telegram bridge. |
| `/current` | Deep Current reads vault history to track session-over-session progress. |
| Session start | User pastes pickup prompt. Agent reads vault. Context recovered. |

## When to Seal a Vault

- **End of session** — Always. Even short sessions produce decisions worth preserving.
- **Before context checkpoint** — If approaching 70%+ context usage, seal first.
- **Campaign pause** — When `/campaign` pauses between missions across sessions.
- **Before destructive operations** — Before `git reset`, branch switches, or major refactors.

### 7. Operational Learnings Sync

At session end, before sealing the vault, check for approved operational learnings from this session:

1. If `/debrief` ran and produced approved learnings → they're already in `docs/LEARNINGS.md`
2. If no debrief ran but the session discovered operational facts (API quirks, decision rationale, root causes that took multiple attempts) → Seldon flags candidates using the same criteria as FIELD_MEDIC.md Step 2.5
3. Present candidates to user for approval. Append approved entries to `docs/LEARNINGS.md`
4. Include in the vault's "Open Items" section: *"[N] operational learnings added to LEARNINGS.md this session"*

This ensures learnings are captured even in sessions that don't run a formal debrief. The vault is the last checkpoint — if a learning was discovered but not captured by debrief, the vault catches it.

**Do NOT duplicate LEARNINGS.md content in the vault narrative.** The vault references the file; the file holds the structured entries. The vault says "3 learnings captured" — it doesn't repeat them. See ADR-035 for the full design rationale.

## Anti-Patterns

- **Vault as transcript** — Don't dump the session log. Compress to signal.
- **Vault as documentation** — Don't write docs in the vault. Write docs in `/docs/`, reference them from the vault.
- **Vault without pickup prompt** — A vault file nobody reads is wasted. The pickup prompt is mandatory.
- **Stale vaults** — Vaults older than 7 days are historical, not operational. The next session should read the most recent vault, not the oldest.
