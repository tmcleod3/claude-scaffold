/**
 * Danger Room API — Real-time data feeds for the mission control dashboard.
 *
 * v22.0 (ADR-041 M1): All project-scoped routes use resolveProject() middleware.
 * Routes registered at /api/projects/:id/danger-room/* with param routing.
 *
 * Shared parsers and WebSocket infra live in wizard/lib/dashboard-*.ts.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { readdir, stat, open } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { watch, existsSync } from 'node:fs';
import { readHeartbeatSnapshot } from '../lib/treasury-reader.js';
import { addRoute } from '../router.js';
import { sendJson, readFileOrNull } from '../lib/http-helpers.js';
import { resolveProject, createProjectContext } from '../lib/project-scope.js';
import { TREASURY_DIR } from '../lib/financial-core.js';
import { getProjectsForUser } from '../lib/project-registry.js';
import { isRemoteMode, isLanMode } from '../lib/tower-auth.js';
import {
  parseCampaignState,
  parseBuildState,
  parseFindings,
  readDeployLog,
  readVersion,
  readContextStats,
  readTestResults,
  readGitStatus,
  detectDeployDrift,
} from '../lib/dashboard-data.js';
import { createDashboardWs } from '../lib/dashboard-ws.js';
import { DaemonAggregator } from '../lib/daemon-aggregator.js';

// ── WebSocket ───────────────────────────────────

const ws = createDashboardWs('Danger Room');

/** Aggregates daemon status across all projects for the dashboard. */
const aggregator = new DaemonAggregator(30_000);

/** Broadcast a message to all connected Danger Room clients. */
export const broadcastDangerRoom = ws.broadcast;

/** Start the daemon aggregator (call during dashboard setup). */
export function startDaemonAggregator(): void {
  aggregator.start();
}

/** Get aggregated daemon status for all projects. */
export function getDaemonStatus(): ReturnType<DaemonAggregator['getStatus']> {
  return aggregator.getStatus();
}

/** Close all Danger Room WebSocket connections, activity watcher, and shut down. */
export function closeDangerRoom(): void {
  ws.close();
  aggregator.stop();
  if (activityPollInterval) clearInterval(activityPollInterval);
  if (activityWatcher) { try { activityWatcher.close(); } catch { /* ignore */ } activityWatcher = null; }
  if (activityDebounce) clearTimeout(activityDebounce);
}

/** Handle WebSocket upgrade for /ws/danger-room. Accepts optional projectId for subscription filtering. */
export const handleDangerRoomUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer, projectId?: string) =>
  ws.handleUpgrade(req, socket, head, projectId);

// ── Agent Activity Watcher (global — wizard operational logs) ──
// This watches the wizard's own agent-activity.jsonl, not a user project's.
// Will be scoped per-project via subscription rooms in M5.

const VOIDFORGE_DIR = join(homedir(), '.voidforge');
let activityFile = join(process.cwd(), 'logs', 'agent-activity.jsonl');
// Try to find it relative to CWD (where the wizard was launched)
let lastActivitySize = 0;
let activityDebounce: ReturnType<typeof setTimeout> | null = null;
let activityCheckInProgress = false;

async function checkAgentActivity(): Promise<void> {
  if (activityCheckInProgress) return;
  activityCheckInProgress = true;
  try { await _checkAgentActivity(); } finally { activityCheckInProgress = false; }
}

async function _checkAgentActivity(): Promise<void> {
  try {
    const st = await stat(activityFile);
    if (st.size <= lastActivitySize) return;

    const fd = await open(activityFile, 'r');
    const buf = Buffer.alloc(st.size - lastActivitySize);
    await fd.read(buf, 0, buf.length, lastActivitySize);
    await fd.close();
    const newContent = buf.toString('utf-8');
    const newLines = newContent.trim().split('\n').filter(Boolean);
    lastActivitySize = st.size;

    for (const line of newLines) {
      try {
        const entry = JSON.parse(line) as { agent?: string; task?: string; status?: string };
        if (entry.agent) {
          const agent = String(entry.agent).slice(0, 50);
          const action = String(entry.task || entry.status || 'dispatched').slice(0, 200);
          ws.broadcast({ type: 'agent-activity', agent, action });
        }
      } catch { /* skip malformed lines */ }
    }
  } catch { /* file doesn't exist yet */ }
}

let activityWatcher: ReturnType<typeof watch> | null = null;

