/**
 * Danger Room API — Real-time data feeds for the mission control dashboard.
 *
 * Shared parsers and WebSocket infra live in wizard/lib/dashboard-*.ts.
 * This file registers Danger Room routes and any Danger Room-specific endpoints
 * (heartbeat, freeze, Deep Current).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { addRoute } from '../router.js';
import { sendJson, readFileOrNull } from '../lib/http-helpers.js';
import {
  parseCampaignState,
  parseBuildState,
  parseFindings,
  readDeployLog,
  readVersion,
  PROJECT_ROOT,
} from '../lib/dashboard-data.js';
import { createDashboardWs } from '../lib/dashboard-ws.js';

// ── WebSocket ───────────────────────────────────

const ws = createDashboardWs('Danger Room');

/** Broadcast a message to all connected Danger Room clients. */
export const broadcastDangerRoom = ws.broadcast;

/** Close all Danger Room WebSocket connections and shut down the server. */
export const closeDangerRoom = ws.close;

/** Handle WebSocket upgrade for /ws/danger-room. */
export const handleDangerRoomUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) =>
  ws.handleUpgrade(req, socket, head);

// ── Shared REST endpoints ────────────────────────

addRoute('GET', '/api/danger-room/campaign', async (_req: IncomingMessage, res: ServerResponse) => {
  sendJson(res, 200, await parseCampaignState());
});

addRoute('GET', '/api/danger-room/build', async (_req: IncomingMessage, res: ServerResponse) => {
  sendJson(res, 200, await parseBuildState());
});

addRoute('GET', '/api/danger-room/findings', async (_req: IncomingMessage, res: ServerResponse) => {
  sendJson(res, 200, await parseFindings());
});

addRoute('GET', '/api/danger-room/version', async (_req: IncomingMessage, res: ServerResponse) => {
  sendJson(res, 200, await readVersion());
});

addRoute('GET', '/api/danger-room/deploy', async (_req: IncomingMessage, res: ServerResponse) => {
  sendJson(res, 200, await readDeployLog());
});

addRoute('GET', '/api/danger-room/context', async (_req: IncomingMessage, res: ServerResponse) => {
  // TODO(v13.0): Wire to Status Line bridge — read ~/.voidforge/context-stats-*.json
  sendJson(res, 200, null);
});

addRoute('GET', '/api/danger-room/experiments', async (_req: IncomingMessage, res: ServerResponse) => {
  try {
    const { listExperiments } = await import('../lib/experiment.js');
    const experiments = await listExperiments();
    sendJson(res, 200, { experiments, total: experiments.length });
  } catch {
    sendJson(res, 200, { experiments: [], total: 0 });
  }
});

// ── Danger Room-specific endpoints ───────────────

addRoute('GET', '/api/danger-room/heartbeat', async (_req: IncomingMessage, res: ServerResponse) => {
  const treasuryVaultPath = join(homedir(), '.voidforge', 'treasury', 'vault.enc');
  const heartbeatJsonPath = join(homedir(), '.voidforge', 'heartbeat.json');
  let cultivationInstalled = false;
  let heartbeatData = null;

  try {
    const { existsSync } = await import('node:fs');
    cultivationInstalled = existsSync(treasuryVaultPath);
    const raw = await readFileOrNull(heartbeatJsonPath);
    if (raw) heartbeatData = JSON.parse(raw);
  } catch { /* no heartbeat data */ }

  sendJson(res, 200, { cultivationInstalled, heartbeat: heartbeatData });
});

addRoute('POST', '/api/danger-room/freeze', async (_req: IncomingMessage, res: ServerResponse) => {
  sendJson(res, 200, { ok: true, message: 'Freeze command sent to daemon' });
});

// ── Deep Current endpoints (v12.x) ─────────────────

addRoute('GET', '/api/danger-room/current', async (_req: IncomingMessage, res: ServerResponse) => {
  const situationPath = join(PROJECT_ROOT, 'logs', 'deep-current', 'situation.json');
  const content = await readFileOrNull(situationPath);
  if (!content) {
    sendJson(res, 200, { initialized: false });
    return;
  }
  try {
    const situation = JSON.parse(content);
    const proposalsDir = join(PROJECT_ROOT, 'logs', 'deep-current', 'proposals');
    let latestProposal = null;
    try {
      const { existsSync } = await import('node:fs');
      if (existsSync(proposalsDir)) {
        const files = await readdir(proposalsDir);
        const mdFiles = files.filter(f => f.endsWith('.md')).sort().reverse();
        if (mdFiles.length > 0) {
          latestProposal = await readFileOrNull(join(proposalsDir, mdFiles[0]));
        }
      }
    } catch { /* no proposals dir */ }
    sendJson(res, 200, { initialized: true, situation, latestProposal });
  } catch {
    sendJson(res, 200, { initialized: false, error: 'Failed to parse situation model' });
  }
});
