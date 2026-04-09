/**
 * Project creation — headless and browser init flows.
 *
 * Creates a new VoidForge project by copying methodology files,
 * injecting project identity, writing the marker, and registering.
 */

import { mkdir, readFile, writeFile, readdir, cp, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { execSync } from 'node:child_process';
import {
  createMarker, writeMarker, registerProject,
  getGlobalDir,
  type VoidForgeMarker,
} from './marker.js';

// ── Types ────────────────────────────────────────────────

export interface ProjectConfig {
  name: string;
  directory: string;
  oneliner?: string;
  domain?: string;
  repoUrl?: string;
  tier?: VoidForgeMarker['tier'];
  extensions?: string[];
  core?: boolean;      // --core flag: minimal methodology
  skipGit?: boolean;   // skip git init
}

export interface ProjectResult {
  projectDir: string;
  markerId: string;
  filesCreated: number;
}

// ── Methodology Source ───────────────────────────────────

/**
 * Resolves the methodology source directory.
 * In development: monorepo root (where CLAUDE.md lives).
 * In production: the installed @voidforge/methodology package.
 */
async function resolveMethodologyRoot(): Promise<string> {
  // Development: walk up from this file to find CLAUDE.md at monorepo root
  const dir = import.meta.dirname ?? new URL('.', import.meta.url).pathname;
  let current = dir;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(current, 'CLAUDE.md')) && existsSync(join(current, '.claude', 'commands'))) {
      return current;
    }
    current = resolve(current, '..');
  }

  // Production: try to resolve from @voidforge/methodology
  try {
    const { createRequire } = await import('node:module');
    const require_ = createRequire(import.meta.url);
    const methodologyPkg = require_.resolve('@voidforge/methodology/package.json');
    return resolve(methodologyPkg, '..');
  } catch {
    // Package not installed — expected in development
  }

  throw new Error(
    'Cannot find methodology source. Checked: CLAUDE.md walkup (development), ' +
    '@voidforge/methodology package (production). Ensure VoidForge is installed correctly.',
  );
}

// ── Copy Methodology ─────────────────────────────────────

async function copyDir(src: string, dest: string): Promise<number> {
  if (!existsSync(src)) return 0;
  await mkdir(dest, { recursive: true });
  let count = 0;
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      count += await copyDir(srcPath, destPath);
    } else {
      await cp(srcPath, destPath);
      count++;
    }
  }
  return count;
}

async function copyMethodology(
  methodologyRoot: string,
  projectDir: string,
  core: boolean,
): Promise<number> {
  let count = 0;

  // Always copy: CLAUDE.md, VERSION.md
  for (const file of ['CLAUDE.md', 'VERSION.md']) {
    const src = join(methodologyRoot, file);
    if (existsSync(src)) {
      await cp(src, join(projectDir, file));
      count++;
    }
  }

  // Full tier: also copy HOLOCRON.md, CHANGELOG.md
  if (!core) {
    for (const file of ['HOLOCRON.md', 'CHANGELOG.md']) {
      const src = join(methodologyRoot, file);
      if (existsSync(src)) {
        await cp(src, join(projectDir, file));
        count++;
      }
    }
  }

  // Commands
  const commandsSrc = join(methodologyRoot, '.claude', 'commands');
  if (existsSync(commandsSrc)) {
    count += await copyDir(commandsSrc, join(projectDir, '.claude', 'commands'));
  }

  // Methods
  const methodsSrc = join(methodologyRoot, 'docs', 'methods');
  if (existsSync(methodsSrc)) {
    count += await copyDir(methodsSrc, join(projectDir, 'docs', 'methods'));
  }

  // Patterns (full tier only)
  if (!core) {
    const patternsSrc = join(methodologyRoot, 'docs', 'patterns');
    if (existsSync(patternsSrc)) {
      count += await copyDir(patternsSrc, join(projectDir, 'docs', 'patterns'));
    }
  }

  // Naming registry
  const registrySrc = join(methodologyRoot, 'docs', 'NAMING_REGISTRY.md');
  if (existsSync(registrySrc)) {
    await mkdir(join(projectDir, 'docs'), { recursive: true });
    await cp(registrySrc, join(projectDir, 'docs', 'NAMING_REGISTRY.md'));
    count++;
  }

  // Thumper scripts
  const thumperSrc = join(methodologyRoot, 'scripts', 'thumper');
  if (existsSync(thumperSrc)) {
    count += await copyDir(thumperSrc, join(projectDir, 'scripts', 'thumper'));
  }

  return count;
}

// ── Identity Injection ───────────────────────────────────

async function injectIdentity(
  projectDir: string,
  config: ProjectConfig,
): Promise<void> {
  const claudePath = join(projectDir, 'CLAUDE.md');
  if (!existsSync(claudePath)) return;

  let content = await readFile(claudePath, 'utf-8');
  content = content.replace('[PROJECT_NAME]', config.name);
  content = content.replace('[ONE_LINE_DESCRIPTION]', config.oneliner ?? '');
  content = content.replace('[DOMAIN]', config.domain ?? '');
  content = content.replace('[REPO_URL]', config.repoUrl ?? '');
  await writeFile(claudePath, content, 'utf-8');
}

// ── Git Init ─────────────────────────────────────────────

function gitInit(projectDir: string): boolean {
  try {
    execSync('git init', { cwd: projectDir, stdio: 'pipe' });
    execSync('git add -A', { cwd: projectDir, stdio: 'pipe' });
    execSync('git commit -m "Initial commit — created with VoidForge"', {
      cwd: projectDir,
      stdio: 'pipe',
      env: { ...process.env },
    });
    return true;
  } catch {
    return false;
  }
}

// ── Main Entry ───────────────────────────────────────────

export async function createProject(config: ProjectConfig): Promise<ProjectResult> {
  const projectDir = resolve(config.directory);

  // 1. Create directory
  await mkdir(projectDir, { recursive: true });

  // 2. Copy methodology
  const methodologyRoot = await resolveMethodologyRoot();
  const filesCreated = await copyMethodology(
    methodologyRoot,
    projectDir,
    config.core ?? false,
  );

  // 3. Inject project identity
  await injectIdentity(projectDir, config);

  // 4. Write .voidforge marker
  const marker = createMarker(
    '21.0.0',
    config.core ? 'methodology' : 'full',
    config.extensions ?? [],
  );
  await writeMarker(projectDir, marker);

  // 5. Register in projects.json
  const globalDir = getGlobalDir();
  await mkdir(globalDir, { recursive: true });
  await registerProject({
    id: marker.id,
    name: config.name,
    path: projectDir,
    created: marker.created,
  });

  // 6. Validate critical files were copied
  if (!existsSync(join(projectDir, 'CLAUDE.md'))) {
    throw new Error('Failed to copy CLAUDE.md — methodology source may be corrupted.');
  }

  // 7. Git init + initial commit
  if (!config.skipGit) {
    const gitOk = gitInit(projectDir);
    if (!gitOk) {
      console.warn('Warning: git init failed. Project created but not version-controlled.');
    }
  }

  return {
    projectDir,
    markerId: marker.id,
    filesCreated: filesCreated + 1, // +1 for .voidforge marker
  };
}
