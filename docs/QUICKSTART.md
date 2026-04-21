# VoidForge Quick Start

Get from zero to building in 5 minutes.

## Prerequisites

- **Node.js 20+** — run `node --version` to check. If not installed: [nodejs.org](https://nodejs.org) or ask Claude "how do I install Node.js on [your OS]"
- **Claude Code** — the CLI tool from Anthropic. Install: `npm install -g @anthropic-ai/claude-code`
- **Git** — run `git --version` to check

## Step 1: Create a VoidForge Project

### Recommended: npm (v21.0+)
```bash
npx voidforge-build init my-project
cd my-project
```

### Alternative: Headless (methodology only — no wizard UI)
```bash
npx voidforge-build init --headless my-project
cd my-project
```

### Alternative: Git clone (full source)
```bash
git clone https://github.com/tmcleod3/voidforge.git my-project
cd my-project
npm install
```

> **Windows users:** If `npm install` fails with a `node-pty` error, use `--headless` mode (no native deps) or WSL2.

## Step 2: Open in Claude Code

```bash
cd my-project
claude
```

Claude reads `CLAUDE.md` automatically. The entire methodology — 260+ agents, 30 commands, 34 patterns — activates the moment you open the project.

## Step 3: Build Something

You have three entry paths:

### Path A: Guided (recommended for first project)
```
/prd
```
Sisko interviews you about what you're building. 5 acts, produces a complete PRD.

### Path B: Blueprint (you already have a PRD)
```
/blueprint
```
Drop your PRD at `docs/PRD.md`. Picard validates, Wong discovers docs, Kusanagi provisions.

### Path C: Build directly
```
/build
```
Starts the 13-phase build protocol immediately.

## Step 4: Run the Full Campaign

```
/campaign --blitz
```

Sisko reads the PRD, plans the missions, and builds everything autonomously. Each mission: architecture → build → review → commit. When all missions complete, a Victory Gauntlet verifies the full system.

## Troubleshooting

**npm install fails on Windows**
The `node-pty` package (browser terminal) requires C++ build tools on Windows. Either:
- Use headless mode: `npx voidforge-build init --headless my-project`
- Install Visual Studio Build Tools: `npm install -g windows-build-tools`
- Or use WSL2 (recommended for Claude Code on Windows)

**Claude doesn't seem to know the commands**
Make sure you're in the project directory when you run `claude`. It reads `CLAUDE.md` from the current directory.

**Build stops mid-way**
Run `/campaign --resume` to pick up where you left off. VoidForge saves state to `logs/` after every phase.

**How do I update VoidForge?**
Run `/void` inside Claude Code, or `npx voidforge-build update` from the terminal.
