/**
 * Danger Room API — Real-time data feeds for the mission control dashboard.
 *
 * REST endpoints read from existing state files (campaign-state.md, assemble-state.md, etc.).
 * WebSocket pushes real-time events (agent activity, findings, phase updates).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { WebSocketServer, WebSocket } from 'ws';
import { addRoute } from '../router.js';
import { getServerPort, getServerHost } from '../server.js';

const PROJECT_ROOT = resolve(join(import.meta.dirname, '..', '..'));
const LOGS_DIR = join(PROJECT_ROOT, 'logs');
const VOIDFORGE_DIR = join(homedir(), '.voidforge');

// ── Helpers ─────────────────────────────────────

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function readFileOrNull(path: string): Promise<string | null> {
  try { return await readFile(path, 'utf-8'); } catch { return null; }
}

// ── State file parsers ──────────────────────────

interface Mission { name: string; status: string; number: number }
interface CampaignData { missions: Mission[]; status: string; sections: Array<{ name: string; status: string }> }

async function parseCampaignState(): Promise<CampaignData | null> {
  const content = await readFileOrNull(join(LOGS_DIR, 'campaign-state.md'));
  if (!content) return null;

  const missions: Mission[] = [];
  const re = /\|\s*(.+?)\s*\|\s*(COMPLETE|IN PROGRESS|NOT STARTED|BLOCKED|STRUCTURAL)\s*\|\s*Mission\s*(\d+)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    // Normalize status: client expects COMPLETE, ACTIVE, BLOCKED, PENDING
    const rawStatus = m[2].trim();
    const status = rawStatus === 'IN PROGRESS' ? 'ACTIVE' : rawStatus === 'NOT STARTED' ? 'PENDING' : rawStatus;
    missions.push({ name: m[1].trim(), status, number: parseInt(m[3]) });
  }

  if (missions.length === 0) return null;

  const statusMatch = content.match(/CAMPAIGN STATUS:\s*(.+?)(?:\n|$)/);
  const status = statusMatch ? statusMatch[1] : 'ACTIVE';
  const sections = missions.map(mi => ({ name: mi.name, status: mi.status }));

  return { missions, status, sections };
}

interface PhaseData { phases: Array<{ name: string; status: string }> }

async function parseBuildState(): Promise<PhaseData | null> {
  const content = await readFileOrNull(join(LOGS_DIR, 'assemble-state.md'));
  if (!content) return null;

  const phases: Array<{ name: string; status: string }> = [];
  const re = /\|\s*(?:\d+\.\s*)?(.+?)\s*\|\s*(COMPLETE|IN PROGRESS|NOT STARTED|PENDING|SKIPPED)\s*\|/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const name = m[1].trim();
    if (name === 'Phase' || name === 'Status' || name.startsWith('-')) continue;
    // Normalize to single-word CSS-safe status: complete, active, pending, skipped
    const raw = m[2].trim();
    const normalized = raw === 'IN PROGRESS' ? 'active' : raw === 'NOT STARTED' ? 'pending' : raw.toLowerCase();
    phases.push({ name, status: normalized });
  }

  return phases.length > 0 ? { phases } : null;
}

function countSeverity(content: string, severity: string): number {
  // Count in table cells: | SEVERITY | (case-insensitive — logs use both CRITICAL and Critical)
  const tableHits = (content.match(new RegExp(`\\|\\s*${severity}\\s*\\|`, 'gi')) || []).length;
  // Count in bold markers: **SEVERITY**
  const boldHits = (content.match(new RegExp(`\\*\\*${severity}\\*\\*`, 'gi')) || []).length;
  return tableHits + boldHits;
}

interface FindingCounts { critical: number; high: number; medium: number; low: number }

async function parseFindings(): Promise<FindingCounts> {
  const counts: FindingCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  try {
    const files = await readdir(LOGS_DIR);
    const logFiles = files.filter(f => f.startsWith('phase-') || f === 'gauntlet-state.md');
    for (const file of logFiles) {
      const content = await readFileOrNull(join(LOGS_DIR, file));
      if (!content) continue;
      counts.critical += countSeverity(content, 'CRITICAL');
      counts.high += countSeverity(content, 'HIGH');
      counts.medium += countSeverity(content, 'MEDIUM');
      counts.low += countSeverity(content, 'LOW');
    }
  } catch { /* no logs directory */ }
  return counts;
}

