# PRD: Wizard Extraction — v21.0

---
version: "1.0"
status: approved
author: Picard (Architecture) + Kenobi (Security) + Kusanagi (DevOps) + Kelsier (Growth)
date: 2026-04-08
architecture: ADR-038
priority: critical
type: breaking
---

## Problem

The VoidForge wizard is embedded inside every project it creates. This is architecturally wrong — the wizard is a multi-project management tool living inside one of the projects it manages. This causes: no update mechanism for wizard bug fixes, AWS SDK dependency pollution in user projects, three-branch sync burden, and fundamental confusion about what VoidForge IS (a methodology framework) vs what the wizard IS (a project management application).

## Solution

Extract the wizard into a standalone npm package. Projects contain methodology only. Extensions (Danger Room, Cultivation) are optional per-project addons.

---

## Requirement 1: npm Package Structure

**Two packages, one monorepo:**

| Package | npm Name | Contains |
|---------|----------|----------|
| Wizard + CLI | `voidforge` | Server, API, UI, lib, CLI, templates, tests |
| Methodology | `@voidforge/methodology` | CLAUDE.md, commands, methods, patterns, Holocron |

**Workspace root `package.json`:**
```json
{
  "name": "voidforge-monorepo",
  "private": true,
  "workspaces": ["packages/*"]
}
```

**Wizard `package.json`:**
```json
{
  "name": "voidforge",
  "version": "21.0.0",
  "bin": { "voidforge": "./bin/voidforge.js" },
  "dependencies": {
    "@aws-sdk/client-ec2": "...",
    "@voidforge/methodology": "21.0.0",
    "ws": "...",
    "node-pty": "..."
  }
}
```

**Methodology `package.json`:**
```json
{
  "name": "@voidforge/methodology",
  "version": "21.0.0",
  "description": "VoidForge methodology — agents, commands, methods, patterns.",
  "files": ["CLAUDE.md", ".claude/", "docs/", "HOLOCRON.md", "VERSION.md", "CHANGELOG.md", "scripts/thumper/"]
}
```

**Acceptance:** Both packages publish to npm. `npx voidforge` downloads and runs. `@voidforge/methodology` is a dependency of `voidforge`, bundled automatically.

---

## Requirement 2: CLI Commands

```
npx voidforge                       Launch wizard (browser UI at :3141)
npx voidforge init                   Create new project (Gandalf flow)
npx voidforge init --headless        Create project without browser
npx voidforge init --core            Minimal methodology (no Holocron, no patterns)
npx voidforge update                 Update project methodology (Bombadil)
npx voidforge update --self          Update the wizard itself
npx voidforge update --extensions    Update all installed extensions
npx voidforge install <extension>    Add extension to current project
npx voidforge uninstall <extension>  Remove extension from current project
npx voidforge deploy                 Deploy project (Haku)
npx voidforge doctor                 Check versions, compatibility, health
npx voidforge migrate                Migrate old-model project to v21.0
npx voidforge version                Show wizard + methodology versions
```

**Acceptance:** All commands work from any directory. Project-scoped commands (`update`, `install`, `deploy`) detect the project via `.voidforge` marker file walking up the directory tree.

---

## Requirement 3: Project Creation Flow

When user runs `npx voidforge init` or clicks "New Project" in the wizard:

1. **Name + Directory:** Project name, target directory (default: `~/Projects/<name>`)
2. **Identity:** One-liner, domain, repo URL (optional)
3. **Extensions:** Checkboxes for Danger Room, Cultivation, Deep Current, Thumper
4. **PRD:** Generate with /prd, upload existing, or start blank

**On create:**
1. Create directory (or validate existing)
2. Copy methodology from bundled `@voidforge/methodology` into project
3. Inject project identity into CLAUDE.md (replace placeholders)
4. Write `.voidforge` marker file
5. Register in `~/.voidforge/projects.json`
6. If extensions selected: provision each (see Req 5)
7. Git init + initial commit
8. Open project in wizard detail view

**Acceptance:** A newly created project has zero npm dependencies from VoidForge. `package.json` does not exist unless the user's app needs one.

---

## Requirement 4: `.voidforge` Marker File

Every VoidForge project gets a `.voidforge` JSON file at root:

```json
{
  "id": "uuid",
  "version": "21.0.0",
  "created": "2026-04-08T00:00:00Z",
  "tier": "full",
  "extensions": ["cultivation", "danger-room"]
}
```

**Used by:**
- CLI to detect project root (walks up from cwd)
- Wizard to discover projects (in addition to registry)
- `/void` to track methodology version
- Extension commands to check what's installed

**Acceptance:** Every project has this file. CLI commands fail gracefully with "Not a VoidForge project — run `npx voidforge init`" when marker is missing.

---

## Requirement 5: Extension System

### Danger Room Extension

**Install:** `npx voidforge install danger-room` or checkbox at creation
**Adds to project:** `danger-room.config.json` (panel config, refresh intervals)
**Runtime:** Wizard server reads project data, serves dashboard. No code in project.
**Update:** Config schema migrated on wizard update.

### Cultivation Extension

