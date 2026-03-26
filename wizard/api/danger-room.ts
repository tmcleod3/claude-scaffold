/**
 * Danger Room API — Real-time data feeds for the mission control dashboard.
 *
 * Shared parsers and WebSocket infra live in wizard/lib/dashboard-*.ts.
 * This file registers Danger Room routes and any Danger Room-specific endpoints
 * (heartbeat, freeze, Deep Current).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { readFile, readdir, stat, open } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { watch, existsSync } from 'node:fs';
import { addRoute } from '../router.js';
import { sendJson, readFileOrNull } from '../lib/http-helpers.js';
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
  PROJECT_ROOT,
} from '../lib/dashboard-data.js';
import { createDashboardWs } from '../lib/dashboard-ws.js';

// ── WebSocket ───────────────────────────────────

const ws = createDashboardWs('Danger Room');

/** Broadcast a message to all connected Danger Room clients. */
export const broadcastDangerRoom = ws.broadcast;

/** Close all Danger Room WebSocket connections, activity watcher, and shut down. */
export function closeDangerRoom(): void {
  ws.close();
  // Clean up activity watcher resources (Infinity Gauntlet ARCH-002)
  if (activityPollInterval) clearInterval(activityPollInterval);
  if (activityWatcher) { try { activityWatcher.close(); } catch { /* ignore */ } activityWatcher = null; }
  if (activityDebounce) clearTimeout(activityDebounce);
}

/** Handle WebSocket upgrade for /ws/danger-room. */
export const handleDangerRoomUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) =>
  ws.handleUpgrade(req, socket, head);

// ── Agent Activity Watcher (methodology-driven JSONL) ──

const ACTIVITY_FILE = join(PROJECT_ROOT, 'logs', 'agent-activity.jsonl');
let lastActivitySize = 0;
let activityDebounce: ReturnType<typeof setTimeout> | null = null;
let activityCheckInProgress = false;

/** Read new lines from agent-activity.jsonl and broadcast via WebSocket. */
async function checkAgentActivity(): Promise<void> {
  if (activityCheckInProgress) return; // prevent concurrent reads (Gauntlet DR-08)
  activityCheckInProgress = true;
  try { await _checkAgentActivity(); } finally { activityCheckInProgress = false; }
}

async function _checkAgentActivity(): Promise<void> {
  try {
    const st = await stat(ACTIVITY_FILE);
    if (st.size <= lastActivitySize) return;

    // Read only the new bytes appended since last check (Gauntlet DR-05: no line estimation)
    const fd = await open(ACTIVITY_FILE, 'r');
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
          // Server-side sanitization: cap field lengths (Gauntlet Kenobi DR-05)
          const agent = String(entry.agent).slice(0, 50);
          const action = String(entry.task || entry.status || 'dispatched').slice(0, 200);
          ws.broadcast({ type: 'agent-activity', agent, action });
        }
      } catch { /* skip malformed lines */ }
    }
  } catch { /* file doesn't exist yet — normal before first agent dispatch */ }
}

// Hybrid approach: fs.watch for immediate + poll fallback (fs.watch is unreliable on some OSes)
let activityWatcher: ReturnType<typeof watch> | null = null;

function setupActivityWatch(): void {
  if (activityWatcher) return;
  try {
    activityWatcher = watch(ACTIVITY_FILE, { persistent: false }, () => {
      if (activityDebounce) clearTimeout(activityDebounce);
      activityDebounce = setTimeout(checkAgentActivity, 200);
    });
    activityWatcher.on('error', () => { activityWatcher = null; }); // re-establish on next poll
  } catch { /* file doesn't exist yet — poll will re-try */ }
}

setupActivityWatch();

// Poll fallback — catches events fs.watch misses AND re-establishes watch if file appeared (DR-06)
const activityPollInterval = setInterval(() => {
  if (!activityWatcher) setupActivityWatch();
  checkAgentActivity();
}, 3000);

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

addRoute('GET', '/api/danger-room/tests', async (_req: IncomingMessage, res: ServerResponse) => {
  sendJson(res, 200, await readTestResults());
});

addRoute('GET', '/api/danger-room/git-status', async (_req: IncomingMessage, res: ServerResponse) => {
  sendJson(res, 200, await readGitStatus());
});

addRoute('GET', '/api/danger-room/drift', async (_req: IncomingMessage, res: ServerResponse) => {
  sendJson(res, 200, await detectDeployDrift());
});

// ── Danger Room-specific endpoints ───────────────

