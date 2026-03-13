import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdir, readFile, writeFile, copyFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { addRoute } from '../router.js';
import { parseJsonBody } from '../lib/body-parser.js';

const execFileAsync = promisify(execFile);

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

const SCAFFOLD_DIR = resolve(import.meta.dirname, '..', '..');

interface ProjectConfig {
  name: string;
  directory: string;
  description?: string;
  domain?: string;
  deploy?: string;
  prd?: string;
}

function sanitizeDirName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// POST /api/project/validate — validate project config
addRoute('POST', '/api/project/validate', async (req: IncomingMessage, res: ServerResponse) => {
  const body = await parseJsonBody(req) as Partial<ProjectConfig>;
  const errors: string[] = [];

  if (!body.name || body.name.trim().length === 0) {
    errors.push('Project name is required');
  }

  if (!body.directory || body.directory.trim().length === 0) {
    errors.push('Project directory is required');
  } else {
    const dir = resolve(body.directory);
    try {
      const s = await stat(dir);
      if (s.isDirectory()) {
        const entries = await readdir(dir);
        if (entries.length > 0) {
          errors.push('Directory already exists and is not empty');
        }
      }
    } catch {
      // Directory doesn't exist — that's fine
    }
  }

  const suggestedDir = body.name
    ? resolve(process.cwd(), '..', sanitizeDirName(body.name))
    : undefined;

  sendJson(res, 200, { valid: errors.length === 0, errors, suggestedDir });
});

/** Recursively copy a directory, excluding specified paths */
async function copyDir(src: string, dest: string, exclude: string[] = []): Promise<void> {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    // Check exclusions
    const relative = srcPath.slice(SCAFFOLD_DIR.length + 1);
    if (exclude.some(ex => relative.startsWith(ex))) {
      continue;
    }

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath, exclude);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

// POST /api/project/create — create the project
addRoute('POST', '/api/project/create', async (req: IncomingMessage, res: ServerResponse) => {
  const body = await parseJsonBody(req) as ProjectConfig;

  if (!body.name || !body.directory) {
    sendJson(res, 400, { error: 'name and directory are required' });
    return;
  }

  const projectDir = resolve(body.directory);

  try {
    // Create project directory
    await mkdir(projectDir, { recursive: true });

    // Copy CLAUDE.md
    await copyFile(join(SCAFFOLD_DIR, 'CLAUDE.md'), join(projectDir, 'CLAUDE.md'));

    // Copy docs/
    await copyDir(join(SCAFFOLD_DIR, 'docs'), join(projectDir, 'docs'));

    // Copy .claude/
    const claudeDir = join(SCAFFOLD_DIR, '.claude');
    try {
      await copyDir(claudeDir, join(projectDir, '.claude'));
    } catch {
      // .claude dir might not exist
    }

    // Copy .gitignore
    try {
      await copyFile(join(SCAFFOLD_DIR, '.gitignore'), join(projectDir, '.gitignore'));
    } catch {
      // OK
    }

    // Create logs directory with build-state.md
    await mkdir(join(projectDir, 'logs'), { recursive: true });
    const buildState = `# Build State

**Project:** ${body.name}
**Current Phase:** 0 (not started)
**Last Updated:** ${new Date().toISOString()}
**Active Agent:** None

## Phase Status
| Phase | Status | Gate Passed |
|-------|--------|-------------|
| 0-13 | not started | — |

## Current Blockers
- None — ready to start. Run /build to begin.

## Next Steps
1. Review docs/PRD.md
2. Run /build to start Phase 0
`;
    await writeFile(join(projectDir, 'logs', 'build-state.md'), buildState);

    // Replace placeholder in CLAUDE.md
    const claudeMdPath = join(projectDir, 'CLAUDE.md');
    let claudeMd = await readFile(claudeMdPath, 'utf-8');
    claudeMd = claudeMd.replace(/\[PROJECT_NAME\]/g, body.name);
    if (body.description) {
      claudeMd = claudeMd.replace(/\[ONE_LINE_DESCRIPTION\]/g, body.description);
    }
    if (body.domain) {
      claudeMd = claudeMd.replace(/\[DOMAIN\]/g, body.domain);
    }
    await writeFile(claudeMdPath, claudeMd);

    // Write PRD if provided
    if (body.prd) {
      await writeFile(join(projectDir, 'docs', 'PRD.md'), body.prd);
    }

    // Create .env from template
    const deployLine = body.deploy ? `\n# Deploy target: ${body.deploy}\nDEPLOY_TARGET=${body.deploy}\n` : '';
    const envContent = `# ${body.name} — Environment Variables
# Generated by VoidForge wizard on ${new Date().toISOString()}
${deployLine}
# Add your environment variables here
# NODE_ENV=development
`;
    await writeFile(join(projectDir, '.env'), envContent);

    // Initialize git repo
    try {
      await execFileAsync('git', ['init'], { cwd: projectDir });
      await execFileAsync('git', ['add', '-A'], { cwd: projectDir });
      await execFileAsync('git', ['commit', '-m', `Initial commit: ${body.name} via VoidForge`], { cwd: projectDir });
    } catch (err) {
      // Git init is best-effort
      console.warn('Git initialization warning:', err);
    }

    sendJson(res, 200, {
      created: true,
      directory: projectDir,
      files: [
        'CLAUDE.md',
        '.claude/commands/',
        '.claude/settings.json',
        'docs/PRD.md',
        'docs/methods/',
        'docs/patterns/',
        'docs/LESSONS.md',
        'logs/build-state.md',
        '.env',
        '.gitignore',
      ],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create project';
    console.error('Project creation error:', message);
    sendJson(res, 500, { error: 'Failed to create project' });
  }
});

// GET /api/project/defaults — return default values
addRoute('GET', '/api/project/defaults', async (_req: IncomingMessage, res: ServerResponse) => {
  const homeDir = process.env['HOME'] ?? '/tmp';
  sendJson(res, 200, {
    baseDir: resolve(homeDir, 'Projects'),
    scaffoldDir: SCAFFOLD_DIR,
  });
});
