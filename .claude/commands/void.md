# /void — Bombadil's Forge Sync

## Context Setup
1. Read `/docs/methods/FORGE_KEEPER.md`
2. Read `VERSION.md` (~30 lines — current version + history)

## Step 0 — Tune the Forge (Bombadil)
Orient to the current state:
1. Read `VERSION.md` — identify the current VoidForge version
2. Run `git status` — note any uncommitted changes (warn if shared files are dirty)
3. Check which shared files exist locally:
   - `CLAUDE.md` (check both root and `.claude/CLAUDE.md` — if `.claude/CLAUDE.md` exists and root does not, use that path. If both exist, warn and don't create a duplicate.)
   - `HOLOCRON.md`
   - `.claude/commands/*`
   - `docs/methods/*`, `docs/patterns/*`, `docs/NAMING_REGISTRY.md`
   - `scripts/thumper/*`
   - `VERSION.md` (conditional — only sync the "Current:" line, preserve project-specific version history rows)
   - `CHANGELOG.md`
4. Announce the current version and that you're checking for updates

## Step 1 — Listen to the River (Goldberry)
Fetch the latest from upstream:
1. Run `git remote -v` — look for a remote pointing to `tmcleod3/voidforge`
2. If no VoidForge remote exists:
   - Run `git remote add voidforge https://github.com/tmcleod3/voidforge.git`
   - Use `voidforge` as the remote name
3. If a matching remote exists, use that name (could be `origin` or `voidforge`)
4. Run `git fetch <remote> scaffold` — get the latest scaffold branch
5. Read remote VERSION.md: `git show <remote>/scaffold:VERSION.md`
6. Compare versions numerically (parse major.minor.patch as integers, not strings — "3.10.0" is newer than "3.9.0"):
   - If current version matches or is ahead → announce "The forge burns bright! You're on the latest." → Stop
   - If behind → continue

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
1. For each shared file, compare local vs upstream using `git diff HEAD <remote>/scaffold -- <path>`
2. Also check for new files on upstream that don't exist locally: `git diff --name-status HEAD <remote>/scaffold -- <shared paths>`
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
- **New files:** `git show <remote>/scaffold:<path>` and write to local path
- **Updated files (no local mods):** Replace with upstream version via `git show <remote>/scaffold:<path>`
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
