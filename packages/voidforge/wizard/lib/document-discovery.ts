/**
 * Document Discovery — Wong's supporting document scanner.
 *
 * Discovers and catalogs all supporting documents in a project directory
 * following the Blueprint Path convention. Used by /blueprint, /campaign,
 * and /build to load context beyond the PRD.
 *
 * Convention:
 *   docs/PRD.md                     — Required. Product specification.
 *   docs/PROJECT-DIRECTIVES.md      — Optional. Appended to CLAUDE.md.
 *   docs/OPERATIONS.md              — Optional. Business context for Sisko.
 *   docs/ADR/*.md                   — Optional. Architecture decisions for Picard.
 *   docs/reference/*                — Optional. Available to all agents.
 *
 * PRD Reference: RFC-blueprint-path.md
 */

import { existsSync } from 'node:fs';
import { readdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';

const MAX_WALK_DEPTH = 10;
const MAX_WALK_FILES = 1000;

// ── Types ───────────────────────────────────────────

export interface DiscoveredDocuments {
  prd: string | null;
  projectDirectives: string | null;
  operations: string | null;
  adrs: string[];
  references: string[];
  total: number;
}

// ── Directive file search paths (checked in order) ──

const DIRECTIVE_PATHS = [
  'docs/PROJECT-DIRECTIVES.md',
  'docs/PROJECT-CLAUDE.md',
  'docs/DIRECTIVES.md',
  'PROJECT-CLAUDE.md',
  'PROJECT-DIRECTIVES.md',
];

// ── Discovery ───────────────────────────────────────

/**
 * Discover all supporting documents in the project directory.
 * Returns a catalog of found files with their paths and total count.
 */
export async function discoverDocuments(projectRoot: string): Promise<DiscoveredDocuments> {
  const result: DiscoveredDocuments = {
    prd: null,
    projectDirectives: null,
    operations: null,
    adrs: [],
    references: [],
    total: 0,
  };

  // PRD (required for /blueprint, optional for other commands)
  const prdPath = join(projectRoot, 'docs/PRD.md');
  if (existsSync(prdPath)) {
    result.prd = 'docs/PRD.md';
    result.total++;
  }

  // Project-specific directives (checked in priority order)
  for (const relativePath of DIRECTIVE_PATHS) {
    const fullPath = join(projectRoot, relativePath);
    if (existsSync(fullPath)) {
      result.projectDirectives = relativePath;
      result.total++;
      break;
    }
  }

  // Operations playbook
  const opsPath = join(projectRoot, 'docs/OPERATIONS.md');
  if (existsSync(opsPath)) {
    result.operations = 'docs/OPERATIONS.md';
    result.total++;
  }

  // Architecture Decision Records
  const adrDir = join(projectRoot, 'docs/ADR');
  if (existsSync(adrDir)) {
    try {
      const files = await readdir(adrDir);
      result.adrs = files
        .filter(f => f.endsWith('.md'))
        .sort()
        .map(f => `docs/ADR/${f}`);
      result.total += result.adrs.length;
    } catch { /* directory unreadable */ }
  }

  // Also check docs/adrs/ (lowercase variant)
  const adrsDir = join(projectRoot, 'docs/adrs');
  if (existsSync(adrsDir) && result.adrs.length === 0) {
    try {
      const files = await readdir(adrsDir);
      result.adrs = files
        .filter(f => f.endsWith('.md'))
        .sort()
        .map(f => `docs/adrs/${f}`);
      result.total += result.adrs.length;
    } catch { /* directory unreadable */ }
  }

  // Reference materials (recursive scan, all file types)
  const refDir = join(projectRoot, 'docs/reference');
  if (existsSync(refDir)) {
    try {
      result.references = await walkDirectory(refDir, 'docs/reference');
      result.total += result.references.length;
    } catch { /* directory unreadable */ }
  }

  return result;
}

/**
 * Recursively walk a directory and return all file paths relative to the project root.
 */
async function walkDirectory(
  dirPath: string,
  relativeTo: string,
  depth: number = 0,
  fileCount: { count: number } = { count: 0 },
): Promise<string[]> {
  if (depth > MAX_WALK_DEPTH || fileCount.count > MAX_WALK_FILES) return [];

  const entries = await readdir(dirPath);
  const files: string[] = [];

  for (const entry of entries) {
    if (fileCount.count > MAX_WALK_FILES) break;
    const fullPath = join(dirPath, entry);
    const entryStat = await lstat(fullPath); // lstat: don't follow symlinks

    if (entryStat.isSymbolicLink()) continue; // Skip symlinks — prevent escape

    if (entryStat.isDirectory()) {
      const subFiles = await walkDirectory(fullPath, `${relativeTo}/${entry}`, depth + 1, fileCount);
      files.push(...subFiles);
    } else {
      files.push(`${relativeTo}/${entry}`);
      fileCount.count++;
    }
  }

  return files.sort();
}

/**
 * Produce a human-readable summary of discovered documents.
 */
export function summarizeDiscovery(docs: DiscoveredDocuments): string {
  const lines: string[] = [];

  if (docs.prd) lines.push(`  PRD: ${docs.prd}`);
  if (docs.projectDirectives) lines.push(`  Project directives: ${docs.projectDirectives}`);
  if (docs.operations) lines.push(`  Operations playbook: ${docs.operations}`);
  if (docs.adrs.length > 0) lines.push(`  ADRs: ${docs.adrs.length} architecture decision records`);
  if (docs.references.length > 0) lines.push(`  References: ${docs.references.length} supporting files`);
  lines.push(`  Total: ${docs.total} documents discovered`);

  return lines.join('\n');
}
