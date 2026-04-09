/**
 * Blueprint API — validates pre-written PRDs for the Blueprint Path.
 *
 * Provides the API endpoint for the wizard UI's blueprint auto-detection
 * and for programmatic PRD validation.
 *
 * PRD Reference: RFC-blueprint-path.md
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { addRoute } from '../router.js';
import { parseFrontmatter, validateFrontmatter } from '../lib/frontmatter.js';
import { validatePrdStructure, scanConflicts } from '../lib/prd-validator.js';
import { discoverDocuments, summarizeDiscovery } from '../lib/document-discovery.js';
import { mergeProjectDirectives, isAlreadyMerged } from '../lib/claude-merge.js';

// ── Types ───────────────────────────────────────────

export interface BlueprintValidationResult {
  valid: boolean;
  prdFound: boolean;
  frontmatter: Record<string, string | undefined>;
  frontmatterErrors: string[];
  structuralWarnings: string[];
  conflicts: string[];
  documents: {
    prd: string | null;
    projectDirectives: string | null;
    operations: string | null;
    adrs: string[];
    references: string[];
    total: number;
  };
  summary: string;
}

// ── Validation Function ─────────────────────────────

/**
 * Validate a project directory for the Blueprint Path.
 * Returns comprehensive validation results without modifying any files.
 */
export async function validateBlueprint(projectRoot: string): Promise<BlueprintValidationResult> {
  const prdPath = join(projectRoot, 'docs/PRD.md');

  // Check if PRD exists
  if (!existsSync(prdPath)) {
    return {
      valid: false,
      prdFound: false,
      frontmatter: {},
      frontmatterErrors: ['No PRD found at docs/PRD.md'],
      structuralWarnings: [],
      conflicts: [],
      documents: { prd: null, projectDirectives: null, operations: null, adrs: [], references: [], total: 0 },
      summary: 'No PRD found. Place your specification at docs/PRD.md.',
    };
  }

  // Parse PRD
  const content = await readFile(prdPath, 'utf-8');
  const { frontmatter } = parseFrontmatter(content);

  // Validate frontmatter
  const frontmatterErrors = validateFrontmatter(frontmatter);

  // Structural validation
  const structural = validatePrdStructure(content, frontmatter);

  // Conflict scan
  const conflicts = scanConflicts(frontmatter);

  // Document discovery
  const documents = await discoverDocuments(projectRoot);

  // Build summary
  const summaryParts: string[] = [];
  if (frontmatter.name) summaryParts.push(`Project: ${frontmatter.name}`);
  if (frontmatter.framework) summaryParts.push(`Stack: ${frontmatter.framework}`);
  if (frontmatter.deploy) summaryParts.push(`Deploy: ${frontmatter.deploy}`);
  summaryParts.push(`Documents: ${documents.total} found`);
  if (frontmatterErrors.length > 0) summaryParts.push(`Errors: ${frontmatterErrors.length}`);
  if (structural.warnings.length > 0) summaryParts.push(`Warnings: ${structural.warnings.length}`);
  if (conflicts.length > 0) summaryParts.push(`Conflicts: ${conflicts.length}`);

  return {
    valid: frontmatterErrors.length === 0,
    prdFound: true,
    frontmatter,
    frontmatterErrors,
    structuralWarnings: structural.warnings,
    conflicts,
    documents,
    summary: summaryParts.join(' | '),
  };
}

/**
 * Execute the full blueprint merge (Step 3 of /blueprint).
 * Only called after user confirms — this modifies CLAUDE.md.
 */
/**
 * Validate that a relative path does not escape the project root.
 * Prevents path traversal attacks via ../ in user-supplied paths.
 */
function isPathSafe(projectRoot: string, relativePath: string): boolean {
  if (!relativePath || relativePath.includes('..') || relativePath.startsWith('/')) {
    return false;
  }
  const resolved = join(projectRoot, relativePath);
  return resolved.startsWith(projectRoot);
}

