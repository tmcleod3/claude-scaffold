#!/usr/bin/env bash
# prepack-patterns.sh — Copy pattern files from docs/patterns/ into
# wizard/lib/patterns/ so tsc can compile without reaching outside the package.
#
# Run automatically via `npm run prepack` before `npm pack` / `npm publish`.
# Also safe to run manually during development.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PATTERNS_SRC="$PACKAGE_DIR/../../docs/patterns"
PATTERNS_DEST="$PACKAGE_DIR/wizard/lib/patterns"

PATTERN_FILES=(
  daemon-process.ts
  financial-transaction.ts
  funding-plan.ts
  outbound-rate-limiter.ts
  revenue-source-adapter.ts
  oauth-token-lifecycle.ts
  ad-platform-adapter.ts
  ad-billing-adapter.ts
  stablecoin-adapter.ts
)

mkdir -p "$PATTERNS_DEST"

copied=0
for file in "${PATTERN_FILES[@]}"; do
  src="$PATTERNS_SRC/$file"
  dest="$PATTERNS_DEST/$file"

  if [ ! -f "$src" ]; then
    echo "ERROR: Pattern source not found: $src" >&2
    exit 1
  fi

  cp "$src" "$dest"
  copied=$((copied + 1))
done

echo "prepack-patterns: copied $copied pattern files to wizard/lib/patterns/"