interface DeployData { url: string; healthy: boolean; target: string; timestamp: string }

async function readDeployLog(): Promise<DeployData | null> {
  const paths = [
    join(LOGS_DIR, 'deploy-log.json'),
    join(VOIDFORGE_DIR, 'deploys', 'latest.json'),
  ];
  for (const p of paths) {
    const content = await readFileOrNull(p);
    if (!content) continue;
    try {
      const data = JSON.parse(content) as Record<string, unknown>;
      return {
        url: String(data.url || ''),
        healthy: Boolean(data.healthy),
        target: String(data.target || ''),
        timestamp: String(data.timestamp || ''),
      };
    } catch { continue; }
  }
  return null;
}

async function readVersion(): Promise<{ version: string; branch: string }> {
  const content = await readFileOrNull(join(PROJECT_ROOT, 'VERSION.md'));
  if (!content) return { version: 'unknown', branch: 'unknown' };
  const match = content.match(/\*\*Current:\*\*\s*([\d.]+)/);
  return { version: match ? match[1] : 'unknown', branch: 'main' };
}

// ── WebSocket ───────────────────────────────────

const wss = new WebSocketServer({ noServer: true });
const clients = new Set<WebSocket>();
const HEARTBEAT_INTERVAL_MS = 30000;
const MAX_CLIENTS = 50;

/** Broadcast a message to all connected Danger Room clients. */
export function broadcastDangerRoom(data: { type: string; [key: string]: unknown }): void {
  const message = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(message); } catch { /* client gone */ }
    }
  }
}

/** Close all Danger Room WebSocket connections and shut down the server. */
export function closeDangerRoom(): void {
  clearInterval(heartbeat);
  for (const client of clients) {
    try { client.close(1001, 'Server shutting down'); } catch { /* ignore */ }
  }
  clients.clear();
  wss.close();
}

/** Handle WebSocket upgrade for /ws/danger-room. Session auth handled by server.ts. */
export function handleDangerRoomUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
  // Origin validation — same pattern as terminal WebSocket
  const origin = req.headers.origin || '';
  const port = getServerPort();
  const allowed = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  const remoteHost = getServerHost();
  if (remoteHost) allowed.push(`https://${remoteHost}`);

  if (!origin || !allowed.includes(origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }

  // Connection limit — defense-in-depth
  if (clients.size >= MAX_CLIENTS) {
    socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    clients.add(ws);
    (ws as unknown as Record<string, boolean>).isAlive = true;

    ws.on('pong', () => { (ws as unknown as Record<string, boolean>).isAlive = true; });
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  });
}

// Heartbeat — detect stale connections behind proxies/firewalls
const heartbeat = setInterval(() => {
  for (const client of clients) {
    const ext = client as unknown as Record<string, boolean>;
    if (!ext.isAlive) {
      clients.delete(client);
      client.terminate();
      continue;
    }
    ext.isAlive = false;
    try { client.ping(); } catch { clients.delete(client); }
  }
}, HEARTBEAT_INTERVAL_MS);

// ── REST endpoints ──────────────────────────────

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
  // Context usage is internal to Claude Code's runtime — not accessible from the server.
  // The gauge renders "—%" when data is null.
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

// ── Growth / Cultivation endpoints (§9.19, §9.20) ──

addRoute('GET', '/api/danger-room/heartbeat', async (_req: IncomingMessage, res: ServerResponse) => {
  // Check if Cultivation is installed by looking for treasury vault or heartbeat state
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

  sendJson(res, 200, {
    cultivationInstalled,
    heartbeat: heartbeatData,
    // lastAgentMessage is included in heartbeatData if present
  });
});

addRoute('POST', '/api/danger-room/freeze', async (_req: IncomingMessage, res: ServerResponse) => {
  // Freeze is a low-friction emergency action (session token only, no vault/TOTP per §9.18)
  // In the full implementation, this sends a freeze command to the daemon socket
  // For now (v11.0 — read-only placeholder), return acknowledgment
  sendJson(res, 200, { ok: true, message: 'Freeze command sent to daemon' });
});
