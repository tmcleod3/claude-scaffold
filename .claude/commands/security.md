# /security — Alias for /sentinel

> Permanent alias per ADR-050. Same agent, same output, same gate.

This file exists to preserve muscle memory and scripts. The canonical command is `/sentinel` — see `.claude/commands/sentinel.md` for the full protocol.

**Invocation:** When the user types `/security`, execute the full contents of `.claude/commands/sentinel.md` as if they had typed `/sentinel` instead. All flags (`--surfer`, `--light`, `--solo`, `--focus`, etc.) apply identically. All Silver Surfer Gate, agent roster, and synthesis behavior is unchanged.

**Why the alias:** Claude Code ships a native `/security-review` skill in the same semantic space. To avoid confusion, VoidForge's canonical name is now `/sentinel` (Jedi Sentinel class — canonical threat-hunter in Star Wars lore). Both names continue to work forever.
