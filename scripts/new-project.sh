#!/bin/bash
# ============================================
# new-project.sh — Initialize a new project from this scaffold
# ============================================
# Usage: ./scripts/new-project.sh "Project Name" "project-dir"
# ============================================

set -euo pipefail

PROJECT_NAME="${1:-}"
PROJECT_DIR="${2:-}"

if [ -z "$PROJECT_NAME" ] || [ -z "$PROJECT_DIR" ]; then
  echo "Usage: ./scripts/new-project.sh \"Project Name\" \"project-dir\""
  echo ""
  echo "Example: ./scripts/new-project.sh \"Kongo\" \"kongo\""
  exit 1
fi

SCAFFOLD_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Creating new project: $PROJECT_NAME"
echo "   Directory: $PROJECT_DIR"
echo "   Scaffold: $SCAFFOLD_DIR"
echo ""

# Create project directory
mkdir -p "$PROJECT_DIR"

# Copy scaffold files
cp -r "$SCAFFOLD_DIR/CLAUDE.md" "$PROJECT_DIR/"
cp -r "$SCAFFOLD_DIR/docs" "$PROJECT_DIR/"
cp "$SCAFFOLD_DIR/.gitignore" "$PROJECT_DIR/" 2>/dev/null || true

# Copy Claude Code configuration
mkdir -p "$PROJECT_DIR/.claude"
cp -r "$SCAFFOLD_DIR/.claude/commands" "$PROJECT_DIR/.claude/" 2>/dev/null || true
cp "$SCAFFOLD_DIR/.claude/settings.json" "$PROJECT_DIR/.claude/" 2>/dev/null || true

# Create build journal directory
mkdir -p "$PROJECT_DIR/logs"
cat > "$PROJECT_DIR/logs/build-state.md" << 'BUILDSTATE'
# Build State

**Project:** [name]
**Current Phase:** 0 (not started)
**Last Updated:** [timestamp]
**Active Agent:** None

## Phase Status
| Phase | Status | Gate Passed |
|-------|--------|-------------|
| 0-13 | not started | — |

## Current Blockers
- None — ready to start. Replace docs/PRD.md and run /build.

## Next Steps
1. Replace docs/PRD.md with your actual PRD (fill in the frontmatter)
2. Run /build to start Phase 0
BUILDSTATE

# Replace placeholder in CLAUDE.md
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s/\[PROJECT_NAME\]/$PROJECT_NAME/g" "$PROJECT_DIR/CLAUDE.md"
else
  sed -i "s/\[PROJECT_NAME\]/$PROJECT_NAME/g" "$PROJECT_DIR/CLAUDE.md"
fi

echo "Project scaffold created at: $PROJECT_DIR"
echo ""
echo "Included:"
echo "  CLAUDE.md           Root context (operational instructions)"
echo "  .claude/commands/   Slash commands: /build /qa /security /ux /devops /architect"
echo "  .claude/settings.json  Permissions + hooks"
echo "  docs/methods/       14 agent protocols"
echo "  docs/patterns/      7 code reference implementations"
echo "  docs/PRD.md         Template with YAML frontmatter"
echo "  docs/LESSONS.md     Feedback capture"
echo "  logs/               Build journal (persistent agent memory)"
echo ""
echo "Next steps:"
echo "  1. cd $PROJECT_DIR"
echo "  2. Replace docs/PRD.md with your actual PRD (fill in the frontmatter)"
echo "  3. Open Claude Code and run: /build"