addRoute('GET', '/api/danger-room/heartbeat', async (_req: IncomingMessage, res: ServerResponse) => {
  const voidforgeDir = join(homedir(), '.voidforge');
  const treasuryDir = join(voidforgeDir, 'treasury');
  const treasuryVaultPath = join(treasuryDir, 'vault.enc');
  const heartbeatJsonPath = join(voidforgeDir, 'heartbeat.json');
  let cultivationInstalled = false;
  let heartbeatData = null;
  let campaigns: unknown[] = [];
  let treasury: {
    revenue: number; spend: number; net: number; roas: number; budgetRemaining: number;
    stablecoinBalance: number | null; pendingOfframps: number;
    bankAvailable: number | null; bankReserved: number | null;
    runwayDays: number | null; fundingState: string | null;
    nextTreasuryEvent: string | null; unsettledInvoices: number;
    reconciliationStatus: string | null;
  } = {
    revenue: 0, spend: 0, net: 0, roas: 0, budgetRemaining: 0,
    stablecoinBalance: null, pendingOfframps: 0,
    bankAvailable: null, bankReserved: null,
    runwayDays: null, fundingState: null,
    nextTreasuryEvent: null, unsettledInvoices: 0,
    reconciliationStatus: null,
  };

  try {
    // existsSync imported statically at top (Infinity Gauntlet ARCH-009)
    cultivationInstalled = existsSync(treasuryVaultPath);
    const raw = await readFileOrNull(heartbeatJsonPath);
    if (raw) heartbeatData = JSON.parse(raw);
  } catch { /* no heartbeat data */ }

  // Read campaigns from treasury/campaigns directory (mirrors heartbeat.ts readCampaigns)
  try {
    const campaignsDir = join(treasuryDir, 'campaigns');
    if (existsSync(campaignsDir)) {
      const files = await readdir(campaignsDir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const content = await readFile(join(campaignsDir, file), 'utf-8');
          campaigns.push(JSON.parse(content));
        } catch { /* skip malformed campaign files */ }
      }
    }
  } catch { /* no campaigns directory */ }

  // Read treasury summary from spend/revenue logs (mirrors heartbeat.ts readTreasurySummary)
  try {
    const spendLog = join(treasuryDir, 'spend-log.jsonl');
    const revenueLog = join(treasuryDir, 'revenue-log.jsonl');
    let totalSpendCents = 0;
    let totalRevenueCents = 0;

    if (existsSync(spendLog)) {
      const lines = (await readFile(spendLog, 'utf-8')).trim().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as { amountCents?: number };
          // Clamp negative values — spend should never be negative
          totalSpendCents += Math.max(0, entry.amountCents ?? 0);
        } catch { /* skip malformed lines */ }
      }
    }

    if (existsSync(revenueLog)) {
      const lines = (await readFile(revenueLog, 'utf-8')).trim().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as { amountCents?: number };
          totalRevenueCents += entry.amountCents ?? 0;
        } catch { /* skip malformed lines */ }
      }
    }

    const net = totalRevenueCents - totalSpendCents;
    const roas = totalSpendCents > 0 ? totalRevenueCents / totalSpendCents : 0;

    // Read budget if available
    let budgetRemaining = 0;
    const budgetsFile = join(treasuryDir, 'budgets.json');
    if (existsSync(budgetsFile)) {
      try {
        const budgetData = JSON.parse(await readFile(budgetsFile, 'utf-8')) as { totalBudgetCents?: number };
        budgetRemaining = (budgetData.totalBudgetCents ?? 0) - totalSpendCents;
      } catch { /* skip malformed budgets */ }
    }

    // ── Stablecoin funding data (v19.0 — read from treasury JSONL logs) ──
    let stablecoinBalance: number | null = null;
    let pendingOfframps = 0;
    let bankAvailable: number | null = null;
    let bankReserved: number | null = null;
    let runwayDays: number | null = null;
    let fundingState: string | null = null;
    let nextTreasuryEvent: string | null = null;
    let unsettledInvoices = 0;
    let reconciliationStatus: string | null = null;

    // Read funding config for stablecoin balance and bank state
    const fundingConfigPath = join(treasuryDir, 'funding-config.json.enc');
    if (existsSync(fundingConfigPath)) {
      // If funding config exists, try to read bank and stablecoin state from heartbeat data
      // (heartbeat.json is the live state written by the daemon; funding-config is encrypted)
      if (heartbeatData) {
        const hb = heartbeatData as Record<string, unknown>;
        if (typeof hb.stablecoinBalanceCents === 'number') stablecoinBalance = hb.stablecoinBalanceCents;
        if (typeof hb.bankAvailableCents === 'number') bankAvailable = hb.bankAvailableCents;
        if (typeof hb.bankReservedCents === 'number') bankReserved = hb.bankReservedCents;
        if (typeof hb.runwayDays === 'number') runwayDays = hb.runwayDays;
        if (typeof hb.fundingState === 'string') fundingState = hb.fundingState;
        if (typeof hb.nextTreasuryEvent === 'string') nextTreasuryEvent = hb.nextTreasuryEvent;
      }
    }

    // Read funding plans for pending off-ramps and unsettled invoices
    const fundingPlansLog = join(treasuryDir, 'funding-plans.jsonl');
    if (existsSync(fundingPlansLog)) {
      try {
        const lines = (await readFile(fundingPlansLog, 'utf-8')).trim().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const plan = JSON.parse(line) as { status?: string };
            if (plan.status === 'PENDING_SETTLEMENT' || plan.status === 'APPROVED') {
              unsettledInvoices++;
            }
          } catch { /* skip malformed lines */ }
        }
      } catch { /* skip read errors */ }
    }

    // Read transfers for pending off-ramp count
    const transfersLog = join(treasuryDir, 'transfers.jsonl');
    if (existsSync(transfersLog)) {
      try {
        const lines = (await readFile(transfersLog, 'utf-8')).trim().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const transfer = JSON.parse(line) as { status?: string; direction?: string };
            if ((transfer.status === 'pending' || transfer.status === 'processing')
                && transfer.direction === 'crypto_to_fiat') {
              pendingOfframps++;
            }
          } catch { /* skip malformed lines */ }
        }
      } catch { /* skip read errors */ }
    }

    // Read latest reconciliation status
    const reconciliationLog = join(treasuryDir, 'reconciliation.jsonl');
    if (existsSync(reconciliationLog)) {
      try {
        const lines = (await readFile(reconciliationLog, 'utf-8')).trim().split('\n').filter(Boolean);
        if (lines.length > 0) {
          // Use last reconciliation entry as current status
          const last = JSON.parse(lines[lines.length - 1]) as { result?: string };
          if (last.result === 'MATCHED' || last.result === 'WITHIN_THRESHOLD') {
            reconciliationStatus = 'matched';
          } else if (last.result === 'MISMATCH') {
            reconciliationStatus = 'mismatch';
          }
        }
      } catch { /* skip read errors */ }
    }

    // Calculate funding state from data if not provided by heartbeat daemon
    if (fundingState === null && (stablecoinBalance !== null || bankAvailable !== null)) {
      if (runwayDays !== null && runwayDays < 3) fundingState = 'frozen';
      else if (runwayDays !== null && runwayDays < 7) fundingState = 'degraded';
      else fundingState = 'healthy';
    }

    treasury = {
      revenue: totalRevenueCents, spend: totalSpendCents, net, roas, budgetRemaining,
      stablecoinBalance, pendingOfframps,
      bankAvailable, bankReserved,
      runwayDays, fundingState,
      nextTreasuryEvent, unsettledInvoices,
      reconciliationStatus,
    };
  } catch { /* no treasury data */ }

  sendJson(res, 200, { cultivationInstalled, heartbeat: heartbeatData, campaigns, treasury });
});

