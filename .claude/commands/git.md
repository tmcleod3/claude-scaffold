# /git — Coulson's Version & Release Management

## Context Setup
1. Read `/docs/methods/RELEASE_MANAGER.md`
2. Read `VERSION.md` (~25 lines — semver rules + version history)

## Step 0 — Orient (Coulson)
Scope the changes:
1. Run `git status` — identify staged, unstaged, and untracked files
2. Run `git diff --stat` — get a summary of what changed
3. If there are unstaged changes, ask the user: "Stage everything, or should I be selective?"
4. If there are no changes at all, stop: "Nothing to version. Working tree is clean."

## Step 1 — Analyze (Vision)
Read the actual diffs and classify every change:
1. Run `git diff --cached` (staged) and `git diff` (unstaged) — read the content
2. Classify each change into exactly one category:
   - **Added** — new files, new features, new commands, new agents
   - **Changed** — modifications to existing features, refactors, improvements
   - **Fixed** — bug fixes, corrections
   - **Removed** — deleted files, removed features
   - **Security** — security-related changes (auth, encryption, headers, secrets)
3. Flag any **breaking changes** (deleted/renamed exports, changed method doc structure, changed build phases, changed agent naming)
4. Present the classification to the user for review before proceeding

## Step 2 — Version (Friday)
Determine the version bump:
1. Read current version from `VERSION.md`
2. Check for user override arguments (`--major`, `--minor`, `--patch`)
3. If no override, apply the priority cascade:
   - **MAJOR** — Breaking changes: deleted/renamed exports, changed method doc structure, changed build phases, changed agent naming
   - **MINOR** — New files (not tests), new features, new commands, new agents, new method docs
   - **PATCH** — Bug fixes, typos, refactors, dependency updates, test-only changes
4. Present recommendation: "Recommend **vX.Y.Z** (MINOR — new command, new method doc). Override? [enter to accept]"
5. User confirms or overrides

## Step 3 — Chronicle (Wong)
Update all version files:
1. Read the top of `CHANGELOG.md` (~30 lines for format reference)
2. Write new CHANGELOG entry at the top (after the header), using the categories from Step 1:
   - User-facing language, not file-level details
   - Group by Added/Changed/Fixed/Removed/Security
   - Include today's date
3. Update `VERSION.md`:
   - Change "**Current:** X.Y.Z" to the new version
   - Add a row to the Version History table with date and one-line summary
4. Update `package.json` version field

## Step 4 — Commit (Rogers)
Stage and commit:
1. Stage all modified version files: `VERSION.md`, `CHANGELOG.md`, `package.json`
2. Stage any other files that are part of this release (from Step 0)
3. Craft commit message in the format: `vX.Y.Z: One-line summary`
   - If elaboration needed, add a blank line then details
   - Match the style of existing commits (check `git log --oneline -10`)
4. Present the full commit message and staged file list to the user
5. On user approval, execute the commit

## Step 5 — Verify (Barton)
Confirm everything is consistent:
1. Run `git log -1 --format="%H %s"` — verify the commit exists and message is correct
2. Check version consistency:
   - `VERSION.md` current version matches
   - `package.json` version matches
   - `CHANGELOG.md` has an entry for this version
   - Commit message starts with the correct version tag
3. Run `git status` — verify working tree is clean (no forgotten files)
4. If any inconsistency found, flag it and offer to fix

## Step 6 — Push (Coulson) [Optional]
Only if the user explicitly requests:
1. Check remote: `git remote -v`
2. Check if branch tracks upstream: `git status -sb`
3. Push: `git push`
4. Verify: `git log --oneline -1` matches remote

## Handoffs
- If changes include security fixes → note for Kenobi (`/security`)
- If changes include infrastructure → note for Kusanagi (`/devops`)
- If version is MAJOR → recommend Picard review (`/architect`)
