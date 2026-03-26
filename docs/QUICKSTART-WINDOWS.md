# VoidForge on Windows — Wizard Setup Guide

Get the full VoidForge wizard running on Windows. Browser-based setup, deploy, and dashboard.

## What You'll Need

- **Node.js 20+** — download from [nodejs.org](https://nodejs.org) (LTS version). After install, open a new terminal and run `node --version` to confirm.
- **Git** — download from [git-scm.com](https://git-scm.com/download/win). After install: `git --version` to confirm.
- **Claude Code** — install globally: `npm install -g @anthropic-ai/claude-code`

## Step 1: Clone VoidForge

Open PowerShell or Command Prompt:

```bash
git clone https://github.com/tmcleod3/voidforge.git my-project
cd my-project
```

## Step 2: Install Dependencies

Try the standard install first:

```bash
npm install
```

### If npm install fails with a `node-pty` error

This is a native C++ module used for the browser terminal. On Windows it needs build tools. You have three options:

**Option A — Skip it (fastest, recommended)**
```bash
npm install --ignore-scripts
```
This installs everything except native modules. You get the full wizard — setup, deploy, Danger Room, Lobby, War Room. The only thing that won't work is the browser terminal (Tower page). Everything else is fully functional.

**Option B — Install Windows build tools**
```bash
npm install -g windows-build-tools
npm install
```
This takes 5-10 minutes to download Visual Studio Build Tools. After it completes, `npm install` should succeed with full terminal support.

**Option C — Use WSL2 (best long-term)**
```bash
wsl --install
```
Restart your computer. Then open Ubuntu from the Start menu:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
git clone https://github.com/tmcleod3/voidforge.git my-project
cd my-project
npm install
```
WSL2 gives you a Linux environment inside Windows. Claude Code runs best here. No native module issues.

## Step 3: Start the Wizard

```bash
npm run wizard
```

Your browser opens to **http://localhost:3141**. You'll see:

**Gandalf — VoidForge Setup**

This is the 3-act setup wizard:
1. **Act 1 — Secure Your Forge:** Create a vault password. This encrypts all your API keys and credentials.
2. **Act 2 — Your Project:** Enter your project details or paste/generate a PRD.
3. **Act 3 — Operations:** Configure deploy targets, connect cloud providers, set up integrations.

## Step 4: Build Your Project

After the wizard completes, open a new terminal in the same directory:

```bash
cd my-project
claude
```

Inside Claude Code, run:

```
/campaign --blitz
```

This reads your PRD and builds the entire project autonomously — architecture, code, tests, reviews, deploy config. It commits after each mission and keeps going until done.

## What Each Page Does

| Page | URL | Purpose |
|------|-----|---------|
| **The Lobby** | `/lobby.html` | Multi-project dashboard. See all your projects, health status, deploy state. |
| **Gandalf** | `/index.html` | Setup wizard. Create vault, configure project, enter credentials. |
| **Haku** | `/deploy.html` | Deploy wizard. Provision infrastructure, deploy code. |
| **Danger Room** | `/danger-room.html` | Operations dashboard. Campaign timeline, findings, growth tabs, treasury. |
| **War Room** | `/war-room.html` | Alternative dashboard view. Experiments, prophecy graph. |
| **Tower** | `/tower.html` | Browser terminal. Run Claude Code from the browser. (Needs node-pty.) |
| **Login** | `/login.html` | Authentication for remote mode. |

## The Quick Path

Most people do this:

1. `npm run wizard` — set up vault + credentials in the browser
2. `claude` — open Claude Code in the project
3. `/prd` — describe what you want to build
4. `/campaign --blitz` — build everything autonomously
5. Open **http://localhost:3141/danger-room.html** — watch progress in the dashboard

## Common Windows Issues

**"npm is not recognized"**
Node.js wasn't added to PATH. Close and reopen your terminal after installing Node.js. If still broken, reinstall Node.js and check "Add to PATH" during setup.

**"git is not recognized"**
Same fix — close and reopen terminal after installing Git.

**"claude is not recognized"**
Run `npm install -g @anthropic-ai/claude-code` and reopen terminal.

**Wizard starts but browser doesn't open**
Manually open **http://localhost:3141** in your browser.

**Port 3141 already in use**
Another process is using the port. Either kill it (`netstat -ano | findstr 3141` then `taskkill /PID [number] /F`) or set a different port: `PORT=3142 npm run wizard`

**Everything installs but the wizard is blank/broken**
Make sure you're on the `main` branch: `git branch` should show `* main`. If you're on scaffold or core, those don't have the wizard files.

## Next Steps

- **[The Holocron](../HOLOCRON.md)** — complete user guide (start here if you want to understand everything)
- **[QUICKSTART.md](QUICKSTART.md)** — general quick start (all platforms)
- **[The Prophecy](../PROPHECY.md)** — roadmap and what's coming next
- **Slash commands:** Type `/` in Claude Code to see all 26 commands
