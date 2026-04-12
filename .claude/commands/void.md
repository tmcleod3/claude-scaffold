# /void — Bombadil's Forge Sync

> **Note:** This branch is a tombstone redirect. Running `/void` here upgrades your methodology to the latest from `main`. For the best experience, install the VoidForge CLI: `npm install -g thevoidforge`

## Context Setup
1. Read `/docs/methods/FORGE_KEEPER.md`
2. Read `VERSION.md` (~30 lines — current version + history)

## CRITICAL: Write Target Safety

**NEVER write methodology files to `~/.claude/`.** All files MUST go to the PROJECT root (where `.voidforge` marker or `.git` exists). Writing to `~/.claude/commands/` or `~/.claude/agents/` creates user-level duplicates that appear alongside project-level commands in every project — Claude Code shows both "(user)" and "(project)" copies.

**Detect and fix duplicates (auto-cleanup):** Before any sync, check if `~/.claude/commands/` or `~/.claude/agents/` contain VoidForge methodology files. If they do:
1. Run `ls ~/.claude/commands/ 2>/dev/null | head -3` and `ls ~/.claude/agents/ 2>/dev/null | head -3`
2. If VoidForge commands exist there (assess.md, build.md, qa.md, etc.), warn: "Found VoidForge commands in ~/.claude/ (user-level). These cause duplicate commands in Claude Code. Removing..."
3. Run `rm -rf ~/.claude/commands/ ~/.claude/agents/` to clean them
4. Confirm: "User-level duplicates removed. Project-level commands will be used."

