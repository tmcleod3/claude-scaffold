#!/usr/bin/env bash
# Post-Deploy Probe — Assert sensitive paths are NOT publicly served.
#
# Reference implementation for .claude/commands/deploy.md Step 4.5.
# Probes a denylist of paths against a live deploy URL. Exits non-zero on any 200.
#
# Evidence: field reports #305 (32-day credential leak), #303 (methodology exposure).
#
# Usage:
#   DEPLOY_URL=https://example.com bash docs/patterns/post-deploy-probe.sh
#   DEPLOY_URL=https://example.com DEPLOY_PROBE_EXTRA=$'/admin\n/private.key' bash docs/patterns/post-deploy-probe.sh

set -euo pipefail

: "${DEPLOY_URL:?DEPLOY_URL is required (e.g. https://example.com)}"

# Strip trailing slash for clean URL composition.
DEPLOY_URL="${DEPLOY_URL%/}"

TMP="$(mktemp -t postdeploy-probe.XXXXXX)"
cleanup() { rm -f "$TMP"; }
trap cleanup EXIT INT TERM

# Fixed denylist — mirrors Step 4.5 in .claude/commands/deploy.md.
DENYLIST=(
  "/.env"
  "/.env.production"
  "/.env.local"
  "/.git/config"
  "/.git/HEAD"
  "/.claude/agents/silver-surfer-herald.md"
  "/docs/methods/FORGE_KEEPER.md"
  "/HOLOCRON.md"
  "/CHANGELOG.md"
  "/VERSION.md"
  "/package.json"
  "/tsconfig.json"
  "/id_rsa"
  "/.ssh/id_rsa"
)

# Optional extensible denylist (newline-separated).
if [[ -n "${DEPLOY_PROBE_EXTRA:-}" ]]; then
  while IFS= read -r extra; do
    [[ -n "$extra" ]] && DENYLIST+=("$extra")
  done <<< "$DEPLOY_PROBE_EXTRA"
fi

hits=0
checked=0

for path in "${DENYLIST[@]}"; do
  checked=$((checked + 1))
  url="${DEPLOY_URL}${path}"
  status="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url" || echo "000")"
  if [[ "$status" == "200" ]]; then
    hits=$((hits + 1))
    printf 'LEAK  %s  -> %s\n' "$status" "$url" | tee -a "$TMP" >&2
  else
    printf 'ok    %s  -> %s\n' "$status" "$url"
  fi
done

printf '{"action":"post-deploy-probe","url":"%s","checked":%d,"hits":%d}\n' \
  "$DEPLOY_URL" "$checked" "$hits"

if (( hits > 0 )); then
  echo "[post-deploy-probe] ${hits} sensitive path(s) publicly served. Rollback and fix deploy surface." >&2
  exit 1
fi

echo "[post-deploy-probe] clean"
exit 0