**Install:** `npx voidforge install cultivation` or checkbox at creation
**Adds to project:**
```
cultivation/
├── heartbeat.config.json       config (schedules, platforms, circuit breakers)
├── jobs/                        thin wrappers importing from wizard/lib/
│   ├── token-refresh.ts
│   ├── spend-check.ts
│   ├── campaign-status.ts
│   ├── reconciliation.ts
│   ├── ab-evaluation.ts
│   └── ... (12 total)
├── treasury/                    runtime state (gitignored)
│   ├── spend-log.jsonl
│   ├── revenue-log.jsonl
│   └── campaigns/
└── .gitignore                   ignores runtime state
```

**Runtime:** Per-project heartbeat daemon.
- PID: `<project>/.voidforge/heartbeat.pid`
- Socket: `<project>/.voidforge/heartbeat.sock`
- Service: `com.voidforge.heartbeat.<project-id>`

**Post-install setup:** Interactive flow for vault connection, revenue source, circuit breakers.

### Extension Lifecycle
- **Install:** Copies template files, registers in `.voidforge` marker
- **Update:** Wizard update migrates config schemas, copies new thin-wrapper jobs
- **Remove:** Deletes extension directory, stops daemon if running, deregisters

**Acceptance:** Extensions install without `npm install` in the project. Thin-wrapper jobs import from the globally-installed wizard.

---

## Requirement 6: Update Mechanisms

### Wizard Self-Update
```bash
npx voidforge update --self
# or: npm update -g voidforge
```
Downloads latest `voidforge` from npm. Restarts wizard if running. Updates bundled methodology snapshot.

### Methodology Update (replaces /void git-fetch)
```bash
npx voidforge update
# or: /void in Claude Code (calls npx voidforge update internally)
```
Diffs bundled `@voidforge/methodology` against project's local files. Presents Bombadil-style update plan. Applies on confirmation. Updates `.voidforge` marker version.

### Extension Update
Bundled with wizard update. On wizard update, for each project with extensions:
1. Migrate config schemas (add new fields with defaults)
2. Copy any new thin-wrapper job files
3. Restart daemon if running (SIGHUP or full restart)

**Acceptance:** A wizard bug fix reaches all users via `npm update`. No git surgery. No branch cherry-picking. No manual file copying.

---

## Requirement 7: Daemon Aggregator

The wizard server connects to all per-project heartbeat daemons:

1. Read `~/.voidforge/projects.json`
2. For each project with Cultivation extension, connect to its socket
3. Poll `/status` every 30 seconds
4. Serve aggregated data to Danger Room dashboard

**Danger Room views:**
- **All Projects:** Aggregated KPIs (total spend, total revenue, combined ROAS)
- **Per-Project:** Select from dropdown, see individual metrics and campaigns
- **Heartbeat grid:** Card per project showing daemon health, last beat, platform token status

**Freeze button:** In "All Projects" view, freezes all daemons. In per-project view, freezes only that project's daemon. UI must make scope clear.

**Acceptance:** Opening Danger Room with 3 Cultivation projects shows all 3 in the project selector. Offline daemons show as "offline" without blocking others.

---

## Requirement 8: Migration from v20.x

When `npx voidforge` detects an old-model project (has `wizard/` directory):

```
VoidForge v21.0 — Migration

Your project contains an embedded wizard (v20.x model).
VoidForge now runs as a standalone application.

Plan:
  1. Install wizard globally via npm
  2. Move ~/.voidforge/ data to new structure
  3. Remove wizard/ from your project (216 files)
  4. Remove VoidForge deps from package.json
  5. Add .voidforge marker file
  6. Keep all methodology files in place

Proceed? (yes / dry-run / skip)
```

**dry-run:** Shows what would change without doing it.
**Rollback:** `~/.voidforge/migration-backup/` created before any changes.

**Acceptance:** A v20.x user can migrate to v21.0 with one command. Rollback works. No data loss.

---

## Requirement 9: Branch Cleanup

1. `main` branch becomes the monorepo (packages/voidforge + packages/@voidforge/methodology)
2. `scaffold` branch gets a final commit: "This branch is deprecated. Use `npx voidforge init` instead."
3. `core` branch gets the same deprecation notice
4. Both deprecated branches remain for 30 days, then are deleted
5. CI publishes both npm packages on git tag

**Acceptance:** `git clone --branch scaffold` shows deprecation message. `npx voidforge init` is the new install path for all tiers.

---

## Non-Goals

- No changes to Claude Code integration (still reads CLAUDE.md, still runs slash commands)
- No changes to agent personalities, naming, or methodology content
- No changes to the 13-phase build protocol
- No per-project vault encryption in v21.0 (deferred to v21.1 per Kenobi)
- No changes to /void's UX (Bombadil still sings, same flow, different transport)

## Test Plan

- [ ] `npx voidforge init` creates a project with zero VoidForge deps
- [ ] `npx voidforge update` updates methodology in a project
- [ ] `npx voidforge install cultivation` adds extension to existing project
- [ ] Per-project heartbeat daemon starts, runs, stops independently
- [ ] Danger Room shows multiple projects with per-project drill-down
- [ ] Migration from v20.x project works with rollback
- [ ] `npx voidforge update --self` updates the wizard
- [ ] Projects work offline after creation (all methodology is local)
- [ ] `.voidforge` marker file is created and used by all CLI commands
- [ ] Extension thin-wrapper jobs import correctly from global wizard