## Step 0 — Tune the Forge (Bombadil)
Orient to the current state:
1. Read `VERSION.md` — identify the current VoidForge version
2. Run `git status` — note any uncommitted changes (warn if shared files are dirty)
3. Check which shared files exist locally:
   - `CLAUDE.md` (check both root and `.claude/CLAUDE.md` — if `.claude/CLAUDE.md` exists and root does not, use that path. If both exist, warn and don't create a duplicate.)
   - `HOLOCRON.md`
   - `.claude/commands/*`
   - `.claude/agents/*`
   - `docs/methods/*`, `docs/patterns/*`, `docs/NAMING_REGISTRY.md`
   - `scripts/thumper/*`
   - `VERSION.md` (conditional — only sync the "Current:" line, preserve project-specific version history rows)
   - `CHANGELOG.md`
4. Announce the current version and that you're checking for updates

## Step 1 — Listen to the River (Goldberry)
Fetch the latest from upstream. Two transports supported:

**Transport A (npm — v21.0+):** If `npx voidforge` is available:
1. Check: run `npx voidforge --version` to get the installed CLI version
2. **CLI freshness check (MANDATORY):** Run `npm view thevoidforge version` to get the latest npm version. Compare the two:
   - If the CLI version is BEHIND npm latest → run `npm install -g thevoidforge@latest` FIRST. This is critical: old CLIs (pre-v23.1.1) compare against their own bundled methodology and will falsely report "up to date." The upgrade must happen BEFORE `npx voidforge update`.
   - If the install fails (permissions) → try `sudo npm install -g thevoidforge@latest` or suggest the user run it manually
   - After upgrading, verify with `npx voidforge --version` that the new version is active
3. Run `npx voidforge update` — now using the latest CLI, which has the full methodology including `.claude/agents/`
4. If no changes → "The forge burns bright! You're on the latest." → Stop
5. If changes applied → skip to Step 4 (npm transport handles Steps 2-3)

**Transport B (git — legacy):** If `npx voidforge` is NOT available:
1. Offer to install: "Install VoidForge CLI for one-pass updates: `npm install -g thevoidforge`. Or continue with git transport (may require two passes for new file categories)."
2. If user declines or npm unavailable, proceed with git:
3. Run `git remote -v` — look for a remote pointing to `tmcleod3/voidforge`
4. If no VoidForge remote exists:
   - Run `git remote add voidforge https://github.com/tmcleod3/voidforge.git`
   - Use `voidforge` as the remote name
5. If a matching remote exists, use that name (could be `origin` or `voidforge`)
6. Run `git fetch <remote> main` — get the latest main branch
7. Read remote VERSION.md: `git show <remote>/main:VERSION.md`
8. Compare versions numerically (parse major.minor.patch as integers, not strings — "3.10.0" is newer than "3.9.0"):
   - If current version matches or is ahead → announce "The forge burns bright! You're on the latest." → Stop
   - If behind → continue to Step 2

## Step 1.5 — Spring Cleaning (Treebeard)
Check the **Migration Registry** in `/docs/methods/FORGE_KEEPER.md` for one-time cleanup actions:
1. Determine which migrations apply based on local version → upstream version range
2. For each applicable migration, scan for the listed files
3. **Fingerprint ambiguous files** before marking for removal — files like `docs/ARCHITECTURE.md` could be the user's own. Only remove if they contain VoidForge markers (e.g., "Version: 15.2.1", references to `wizard/`, "VoidForge" in header)
4. **Always-remove files** (PRD-VOIDFORGE.md, PROPHECY.md, WORKSHOP.md, etc.) don't need fingerprinting — they're unambiguously VoidForge artifacts
5. **wizard/ is NOT auto-removed.** Scaffold/core users may have pulled it via Full-tier commands (/cultivation, /dangerroom, /grow, /treasury, /portfolio, /current). Check: if package.json has dependencies or .voidforge/ exists on disk → user is running Full-tier, keep wizard/. If minimal package.json and no runtime data → ask the user whether to keep or remove
6. Present the cleanup plan alongside the update plan in Step 2
7. Apply cleanup in Step 3 alongside updates — same confirmation prompt ("all / selective / skip")
8. For tracked `logs/*` files, use `git rm --cached` (untrack but keep on disk)
9. If `package.json` has `dependencies`/`devDependencies` on scaffold/core AND wizard/ is being kept → leave package.json alone. Only strip to minimal if wizard/ is being removed

## Step 2 — Walk the Forest (Treebeard)
Compare every shared methodology file:
1. For each shared file, compare local vs upstream using `git diff HEAD <remote>/main -- <path>`
2. Also check for new files on upstream that don't exist locally: `git diff --name-status HEAD <remote>/main -- <shared paths>`
3. Categorize each file:
   - **New** — exists upstream, not locally
   - **Updated** — content differs between local and upstream
   - **Unchanged** — identical
   - **Locally modified** — check with `git diff HEAD -- <path>` to see if user has uncommitted local changes to a file that upstream also changed
4. For each changed file, summarize the changes in plain language (read the diff, describe what's new/different)
5. Present the full update plan to the user:
   - List new files with descriptions
   - List updated files with change summaries
   - Flag locally modified files with conflict warnings
   - Count unchanged files (don't list them)
6. Ask the user: "Shall old Tom sing these changes into being? (all / selective / skip)"

## Step 3 — Carry the Message (Radagast)
Apply updates based on user's choice:
1. For **"all"** — update every file in the manifest
2. For **"selective"** — walk through each file, ask yes/no
3. For **"skip"** — stop gracefully

For each file being updated:
- **New files:** `git show <remote>/main:<path>` and write to local path
- **Updated files (no local mods):** Replace with upstream version via `git show <remote>/main:<path>`
- **Updated files (with local mods):**
  - For `CLAUDE.md`: Preserve the `## Project` section (name, one-liner, domain, repo) and any user-added `## Coding Standards` entries. Update all methodology sections (Slash Commands, Team, Docs Reference, Release Tiers, etc.)
  - For other files: Show both versions, let user choose, or attempt to merge non-overlapping changes
- **Never touch:** `docs/PRD.md`, `docs/LESSONS.md`, `logs/*`, `wizard/*`, `scripts/* (except scripts/thumper/)`, `.env`, `.claude/settings.json`, `package.json`, application code

## Step 4 — The Song Continues (Bombadil)
Verify and celebrate:
1. Confirm all updated files were written correctly (spot-check a couple)
2. Update local `VERSION.md` current version to match upstream if it wasn't already in the shared file set
3. Log the sync — append to `/logs/forge-sync.md`:
   ```
   ## Forge Sync — [DATE]
   - Updated from v[OLD] to v[NEW]
   - Files synced: [count]
   - New: [list or "none"]
   - Updated: [list]
   - Conflicts: [list or "none"]
   ```
4. Note any handoffs:
   - New slash commands added → mention what they do
   - New method docs → mention what agent/domain they cover
   - New patterns → mention what they demonstrate
   - Changes to build protocol → recommend reviewing before next `/build`
5. **Content impact check:** If NAMING_REGISTRY.md or CLAUDE.md was updated, diff the agent/command lists against the previous version. If new agents or commands were added, explicitly announce them: "New in this update: [Agent Name] ([role]). New commands: [/command]." Then warn: **"If your project displays agent counts, command lists, references the team roster, or assigns agents to protocol phases (e.g., marketing sites, docs pages, about pages, protocol timelines), update those data sources to match. New agents may need to be added to protocol phase assignments — check which phases they should participate in."** This is a handoff, not an auto-fix — `/void` doesn't know your project's data model.
   - If `VERSION.md` was updated, check if the project has any pages displaying version/release history. Flag versions in VERSION.md not reflected in site content.
6. Announce completion with flair

## Handoffs
- If build protocol phases changed → recommend **Picard** review (`/architect`)
- If security method updated → recommend **Kenobi** review (`/security`)
- If new patterns added → note for **Stark** and **Galadriel** to review
- If the update is a MAJOR version → strongly recommend reading the CHANGELOG before continuing work
