/**
 * Projects API — listing, access management, lessons.
 * Split from projects.ts for file size (v23.3).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { addRoute } from '../router.js';
import { parseJsonBody } from '../lib/body-parser.js';
import {
  getProjectsForUser,
  grantAccess,
  revokeAccess,
  getProjectAccess,
  checkProjectAccess,
} from '../lib/project-registry.js';
import { addLesson, getLessons, getLessonCount, type LessonInput } from '../lib/agent-memory.js';
import { audit } from '../lib/audit-log.js';
import { validateSession, parseSessionCookie, getClientIp, isRemoteMode } from '../lib/tower-auth.js';
import { isValidRole, hasRole, type SessionInfo } from '../lib/user-manager.js';
import { sendJson } from '../lib/http-helpers.js';

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

// ── Lessons endpoints ──────────────────────────────

// GET /api/projects/lessons — get lessons (optionally filtered by framework)
addRoute('GET', '/api/projects/lessons', async (req: IncomingMessage, res: ServerResponse) => {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { success: false, error: 'Authentication required' });
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const framework = url.searchParams.get('framework') || undefined;
  const category = url.searchParams.get('category') || undefined;

  const lessons = await getLessons({ framework, category });
  const count = await getLessonCount();
  sendJson(res, 200, { success: true, data: { lessons, total: count } });
});

// POST /api/projects/lessons — add a lesson (deployer+)
addRoute('POST', '/api/projects/lessons', async (req: IncomingMessage, res: ServerResponse) => {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { success: false, error: 'Authentication required' });
    return;
  }

  // Deployer minimum to write lessons
  if (!hasRole(session, 'deployer')) {
    sendJson(res, 404, { success: false, error: 'Not found' });
    return;
  }

  const body = await parseJsonBody(req);
  if (typeof body !== 'object' || body === null) {
    sendJson(res, 400, { success: false, error: 'Request body must be a JSON object' });
    return;
  }

  const { framework, category, lesson, action, project, agent } = body as Record<string, unknown>;
  if (typeof framework !== 'string' || typeof category !== 'string' ||
      typeof lesson !== 'string' || typeof action !== 'string' ||
      typeof project !== 'string' || typeof agent !== 'string') {
    sendJson(res, 400, { success: false, error: 'framework, category, lesson, action, project, and agent are required strings' });
    return;
  }

  // Cap field lengths
  if (lesson.length > 1000 || action.length > 500) {
    sendJson(res, 400, { success: false, error: 'lesson max 1000 chars, action max 500 chars' });
    return;
  }

  const input: LessonInput = {
    framework: framework.slice(0, 50),
    category: category.slice(0, 50),
    lesson: lesson.slice(0, 1000),
    action: action.slice(0, 500),
    project: project.slice(0, 100),
    agent: agent.slice(0, 50),
  };

  const created = await addLesson(input);
  const ip = getClientIp(req);
  await audit('project_create', ip, session.username, { action: 'add_lesson', framework: input.framework, category: input.category });
  sendJson(res, 201, { success: true, data: created });
});
