/**
 * Deploy Preflight — Pre-deploy secret and sensitive-path scan
 *
 * Reference implementation for .claude/commands/deploy.md Step 2.5.
 * Scans the deploy artifact directory BEFORE upload. Exits non-zero on any hit.
 *
 * Evidence: field reports #305 (32-day credential leak), #303 (methodology exposure).
 *
 * Key principles:
 * - Scan the deploy payload directory, NOT the repo root.
 * - Never auto-filter — a hit means the operator must investigate.
 * - Never print secret content; only paths + pattern IDs.
 * - Allowlist escape hatch via DEPLOY_PREFLIGHT_ALLOW (comma-separated globs).
 *
 * Usage:
 *   npx tsx docs/patterns/deploy-preflight.ts ./dist
 *   DEPLOY_PREFLIGHT_ALLOW='fixtures/*,public/ok.env.example' npx tsx docs/patterns/deploy-preflight.ts ./dist
 *
 * CI step example (before wrangler/vercel/firebase):
 *   - run: npx tsx docs/patterns/deploy-preflight.ts ./dist
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { argv, env, exit } from 'node:process';

// ---------- forbidden filename patterns ----------
const FORBIDDEN_NAME_PATTERNS: { id: string; test: (name: string, rel: string) => boolean }[] = [
  { id: 'env-file', test: (n) => /^\.env(\..+)?$/.test(n) && !/\.(example|template|sample)$/.test(n) },
  { id: 'pem-file', test: (n) => n.endsWith('.pem') },
  { id: 'key-file', test: (n) => n.endsWith('.key') },
  { id: 'ssh-private-key', test: (n) => /^id_(rsa|ed25519|ecdsa|dsa)(\..+)?$/.test(n) && !n.endsWith('.pub') },
  { id: 'pkcs12', test: (n) => n.endsWith('.p12') || n.endsWith('.pfx') },
  { id: 'methodology-claude', test: (_, rel) => rel.split(sep)[0] === '.claude' },
  { id: 'methodology-docs-methods', test: (_, rel) => rel.startsWith(`docs${sep}methods${sep}`) },
  { id: 'methodology-docs-patterns', test: (_, rel) => rel.startsWith(`docs${sep}patterns${sep}`) },
  { id: 'methodology-holocron', test: (n) => n === 'HOLOCRON.md' },
  { id: 'methodology-changelog', test: (n) => n === 'CHANGELOG.md' },
  { id: 'methodology-version', test: (n) => n === 'VERSION.md' },
  { id: 'build-logs', test: (_, rel) => rel.split(sep)[0] === 'logs' },
];

// ---------- forbidden content patterns (scanned in text-ish files only) ----------
const FORBIDDEN_CONTENT_PATTERNS: { id: string; re: RegExp }[] = [
  { id: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: 'cloudflare-token', re: /\b[0-9a-f]{40}\b/ },
  { id: 'github-pat', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { id: 'private-key-block', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
];

const TEXT_EXTENSIONS = new Set([
  '.html', '.htm', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.json', '.map', '.txt', '.md', '.xml', '.yml', '.yaml', '.env',
  '.css', '.svg',
]);

interface Hit {
  kind: 'name' | 'content';
  path: string;
  patternId: string;
}

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

function loadAllowlist(): RegExp[] {
  const raw = env.DEPLOY_PREFLIGHT_ALLOW ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(globToRegex);
}

function isAllowed(relPath: string, allowlist: RegExp[]): boolean {
  return allowlist.some((re) => re.test(relPath));
}

function* walk(root: string, current = root): Generator<string> {
  let entries;
  try {
    entries = readdirSync(current, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(current, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) {
      yield* walk(root, full);
    } else if (e.isFile()) {
      yield full;
    }
  }
}

function scanName(fullPath: string, relPath: string): string | null {
  const base = relPath.split(sep).pop() ?? '';
  for (const p of FORBIDDEN_NAME_PATTERNS) {
    if (p.test(base, relPath)) return p.id;
  }
  return null;
}

function scanContent(fullPath: string): string | null {
  const ext = extname(fullPath).toLowerCase();
  if (!TEXT_EXTENSIONS.has(ext)) return null;
  let stats;
  try {
    stats = statSync(fullPath);
  } catch {
    return null;
  }
  // skip files >2MB to keep the scan fast; secrets are typically short
  if (stats.size > 2_000_000) return null;
  let buf: string;
  try {
    buf = readFileSync(fullPath, 'utf8');
  } catch {
    return null;
  }
  for (const p of FORBIDDEN_CONTENT_PATTERNS) {
    if (p.re.test(buf)) return p.id;
  }
  return null;
}

function main(): void {
  const target = argv[2];
  if (!target) {
    console.error('[deploy-preflight] Usage: deploy-preflight <deploy-dir>');
    exit(2);
  }

  let rootStat;
  try {
    rootStat = statSync(target);
  } catch {
    console.error(`[deploy-preflight] target does not exist: ${target}`);
    exit(2);
  }
  if (!rootStat.isDirectory()) {
    console.error(`[deploy-preflight] target is not a directory: ${target}`);
    exit(2);
  }

  const allowlist = loadAllowlist();
  const hits: Hit[] = [];
  let scanned = 0;

  for (const fullPath of walk(target)) {
    const relPath = relative(target, fullPath);
    if (isAllowed(relPath, allowlist)) continue;
    scanned += 1;

    const nameHit = scanName(fullPath, relPath);
    if (nameHit) {
      hits.push({ kind: 'name', path: relPath, patternId: nameHit });
      continue; // skip content scan on already-forbidden names
    }

    const contentHit = scanContent(fullPath);
    if (contentHit) {
      hits.push({ kind: 'content', path: relPath, patternId: contentHit });
    }
  }

  const summary = {
    action: 'deploy-preflight',
    target,
    scanned,
    hits: hits.length,
    allowlist: allowlist.length,
  };
  console.log(JSON.stringify(summary));

  if (hits.length > 0) {
    console.error(`[deploy-preflight] ${hits.length} forbidden path(s) in deploy payload:`);
    for (const h of hits) {
      console.error(`  - [${h.kind}:${h.patternId}] ${h.path}`);
    }
    console.error('[deploy-preflight] ABORTED. Remove offending files or fix deploy surface configuration.');
    exit(1);
  }

  console.log('[deploy-preflight] clean');
  exit(0);
}

main();
