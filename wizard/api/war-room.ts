/**
 * War Room API — Alternative dashboard view using shared data parsers.
 *
 * Shares all parsers and WebSocket infra with Danger Room via wizard/lib/dashboard-*.ts.
 * Routes are registered under /api/war-room/* for the war-room.html frontend.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { addRoute } from '../router.js';
import { sendJson } from '../lib/http-helpers.js';
import {
  parseCampaignState,
  parseBuildState,
  parseFindings,
  readDeployLog,
  readVersion,
} from '../lib/dashboard-data.js';
import { createDashboardWs } from '../lib/dashboard-ws.js';

// ── WebSocket ───────────────────────────────────

const ws = createDashboardWs('War Room');

export const broadcastWarRoom = ws.broadcast;
export const closeWarRoom = ws.close;
export const handleWarRoomUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) =>
  ws.handleUpgrade(req, socket, head);

// ── REST endpoints ──────────────────────────────

addRoute('GET', '/api/war-room/campaign', async (_req: IncomingMessage, res: ServerResponse) => {
  sendJson(res, 200, await parseCampaignState());
});

addRoute('GET', '/api/war-room/build', async (_req: IncomingMessage, res: ServerResponse) => {
  sendJson(res, 200, await parseBuildState());
});

addRoute('GET', '/api/war-room/findings', async (_req: IncomingMessage, res: ServerResponse) => {
  sendJson(res, 200, await parseFindings());
});

addRoute('GET', '/api/war-room/version', async (_req: IncomingMessage, res: ServerResponse) => {
  sendJson(res, 200, await readVersion());
});

addRoute('GET', '/api/war-room/deploy', async (_req: IncomingMessage, res: ServerResponse) => {
  sendJson(res, 200, await readDeployLog());
});

addRoute('GET', '/api/war-room/context', async (_req: IncomingMessage, res: ServerResponse) => {
  // TODO(v13.0): Wire to Status Line bridge — read ~/.voidforge/context-stats-*.json
  sendJson(res, 200, null);
});

addRoute('GET', '/api/war-room/experiments', async (_req: IncomingMessage, res: ServerResponse) => {
  try {
    const { listExperiments } = await import('../lib/experiment.js');
    const experiments = await listExperiments();
    sendJson(res, 200, { experiments, total: experiments.length });
  } catch {
    sendJson(res, 200, { experiments: [], total: 0 });
  }
});
