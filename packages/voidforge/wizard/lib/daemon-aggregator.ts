/**
 * Daemon Aggregator — connects to per-project heartbeat daemons.
 *
 * The wizard server reads projects.json, connects to each project's
 * heartbeat socket, polls /status, and serves aggregated data to
 * the Danger Room dashboard.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readMarker } from './marker.js';

// ── Types ────────────────────────────────────────────────

export interface DaemonStatus {
  projectId: string;
  projectName: string;
  projectPath: string;
  online: boolean;
  lastBeat: string | null;
  uptime: number;
  jobs: JobStatus[];
  platforms: PlatformStatus[];
  spend: SpendSummary;
}

export interface JobStatus {
  name: string;
  lastRun: string | null;
  nextRun: string | null;
  status: 'idle' | 'running' | 'failed' | 'disabled';
  failureCount: number;
}

export interface PlatformStatus {
  name: string;
  tokenStatus: 'valid' | 'expiring' | 'expired' | 'missing';
  tokenExpiresAt: string | null;
}

export interface SpendSummary {
  todayCents: number;
  weekCents: number;
  monthCents: number;
  budgetCents: number;
  revenueCents: number;
}

export interface AggregatedStatus {
  projects: DaemonStatus[];
  totals: {
    totalSpendCents: number;
    totalRevenueCents: number;
    combinedRoas: number;
    onlineCount: number;
    offlineCount: number;
  };
  lastPoll: string;
}

// ── Project Discovery ────────────────────────────────────

interface RegistryProject {
  id: string;
  name: string;
  directory: string;
}

async function discoverCultivationProjects(): Promise<RegistryProject[]> {
  const { homedir } = await import('node:os');
  const registryPath = join(homedir(), '.voidforge', 'projects.json');
  if (!existsSync(registryPath)) return [];

  try {
    const raw = await readFile(registryPath, 'utf-8');
    const projects = JSON.parse(raw) as RegistryProject[];
    const cultivationProjects: RegistryProject[] = [];

    for (const project of projects) {
      if (!project.directory || !existsSync(project.directory)) continue;
      const marker = await readMarker(project.directory);
      if (marker && marker.extensions.includes('cultivation')) {
        cultivationProjects.push(project);
      }
    }

    return cultivationProjects;
  } catch {
    return [];
  }
}

// ── Socket Connection ────────────────────────────────────

async function pollDaemon(project: RegistryProject): Promise<DaemonStatus> {
  const socketPath = join(project.directory, 'cultivation', 'heartbeat.sock');
  const pidPath = join(project.directory, 'cultivation', 'heartbeat.pid');

  const offline: DaemonStatus = {
    projectId: project.id,
    projectName: project.name,
    projectPath: project.directory,
    online: false,
    lastBeat: null,
    uptime: 0,
    jobs: [],
    platforms: [],
    spend: { todayCents: 0, weekCents: 0, monthCents: 0, budgetCents: 0, revenueCents: 0 },
  };

  // Check if daemon is running
  if (!existsSync(pidPath)) return offline;

  try {
    const pid = parseInt(await readFile(pidPath, 'utf-8'), 10);
    // Check if process is alive
    process.kill(pid, 0);
  } catch {
    return offline; // Process not running
  }

  // Connect to Unix socket and poll /status
  if (!existsSync(socketPath)) return offline;

  try {
    const { default: net } = await import('node:net');
    const response = await new Promise<string>((resolve, reject) => {
      const socket = net.createConnection(socketPath, () => {
        socket.write('GET /status HTTP/1.0\r\n\r\n');
      });

      let data = '';
      socket.on('data', (chunk) => { data += chunk.toString(); });
      socket.on('end', () => resolve(data));
      socket.on('error', reject);
      socket.setTimeout(5000, () => {
        socket.destroy();
        reject(new Error('Socket timeout'));
      });
    });

    // Parse HTTP response body
    const bodyStart = response.indexOf('\r\n\r\n');
    if (bodyStart === -1) return offline;

    const body = response.slice(bodyStart + 4);
    const status = JSON.parse(body) as Omit<DaemonStatus, 'projectId' | 'projectName' | 'projectPath'>;

    return {
      ...status,
      projectId: project.id,
      projectName: project.name,
      projectPath: project.directory,
      online: true,
    };
  } catch {
    return offline;
  }
}

// ── Aggregator ───────────────────────────────────────────

export class DaemonAggregator {
  private projects: RegistryProject[] = [];
  private statuses: Map<string, DaemonStatus> = new Map();
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private pollIntervalMs: number;

  constructor(pollIntervalMs: number = 30000) {
    this.pollIntervalMs = pollIntervalMs;
  }

  async start(): Promise<void> {
    await this.refresh();
    this.pollInterval = setInterval(() => this.pollAll(), this.pollIntervalMs);
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  async refresh(): Promise<void> {
    this.projects = await discoverCultivationProjects();
    await this.pollAll();
  }

  private async pollAll(): Promise<void> {
    const results = await Promise.allSettled(
      this.projects.map(p => pollDaemon(p)),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        this.statuses.set(result.value.projectId, result.value);
      }
    }
  }

  getStatus(): AggregatedStatus {
    const projects = Array.from(this.statuses.values());

    let totalSpendCents = 0;
    let totalRevenueCents = 0;
    let onlineCount = 0;
    let offlineCount = 0;

    for (const p of projects) {
      totalSpendCents += p.spend.monthCents;
      totalRevenueCents += p.spend.revenueCents;
      if (p.online) onlineCount++;
      else offlineCount++;
    }

    const combinedRoas = totalSpendCents > 0
      ? totalRevenueCents / totalSpendCents
      : 0;

    return {
      projects,
      totals: {
        totalSpendCents,
        totalRevenueCents,
        combinedRoas,
        onlineCount,
        offlineCount,
      },
      lastPoll: new Date().toISOString(),
    };
  }

  getProjectStatus(projectId: string): DaemonStatus | undefined {
    return this.statuses.get(projectId);
  }

  /** Freeze all daemons or a specific project's daemon. */
  async freeze(projectId?: string): Promise<{ frozen: string[]; failed: string[] }> {
    const targets = projectId
      ? this.projects.filter(p => p.id === projectId)
      : this.projects;

    const frozen: string[] = [];
    const failed: string[] = [];

    for (const project of targets) {
      const pidPath = join(project.directory, 'cultivation', 'heartbeat.pid');
      try {
        if (existsSync(pidPath)) {
          const pid = parseInt(await readFile(pidPath, 'utf-8'), 10);
          process.kill(pid, 'SIGSTOP');
          frozen.push(project.name);
        }
      } catch {
        failed.push(project.name);
      }
    }

    return { frozen, failed };
  }

  /** Unfreeze all daemons or a specific project's daemon. */
  async unfreeze(projectId?: string): Promise<{ unfrozen: string[]; failed: string[] }> {
    const targets = projectId
      ? this.projects.filter(p => p.id === projectId)
      : this.projects;

    const unfrozen: string[] = [];
    const failed: string[] = [];

    for (const project of targets) {
      const pidPath = join(project.directory, 'cultivation', 'heartbeat.pid');
      try {
        if (existsSync(pidPath)) {
          const pid = parseInt(await readFile(pidPath, 'utf-8'), 10);
          process.kill(pid, 'SIGCONT');
          unfrozen.push(project.name);
        }
      } catch {
        failed.push(project.name);
      }
    }

    return { unfrozen, failed };
  }
}
