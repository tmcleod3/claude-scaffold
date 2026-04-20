# /review — Alias for /engage

> Permanent alias per ADR-050. Same agent, same output, same gate.

This file exists to preserve muscle memory and scripts. The canonical command is `/engage` — see `.claude/commands/engage.md` for the full protocol.

**Invocation:** When the user types `/review`, execute the full contents of `.claude/commands/engage.md` as if they had typed `/engage` instead. All flags (`--surfer`, `--light`, `--solo`, `--focus`, etc.) apply identically. All Silver Surfer Gate, agent roster, and synthesis behavior is unchanged.

**Why the alias:** Claude Code ships a native `/review` skill. To avoid silent ambiguity outside the Claude Code CLI, VoidForge's canonical name is now `/engage`. Both names continue to work forever.
