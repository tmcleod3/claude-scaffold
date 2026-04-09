# ADR-039: Build & Publish Pipeline for v21.0 npm Distribution

## Status: Accepted

## Context

Campaign 26 (v21.0 The Extraction) completed the monorepo conversion and all feature work, but the packages cannot be published to npm. The wizard CLI uses a `#!/usr/bin/env npx tsx` shebang that runs TypeScript directly — this works in development but fails when installed from npm because:

1. **tsx is a devDependency**, not bundled with the published package
2. **Dynamic imports use `.js` extensions** but only `.ts` files exist (tsx resolves these, node does not)
3. **tsconfig rootDir points to monorepo root** (`../..`), making `tsc` output structurally broken
4. **9 pattern files** are imported from `docs/patterns/` (outside the voidforge package boundary)
5. **No CI/CD pipeline** exists for npm publish

Additionally, 4 calls to `appendToLog` in `heartbeat.ts` are missing the required `prevHash` parameter, breaking the hash chain integrity that ADR-001 established.

## Decision

### 1. Compile to JavaScript via tsc, publish dist/

The voidforge package will compile TypeScript to JavaScript before publishing. The bin entry points to the compiled file:

```
packages/voidforge/
  dist/                    ← compiled JS (published to npm)
    scripts/voidforge.js   ← bin entry
    wizard/                ← compiled wizard
  wizard/                  ← source TS (development only, not published)
  scripts/                 ← source TS (development only)
```

- **tsconfig rootDir** changes from `../..` to `.` (package-relative)
- **package.json bin** changes from `./scripts/voidforge.ts` to `./dist/scripts/voidforge.js`
- **package.json files** changes to `["dist/"]`
- **prepack script** runs `tsc` before npm publish

Development workflow unchanged: `npx tsx scripts/voidforge.ts` still works.

### 2. Pattern files stay in methodology package

The 9 pattern files imported by wizard code (`daemon-process.ts`, `financial-transaction.ts`, etc.) export runtime types and functions. These belong to the methodology, not the wizard.

**For development:** The current deep relative imports (`../../../../docs/patterns/...`) work because tsconfig includes them.

**For production:** The wizard package will copy the 9 consumed pattern files into `packages/voidforge/wizard/lib/patterns/` at prepack time. This creates a local copy for the compiled dist/ without polluting the development workflow. The methodology package retains the originals as documentation.

**Alternative rejected:** Importing from `@voidforge/methodology` at runtime was rejected because the CLI should not depend on the methodology package being installed alongside it.

### 3. GitHub Actions CI/CD on git tag

```yaml
on:
  push:
    tags: ['v*']
```

Pipeline: checkout → install → typecheck → test → build → publish both packages. Requires `NPM_TOKEN` secret in GitHub repo settings.

### 4. Fix heartbeat hash chain calls

Add `getLastLogHash()` helper that reads the last JSONL entry's `hash` field. Call it before each `appendToLog` to provide the required `prevHash` parameter. This restores the tamper-detection chain from ADR-001.

### 5. Branch deprecation strategy

Scaffold and core branches get a final deprecation commit with DEPRECATION.md and updated README/CLAUDE.md. No backport of monorepo structure. 30-day grace period, then archive and delete. Main branch references cleaned up (CLAUDE.md Release Tiers, README install, FORGE_KEEPER.md sync).

## Consequences

**Enables:**
- `npx voidforge init` works from npm (the core promise of v21.0)
- `npx voidforge update --self` works (npm update -g)
- Automated publishing on git tag — no manual npm publish steps
- Hash chain integrity restored for spend/revenue logs

**Prevents:**
- Running the CLI without Node.js (tsx is no longer needed at runtime)
- Editing wizard TypeScript and seeing changes immediately in the CLI (need `npm run build`)

**Trade-offs:**
- Development requires `npx tsx` for hot-reload, `npm run build` for testing the compiled version
- Pattern files are duplicated (source in docs/ + copy in wizard/lib/patterns/) — sync risk managed by prepack script
- Scaffold/core users lose their install path after 30 days — npm is the only path forward

## Alternatives Considered

1. **Keep tsx as runtime dependency:** Rejected because tsx is 50MB+ and would be installed globally for every user. Also, `npx` doesn't execute TypeScript shebangs from installed packages.

2. **Use esbuild for bundling:** Rejected because esbuild would create a single-file bundle, making debugging harder. tsc output preserves file structure 1:1.

3. **Use Node.js --experimental-strip-types:** Rejected because it requires Node 22+ and doesn't handle TypeScript-specific syntax (enums, namespaces). Our engine requirement is Node 20.11+.

4. **Publish methodology as a separate installable dependency of voidforge:** Rejected because the CLI should be self-contained. Users shouldn't need to understand the package split.
