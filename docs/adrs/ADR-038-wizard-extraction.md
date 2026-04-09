# ADR-038: Wizard Extraction — Standalone Application Architecture

## Status: Accepted

## Context

The wizard (214 TypeScript files, 7 npm dependencies including AWS SDK and node-pty) is embedded inside every project. This causes:

1. **No wizard update path.** FORGE_KEEPER says "use npm update for wizard" but VoidForge isn't published to npm. Bug fixes (e.g., the Secure cookie auth bug of April 2026) require manual `git checkout origin/main -- wizard/` on every downstream project.
2. **Dependency pollution.** Every project gets AWS SDK, node-pty, ws in its `package.json` — even if it's a static site.
3. **Identity crisis.** The wizard is a multi-project manager embedded in one of the projects it manages. The project registry already lives at `~/.voidforge/` — the data escaped but the application didn't follow.
4. **Three-branch sync burden.** Every shared file change must be cherry-picked to main, scaffold, and core. This is manual and error-prone (see: scaffold cleanup accidentally applied to main, April 2026).
5. **`/void` can't update wizard.** Bombadil explicitly excludes `wizard/*` from sync because it's "user code." But it's not — it's VoidForge infrastructure.

## Decision

### The wizard becomes a standalone application.

**Install:** `npx voidforge` (or `npm install -g voidforge`)
**Location:** Standard npm global path (not `~/.voidforge/app/`)
**Runtime data:** `~/.voidforge/` (vault, project registry, audit log)
**Projects:** Separate directories, containing methodology only + optional extensions

### Repository structure: monorepo with two packages

```
voidforge/                          (one repo, one main branch)
├── packages/
│   ├── voidforge/                  npm: "voidforge" (wizard + CLI)
│   │   ├── package.json            bin: { voidforge: "./bin/voidforge.js" }
│   │   ├── bin/voidforge.js        CLI entry point
│   │   ├── wizard/                 server, API, UI, lib, tests
│   │   └── templates/              project templates + scaffold snapshot
│   │
│   └── @voidforge/methodology/     npm: "@voidforge/methodology"
│       ├── package.json            no dependencies
│       ├── CLAUDE.md
│       ├── .claude/commands/
│       ├── docs/methods/
│       ├── docs/patterns/
│       ├── HOLOCRON.md, VERSION.md, CHANGELOG.md
│       └── scripts/thumper/
├── package.json                    workspace root
└── .github/workflows/publish.yml
```

### Project structure (created by wizard)

```
~/Projects/my-app/
├── CLAUDE.md                       methodology
├── .claude/commands/               slash commands
├── docs/methods/, patterns/        agent protocols, reference implementations
├── docs/PRD.md                     product requirements
├── .voidforge                      marker file (version, extensions, project ID)
├── src/                            user's actual code
├── package.json                    user's deps ONLY
└── cultivation/                    OPTIONAL extension (if enabled)
    ├── heartbeat.config.json
    ├── jobs/                       thin wrappers importing from wizard/lib/
    └── treasury/                   per-project financial state (gitignored)
```

### Extensions are per-project, opt-in

| Extension | What it adds to project | Runtime |
|-----------|------------------------|---------|
| Danger Room | `danger-room.config.json` | Wizard reads project data, serves dashboard |
| Cultivation | `cultivation/` directory with config + jobs + treasury | Per-project heartbeat daemon |
| Deep Current | `deep-current.config.json` | Wizard-hosted intelligence |
| Thumper | `scripts/thumper/` (already exists in methodology) | Shell scripts |

### Vault stays global, credentials namespaced

- Global vault at `~/.voidforge/vault.enc` — one password for all projects
- Credentials namespaced by platform account ID, not project
- Per-project daemons read only the credentials their config references
- HKDF per-project vault derivation deferred to v21.1 (Kenobi's recommendation)

### Per-project heartbeat daemons

- Each project with Cultivation gets its own daemon process
- PID/socket/state in `<project>/.voidforge/`
- Service name: `com.voidforge.heartbeat.<project-id>`
- Wizard's Danger Room connects to all per-project sockets via daemon aggregator

### Update mechanisms

| What | How | Trigger |
|------|-----|---------|
| Wizard | `npx voidforge update --self` or `npm update -g voidforge` | Manual or auto-check on startup |
| Methodology | `npx voidforge update` (replaces `/void` git-fetch) | Manual or `/void` in Claude Code |
| Extensions | `npx voidforge update --extensions` | Bundled with wizard update |

### Git branches: kill scaffold and core

- `main` branch becomes the monorepo with both packages
- `scaffold` and `core` branches get deprecation notices pointing to `npx voidforge init`
- Deleted after 30-day deprecation period
- `/void` switches from git-fetch to npm-fetch for methodology updates

## Consequences

**Enables:**
- Wizard bug fixes reach users via `npm update` — no git surgery
- Projects have zero VoidForge dependencies in their package.json
- Multi-project management is native (wizard is the project manager)
- Extensions are opt-in — most projects don't need Cultivation or Danger Room
- Single `main` branch eliminates cherry-pick sync burden

**Trade-offs:**
- Requires npm account and publishing infrastructure
- Existing users must migrate (automated migration provided)
- `/void` transport changes from git to npm (same UX, different backend)
- Two packages to version and publish (automated via CI)

**Prevents:**
- Dependency pollution in user projects
- Manual git surgery for wizard updates
- Branch sync errors (scaffold cleanup on main incident)
- Identity confusion (wizard is a project manager, not part of a project)

## Alternatives Considered

1. **`/void --wizard` flag** — Add wizard sync to Bombadil. Rejected: doesn't fix the dependency pollution or identity problem. Wizard code mixed in the project is the root cause.
2. **Separate GitHub repo for wizard** — Rejected: wizard imports methodology during `init` (copies files). Co-location prevents version drift. Monorepo in one repo is cleaner.
3. **Global daemon instead of per-project** — Rejected: per-project is cleaner isolation, simpler lifecycle, no cross-project blast radius. (Picard dissented, Kelsier's argument won.)
4. **Per-project vaults** — Deferred to v21.1: adds complexity without immediate user benefit. Global vault with namespaced keys is sufficient for v21.0. Kenobi's HKDF derivation design preserved for future implementation.