function setupActivityWatch(): void {
  if (activityWatcher) return;
  try {
    activityWatcher = watch(activityFile, { persistent: false }, () => {
      if (activityDebounce) clearTimeout(activityDebounce);
      activityDebounce = setTimeout(checkAgentActivity, 200);
    });
    activityWatcher.on('error', () => { activityWatcher = null; });
  } catch { /* file doesn't exist yet */ }
}

setupActivityWatch();

const activityPollInterval = setInterval(() => {
  if (!activityWatcher) setupActivityWatch();
  checkAgentActivity();
}, 3000);

// ── Project-scoped REST endpoints (/api/projects/:id/danger-room/*) ──

addRoute('GET', '/api/projects/:id/danger-room/campaign', async (req: IncomingMessage, res: ServerResponse) => {
  const resolved = await resolveProject(req, res);
  if (!resolved) return;
  sendJson(res, 200, await parseCampaignState(resolved.context.logsDir));
});

addRoute('GET', '/api/projects/:id/danger-room/build', async (req: IncomingMessage, res: ServerResponse) => {
  const resolved = await resolveProject(req, res);
  if (!resolved) return;
  sendJson(res, 200, await parseBuildState(resolved.context.logsDir));
});

addRoute('GET', '/api/projects/:id/danger-room/findings', async (req: IncomingMessage, res: ServerResponse) => {
  const resolved = await resolveProject(req, res);
  if (!resolved) return;
  sendJson(res, 200, await parseFindings(resolved.context.logsDir));
});

addRoute('GET', '/api/projects/:id/danger-room/version', async (req: IncomingMessage, res: ServerResponse) => {
  const resolved = await resolveProject(req, res);
  if (!resolved) return;
  sendJson(res, 200, await readVersion(resolved.context.directory));
});

addRoute('GET', '/api/projects/:id/danger-room/deploy', async (req: IncomingMessage, res: ServerResponse) => {
  const resolved = await resolveProject(req, res);
  if (!resolved) return;
  sendJson(res, 200, await readDeployLog(resolved.context.logsDir));
});

addRoute('GET', '/api/projects/:id/danger-room/context', async (_req: IncomingMessage, res: ServerResponse) => {
  // Context stats are global (user-scoped Claude session) — no project resolution needed
  sendJson(res, 200, await readContextStats());
});

