/**
 * Projects API — Multi-project CRUD for The Lobby.
 * Endpoints: list, get, import, delete, access management.
 * All queries filtered by per-project access control (v7.0).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { access as fsAccess, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { addRoute } from '../router.js';
import { parseJsonBody } from '../lib/body-parser.js';
import { parseFrontmatter } from '../lib/frontmatter.js';
import {
  addProject,
  getProject,
  removeProject,
  findByDirectory,
  getProjectsForUser,
  grantAccess,
  revokeAccess,
  getProjectAccess,
  checkProjectAccess,
  linkProjects,
  unlinkProjects,
  getLinkedGroup,
  type ProjectInput,
} from '../lib/project-registry.js';
import { getDeployPlan } from '../lib/deploy-coordinator.js';
import { audit } from '../lib/audit-log.js';
import { validateSession, parseSessionCookie, getClientIp, isRemoteMode } from '../lib/tower-auth.js';
import { isValidRole, type SessionInfo } from '../lib/user-manager.js';

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

/** Extract session from request. Returns null if not authenticated (local mode returns synthetic admin). */
function getSession(req: IncomingMessage): SessionInfo | null {
  if (!isRemoteMode()) {
    return { username: 'local', role: 'admin' };
  }
  const token = parseSessionCookie(req.headers.cookie);
  const ip = getClientIp(req);
  if (!token) return null;
  return validateSession(token, ip);
}

// GET /api/projects — list projects visible to the current user
addRoute('GET', '/api/projects', async (req: IncomingMessage, res: ServerResponse) => {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { success: false, error: 'Authentication required' });
    return;
  }

  const projects = await getProjectsForUser(session.username, session.role);

  // Annotate each project with the user's effective role for UI rendering
  const annotated = projects.map((p) => {
    let userRole: string = 'viewer';
    if (session.role === 'admin' || p.owner === session.username) {
      userRole = 'owner';
    } else {
      const entry = p.access.find((a) => a.username === session.username);
      if (entry) userRole = entry.role;
    }
    return { ...p, userRole };
  });

  sendJson(res, 200, { success: true, data: annotated });
});

// GET /api/projects/get — get single project by id (filtered by access)
addRoute('GET', '/api/projects/get', async (req: IncomingMessage, res: ServerResponse) => {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { success: false, error: 'Authentication required' });
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const id = url.searchParams.get('id');
  if (!id) {
    sendJson(res, 400, { success: false, error: 'id query parameter is required' });
    return;
  }

  // Access check — returns null if project doesn't exist OR user has no access
  const effectiveRole = await checkProjectAccess(id, session.username, session.role);
  if (!effectiveRole) {
    sendJson(res, 404, { success: false, error: 'Project not found' });
    return;
  }

  const project = await getProject(id);
  if (!project) {
    sendJson(res, 404, { success: false, error: 'Project not found' });
    return;
  }

  sendJson(res, 200, { success: true, data: { ...project, userRole: effectiveRole } });
});

/** Scan a project directory for metadata. Reuses patterns from wizard/api/deploy.ts. */
async function scanProjectMetadata(dir: string): Promise<ProjectInput> {
  let name = 'Unknown';
  try {
    const claudeMd = await readFile(join(dir, 'CLAUDE.md'), 'utf-8');
    const nameMatch = claudeMd.match(/\*\*Name:\*\*\s*(.+)/);
    if (nameMatch) {
      const extracted = nameMatch[1].trim();
      if (!extracted.startsWith('[')) name = extracted;
    }
  } catch { /* use default */ }

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
        await fsAccess(join(dir, 'Gemfile'));
        framework = 'rails';
      } catch { /* not Ruby */ }
    }
  }

  let lastBuildPhase = 0;
  try {
    const buildState = await readFile(join(dir, 'logs', 'build-state.md'), 'utf-8');
    const phaseMatch = buildState.match(/\*\*Current Phase:\*\*\s*(\d+)/);
    if (phaseMatch) {
      lastBuildPhase = parseInt(phaseMatch[1], 10);
    }
  } catch { /* no build state */ }

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
    owner: '',
    access: [],
    linkedProjects: [],
  };
}

