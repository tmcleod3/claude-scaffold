/**
 * Projects API — Multi-project CRUD for the Great Hall.
 * Endpoints: list, get, import, delete.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { access, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { addRoute } from '../router.js';
import { parseJsonBody } from '../lib/body-parser.js';
import { parseFrontmatter } from '../lib/frontmatter.js';
import {
  readRegistry,
  addProject,
  getProject,
  removeProject,
  findByDirectory,
  type ProjectInput,
} from '../lib/project-registry.js';

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

// GET /api/projects — list all projects
addRoute('GET', '/api/projects', async (_req: IncomingMessage, res: ServerResponse) => {
  const projects = await readRegistry();
  sendJson(res, 200, { success: true, data: projects });
});

// GET /api/projects/get — get single project by id (query param)
addRoute('GET', '/api/projects/get', async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const id = url.searchParams.get('id');

  if (!id) {
    sendJson(res, 400, { success: false, error: 'id query parameter is required' });
    return;
  }

  const project = await getProject(id);
  if (!project) {
    sendJson(res, 404, { success: false, error: 'Project not found' });
    return;
  }

  sendJson(res, 200, { success: true, data: project });
});

/** Scan a project directory for metadata. Reuses patterns from wizard/api/deploy.ts. */
async function scanProjectMetadata(dir: string): Promise<ProjectInput> {
  // Read project name from CLAUDE.md
  let name = 'Unknown';
  try {
    const claudeMd = await readFile(join(dir, 'CLAUDE.md'), 'utf-8');
    const nameMatch = claudeMd.match(/\*\*Name:\*\*\s*(.+)/);
    if (nameMatch) {
      const extracted = nameMatch[1].trim();
      if (!extracted.startsWith('[')) name = extracted;
    }
  } catch { /* use default */ }

  // Read .env once for all values
  let deployTarget = '';
  let deployUrl = '';
  let hostname = '';
  let sshHost = '';
  try {
    const envContent = await readFile(join(dir, '.env'), 'utf-8');
    const deployMatch = envContent.match(/DEPLOY_TARGET=(.+)/);
    if (deployMatch) {
      deployTarget = deployMatch[1].trim().replace(/^["']|["']$/g, '').split('#')[0].trim();
    }
    const hostnameMatch = envContent.match(/HOSTNAME=(.+)/);
    if (hostnameMatch) {
      hostname = hostnameMatch[1].trim().replace(/^["']|["']$/g, '').split('#')[0].trim();
      if (hostname) deployUrl = `https://${hostname}`;
    }
    if (deployTarget === 'vps') {
      const sshMatch = envContent.match(/SSH_HOST=(.+)/);
      if (sshMatch) {
        sshHost = sshMatch[1].trim().replace(/^["']|["']$/g, '').split('#')[0].trim();
      }
    }
  } catch { /* no .env */ }

  // Read framework/database from PRD frontmatter
  let framework = '';
  let database = 'none';
  try {
    const prd = await readFile(join(dir, 'docs', 'PRD.md'), 'utf-8');
    const { frontmatter } = parseFrontmatter(prd);
    if (frontmatter.framework) framework = frontmatter.framework;
    if (frontmatter.database) database = frontmatter.database;
    if (frontmatter.deploy && !deployTarget) deployTarget = frontmatter.deploy;
    if (frontmatter.hostname && !hostname) {
      hostname = frontmatter.hostname;
      if (!deployUrl && hostname) deployUrl = `https://${hostname}`;
    }
  } catch { /* no PRD or no frontmatter */ }

  // Auto-detect framework from files if not in PRD
  if (!framework) {
    try {
      const pkg = await readFile(join(dir, 'package.json'), 'utf-8');
      const pkgData = JSON.parse(pkg) as { dependencies?: Record<string, string> };
      const deps = pkgData.dependencies ?? {};
      if (deps['next']) framework = 'next.js';
      else if (deps['express']) framework = 'express';
    } catch { /* not a Node project */ }

    if (!framework) {
      try {
        const reqs = await readFile(join(dir, 'requirements.txt'), 'utf-8');
        if (reqs.toLowerCase().includes('django')) framework = 'django';
        else framework = 'python';
      } catch { /* not Python */ }
    }

    if (!framework) {
      try {
        await access(join(dir, 'Gemfile'));
        framework = 'rails';
      } catch { /* not Ruby */ }
    }
  }

  // Read build state for last phase
  let lastBuildPhase = 0;
  try {
    const buildState = await readFile(join(dir, 'logs', 'build-state.md'), 'utf-8');
    const phaseMatch = buildState.match(/\*\*Current Phase:\*\*\s*(\d+)/);
    if (phaseMatch) {
      lastBuildPhase = parseInt(phaseMatch[1], 10);
    }
  } catch { /* no build state */ }

  // Determine health check URL
  let healthCheckUrl = '';
  if (deployUrl) {
    healthCheckUrl = `${deployUrl}/api/health`;
  }

  return {
    name,
    directory: dir,
    deployTarget: deployTarget || 'unknown',
    deployUrl,
    sshHost,
    framework: framework || 'unknown',
    database,
    createdAt: new Date().toISOString(),
    lastBuildPhase,
    lastDeployAt: '',
    healthCheckUrl,
    monthlyCost: 0,
  };
}

// POST /api/projects/import — import an existing project
addRoute('POST', '/api/projects/import', async (req: IncomingMessage, res: ServerResponse) => {
  const body = await parseJsonBody(req);

  // Runtime type validation
  if (typeof body !== 'object' || body === null) {
    sendJson(res, 400, { success: false, error: 'Request body must be a JSON object' });
    return;
  }
  const { directory } = body as Record<string, unknown>;
  if (typeof directory !== 'string' || directory.trim().length === 0) {
    sendJson(res, 400, { success: false, error: 'directory must be a non-empty string' });
    return;
  }

  // Canonicalize and validate path
  const dir = resolve(directory);
  if (!dir.startsWith('/')) {
    sendJson(res, 400, { success: false, error: 'directory must be an absolute path' });
    return;
  }

  // Check directory exists
  try {
    await access(dir);
  } catch {
    sendJson(res, 400, { success: false, error: 'Directory does not exist' });
    return;
  }

  // Check it's a VoidForge project (has CLAUDE.md)
  try {
    await access(join(dir, 'CLAUDE.md'));
  } catch {
    sendJson(res, 400, { success: false, error: 'Not a VoidForge project — no CLAUDE.md found' });
    return;
  }

  // Check not already registered
  const existing = await findByDirectory(dir);
  if (existing) {
    sendJson(res, 409, { success: false, error: 'Project already registered', data: existing });
    return;
  }

  try {
    const input = await scanProjectMetadata(dir);
    const project = await addProject(input);
    sendJson(res, 201, { success: true, data: project });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Import failed';
    // Don't expose full error details — check for known errors
    if (message.includes('already registered')) {
      sendJson(res, 409, { success: false, error: 'Project already registered' });
    } else {
      sendJson(res, 500, { success: false, error: 'Failed to import project' });
    }
  }
});

// POST /api/projects/delete — remove a project from registry
addRoute('POST', '/api/projects/delete', async (req: IncomingMessage, res: ServerResponse) => {
  const body = await parseJsonBody(req);

  // Runtime type validation
  if (typeof body !== 'object' || body === null) {
    sendJson(res, 400, { success: false, error: 'Request body must be a JSON object' });
    return;
  }
  const { id } = body as Record<string, unknown>;
  if (typeof id !== 'string' || id.trim().length === 0) {
    sendJson(res, 400, { success: false, error: 'id must be a non-empty string' });
    return;
  }

  const removed = await removeProject(id);
  if (!removed) {
    sendJson(res, 404, { success: false, error: 'Project not found' });
    return;
  }

  sendJson(res, 200, { success: true });
});
