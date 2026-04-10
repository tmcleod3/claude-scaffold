/**
 * Projects API — dashboard data, costs, portfolio, lessons, linked services.
 * Split from projects.ts for file size (v23.3).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { addRoute } from '../router.js';
import { parseJsonBody } from '../lib/body-parser.js';
import {
  getProjectsForUser,
  checkProjectAccess,
  linkProjects,
  unlinkProjects,
  getLinkedGroup,
} from '../lib/project-registry.js';
import { getDeployPlan } from '../lib/deploy-coordinator.js';
import { getAggregateCosts } from '../lib/cost-tracker.js';
import { readTreasurySummary, type TreasurySummary } from '../lib/treasury-reader.js';
import { createProjectContext } from '../lib/project-scope.js';
import { audit } from '../lib/audit-log.js';
import { validateSession, parseSessionCookie, getClientIp, isRemoteMode } from '../lib/tower-auth.js';
import { type SessionInfo } from '../lib/user-manager.js';
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

// ── Cost + Portfolio endpoints ──────────────────────

// GET /api/projects/costs — aggregate costs across accessible projects
addRoute('GET', '/api/projects/costs', async (req: IncomingMessage, res: ServerResponse) => {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { success: false, error: 'Authentication required' });
    return;
  }

  const costs = await getAggregateCosts(session.username, session.role);
  sendJson(res, 200, { success: true, data: costs });
});

// GET /api/projects/portfolio — per-project financial breakdown (v22.2 M2)
addRoute('GET', '/api/projects/portfolio', async (req: IncomingMessage, res: ServerResponse) => {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { success: false, error: 'Authentication required' });
    return;
  }

  const projects = await getProjectsForUser(session.username, session.role);

  // Concurrent reads — each project's treasury summary is independent (ARCH-001 fix)
  const results = await Promise.allSettled(
    projects.map(async (project) => {
      const ctx = createProjectContext(project);
      const treasury = await readTreasurySummary(ctx.treasuryDir);
      return { projectId: project.id, projectName: project.name, treasury };
    }),
  );

  const portfolio: Array<{ projectId: string; projectName: string; treasury: TreasurySummary }> = [];
  let totalSpend = 0;
  let totalRevenue = 0;

  for (const result of results) {
    if (result.status === 'fulfilled') {
      portfolio.push(result.value);
      totalSpend += result.value.treasury.spend;
      totalRevenue += result.value.treasury.revenue;
    }
  }

  const combinedRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  sendJson(res, 200, {
    success: true,
    data: {
      projects: portfolio,
      totals: {
        totalSpendCents: totalSpend,
        totalRevenueCents: totalRevenue,
        combinedRoas,
        projectCount: portfolio.length,
      },
    },
  });
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
