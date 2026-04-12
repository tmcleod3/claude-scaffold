import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdir, readFile, writeFile, copyFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { addRoute } from '../router.js';
import { parseJsonBody } from '../lib/body-parser.js';
import { addProject } from '../lib/project-registry.js';
import { validateSession, parseSessionCookie, getClientIp, isRemoteMode } from '../lib/tower-auth.js';
import { sendJson } from '../lib/http-helpers.js';

const execFileAsync = promisify(execFile);

const SCAFFOLD_DIR = resolve(import.meta.dirname, '..', '..');

interface ProjectConfig {
  name: string;
  directory: string;
  description?: string;
  domain?: string;
  hostname?: string;
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

  const homeDir = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '/tmp';
  const suggestedDir = body.name
    ? resolve(homeDir, 'Projects', sanitizeDirName(body.name))
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
  const raw = await parseJsonBody(req);
  if (typeof raw !== 'object' || raw === null) {
    sendJson(res, 400, { error: 'Request body must be a JSON object' });
    return;
  }
  const body = raw as Record<string, unknown>;

  if (typeof body.name !== 'string' || body.name.trim().length === 0 ||
      typeof body.directory !== 'string' || body.directory.trim().length === 0) {
    sendJson(res, 400, { error: 'name and directory are required strings' });
    return;
  }

  // Coerce optional fields to safe strings (strip newlines for .env injection prevention)
  const safeName = String(body.name).replace(/[\r\n]/g, ' ').trim();
  const safeDir = String(body.directory).trim();
  const safeDescription = typeof body.description === 'string' ? body.description.replace(/[\r\n]/g, ' ').trim() : '';
  const safeDomain = typeof body.domain === 'string' ? body.domain.replace(/[\r\n]/g, '').trim() : '';
  const safeHostname = typeof body.hostname === 'string' ? body.hostname.replace(/[\r\n]/g, '').trim() : '';
  const safeDeploy = typeof body.deploy === 'string' ? body.deploy.replace(/[\r\n]/g, '').trim() : '';
  const safePrd = typeof body.prd === 'string' ? body.prd : '';

  const projectDir = resolve(safeDir);

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

**Project:** ${safeName}
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
    claudeMd = claudeMd.replace(/\[PROJECT_NAME\]/g, safeName);
    if (safeDescription) {
      claudeMd = claudeMd.replace(/\[ONE_LINE_DESCRIPTION\]/g, safeDescription);
    }
    if (safeDomain) {
      claudeMd = claudeMd.replace(/\[DOMAIN\]/g, safeDomain);
    }
    await writeFile(claudeMdPath, claudeMd);

    // Write PRD if provided
    if (safePrd) {
      await writeFile(join(projectDir, 'docs', 'PRD.md'), safePrd);
    }

    // Create .env from template (newlines stripped from values to prevent injection)
    const deployLine = safeDeploy ? `\n# Deploy target: ${safeDeploy}\nDEPLOY_TARGET=${safeDeploy}\n` : '';
    const hostnameLine = safeHostname ? `\n# DNS hostname (Cloudflare)\nHOSTNAME=${safeHostname}\n` : '';
    const envContent = `# ${safeName} — Environment Variables
# Generated by VoidForge wizard on ${new Date().toISOString()}
${deployLine}${hostnameLine}
# Add your environment variables here
# NODE_ENV=development
`;
    await writeFile(join(projectDir, '.env'), envContent);

    // Initialize git repo
    try {
      await execFileAsync('git', ['init'], { cwd: projectDir });
      await execFileAsync('git', ['add', '-A'], { cwd: projectDir });
      await execFileAsync('git', ['commit', '-m', `Initial commit: ${safeName} via VoidForge`], { cwd: projectDir });
    } catch (err) {
      // Git init is best-effort
      const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
      console.warn(`Git initialization skipped: ${msg}. Project created but not version-controlled.`);
    }

    // Register in project registry for The Lobby
    try {
      await addProject({
        name: safeName,
        directory: projectDir,
        deployTarget: safeDeploy || 'unknown',
        deployUrl: safeHostname ? `https://${safeHostname}` : '',
        sshHost: '',
        framework: 'unknown',
        database: 'none',
        createdAt: new Date().toISOString(),
        lastBuildPhase: 0,
        lastDeployAt: '',
        healthCheckUrl: '',
        monthlyCost: 0,
        owner: (() => {
          if (!isRemoteMode()) return 'local';
          const token = parseSessionCookie(req.headers.cookie);
          const ip = getClientIp(req);
          const session = token ? validateSession(token, ip) : null;
          return session?.username ?? '';
        })(),
        access: [],
        linkedProjects: [],
      });
    } catch {
      // Registry write is best-effort — don't fail project creation
    }

    // Write .voidforge marker file for CLI compatibility
    try {
      const { createMarker, writeMarker } = await import('../lib/marker.js');
      const marker = createMarker('21.0.0', 'full');
      await writeMarker(projectDir, marker);
    } catch {
      // Marker write is best-effort — don't fail project creation
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
