# ADR-058: Template Placeholder Purge

## Status
Proposed — 2026-04-20

## Context
Root `CLAUDE.md` ships with `[PROJECT_NAME]`, `[ONE_LINE_DESCRIPTION]`, `[DOMAIN]`, `[REPO_URL]` placeholders. These are intended as user-fillable slots after `npx voidforge init` — but the npm `@voidforge/methodology` package currently copies root `CLAUDE.md` verbatim via prepack, so every downstream install receives the literal placeholders. Every agent reading the Project section for context gets null data.

## Decision

**Option C implemented** (per Gen's recommendation):

1. Wrap the Project section in a sed-strippable comment in root CLAUDE.md:
   ```markdown
   <!-- REMOVE-FOR-NPM-PUBLISH: This section is a template for monorepo root only. Published methodology users fill this after `npx voidforge init`. -->
   ## Project
   - **Name:** [PROJECT_NAME]
   ...
   <!-- END-REMOVE-FOR-NPM-PUBLISH -->
   ```

2. Update `packages/methodology/scripts/prepack.sh` (or equivalent) to strip the block when copying into the published package:
   ```bash
   sed '/<!-- REMOVE-FOR-NPM-PUBLISH/,/END-REMOVE-FOR-NPM-PUBLISH -->/d' "$REPO_ROOT/CLAUDE.md" > "$PKG_DIR/CLAUDE.md"
   ```

3. `npx voidforge init` prompts for Project metadata and writes it to the user's local CLAUDE.md.

## Consequences
**Positive:** zero placeholder leakage. Published package starts clean for consumers.
**Negative:** one more sed rule in prepack to maintain.

## Alternatives Considered
- Option A (fill with VoidForge's own values) — wrong: users would inherit "VoidForge" as their project name.
- Option B (remove Project section entirely from methodology package) — loses the scaffold template users need.

## Related ADRs
None direct.

## Rollout
v23.9.0.
