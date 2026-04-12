# ADR-048: Silver Surfer — Herald Invocation Bridge

## Status: Accepted

## Context

ADR-047 built the Herald dispatch engine (herald.ts, agent-registry.ts) and wired instructions into 14 command files. However, the /assess audit revealed the invocation bridge is missing: command `.md` files say "call `runHerald()`" but there's no runtime pathway for Claude Code to execute that TypeScript function from a markdown instruction.

The Herald library is built, tested (48 tests), and distributed, but functionally dead — nothing calls it.

Additionally, the Herald has no character identity. Every other VoidForge system has one: Fury orchestrates, Sisko commands campaigns, Bombadil syncs. The Herald needs a name.

## Decision

1. **Name the Herald "Silver Surfer"** — Marvel's canonical Herald of Galactus. Scouts ahead, assesses what's needed, summons the right power. Fast (cosmic speed = Haiku's <2s scan). Marvel universe = same as Fury's Initiative pipeline.

2. **Add `voidforge herald` CLI subcommand** — the invocation bridge. When a command file says "run the Herald," Claude executes:
   ```bash
   npx thevoidforge herald --command /review --focus "security" --json
   ```
   This calls `runHerald()` via the CLI, outputs a JSON roster, and Claude uses that roster to launch agents.

3. **Create Silver Surfer agent definition** — `.claude/agents/silver-surfer-herald.md` with Haiku tier, scout tools.

4. **Update all 14 command files** — replace pseudocode Herald instructions with the actual CLI invocation.

5. **Rename Herald references** — "The Herald" becomes "Silver Surfer" in ADR-047, command files, and documentation. The functions stay named `herald.ts` / `runHerald()` (the code name is fine — the character name is for the user-facing identity).

## Consequences

- The Herald pipeline works end-to-end: command → CLI → Haiku → roster → agent deployment
- Silver Surfer joins the Marvel universe roster (agent #264)
- Users see "Silver Surfer scanning..." in the output when the Herald runs
- `--light` skips the CLI call entirely (no Haiku cost)

## Alternatives

1. **Have Claude inline the selection** — Claude reads agent descriptions itself and picks. Rejected: this uses Opus tokens for classification work Haiku does better and cheaper.
2. **Keep it as pseudocode** — let Claude interpret the instruction. Rejected: /assess proved this doesn't result in actual Haiku calls.
