#!/usr/bin/env bash
# Prepack script for @voidforge/methodology
# Copies methodology files from monorepo root into this package directory for npm publish.
# These copies are gitignored — the source of truth is always the root.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PKG_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(cd "$PKG_DIR/../.." && pwd)"

echo "Prepack: copying methodology files from $REPO_ROOT into $PKG_DIR"

# Copy root-level methodology files
cp "$REPO_ROOT/CLAUDE.md" "$PKG_DIR/CLAUDE.md"
cp "$REPO_ROOT/HOLOCRON.md" "$PKG_DIR/HOLOCRON.md"
cp "$REPO_ROOT/VERSION.md" "$PKG_DIR/VERSION.md"
cp "$REPO_ROOT/CHANGELOG.md" "$PKG_DIR/CHANGELOG.md"

# Copy .claude/commands/
rm -rf "$PKG_DIR/.claude"
mkdir -p "$PKG_DIR/.claude/commands"
cp "$REPO_ROOT"/.claude/commands/*.md "$PKG_DIR/.claude/commands/"

# Copy docs/methods/ and docs/patterns/
rm -rf "$PKG_DIR/docs"
mkdir -p "$PKG_DIR/docs/methods" "$PKG_DIR/docs/patterns"
cp "$REPO_ROOT"/docs/methods/*.md "$PKG_DIR/docs/methods/"
cp "$REPO_ROOT"/docs/patterns/*.ts "$PKG_DIR/docs/patterns/" 2>/dev/null || true
cp "$REPO_ROOT"/docs/patterns/*.tsx "$PKG_DIR/docs/patterns/" 2>/dev/null || true
cp "$REPO_ROOT"/docs/patterns/*.md "$PKG_DIR/docs/patterns/" 2>/dev/null || true
cp "$REPO_ROOT/docs/NAMING_REGISTRY.md" "$PKG_DIR/docs/NAMING_REGISTRY.md"

# Copy scripts/thumper/
rm -rf "$PKG_DIR/scripts/thumper"
mkdir -p "$PKG_DIR/scripts/thumper"
cp "$REPO_ROOT"/scripts/thumper/* "$PKG_DIR/scripts/thumper/"

echo "Prepack: done. Files ready for npm pack."