// POST /api/projects/import — import an existing project (sets owner to current user)
addRoute('POST', '/api/projects/import', async (req: IncomingMessage, res: ServerResponse) => {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { success: false, error: 'Authentication required' });
    return;
  }

  const body = await parseJsonBody(req);
  if (typeof body !== 'object' || body === null) {
    sendJson(res, 400, { success: false, error: 'Request body must be a JSON object' });
    return;
  }
  const { directory } = body as Record<string, unknown>;
  if (typeof directory !== 'string' || directory.trim().length === 0) {
    sendJson(res, 400, { success: false, error: 'directory must be a non-empty string' });
    return;
  }

  if (directory.includes('..')) {
    sendJson(res, 400, { success: false, error: 'directory must not contain ".." segments' });
    return;
  }
  const dir = resolve(directory);
  if (!dir.startsWith('/')) {
    sendJson(res, 400, { success: false, error: 'directory must be an absolute path' });
    return;
  }

  try {
    await fsAccess(dir);
  } catch {
    sendJson(res, 400, { success: false, error: 'Directory does not exist' });
    return;
  }

  try {
    await fsAccess(join(dir, 'CLAUDE.md'));
  } catch {
    sendJson(res, 400, { success: false, error: 'Not a VoidForge project — no CLAUDE.md found' });
    return;
  }

  const existing = await findByDirectory(dir);
  if (existing) {
    sendJson(res, 409, { success: false, error: 'Project already registered', data: existing });
    return;
  }

  try {
    const input = await scanProjectMetadata(dir);
    input.owner = session.username; // Set owner to importing user
    const project = await addProject(input);
    const ip = getClientIp(req);
    await audit('project_create', ip, session.username, { action: 'import', directory: dir, name: project.name });
    sendJson(res, 201, { success: true, data: { ...project, userRole: 'owner' } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Import failed';
    if (message.includes('already registered')) {
      sendJson(res, 409, { success: false, error: 'Project already registered' });
    } else {
      sendJson(res, 500, { success: false, error: 'Failed to import project' });
    }
  }
});

// POST /api/projects/delete — remove a project (owner or admin only)
addRoute('POST', '/api/projects/delete', async (req: IncomingMessage, res: ServerResponse) => {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { success: false, error: 'Authentication required' });
    return;
  }

  const body = await parseJsonBody(req);
  if (typeof body !== 'object' || body === null) {
    sendJson(res, 400, { success: false, error: 'Request body must be a JSON object' });
    return;
  }
  const { id } = body as Record<string, unknown>;
  if (typeof id !== 'string' || id.trim().length === 0) {
    sendJson(res, 400, { success: false, error: 'id must be a non-empty string' });
    return;
  }

  // Check access — only owner or admin can delete
  const effectiveRole = await checkProjectAccess(id, session.username, session.role);
  if (effectiveRole !== 'admin') {
    sendJson(res, 404, { success: false, error: 'Project not found' });
    return;
  }

  const removed = await removeProject(id);
  if (!removed) {
    sendJson(res, 404, { success: false, error: 'Project not found' });
    return;
  }

  const ip = getClientIp(req);
  await audit('project_delete', ip, session.username, { projectId: id });
  sendJson(res, 200, { success: true });
});

// ── Access management endpoints ─────────────────────

// GET /api/projects/access — get access list for a project (owner or admin)
addRoute('GET', '/api/projects/access', async (req: IncomingMessage, res: ServerResponse) => {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { success: false, error: 'Authentication required' });
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const id = url.searchParams.get('id');
  if (!id) {
    sendJson(res, 400, { success: false, error: 'id query parameter is required' });
    return;
  }

  // Only owner or admin can view access list
  const effectiveRole = await checkProjectAccess(id, session.username, session.role);
  if (effectiveRole !== 'admin') {
    sendJson(res, 404, { success: false, error: 'Project not found' });
    return;
  }

  const accessInfo = await getProjectAccess(id);
  if (!accessInfo) {
    sendJson(res, 404, { success: false, error: 'Project not found' });
    return;
  }

  sendJson(res, 200, { success: true, data: accessInfo });
});

