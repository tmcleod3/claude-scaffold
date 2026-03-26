# VoidForge Quick Start

Get from zero to building in 5 minutes.

## Prerequisites

- **Node.js 20+** — run `node --version` to check. If not installed: [nodejs.org](https://nodejs.org) or ask Claude "how do I install Node.js on [your OS]"
- **Claude Code** — the CLI tool from Anthropic. Install: `npm install -g @anthropic-ai/claude-code`
- **Git** — run `git --version` to check

## Step 1: Clone VoidForge

Pick one:

### Full version (wizard server + methodology)
```bash
git clone https://github.com/tmcleod3/voidforge.git my-project
cd my-project
npm install
```

### Scaffold version (methodology only — lighter, no native deps)
```bash
git clone --branch scaffold https://github.com/tmcleod3/voidforge.git my-project
cd my-project
```

> **Windows users:** If `npm install` fails with a `node-pty` error on the full version, use the scaffold branch instead. Everything works except the browser terminal. Alternatively, use WSL2.

## Step 2: Open in Claude Code

```bash
cd my-project
claude
```

Claude reads `CLAUDE.md` automatically. The entire methodology — 260+ agents, 26 commands, 35 patterns — activates the moment you open the project.

## Step 3: Build Something

### Option A: Start from scratch
```
/prd
```
Sisko interviews you about what you want to build, then generates a complete PRD with valid YAML frontmatter. Takes about 5 minutes of conversation.

### Option B: Bring your own PRD
Drop your requirements document into `docs/PRD.md` and run:
```
/build
```
The 13-phase build protocol takes over: scaffold, infrastructure, auth, core features, integrations, reviews, deploy.

### Option C: Full autonomous mode
```
/campaign --blitz
```
Sisko reads the PRD, sequences missions, builds each one, commits, and keeps going until the PRD is fully implemented. Walk away and come back to a built project.

## What the Commands Do

| Command | What It Does |
|---------|-------------|
| `/prd` | Generate a PRD from a conversation |
| `/build` | Execute the 13-phase build protocol |
| `/campaign` | Autonomous mission sequencing (reads PRD, builds everything) |
| `/campaign --blitz` | Same but fully autonomous — no pauses |
| `/assemble` | Full pipeline: architecture + build + review + security + QA |
| `/gauntlet` | Comprehensive review (5 rounds, 30+ agents) |
| `/review` | Code review on specific files |
| `/test` | Write missing tests |
| `/qa` | Full QA pass |
| `/ux` | UX/accessibility audit |
| `/security` | OWASP security audit |
| `/deploy` | Deploy to any cloud target |
| `/architect` | Architecture review |
| `/assess` | Pre-build codebase assessment |
| `/git` | Version bump, changelog, commit |

## The Quick Path

Most people do this:

1. `/prd` — describe what you want
2. `/campaign --blitz` — build the whole thing
3. `/gauntlet` — review before shipping
4. `/deploy` — ship it

## Troubleshooting

**"npx voidforge init" doesn't work**
That's not available yet. Clone the repo directly (Step 1 above).

**npm install fails on Windows**
The `node-pty` package (browser terminal) requires C++ build tools on Windows. Either:
- Install Visual Studio Build Tools: `npm install -g windows-build-tools`
- Or use the scaffold branch (no native deps): `git clone --branch scaffold ...`
- Or use WSL2 (recommended for Claude Code on Windows)

**Claude doesn't seem to know the commands**
Make sure you're in the project directory when you run `claude`. It reads `CLAUDE.md` from the current directory.

**Build stops mid-way**
Run `/campaign --resume` to pick up where you left off. VoidForge saves state to `logs/` after every phase.

## Learn More

- **[The Holocron](../HOLOCRON.md)** — complete user guide
- **[The Prophecy](../PROPHECY.md)** — what's coming next
- **[README](../README.md)** — system reference