addRoute('POST', '/api/danger-room/freeze', async (_req: IncomingMessage, res: ServerResponse) => {
  // RBAC enforced by ROUTE_ROLES in server.ts (deployer+ required).
  // Previous implementation checked client-supplied X-VoidForge-Role header (SEC-R1-001 — privilege escalation).
  // v18.0: Removed client-header check. Session-based role verification happens in server middleware.

  // v17.0: Wire to daemon Unix socket with auth token.
  try {
    const net = await import('node:net');
    const { readFile: fsReadFile } = await import('node:fs/promises');
    const { SOCKET_PATH, TOKEN_FILE } = await import('../lib/daemon-core.js');
    const { existsSync } = await import('node:fs');

    if (!existsSync(SOCKET_PATH)) {
      sendJson(res, 503, { ok: false, error: 'Heartbeat daemon not running. Start with: voidforge heartbeat start' });
      return;
    }

    // Read auth token from TOKEN_FILE
    let authToken = '';
    try {
      authToken = (await fsReadFile(TOKEN_FILE, 'utf-8')).trim();
    } catch {
      sendJson(res, 503, { ok: false, error: 'Cannot read daemon auth token — heartbeat may not be running' });
      return;
    }

    const response = await new Promise<string>((resolve, reject) => {
      const socket = net.connect(SOCKET_PATH);
      let data = '';
      socket.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      socket.on('end', () => resolve(data));
      socket.on('error', (err: Error) => reject(err));
      socket.setTimeout(5000, () => { socket.destroy(); reject(new Error('Daemon socket timeout')); });
      socket.write(`POST /freeze HTTP/1.0\r\nAuthorization: Bearer ${authToken}\r\nContent-Length: 0\r\n\r\n`);
    });

    // Parse daemon response — expects JSON body after HTTP headers
    const bodyStart = response.indexOf('\r\n\r\n');
    const body = bodyStart >= 0 ? response.slice(bodyStart + 4) : response;
    const parsed = JSON.parse(body) as { ok: boolean; message?: string };
    sendJson(res, parsed.ok ? 200 : 500, parsed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to contact daemon';
    sendJson(res, 503, { ok: false, error: `Daemon communication failed: ${message}` });
  }
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
      // existsSync imported statically at top (Infinity Gauntlet ARCH-009)
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
