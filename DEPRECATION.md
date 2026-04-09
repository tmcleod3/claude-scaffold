# Scaffold Branch — DEPRECATED

**Deprecated:** 2026-04-08 (v21.0)
**Deletion date:** 2026-05-08 (30 days)

## What Changed

VoidForge v21.0 extracts the wizard into a standalone npm package. The three-branch model (main, scaffold, core) is replaced with npm distribution:

- `voidforge` — CLI + wizard (standalone application)
- `@voidforge/methodology` — Reusable methodology (CLAUDE.md, commands, methods, patterns)

## Migration

### For new projects

```bash
npx voidforge init my-app
```

### For existing scaffold projects

```bash
# 1. Get the final methodology update
/void

# 2. Install the VoidForge CLI
npm install -g voidforge

# 3. Future updates use npm transport (same Bombadil UX)
npx voidforge update
```

Your existing project files (PRD, application code, logs) are unaffected. Only the methodology update mechanism changes — from `git fetch scaffold` to `npx voidforge update`.

## Why

The scaffold branch required manual cherry-picking of every methodology change across 3 branches. With 28 commands, 29 methods, and 38 patterns, this was unsustainable. npm packages provide atomic versioned updates with zero git surgery.

## Deadline

This branch is deprecated and will be deleted on 2026-05-08. After that date, `git fetch <remote> scaffold` will fail and `/void` will break if you haven't migrated.

## Step-by-Step Migration

1. **Run `/void` one final time** to sync from main (void.md has been updated to pull from main instead of scaffold)
2. **Install the VoidForge CLI:** `npm install -g voidforge`
3. **For npm-based updates going forward:** `npx voidforge update`
4. **If `npx voidforge update` says "Not a VoidForge project"**, create a `.voidforge` marker file: `echo '{}' > .voidforge`

## Reference

- **ADR-038:** Wizard Extraction architecture decision
- **PRD:** `/docs/PRD-wizard-extraction.md`
- **Monorepo:** github.com/tmcleod3/voidforge (main branch)
