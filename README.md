# VoidForge Core

The ultra-light tier. All methodology, no infrastructure. Drop into any project.

**What's inside:** 170+ named agents across 7 fictional universes, all 17 agent protocols, 11 slash commands, 7 code patterns, the full 13-phase build protocol, `/thumper` Telegram bridge, and the Holocron.

## Usage

### Drop into an existing project

```bash
git clone --branch core https://github.com/tmcleod3/voidforge.git /tmp/vf
cp -r /tmp/vf/.claude /tmp/vf/CLAUDE.md /tmp/vf/HOLOCRON.md /tmp/vf/docs your-project/
```

Then open your project with Claude Code and run `/build`.

### Reference as context

Point Claude Code at the cloned core branch directly. The `CLAUDE.md` and slash commands will be picked up automatically.

## What's NOT here

No wizard, no deploy scripts, no npm dependencies. Just the methodology.

- Want the interactive wizard and cloud provisioners? Use the [`main`](https://github.com/tmcleod3/voidforge/tree/main) branch.
- Want methodology plus shell scripts but no wizard? Use the [`scaffold`](https://github.com/tmcleod3/voidforge/tree/scaffold) branch.

## Guide

Read the **[Holocron](HOLOCRON.md)** -- the complete VoidForge guide, from first project to advanced usage. Read the **[Prophecy](PROPHECY.md)** -- what's coming next.