// POST /api/projects/access/grant — grant access (owner or admin only)
addRoute('POST', '/api/projects/access/grant', async (req: IncomingMessage, res: ServerResponse) => {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { success: false, error: 'Authentication required' });
    return;
  }

  const body = await parseJsonBody(req);
  if (typeof body !== 'object' || body === null) {
    sendJson(res, 400, { success: false, error: 'Request body must be a JSON object' });
    return;
  }

  const { projectId, username, role } = body as Record<string, unknown>;
  if (typeof projectId !== 'string' || projectId.trim().length === 0) {
    sendJson(res, 400, { success: false, error: 'projectId is required' });
    return;
  }
  if (typeof username !== 'string' || username.trim().length === 0) {
    sendJson(res, 400, { success: false, error: 'username is required' });
    return;
  }
  if (typeof role !== 'string' || !isValidRole(role) || role === 'admin') {
    sendJson(res, 400, { success: false, error: 'role must be one of: deployer, viewer' });
    return;
  }

  // Only owner or admin can grant access
  const effectiveRole = await checkProjectAccess(projectId, session.username, session.role);
  if (effectiveRole !== 'admin') {
    sendJson(res, 404, { success: false, error: 'Project not found' });
    return;
  }

  const ip = getClientIp(req);

  try {
    await grantAccess(projectId, username.trim(), role);
    await audit('access_grant', ip, session.username, {
      projectId,
      target: username.trim(),
      grantedRole: role,
    });
    sendJson(res, 200, { success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to grant access';
    if (message === 'Project not found') {
      sendJson(res, 404, { success: false, error: 'Project not found' });
    } else {
      sendJson(res, 400, { success: false, error: 'Failed to grant access' });
    }
  }
});

// POST /api/projects/access/revoke — revoke access (owner or admin only)
addRoute('POST', '/api/projects/access/revoke', async (req: IncomingMessage, res: ServerResponse) => {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { success: false, error: 'Authentication required' });
    return;
  }

  const body = await parseJsonBody(req);
  if (typeof body !== 'object' || body === null) {
    sendJson(res, 400, { success: false, error: 'Request body must be a JSON object' });
    return;
  }

  const { projectId, username } = body as Record<string, unknown>;
  if (typeof projectId !== 'string' || projectId.trim().length === 0) {
    sendJson(res, 400, { success: false, error: 'projectId is required' });
    return;
  }
  if (typeof username !== 'string' || username.trim().length === 0) {
    sendJson(res, 400, { success: false, error: 'username is required' });
    return;
  }

  // Only owner or admin can revoke access
  const effectiveRole = await checkProjectAccess(projectId, session.username, session.role);
  if (effectiveRole !== 'admin') {
    sendJson(res, 404, { success: false, error: 'Project not found' });
    return;
  }

  const ip = getClientIp(req);

  try {
    await revokeAccess(projectId, username.trim());
    await audit('access_revoke', ip, session.username, {
      projectId,
      target: username.trim(),
    });
    sendJson(res, 200, { success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to revoke access';
    if (message === 'Project not found' || message === 'User has no access to revoke') {
      sendJson(res, 400, { success: false, error: message });
    } else {
      sendJson(res, 400, { success: false, error: 'Failed to revoke access' });
    }
  }
});

// ── Linked services endpoints ───────────────────────

// POST /api/projects/link — link two projects (owner/admin of both required)
addRoute('POST', '/api/projects/link', async (req: IncomingMessage, res: ServerResponse) => {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { success: false, error: 'Authentication required' });
    return;
  }

  const body = await parseJsonBody(req);
  if (typeof body !== 'object' || body === null) {
    sendJson(res, 400, { success: false, error: 'Request body must be a JSON object' });
    return;
  }

  const { projectIdA, projectIdB } = body as Record<string, unknown>;
  if (typeof projectIdA !== 'string' || projectIdA.trim().length === 0) {
    sendJson(res, 400, { success: false, error: 'projectIdA is required' });
    return;
  }
  if (typeof projectIdB !== 'string' || projectIdB.trim().length === 0) {
    sendJson(res, 400, { success: false, error: 'projectIdB is required' });
    return;
  }

  // Must have admin access to BOTH projects
  const roleA = await checkProjectAccess(projectIdA, session.username, session.role);
  const roleB = await checkProjectAccess(projectIdB, session.username, session.role);
  if (roleA !== 'admin' || roleB !== 'admin') {
    sendJson(res, 404, { success: false, error: 'Project not found' });
    return;
  }

  const ip = getClientIp(req);

  try {
    await linkProjects(projectIdA, projectIdB);
    await audit('access_grant', ip, session.username, {
      action: 'link',
      projectIdA,
      projectIdB,
    });
    sendJson(res, 200, { success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to link';
    if (message === 'Cannot link a project to itself' || message === 'Project not found') {
      sendJson(res, 400, { success: false, error: message });
    } else {
      sendJson(res, 400, { success: false, error: 'Failed to link projects' });
    }
  }
});

