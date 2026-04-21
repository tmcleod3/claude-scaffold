/**
 * Update mechanisms — methodology update (replaces /void git-fetch),
 * self-update, and extension update.
 */

import { readFile, readdir, cp, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';
import { readMarker, writeMarker } from './marker.js';

// ── Types ────────────────────────────────────────────────

export interface UpdatePlan {
  added: string[];
  modified: string[];
  removed: string[];
  unchanged: number;
}

export interface UpdateResult {
  applied: boolean;
  plan: UpdatePlan;
  newVersion: string;
}

// ── Methodology Source Resolution ────────────────────────

async function resolveMethodologySource(): Promise<string> {
  const dir = import.meta.dirname ?? new URL('.', import.meta.url).pathname;
  let current = dir;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(current, 'CLAUDE.md')) && existsSync(join(current, '.claude', 'commands'))) {
      return current;
    }
    const { resolve } = await import('node:path');
    current = resolve(current, '..');
  }

  try {
    const { createRequire } = await import('node:module');
    const require_ = createRequire(import.meta.url);
    const pkgPath = require_.resolve('voidforge-build-methodology/package.json');
    const { resolve } = await import('node:path');
    return resolve(pkgPath, '..');
  } catch {
    // Not installed
  }

  throw new Error('Cannot find methodology source for update.');
}

// ── Diff ─────────────────────────────────────────────────

async function collectFiles(dir: string, base: string = ''): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...await collectFiles(join(dir, entry.name), rel));
    } else {
      files.push(rel);
    }
  }
  return files;
}

/**
 * Diff methodology source against project files.
 * Returns a plan showing what would change.
 */
export async function diffMethodology(projectDir: string): Promise<UpdatePlan> {
  const sourceRoot = await resolveMethodologySource();
  const plan: UpdatePlan = { added: [], modified: [], removed: [], unchanged: 0 };

  // Directories to compare
  const dirs = [
    { src: '.claude/commands', dest: '.claude/commands' },
    { src: '.claude/agents', dest: '.claude/agents' },
    { src: 'docs/methods', dest: 'docs/methods' },
    { src: 'docs/patterns', dest: 'docs/patterns' },
    { src: 'scripts/thumper', dest: 'scripts/thumper' },
  ];

  // Single files to compare
  const singleFiles = ['CLAUDE.md', 'HOLOCRON.md', 'VERSION.md'];

  // Check single files
  for (const file of singleFiles) {
    const srcPath = join(sourceRoot, file);
    const destPath = join(projectDir, file);
    if (!existsSync(srcPath)) continue;

    if (!existsSync(destPath)) {
      plan.added.push(file);
    } else {
      const srcContent = await readFile(srcPath, 'utf-8');
      const destContent = await readFile(destPath, 'utf-8');
      // Skip CLAUDE.md first 10 lines (project identity) when comparing
      if (file === 'CLAUDE.md') {
        const srcLines = srcContent.split('\n').slice(10).join('\n');
        const destLines = destContent.split('\n').slice(10).join('\n');
        if (srcLines !== destLines) plan.modified.push(file);
        else plan.unchanged++;
      } else {
        if (srcContent !== destContent) plan.modified.push(file);
        else plan.unchanged++;
      }
    }
  }

  // Check directories
  for (const { src, dest } of dirs) {
    const srcDir = join(sourceRoot, src);
    const destDir = join(projectDir, dest);
    const srcFiles = await collectFiles(srcDir);
    const destFiles = await collectFiles(destDir);

    const srcSet = new Set(srcFiles);
    const destSet = new Set(destFiles);

    for (const file of srcFiles) {
      const fullDest = join(destDir, file);
      if (!destSet.has(file)) {
        plan.added.push(`${dest}/${file}`);
      } else {
        const srcContent = await readFile(join(srcDir, file), 'utf-8');
        const destContent = await readFile(fullDest, 'utf-8');
        if (srcContent !== destContent) {
          plan.modified.push(`${dest}/${file}`);
        } else {
          plan.unchanged++;
        }
      }
    }

    // Files in project but not in source (removed upstream)
    for (const file of destFiles) {
      if (!srcSet.has(file)) {
        plan.removed.push(`${dest}/${file}`);
      }
    }
  }

  return plan;
}

// ── Apply Update ─────────────────────────────────────────

/**
 * Apply the update plan — copy new/modified files from source to project.
 * Does NOT delete removed files (user may have customizations).
 */
export async function applyUpdate(projectDir: string): Promise<UpdateResult> {
  const sourceRoot = await resolveMethodologySource();
  const plan = await diffMethodology(projectDir);

  // Read source VERSION.md for new version
  let newVersion = 'unknown';
  const versionPath = join(sourceRoot, 'VERSION.md');
  if (existsSync(versionPath)) {
    const content = await readFile(versionPath, 'utf-8');
    const match = content.match(/(\d+\.\d+\.\d+)/);
    if (match) newVersion = match[1];
  }

  if (plan.added.length === 0 && plan.modified.length === 0) {
    return { applied: false, plan, newVersion };
  }

  // Copy added + modified files
  const { mkdir } = await import('node:fs/promises');
  for (const file of [...plan.added, ...plan.modified]) {
    // Special handling for CLAUDE.md: preserve project identity (first 10 lines)
    if (file === 'CLAUDE.md') {
      const srcContent = await readFile(join(sourceRoot, file), 'utf-8');
      const destPath = join(projectDir, file);
      if (existsSync(destPath)) {
        const destContent = await readFile(destPath, 'utf-8');
        const destIdentity = destContent.split('\n').slice(0, 10).join('\n');
        const srcBody = srcContent.split('\n').slice(10).join('\n');
        await import('node:fs/promises').then(fs =>
          fs.writeFile(destPath, destIdentity + '\n' + srcBody, 'utf-8'),
        );
      } else {
        await cp(join(sourceRoot, file), destPath);
      }
      continue;
    }

    const srcPath = join(sourceRoot, file);
    const destPath = join(projectDir, file);
    const destDir = join(destPath, '..');
    await mkdir(destDir, { recursive: true });
    await cp(srcPath, destPath);
  }

  // Update marker version
  const marker = await readMarker(projectDir);
  if (marker) {
    marker.version = newVersion;
    await writeMarker(projectDir, marker);
  }

  return { applied: true, plan, newVersion };
}

// ── Self-Update ──────────────────────────────────────────

export function selfUpdate(): { success: boolean; message: string } {
  try {
    // Strip npm_config_* env vars — they outrank the CLI --registry flag
    // and could redirect install to an attacker-controlled registry (SEC-R2-001).
    // Also drop undefined values — execSync stringifies them to "undefined"
    // which breaks downstream tools (R4-CURSED-002).
    const safeEnv: NodeJS.ProcessEnv = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined && !/^npm_config_/i.test(k)) safeEnv[k] = v;
    }
    execSync('npm install -g voidforge-build@latest --registry=https://registry.npmjs.org/', {
      stdio: 'pipe',
      env: safeEnv,
    });
    return { success: true, message: 'VoidForge updated successfully.' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Self-update failed: ${msg}` };
  }
}