addRoute('GET', '/api/projects/:id/danger-room/experiments', async (req: IncomingMessage, res: ServerResponse) => {
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

addRoute('GET', '/api/projects/:id/danger-room/tests', async (req: IncomingMessage, res: ServerResponse) => {
  const resolved = await resolveProject(req, res);
  if (!resolved) return;
  sendJson(res, 200, await readTestResults(resolved.context.directory, resolved.context.logsDir));
});

addRoute('GET', '/api/projects/:id/danger-room/git-status', async (req: IncomingMessage, res: ServerResponse) => {
  const resolved = await resolveProject(req, res);
  if (!resolved) return;
  sendJson(res, 200, await readGitStatus(resolved.context.directory));
});

addRoute('GET', '/api/projects/:id/danger-room/drift', async (req: IncomingMessage, res: ServerResponse) => {
  const resolved = await resolveProject(req, res);
  if (!resolved) return;
  sendJson(res, 200, await detectDeployDrift(resolved.context.logsDir, resolved.context.directory));
});

// ── Danger Room-specific endpoints ───────────────

addRoute('GET', '/api/projects/:id/danger-room/heartbeat', async (req: IncomingMessage, res: ServerResponse) => {
  const resolved = await resolveProject(req, res);
  if (!resolved) return;
  const ctx = resolved.context;
  // Financial vault check uses global treasury dir (vault stays user-scoped per ADR-040 §4)
  const vaultCheckPath = join(TREASURY_DIR, 'vault.enc');
  const snapshot = await readHeartbeatSnapshot(ctx.treasuryDir, ctx.stateFile, vaultCheckPath);
  sendJson(res, 200, snapshot);
});

addRoute('POST', '/api/projects/:id/danger-room/freeze', async (req: IncomingMessage, res: ServerResponse) => {
  const resolved = await resolveProject(req, res);
  if (!resolved) return;

  // Deployer+ required for freeze (safety-critical operation)
  if (resolved.role !== 'deployer' && resolved.role !== 'admin') {
    sendJson(res, 404, { success: false, error: 'Not found' });
    return;
  }

  const ctx = resolved.context;

  try {
    const net = await import('node:net');
    const { readFile: fsReadFile } = await import('node:fs/promises');

    if (!existsSync(ctx.socketPath)) {
      sendJson(res, 503, { ok: false, error: 'Heartbeat daemon not running. Start with: voidforge heartbeat start' });
      return;
    }

    let authToken = '';
    try {
      authToken = (await fsReadFile(ctx.tokenFile, 'utf-8')).trim();
    } catch {
      // No fallback to global token (v22.0.x P1-C — fragile trust model removed)
      sendJson(res, 503, { ok: false, error: 'Cannot read daemon auth token — heartbeat may not be configured for this project' });
      return;
    }

    const response = await new Promise<string>((resolve, reject) => {
      const socket = net.connect(ctx.socketPath);
      let data = '';
      socket.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      socket.on('end', () => resolve(data));
      socket.on('error', (err: Error) => reject(err));
      socket.setTimeout(5000, () => { socket.destroy(); reject(new Error('Daemon socket timeout')); });
      socket.write(`POST /freeze HTTP/1.0\r\nAuthorization: Bearer ${authToken}\r\nContent-Length: 0\r\n\r\n`);
    });

    const bodyStart = response.indexOf('\r\n\r\n');
    const body = bodyStart >= 0 ? response.slice(bodyStart + 4) : response;
    const parsed = JSON.parse(body) as { ok: boolean; message?: string };
    sendJson(res, parsed.ok ? 200 : 500, parsed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to contact daemon';
    sendJson(res, 503, { ok: false, error: `Daemon communication failed: ${message}` });
  }
});

// ── Deep Current endpoints ─────────────────

addRoute('GET', '/api/projects/:id/danger-room/current', async (req: IncomingMessage, res: ServerResponse) => {
  const resolved = await resolveProject(req, res);
  if (!resolved) return;
  const logsDir = resolved.context.logsDir;
  const situationPath = join(logsDir, 'deep-current', 'situation.json');
  const content = await readFileOrNull(situationPath);
  if (!content) {
    sendJson(res, 200, { initialized: false });
    return;
  }
  try {
    const situation = JSON.parse(content);
    const proposalsDir = join(logsDir, 'deep-current', 'proposals');
    let latestProposal = null;
    try {
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

// ── Legacy backward-compat routes (v22.0.x P0-B) ────────
// Old danger-room.js/war-room.js UI files fetch from /api/danger-room/*
// These shim routes use ?project=<id> or the first registered project.
// v22.2 M3: Deprecated — sunset 2026-07-01, removed in v23.0.

/** Set deprecation headers on legacy route responses (v22.2 M3). */
function setDeprecationHeaders(res: ServerResponse, newPath: string): void {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', 'Wed, 01 Jul 2026 00:00:00 GMT');
  res.setHeader('Link', `<${newPath}>; rel="successor-version"`);
}

async function getDefaultContext() {
  const projects = await getProjectsForUser('local', 'admin');
  if (projects.length === 0) return null;
  return createProjectContext(projects[0]);
}

async function getLegacyContext(req: IncomingMessage, res: ServerResponse): Promise<ReturnType<typeof createProjectContext> | null> {
  // SEC-014 fix: block legacy routes in remote/LAN mode (no auth on these routes)
  if (isRemoteMode() || isLanMode()) {
    sendJson(res, 404, { success: false, error: 'Use /api/projects/:id/danger-room/* endpoints' });
    return null;
  }
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const projectId = url.searchParams.get('project');
  if (projectId) {
    const { getProject } = await import('../lib/project-registry.js');
    const project = await getProject(projectId);
    if (project) return createProjectContext(project);
  }
  return getDefaultContext();
}

addRoute('GET', '/api/danger-room/campaign', async (req: IncomingMessage, res: ServerResponse) => {
  setDeprecationHeaders(res, '/api/projects/:id/danger-room/campaign');
  const ctx = await getLegacyContext(req, res);
  if (!ctx) return;
  sendJson(res, 200, await parseCampaignState(ctx.logsDir));
});

addRoute('GET', '/api/danger-room/build', async (req: IncomingMessage, res: ServerResponse) => {
  setDeprecationHeaders(res, '/api/projects/:id/danger-room/build');
  const ctx = await getLegacyContext(req, res);
  if (!ctx) return;
  sendJson(res, 200, await parseBuildState(ctx.logsDir));
});

addRoute('GET', '/api/danger-room/findings', async (req: IncomingMessage, res: ServerResponse) => {
  setDeprecationHeaders(res, '/api/projects/:id/danger-room/findings');
  const ctx = await getLegacyContext(req, res);
  if (!ctx) return;
  sendJson(res, 200, await parseFindings(ctx.logsDir));
});

addRoute('GET', '/api/danger-room/version', async (req: IncomingMessage, res: ServerResponse) => {
  setDeprecationHeaders(res, '/api/projects/:id/danger-room/version');
  const ctx = await getLegacyContext(req, res);
  if (!ctx) return;
  sendJson(res, 200, await readVersion(ctx.directory));
});

addRoute('GET', '/api/danger-room/deploy', async (req: IncomingMessage, res: ServerResponse) => {
  setDeprecationHeaders(res, '/api/projects/:id/danger-room/deploy');
  const ctx = await getLegacyContext(req, res);
  if (!ctx) return;
  sendJson(res, 200, await readDeployLog(ctx.logsDir));
});

addRoute('GET', '/api/danger-room/context', async (req: IncomingMessage, res: ServerResponse) => {
  setDeprecationHeaders(res, '/api/projects/:id/danger-room/context');
  // SEC-014: gate on local-only mode
  if (isRemoteMode() || isLanMode()) { sendJson(res, 404, { success: false, error: 'Use project-scoped endpoints' }); return; }
  sendJson(res, 200, await readContextStats());
});

addRoute('GET', '/api/danger-room/experiments', async (req: IncomingMessage, res: ServerResponse) => {
  setDeprecationHeaders(res, '/api/projects/:id/danger-room/experiments');
  if (isRemoteMode() || isLanMode()) { sendJson(res, 404, { success: false, error: 'Use project-scoped endpoints' }); return; }
  try {
    const { listExperiments } = await import('../lib/experiment.js');
    const experiments = await listExperiments();
    sendJson(res, 200, { experiments, total: experiments.length });
  } catch { sendJson(res, 200, { experiments: [], total: 0 }); }
});

addRoute('GET', '/api/danger-room/tests', async (req: IncomingMessage, res: ServerResponse) => {
  setDeprecationHeaders(res, '/api/projects/:id/danger-room/tests');
  const ctx = await getLegacyContext(req, res);
  if (!ctx) return;
  sendJson(res, 200, await readTestResults(ctx.directory, ctx.logsDir));
});

addRoute('GET', '/api/danger-room/git-status', async (req: IncomingMessage, res: ServerResponse) => {
  setDeprecationHeaders(res, '/api/projects/:id/danger-room/git-status');
  const ctx = await getLegacyContext(req, res);
  if (!ctx) return;
  sendJson(res, 200, await readGitStatus(ctx.directory));
});

addRoute('GET', '/api/danger-room/drift', async (req: IncomingMessage, res: ServerResponse) => {
  setDeprecationHeaders(res, '/api/projects/:id/danger-room/drift');
  const ctx = await getLegacyContext(req, res);
  if (!ctx) return;
  sendJson(res, 200, await detectDeployDrift(ctx.logsDir, ctx.directory));
});

addRoute('GET', '/api/danger-room/heartbeat', async (req: IncomingMessage, res: ServerResponse) => {
  setDeprecationHeaders(res, '/api/projects/:id/danger-room/heartbeat');
  const ctx = await getLegacyContext(req, res);
  if (!ctx) return;
  const vaultCheckPath = join(TREASURY_DIR, 'vault.enc');
  sendJson(res, 200, await readHeartbeatSnapshot(ctx.treasuryDir, ctx.stateFile, vaultCheckPath));
});

addRoute('GET', '/api/danger-room/current', async (req: IncomingMessage, res: ServerResponse) => {
  setDeprecationHeaders(res, '/api/projects/:id/danger-room/current');
  const ctx = await getLegacyContext(req, res);
  if (!ctx) return;
  const situationPath = join(ctx.logsDir, 'deep-current', 'situation.json');
  const content = await readFileOrNull(situationPath);
  if (!content) { sendJson(res, 200, { initialized: false }); return; }
  try {
    const situation = JSON.parse(content);
    sendJson(res, 200, { initialized: true, situation, latestProposal: null });
  } catch { sendJson(res, 200, { initialized: false }); }
});