export async function executeBlueprintMerge(
  projectRoot: string,
  directivesPath: string | null,
): Promise<{ merged: boolean; reason: string }> {
  if (!directivesPath) {
    return { merged: false, reason: 'No project directives file discovered' };
  }

  // Path traversal prevention
  if (!isPathSafe(projectRoot, directivesPath)) {
    return { merged: false, reason: 'Invalid directives path — must be a relative path within the project' };
  }

  const alreadyMerged = await isAlreadyMerged(projectRoot);
  if (alreadyMerged) {
    return { merged: false, reason: 'Project directives already merged' };
  }

  const result = await mergeProjectDirectives(projectRoot, directivesPath);
  return { merged: result.merged, reason: result.reason };
}

// ── Route Handler ───────────────────────────────────

/**
 * Handle blueprint API requests. Mount at /api/blueprint/*
 *
 * GET  /api/blueprint/detect?dir=<path>  — Check if PRD exists
 * GET  /api/blueprint/validate?dir=<path> — Full validation
 * POST /api/blueprint/merge — Execute CLAUDE.md merge
 */
export async function handleBlueprintRequest(
  method: string,
  path: string,
  body: unknown,
): Promise<{ status: number; body: unknown } | null> {
  if (method === 'GET' && path === '/api/blueprint/detect') {
    // Quick check: does docs/PRD.md exist in the current project?
    const projectRoot = process.cwd();
    const prdPath = join(projectRoot, 'docs/PRD.md');
    const exists = existsSync(prdPath);

    if (exists) {
      const content = await readFile(prdPath, 'utf-8');
      const { frontmatter } = parseFrontmatter(content);
      return {
        status: 200,
        body: {
          detected: true,
          name: frontmatter.name ?? 'Unnamed',
          description: frontmatter.type ?? 'Unknown type',
        },
      };
    }

    return { status: 200, body: { detected: false } };
  }

  if (method === 'GET' && path === '/api/blueprint/validate') {
    const projectRoot = process.cwd();
    const result = await validateBlueprint(projectRoot);
    return { status: 200, body: result };
  }

  if (method === 'POST' && path === '/api/blueprint/merge') {
    const projectRoot = process.cwd();
    const params = body as { directivesPath?: string } | undefined;
    const result = await executeBlueprintMerge(projectRoot, params?.directivesPath ?? null);
    return { status: 200, body: result };
  }

  return null; // Not a blueprint route
}

// ── JSON Response Helper ────────────────────────────

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ── Route Registration ──────────────────────────────

addRoute('GET', '/api/blueprint/detect', async (_req: IncomingMessage, res: ServerResponse) => {
  const projectRoot = process.cwd();
  const prdPath = join(projectRoot, 'docs/PRD.md');

  if (existsSync(prdPath)) {
    const content = await readFile(prdPath, 'utf-8');
    const { frontmatter } = parseFrontmatter(content);
    sendJson(res, 200, {
      detected: true,
      name: frontmatter.name ?? 'Unnamed',
      description: frontmatter.type ?? 'Unknown type',
    });
  } else {
    sendJson(res, 200, { detected: false });
  }
});

addRoute('GET', '/api/blueprint/validate', async (_req: IncomingMessage, res: ServerResponse) => {
  const projectRoot = process.cwd();
  const result = await validateBlueprint(projectRoot);
  sendJson(res, 200, result);
});

addRoute('POST', '/api/blueprint/merge', async (req: IncomingMessage, res: ServerResponse) => {
  let body = '';
  for await (const chunk of req) body += chunk;

  let params: { directivesPath?: string } = {};
  try {
    params = JSON.parse(body) as { directivesPath?: string };
  } catch { /* empty body is fine — directivesPath defaults to null */ }

  const projectRoot = process.cwd();
  const result = await executeBlueprintMerge(projectRoot, params.directivesPath ?? null);
  sendJson(res, 200, result);
});
