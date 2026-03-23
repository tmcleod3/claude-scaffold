/**
 * Danger Room API — Real-time data feeds for the mission control dashboard.
 *
 * Shared parsers and WebSocket infra live in wizard/lib/dashboard-*.ts.
 * This file registers Danger Room routes and any Danger Room-specific endpoints
 * (heartbeat, freeze, Deep Current).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { watch } from 'node:fs';
import { addRoute } from '../router.js';
import { sendJson, readFileOrNull } from '../lib/http-helpers.js';
import {
  parseCampaignState,
  parseBuildState,
  parseFindings,
  readDeployLog,
  readVersion,
  readContextStats,
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

// ── Agent Activity Watcher (methodology-driven JSONL) ──

const ACTIVITY_FILE = join(PROJECT_ROOT, 'logs', 'agent-activity.jsonl');
let lastActivitySize = 0;
let activityDebounce: ReturnType<typeof setTimeout> | null = null;

/** Read new lines from agent-activity.jsonl and broadcast via WebSocket. */
async function checkAgentActivity(): Promise<void> {
  try {
    const st = await stat(ACTIVITY_FILE);
    if (st.size <= lastActivitySize) return;

    const content = await readFile(ACTIVITY_FILE, 'utf-8');
    const lines = content.trim().split('\n');
    // Only process lines after our last known position
    const newLines = lastActivitySize === 0 ? lines.slice(-5) : lines.slice(-Math.max(1, lines.length - Math.floor(lastActivitySize / 80)));
    lastActivitySize = st.size;

    for (const line of newLines) {
      try {
        const entry = JSON.parse(line) as { agent?: string; task?: string; status?: string };
        if (entry.agent) {
          ws.broadcast({
            type: 'agent-activity',
            agent: entry.agent,
            action: entry.task || entry.status || 'dispatched',
          });
        }
      } catch { /* skip malformed lines */ }
    }
  } catch { /* file doesn't exist yet — normal before first agent dispatch */ }
}

// Hybrid approach: fs.watch for immediate + poll fallback (fs.watch is unreliable on some OSes)
try {
  const watcher = watch(ACTIVITY_FILE, { persistent: false }, () => {
    if (activityDebounce) clearTimeout(activityDebounce);
    activityDebounce = setTimeout(checkAgentActivity, 200); // debounce rapid writes
  });
  watcher.on('error', () => {}); // file may not exist yet
} catch { /* watch setup fails if file doesn't exist — poll handles it */ }

// Poll fallback — catches events fs.watch misses (every 3 seconds)
setInterval(checkAgentActivity, 3000);

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
  const stats = await readContextStats();
  sendJson(res, 200, stats);
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
