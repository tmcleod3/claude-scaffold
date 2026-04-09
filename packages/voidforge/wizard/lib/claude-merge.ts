/**
 * CLAUDE.md Merge Utility — Safe append of project directives.
 *
 * Merges project-specific directives into VoidForge's CLAUDE.md by
 * appending them under a clearly marked section. Never replaces the
 * methodology content. Idempotent — won't duplicate if run multiple times.
 *
 * PRD Reference: RFC-blueprint-path.md
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// ── Constants ───────────────────────────────────────

const MERGE_MARKER = '# PROJECT-SPECIFIC DIRECTIVES';

// ── Types ───────────────────────────────────────────

export interface MergeResult {
  merged: boolean;
  reason: string;
  claudeMdPath: string;
  directivesPath: string;
}

// ── Merge Function ──────────────────────────────────

/**
 * Append project directives to CLAUDE.md.
 *
 * Rules:
 * - VoidForge's CLAUDE.md content is NEVER replaced
 * - Project directives are appended under a clear marker section
 * - Idempotent: if the marker already exists, the merge is skipped
 * - The source directive file path is recorded in the merged section
 *
 * @param projectRoot - The project's root directory
 * @param directivesRelativePath - Relative path to the directives file (e.g., 'docs/PROJECT-DIRECTIVES.md')
 * @returns MergeResult describing what happened
 */
export async function mergeProjectDirectives(
  projectRoot: string,
  directivesRelativePath: string,
): Promise<MergeResult> {
  const claudeMdPath = join(projectRoot, 'CLAUDE.md');
  const directivesPath = join(projectRoot, directivesRelativePath);

  // Validate both files exist
  if (!existsSync(claudeMdPath)) {
    return {
      merged: false,
      reason: 'CLAUDE.md not found in project root',
      claudeMdPath,
      directivesPath: directivesRelativePath,
    };
  }

  if (!existsSync(directivesPath)) {
    return {
      merged: false,
      reason: `Directives file not found: ${directivesRelativePath}`,
      claudeMdPath,
      directivesPath: directivesRelativePath,
    };
  }

  // Read both files
  const claudeMdContent = await readFile(claudeMdPath, 'utf-8');
  const directivesContent = await readFile(directivesPath, 'utf-8');

  // Idempotency check: already merged?
  if (claudeMdContent.includes(MERGE_MARKER)) {
    return {
      merged: false,
      reason: 'Project directives already merged (marker found)',
      claudeMdPath,
      directivesPath: directivesRelativePath,
    };
  }

  // Validate directives content is non-empty
  if (directivesContent.trim().length === 0) {
    return {
      merged: false,
      reason: 'Directives file is empty',
      claudeMdPath,
      directivesPath: directivesRelativePath,
    };
  }

  // Merge: append directives under the marker
  const merged = `${claudeMdContent.trimEnd()}

---

${MERGE_MARKER}

_Loaded from \`${directivesRelativePath}\` by /blueprint_

${directivesContent.trimEnd()}
`;

  await writeFile(claudeMdPath, merged, 'utf-8');

  return {
    merged: true,
    reason: `Project directives appended from ${directivesRelativePath}`,
    claudeMdPath,
    directivesPath: directivesRelativePath,
  };
}

/**
 * Check if project directives have already been merged into CLAUDE.md.
 */
export async function isAlreadyMerged(projectRoot: string): Promise<boolean> {
  const claudeMdPath = join(projectRoot, 'CLAUDE.md');
  if (!existsSync(claudeMdPath)) return false;

  const content = await readFile(claudeMdPath, 'utf-8');
  return content.includes(MERGE_MARKER);
}

/**
 * Remove previously merged project directives from CLAUDE.md.
 * Useful for re-merging with updated directives.
 */
export async function unmergeProjectDirectives(projectRoot: string): Promise<boolean> {
  const claudeMdPath = join(projectRoot, 'CLAUDE.md');
  if (!existsSync(claudeMdPath)) return false;

  const content = await readFile(claudeMdPath, 'utf-8');
  const markerIndex = content.indexOf(`\n---\n\n${MERGE_MARKER}`);
  if (markerIndex === -1) return false;

  // Remove everything from the marker onwards
  const cleaned = content.slice(0, markerIndex).trimEnd() + '\n';
  await writeFile(claudeMdPath, cleaned, 'utf-8');
  return true;
}
