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

echo "🏗️  Creating new project: $PROJECT_NAME"
echo "   Directory: $PROJECT_DIR"
echo "   Scaffold: $SCAFFOLD_DIR"
echo ""

# Create project directory
mkdir -p "$PROJECT_DIR"

# Copy scaffold
cp -r "$SCAFFOLD_DIR/CLAUDE.md" "$PROJECT_DIR/"
cp -r "$SCAFFOLD_DIR/docs" "$PROJECT_DIR/"
cp "$SCAFFOLD_DIR/.gitignore" "$PROJECT_DIR/" 2>/dev/null || true

# Replace placeholder in CLAUDE.md
sed -i "s/\[PROJECT_NAME\]/$PROJECT_NAME/g" "$PROJECT_DIR/CLAUDE.md"

echo "✅ Project scaffold created at: $PROJECT_DIR"
echo ""
echo "Next steps:"
echo "  1. cd $PROJECT_DIR"
echo "  2. Replace docs/PRD.md with your actual PRD"
echo "  3. Open Claude Code and say: \"Build this project from the PRD\""
echo ""
echo "Your method docs are ready in docs/methods/:"
ls -1 "$PROJECT_DIR/docs/methods/"
