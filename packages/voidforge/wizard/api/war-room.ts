/**
 * War Room API — Alternative dashboard view using shared data parsers.
 *
 * v22.0 (ADR-041 M1): All routes use resolveProject() for project scoping.
 * Routes registered at /api/projects/:id/war-room/*.
 *
 * Shares all parsers and WebSocket infra with Danger Room via wizard/lib/dashboard-*.ts.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { addRoute } from '../router.js';
import { sendJson } from '../lib/http-helpers.js';
import { resolveProject, createProjectContext } from '../lib/project-scope.js';
import { getProjectsForUser } from '../lib/project-registry.js';
import {
  parseCampaignState,
  parseBuildState,
  parseFindings,
  readDeployLog,
  readVersion,
  readContextStats,
} from '../lib/dashboard-data.js';
import { createDashboardWs } from '../lib/dashboard-ws.js';

// ── WebSocket ───────────────────────────────────

const ws = createDashboardWs('War Room');

export const broadcastWarRoom = ws.broadcast;
export const closeWarRoom = ws.close;
export const handleWarRoomUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer, projectId?: string) =>
  ws.handleUpgrade(req, socket, head, projectId);

// ── Project-scoped REST endpoints ──────────────

addRoute('GET', '/api/projects/:id/war-room/campaign', async (req: IncomingMessage, res: ServerResponse) => {
  const resolved = await resolveProject(req, res);
  if (!resolved) return;
  sendJson(res, 200, await parseCampaignState(resolved.context.logsDir));
});

addRoute('GET', '/api/projects/:id/war-room/build', async (req: IncomingMessage, res: ServerResponse) => {
  const resolved = await resolveProject(req, res);
  if (!resolved) return;
  sendJson(res, 200, await parseBuildState(resolved.context.logsDir));
});

addRoute('GET', '/api/projects/:id/war-room/findings', async (req: IncomingMessage, res: ServerResponse) => {
  const resolved = await resolveProject(req, res);
  if (!resolved) return;
  sendJson(res, 200, await parseFindings(resolved.context.logsDir));
});

addRoute('GET', '/api/projects/:id/war-room/version', async (req: IncomingMessage, res: ServerResponse) => {
  const resolved = await resolveProject(req, res);
  if (!resolved) return;
  sendJson(res, 200, await readVersion(resolved.context.directory));
});

addRoute('GET', '/api/projects/:id/war-room/deploy', async (req: IncomingMessage, res: ServerResponse) => {
  const resolved = await resolveProject(req, res);
  if (!resolved) return;
  sendJson(res, 200, await readDeployLog(resolved.context.logsDir));
});

addRoute('GET', '/api/projects/:id/war-room/context', async (_req: IncomingMessage, res: ServerResponse) => {
  // Context stats are global (user-scoped Claude session)
  sendJson(res, 200, await readContextStats());
});

addRoute('GET', '/api/projects/:id/war-room/experiments', async (req: IncomingMessage, res: ServerResponse) => {
  const resolved = await resolveProject(req, res);
  if (!resolved) return;
  try {
    const { listExperiments } = await import('../lib/experiment.js');
    const experiments = await listExperiments();
    sendJson(res, 200, { experiments, total: experiments.length });
  } catch {
    sendJson(res, 200, { experiments: [], total: 0 });
  }
});

// ── Legacy backward-compat routes (v22.0.x P0-B) ────────

async function getDefaultContext() {
  const projects = await getProjectsForUser('local', 'admin');
  if (projects.length === 0) return null;
  return createProjectContext(projects[0]);
}

async function getLegacyContext(req: IncomingMessage) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const projectId = url.searchParams.get('project');
  if (projectId) {
    const { getProject } = await import('../lib/project-registry.js');
    const project = await getProject(projectId);
    if (project) return createProjectContext(project);
  }
  return getDefaultContext();
}

addRoute('GET', '/api/war-room/campaign', async (req: IncomingMessage, res: ServerResponse) => {
  const ctx = await getLegacyContext(req);
  sendJson(res, 200, ctx ? await parseCampaignState(ctx.logsDir) : null);
});

addRoute('GET', '/api/war-room/build', async (req: IncomingMessage, res: ServerResponse) => {
  const ctx = await getLegacyContext(req);
  sendJson(res, 200, ctx ? await parseBuildState(ctx.logsDir) : null);
});

addRoute('GET', '/api/war-room/findings', async (req: IncomingMessage, res: ServerResponse) => {
  const ctx = await getLegacyContext(req);
  sendJson(res, 200, ctx ? await parseFindings(ctx.logsDir) : null);
});

addRoute('GET', '/api/war-room/version', async (req: IncomingMessage, res: ServerResponse) => {
  const ctx = await getLegacyContext(req);
  sendJson(res, 200, ctx ? await readVersion(ctx.directory) : null);
});

addRoute('GET', '/api/war-room/deploy', async (req: IncomingMessage, res: ServerResponse) => {
  const ctx = await getLegacyContext(req);
  sendJson(res, 200, ctx ? await readDeployLog(ctx.logsDir) : null);
});

addRoute('GET', '/api/war-room/context', async (_req: IncomingMessage, res: ServerResponse) => {
  sendJson(res, 200, await readContextStats());
});

addRoute('GET', '/api/war-room/experiments', async (_req: IncomingMessage, res: ServerResponse) => {
  try {
    const { listExperiments } = await import('../lib/experiment.js');
    sendJson(res, 200, { experiments: await listExperiments(), total: (await listExperiments()).length });
  } catch { sendJson(res, 200, { experiments: [], total: 0 }); }
});