// POST /api/projects/unlink — unlink two projects (owner/admin of either)
addRoute('POST', '/api/projects/unlink', async (req: IncomingMessage, res: ServerResponse) => {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { success: false, error: 'Authentication required' });
    return;
  }

  const body = await parseJsonBody(req);
  if (typeof body !== 'object' || body === null) {
    sendJson(res, 400, { success: false, error: 'Request body must be a JSON object' });
    return;
  }

  const { projectIdA, projectIdB } = body as Record<string, unknown>;
  if (typeof projectIdA !== 'string' || projectIdA.trim().length === 0) {
    sendJson(res, 400, { success: false, error: 'projectIdA is required' });
    return;
  }
  if (typeof projectIdB !== 'string' || projectIdB.trim().length === 0) {
    sendJson(res, 400, { success: false, error: 'projectIdB is required' });
    return;
  }

  // Must have admin access to EITHER project
  const roleA = await checkProjectAccess(projectIdA, session.username, session.role);
  const roleB = await checkProjectAccess(projectIdB, session.username, session.role);
  if (roleA !== 'admin' && roleB !== 'admin') {
    sendJson(res, 404, { success: false, error: 'Project not found' });
    return;
  }

  const ip = getClientIp(req);

  try {
    await unlinkProjects(projectIdA, projectIdB);
    await audit('access_revoke', ip, session.username, {
      action: 'unlink',
      projectIdA,
      projectIdB,
    });
    sendJson(res, 200, { success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to unlink';
    if (message === 'Project not found') {
      sendJson(res, 400, { success: false, error: message });
    } else {
      sendJson(res, 400, { success: false, error: 'Failed to unlink projects' });
    }
  }
});

// GET /api/projects/linked — get linked projects for a project
addRoute('GET', '/api/projects/linked', async (req: IncomingMessage, res: ServerResponse) => {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { success: false, error: 'Authentication required' });
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const id = url.searchParams.get('id');
  if (!id) {
    sendJson(res, 400, { success: false, error: 'id query parameter is required' });
    return;
  }

  const effectiveRole = await checkProjectAccess(id, session.username, session.role);
  if (!effectiveRole) {
    sendJson(res, 404, { success: false, error: 'Project not found' });
    return;
  }

  const group = await getLinkedGroup(id);
  // Filter linked projects by user access — don't leak data about projects the user can't see
  const accessChecks = await Promise.all(
    group.filter((p) => p.id !== id).map(async (p) => ({
      project: p,
      hasAccess: !!(await checkProjectAccess(p.id, session.username, session.role)),
    })),
  );
  const linked = accessChecks.filter((c) => c.hasAccess).map((c) => ({
    id: c.project.id,
    name: c.project.name,
    deployTarget: c.project.deployTarget,
    healthStatus: c.project.healthStatus,
    lastDeployAt: c.project.lastDeployAt,
  }));

  sendJson(res, 200, { success: true, data: linked });
});

// POST /api/projects/deploy-check — check which linked projects need redeployment
addRoute('POST', '/api/projects/deploy-check', async (req: IncomingMessage, res: ServerResponse) => {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { success: false, error: 'Authentication required' });
    return;
  }

  const body = await parseJsonBody(req);
  if (typeof body !== 'object' || body === null) {
    sendJson(res, 400, { success: false, error: 'Request body must be a JSON object' });
    return;
  }

  const { projectId } = body as Record<string, unknown>;
  if (typeof projectId !== 'string' || projectId.trim().length === 0) {
    sendJson(res, 400, { success: false, error: 'projectId is required' });
    return;
  }

  const effectiveRole = await checkProjectAccess(projectId, session.username, session.role);
  if (!effectiveRole) {
    sendJson(res, 404, { success: false, error: 'Project not found' });
    return;
  }

  const ip = getClientIp(req);
  const plan = await getDeployPlan(projectId, session.username, ip);
  if (!plan) {
    sendJson(res, 404, { success: false, error: 'Project not found' });
    return;
  }

  sendJson(res, 200, { success: true, data: plan });
});
