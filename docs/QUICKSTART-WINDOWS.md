# VoidForge on Windows + VS Code

Get VoidForge running inside Visual Studio Code on Windows. This guide covers setup, known limitations, and how to use the full system from within the editor.

## What You'll Need

- **Visual Studio Code** — [code.visualstudio.com](https://code.visualstudio.com)
- **Node.js 20+** — [nodejs.org](https://nodejs.org) (LTS). After install, open a **new** PowerShell and run `node --version`.
- **Git for Windows** — [git-scm.com/download/win](https://git-scm.com/download/win). During install, **check "Add to PATH"**. After install: `git --version`.
- **Claude Code VS Code Extension** — search "Claude Code" in the VS Code extensions panel (`Ctrl+Shift+X`) or install from the marketplace.
- **Claude Code CLI** — `npm install -g @anthropic-ai/claude-code` (needed for full slash command support).

> **Important:** Close and reopen VS Code after installing Node.js and Git. Windows doesn't pick up new PATH entries in existing terminal sessions.

## Step 1: Clone VoidForge

Open the VS Code integrated terminal (`` Ctrl+` ``):

```powershell
git clone https://github.com/tmcleod3/voidforge.git my-project
cd my-project
```

Then open the folder in VS Code: **File > Open Folder > select `my-project`**.

### Pick Your Branch

| Branch | What You Get | Install |
|--------|-------------|---------|
| `npx voidforge-build init` | Full — wizard server, dashboard, everything | May need build tools for node-pty |
| `npx voidforge-build init --headless` | Methodology only — all commands, patterns, agents | No native deps needed |

**Recommended for most Windows users:** Use headless mode to avoid native module issues:

```powershell
npx voidforge-build init --headless my-project
```

If you want the full wizard and `npm install` fails with a `node-pty` error, see [Troubleshooting](#npm-install-fails-with-node-pty-error) below.

## Step 2: Set Up Claude Code in VS Code

### Option A: Use the VS Code Extension (Recommended)

1. Open the Extensions panel (`Ctrl+Shift+X`).
2. Search **"Claude Code"** and install the Anthropic extension.
3. Requires VS Code **1.98.0 or higher** — update VS Code if needed.
4. After install, click the **spark icon** (top-right of the editor toolbar) or open the Claude panel from the sidebar.
5. Sign in with your Anthropic account when prompted.

The extension gives you a chat panel inside VS Code with inline diffs, file mentions, and conversation tabs.

### Option B: Use the CLI in the Integrated Terminal

Open the VS Code terminal (`` Ctrl+` ``):

```powershell
claude
```

Claude reads `CLAUDE.md` from the workspace root automatically. The full methodology — 260+ agents, 30 commands, 34 patterns — activates immediately.

> **Both work together.** The extension and CLI share the same project context. Use the extension for quick edits and conversation; use the CLI for full slash command access and long-running builds.

## Step 3: Build Something

In either the Claude extension panel or the CLI:

```
/prd
```

Sisko interviews you about what to build, then generates a complete PRD. After that:

```
/campaign --blitz
```

This reads your PRD and builds the entire project autonomously — architecture, code, tests, reviews, deploy config. It commits after each mission and keeps going until done.

---

## Using VoidForge from Inside VS Code

### The Extension Panel

Once installed, the Claude Code extension appears as a sidebar panel. Here's what you can do:

**Chat and edit:**
- Ask questions about the codebase — Claude has full file access.
- Request code changes — inline diffs appear in the editor for review.
- Accept or reject each change before it's applied.
- Use `@filename` to reference specific files (e.g., `@src/auth.ts explain this`).
- Use `@terminal:name` to reference terminal output in your prompts.

**Available extension commands** (type `/` in the prompt box):
- `/model` — switch between Claude models
- `/usage` — check token and plan usage
- `/compact` — manually compact conversation context
- `/mcp` — manage MCP server connections
- `/memory` — view and edit auto memory
- `/permissions` — manage tool permissions
- `/hooks` — view and manage hooks

**Not available in the extension:**
VoidForge's slash commands (`/build`, `/campaign`, `/prd`, `/gauntlet`, etc.) are loaded from `.claude/commands/` and are **fully supported in the CLI** but may not all appear in the extension's `/` menu. For these, use the integrated terminal.

### Running VoidForge Commands via the CLI

Open the VS Code integrated terminal (`` Ctrl+` ``):

```powershell
claude
```

Now you have full access to every VoidForge command:

| Command | What It Does |
|---------|-------------|
| `/prd` | Generate a PRD from a conversation |
| `/build` | Execute the 13-phase build protocol |
| `/campaign` | Autonomous mission sequencing |
| `/campaign --blitz` | Fully autonomous — no pauses |
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
| `/debrief` | Post-mortem analysis |

### Best Workflow: Extension + CLI Together

1. **Extension panel** for conversational work — asking questions, reviewing diffs, quick edits.
2. **CLI in integrated terminal** for build commands — `/campaign`, `/build`, `/gauntlet`. These run long and produce structured output that works best in a terminal.
3. **Second terminal tab** for running your app, tests, or dev server while Claude works in the first.

> **Tip:** Split the VS Code layout — editor on the left, Claude extension panel on the right, terminal at the bottom. You can watch Claude propose changes in the panel while the build runs in the terminal.

### Extension Features Worth Knowing

**Inline diffs:** When Claude proposes a change, VS Code shows a diff overlay on the file. You can accept, reject, or modify before it's saved.

**Checkpoints:** The extension creates snapshots you can rewind to if Claude takes the code in a direction you don't want. Look for the checkpoint controls in the panel.

**IDE diagnostics:** The extension automatically exposes VS Code's Problems panel (errors, warnings, lints) to Claude via a built-in MCP server. Claude can see your TypeScript errors, ESLint warnings, etc. without you copying them.

**Auto-save:** By default, files are saved before Claude reads them. This ensures Claude always sees your latest edits. Configurable in extension settings.

---

## Known Limitations on Windows

### Git Bash Is Required (Even with PowerShell)

Claude Code on Windows uses Git Bash under the hood for its Bash tool, even if you're running PowerShell. If Git for Windows isn't installed or isn't found, you'll see:

```
Claude Code on Windows requires git-bash
```

**Fix:** Install Git for Windows and ensure it's in PATH. If Git is installed but still not detected, add this to `~/.claude/settings.json` (create the file if it doesn't exist — `~` is `C:\Users\YourName`):

```json
{
  "env": {
    "CLAUDE_CODE_GIT_BASH_PATH": "C:\\Program Files\\Git\\bin\\bash.exe"
  }
}
```

### Spaces in Git Install Path

If Git is installed to `C:\Program Files\Git` (the default), the space in "Program Files" can cause path parsing errors in some configurations.

**Fix:** Use the `CLAUDE_CODE_GIT_BASH_PATH` setting above with the full path. Alternatively, install Git to a path without spaces (e.g., `C:\Git`).

### PowerShell vs. Git Bash vs. CMD

| Shell | Works? | Notes |
|-------|--------|-------|
| **PowerShell** | Yes (recommended) | Best TTY support, most reliable for Claude Code |
| **Git Bash** | Partial | Required internally by Claude Code, but limited TTY — don't run the CLI directly from Git Bash |
| **CMD** | No | Not supported for Claude Code |
| **WSL2** | Yes | Works well but requires separate setup (see below) |

**Rule of thumb:** Use PowerShell in VS Code's integrated terminal. Set your VS Code default terminal profile to PowerShell: `Ctrl+Shift+P` > "Terminal: Select Default Profile" > PowerShell.

### Extension vs. CLI Feature Gap

The VS Code extension supports core Claude Code features but doesn't expose everything:

| Feature | CLI | Extension |
|---------|-----|-----------|
| VoidForge slash commands (`/build`, `/campaign`, etc.) | All 26+ | Type `/` to see available subset |
| MCP server management | Full | Partial (add via CLI, manage via `/mcp`) |
| `!` bash shortcut (run shell inline) | Yes | No |
| Tab completion | Yes | No |
| IDE diagnostics (Problems panel) | No | Yes (automatic) |
| Inline diff review | No | Yes |
| Checkpoints/rewind | Yes | Yes |

### WSL2 Caveats

If you choose to run via WSL2 instead of native Windows:

- **Cross-filesystem penalty:** Working on files in `/mnt/c/` (Windows filesystem from WSL) is significantly slower for search and file operations. Clone repos inside the WSL filesystem (`~/projects/`) instead.
- **IDE detection:** VS Code's Remote WSL extension works, but some MCP servers may not detect the connection due to WSL2's NAT networking.
- **Node.js conflicts:** If Node.js is installed on both Windows and WSL, the wrong `npm` can get picked up. Verify with `which npm` — it should start with `/usr/`, not `/mnt/c/`.
- **Required packages:** Install `bubblewrap` and `socat` in WSL for sandbox support: `sudo apt install bubblewrap socat`.

### No Browser Terminal on Windows (Main Branch)

The Tower page (`/tower.html`) in the wizard dashboard requires `node-pty`, which needs C++ build tools on Windows. If you skipped this with `--ignore-scripts`, the Tower page won't work. Everything else — Lobby, Danger Room, War Room, setup wizard, deploy wizard — works fine without it.

### Telegram Bridge (Thumper) on VS Code

The `/thumper` command (Telegram remote control) uses terminal automation that doesn't fully support VS Code's integrated terminal on Windows. If you need Thumper, run it from a standalone PowerShell window, not the VS Code terminal. Use `tmux` under WSL2 for the most reliable experience.

---

## Troubleshooting

### "npm is not recognized"

Node.js wasn't added to PATH. Close VS Code completely and reopen it after installing Node.js. If still broken, reinstall Node.js and check "Add to PATH" during setup.

### "git is not recognized"

Same fix — close and reopen VS Code completely after installing Git.

### "claude is not recognized"

Run `npm install -g @anthropic-ai/claude-code` in PowerShell, then restart VS Code.

### npm Install Fails with node-pty Error

This is a native C++ module for the browser terminal. Four options:

**Option A — Use headless mode (fastest)**
```powershell
npx voidforge-build init --headless my-project
```
Full methodology, all commands, no native dependencies.

**Option B — Skip native modules**
```powershell
npm install --ignore-scripts
```
Everything works except the browser terminal (Tower page).

**Option C — Install build tools**
```powershell
npm install -g windows-build-tools
npm install
```
Takes 5-10 minutes. Gets you full Tower support.

**Option D — Use WSL2**
```powershell
wsl --install
```
Restart, open Ubuntu, install Node.js and Git inside WSL, clone there. No native module issues. Use VS Code's "Remote - WSL" extension to open the WSL folder.

### Claude Doesn't Know the VoidForge Commands

Make sure you opened the correct folder in VS Code. Claude reads `CLAUDE.md` from the workspace root. Check:
- **File > Open Folder** points to the `my-project` directory (the one with `CLAUDE.md` in it).
- Run `ls CLAUDE.md` in the terminal to confirm it exists.
- If using the extension, the workspace root must contain `CLAUDE.md`.

### Build Stops Mid-Way

Run `/campaign --resume` to pick up where you left off. VoidForge saves state to `logs/` after every phase.

### Extension Panel Is Empty or Won't Load

- Update VS Code to 1.98.0+.
- Uninstall and reinstall the Claude Code extension.
- Check **Output > Claude Code** panel for error messages.
- Ensure you're signed in to your Anthropic account.

### Slow File Operations

If search and file reads feel sluggish:
- Ensure the project is on a local drive, not a network share.
- If using WSL2, clone inside the WSL filesystem (`~/projects/`), not on `/mnt/c/`.
- Close other heavy VS Code extensions that index files aggressively.

---

## Wizard Dashboard Pages (Main Branch Only)

If you're on the `main` branch with `npm install` completed:

```powershell
npm run wizard
```

Opens **http://localhost:3141**:

| Page | URL | Purpose |
|------|-----|---------|
| **The Lobby** | `/lobby.html` | Multi-project dashboard. Projects, health, deploy state. |
| **Gandalf** | `/index.html` | Setup wizard. Vault, project config, credentials. |
| **Haku** | `/deploy.html` | Deploy wizard. Provision infrastructure, deploy code. |
| **Danger Room** | `/danger-room.html` | Operations dashboard. Campaign timeline, findings, growth, treasury. |
| **War Room** | `/war-room.html` | Experiments, prophecy graph. |
| **Tower** | `/tower.html` | Browser terminal. (Needs node-pty — see limitations above.) |

---

## The Quick Path

1. Install prerequisites (VS Code, Node.js, Git, Claude Code extension + CLI).
2. Create project: `npx voidforge-build init --headless my-project` (or full: `npx voidforge-build init my-project`).
3. Open folder in VS Code.
4. Open Claude in the integrated terminal: `claude`.
5. `/prd` — describe what you want to build.
6. `/campaign --blitz` — build everything autonomously.
7. Watch progress, review diffs, ship.

## Next Steps

- **[The Holocron](../HOLOCRON.md)** — complete user guide (start here to understand everything)
- **[QUICKSTART.md](QUICKSTART.md)** — general quick start (all platforms)
- **[The Prophecy](../PROPHECY.md)** — roadmap and what's coming next
- **Slash commands:** Type `/` in Claude Code to see all 26+ commands
