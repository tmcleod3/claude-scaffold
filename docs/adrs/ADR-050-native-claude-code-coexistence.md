# ADR-050: Native Claude Code Command Coexistence

## Status
Proposed — 2026-04-20

## Context

Claude Code ships native slash-command skills that overlap with VoidForge's command namespace. As of Opus 4.7 (January 2026 knowledge cutoff) these natives include:

- `/review` — Anthropic's built-in PR review skill.
- `/security-review` — Anthropic's built-in security review skill.
- `/init` — Anthropic's built-in CLAUDE.md initializer.
- `/agents` — Native sub-agent management.

VoidForge currently registers `/review` (Picard's multi-agent review with conflict resolution, confidence scoring, double-pass verification) and `/security` (Kenobi's OWASP audit with red-team verification). In Claude Code CLI, project-local `.claude/commands/*.md` shadows native skills — so VoidForge's commands currently win. But:

1. The precedence is **undocumented and unstable** — a future Claude Code release could flip it.
2. Outside Claude Code CLI (claude.ai web, API-only, IDE extensions without project-local command resolution), native fires and the Silver Surfer Gate is silently bypassed.
3. User muscle memory is ambiguous — "/review" could mean either Anthropic's native or Picard's multi-agent pass.

The prior architecture review (v23.8.12 onward) found 33-of-40 agents independently flagged this as a real, silent bug.

## Decision

**Rename VoidForge's colliding commands to character-neutral, universe-consistent names while keeping the originals as permanent aliases.**

### Command renames

| Original | New primary | Character | Rationale |
|----------|-------------|-----------|-----------|
| `/review` | **`/engage`** | Picard (Star Trek) | Picard's most iconic single word — "Engage." Decision-to-act semantics fit the review-to-ship meaning. Zero native collision. |
| `/security` | **`/sentinel`** | Kenobi (Star Wars) | Jedi Sentinel class — canonical threat-hunter role in Star Wars lore. Zero native collision. Distinct from `/security-review`. |

### Aliases — permanent, not deprecated

`/review` continues to work forever as an alias for `/engage`. `/security` continues to work forever as an alias for `/sentinel`. Per Adolin's brand analysis (prior session): deprecation warnings on working commands punish loyalty. Aliases are invisible infrastructure — they cost nothing to maintain and protect muscle memory indefinitely.

**Alias implementation:** `.claude/commands/review.md` becomes a thin redirect file: `> Alias of /engage. See .claude/commands/engage.md.` — the Claude Code runtime reads whichever file the user invokes; we keep behavior identical by having both point to the same content via symlink or duplicated body.

**One-sentence user-facing note** (CHANGELOG + HOLOCRON only, no in-CLI warning):

> `/review` is now `/engage`. Same agent, same output. Both names work.

### Updates required

- `CLAUDE.md` and `packages/methodology/CLAUDE.md` — Slash Commands table: add `/engage` and `/sentinel` rows, mark old rows as "alias."
- `HOLOCRON.md` — update Section 3 command reference; add coexistence note.
- `.claude/commands/` — create `engage.md` and `sentinel.md` as primary files; convert `review.md` and `security.md` to alias shims.
- Silver Surfer Gate command list (line ~19 of CLAUDE.md) — add `/engage` and `/sentinel` to the gated list.
- Handoff references in all command files (`→ Picard (/review)` etc.) — update to `→ Picard (/engage)`.

## Consequences

### Positive
- Eliminates silent precedence ambiguity with native Claude Code.
- Works identically across Claude Code CLI, Claude.ai web, and API-only invocation (native fires where project-local shadowing doesn't exist — but now the user knows to type `/engage` if they want VoidForge's behavior).
- Character-authentic naming (Picard → `/engage`) deepens the brand.
- Zero churn: aliases are permanent.

### Negative
- Two canonical command names to document (primary + alias).
- Slight discoverability asymmetry: new users learn `/engage` via docs, but the team roster still says "Picard does code review" — a one-line cross-reference closes this.
- Future Anthropic native skills may collide with `/engage` or `/sentinel` — low probability (both are character-specific words), but requires periodic audit via Bombadil's `/void` sync.

### Neutral
- `/qa`, `/ux`, `/architect`, `/build`, `/assemble`, `/gauntlet`, `/campaign`, `/test`, `/devops`, `/deploy`, `/ai`, `/assess`, `/prd`, `/blueprint`, `/git`, `/void`, `/vault`, `/thumper`, `/imagine`, `/debrief`, `/dangerroom`, `/cultivation`, `/grow`, `/current`, `/treasury`, `/portfolio` — no known collisions as of 2026-04-20. Tracked in the Native Capabilities Tracker (see ADR followup).

## Alternatives Considered

### Rejected: keep `/review`, document the shadowing
Relies on an undocumented Anthropic precedence rule. Breaks silently outside Claude Code CLI. Does not scale to future native-skill additions.

### Rejected: namespace prefix (`/vf-review`, `/voidforge-security`)
Ugly. Breaks the character-personality brand. Adds keystrokes for no user benefit.

### Rejected: detect-and-override at runtime
Fragile, undocumented behavior. No reliable hook to intercept native resolution.

### Rejected: rename without aliases
Breaks user muscle memory and existing scripts. Adolin's brand analysis: there is no upside to forcing users to migrate for a cosmetic name change.

## Related ADRs

- **ADR-048** — Silver Surfer Herald Invocation Bridge (the gate must be added to new command names).
- **ADR-051** — Structural Gate Enforcement (the gate list updates to include `/engage` and `/sentinel`).
- **ADR-043** — Max by Default (aliases follow the same opt-out flag taxonomy).

## Rollout

- **v23.9.0 (minor):** ship `/engage` and `/sentinel` as primary. `/review` and `/security` become aliases. No deprecation warnings.
- **Never:** no alias removal is planned.
