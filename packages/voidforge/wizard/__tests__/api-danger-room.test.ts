/**
 * Danger Room API tests — real-time dashboard data feeds.
 * Tests route handlers registered in api/danger-room.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

// ── Capture route handlers ────────────────────────────────
const registeredRoutes = new Map<string, (req: IncomingMessage, res: ServerResponse) => Promise<void>>();

vi.mock('../router.js', () => ({
  addRoute: (method: string, path: string, handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>) => {
    registeredRoutes.set(`${method} ${path}`, handler);
  },
}));

vi.mock('../lib/http-helpers.js', () => ({
  sendJson: vi.fn(),
  readFileOrNull: vi.fn(() => null),
}));

vi.mock('../lib/project-scope.js', () => ({
  resolveProject: vi.fn(),
  createProjectContext: vi.fn((project: Record<string, unknown>) => ({
    ...project,
    logsDir: '/tmp/logs',
    directory: '/tmp/project',
    treasuryDir: '/tmp/treasury',
    stateFile: '/tmp/state.json',
    socketPath: '/tmp/heartbeat.sock',
    tokenFile: '/tmp/heartbeat.token',
  })),
}));

vi.mock('../lib/project-registry.js', () => ({
  getProjectsForUser: vi.fn(() => [
    { id: 'p1', name: 'Test', directory: '/tmp/project', owner: 'local', access: [] },
  ]),
  getProject: vi.fn(),
}));

vi.mock('../lib/tower-auth.js', () => ({
  isRemoteMode: vi.fn(() => false),
  isLanMode: vi.fn(() => false),
}));

vi.mock('../lib/dashboard-data.js', () => ({
  parseCampaignState: vi.fn(() => ({ missions: [], active: null })),
  parseBuildState: vi.fn(() => ({ phase: 0, status: 'not started' })),
  parseFindings: vi.fn(() => ({ findings: [], total: 0 })),
  readDeployLog: vi.fn(() => ({ deploys: [] })),
  readVersion: vi.fn(() => ({ version: '1.0.0' })),
  readContextStats: vi.fn(() => ({ usage: 0, limit: 1000000 })),
  readTestResults: vi.fn(() => ({ tests: [], passed: 0, failed: 0 })),
  readGitStatus: vi.fn(() => ({ branch: 'main', clean: true })),
  detectDeployDrift: vi.fn(() => ({ drifted: false })),
}));

vi.mock('../lib/dashboard-ws.js', () => ({
  createDashboardWs: vi.fn(() => ({
    broadcast: vi.fn(),
    close: vi.fn(),
    handleUpgrade: vi.fn(),
  })),
}));

vi.mock('../lib/daemon-aggregator.js', () => ({
  DaemonAggregator: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    getStatus: vi.fn(() => ({})),
  })),
}));

vi.mock('../lib/treasury-reader.js', () => ({
  readHeartbeatSnapshot: vi.fn(() => ({ healthy: true })),
}));

vi.mock('../lib/financial-core.js', () => ({
  TREASURY_DIR: '/tmp/treasury',
}));

// Mock node:fs to avoid file system issues in watch()
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  watch: vi.fn(() => ({ on: vi.fn(), close: vi.fn() })),
}));

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(() => []),
  stat: vi.fn(() => ({ size: 0 })),
  open: vi.fn(() => ({ read: vi.fn(), close: vi.fn() })),
}));

const { sendJson, readFileOrNull } = await import('../lib/http-helpers.js');
const { resolveProject } = await import('../lib/project-scope.js');
const { isRemoteMode, isLanMode } = await import('../lib/tower-auth.js');
const {
  parseCampaignState, readTestResults, readGitStatus, detectDeployDrift,
} = await import('../lib/dashboard-data.js');

await import('../api/danger-room.js');

function mockReq(url = '/'): IncomingMessage {
  return { headers: { host: 'localhost' }, url } as unknown as IncomingMessage;
}
function mockRes(): ServerResponse {
  return { writeHead: vi.fn(), end: vi.fn(), setHeader: vi.fn() } as unknown as ServerResponse;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isRemoteMode).mockReturnValue(false);
  vi.mocked(isLanMode).mockReturnValue(false);
});

// ── Project-scoped route tests ─────────────────────────────

describe('GET /api/projects/:id/danger-room/campaign', () => {
  const handler = () => registeredRoutes.get('GET /api/projects/:id/danger-room/campaign')!;

  it('should return campaign state', async () => {
    vi.mocked(resolveProject).mockResolvedValue({
      context: { logsDir: '/tmp/logs' },
      role: 'admin',
    } as never);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(parseCampaignState).toHaveBeenCalledWith('/tmp/logs');
    expect(sendJson).toHaveBeenCalledWith(res, 200, expect.any(Object));
  });

  it('should return early when project resolution fails', async () => {
    vi.mocked(resolveProject).mockResolvedValue(null);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(parseCampaignState).not.toHaveBeenCalled();
  });
});

describe('GET /api/projects/:id/danger-room/tests', () => {
  const handler = () => registeredRoutes.get('GET /api/projects/:id/danger-room/tests')!;

  it('should return test results', async () => {
    vi.mocked(resolveProject).mockResolvedValue({
      context: { directory: '/tmp/project', logsDir: '/tmp/logs' },
      role: 'admin',
    } as never);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(readTestResults).toHaveBeenCalledWith('/tmp/project', '/tmp/logs');
  });
});

describe('GET /api/projects/:id/danger-room/git-status', () => {
  const handler = () => registeredRoutes.get('GET /api/projects/:id/danger-room/git-status')!;

  it('should return git status', async () => {
    vi.mocked(resolveProject).mockResolvedValue({
      context: { directory: '/tmp/project' },
      role: 'admin',
    } as never);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(readGitStatus).toHaveBeenCalledWith('/tmp/project');
  });
});

describe('GET /api/projects/:id/danger-room/drift', () => {
  const handler = () => registeredRoutes.get('GET /api/projects/:id/danger-room/drift')!;

  it('should detect deploy drift', async () => {
    vi.mocked(resolveProject).mockResolvedValue({
      context: { logsDir: '/tmp/logs', directory: '/tmp/project' },
      role: 'admin',
    } as never);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(detectDeployDrift).toHaveBeenCalledWith('/tmp/logs', '/tmp/project');
  });
});

describe('GET /api/projects/:id/danger-room/context', () => {
  const handler = () => registeredRoutes.get('GET /api/projects/:id/danger-room/context')!;

  it('should return context stats (global, no project resolution needed)', async () => {
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, expect.objectContaining({ usage: 0 }));
  });
});

// ── Deep Current endpoint ──────────────────────────────────

describe('GET /api/projects/:id/danger-room/current', () => {
  const handler = () => registeredRoutes.get('GET /api/projects/:id/danger-room/current')!;

  it('should return uninitialized when no situation file', async () => {
    vi.mocked(resolveProject).mockResolvedValue({
      context: { logsDir: '/tmp/logs' },
      role: 'admin',
    } as never);
    vi.mocked(readFileOrNull).mockResolvedValue(null);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, { initialized: false });
  });
});

// ── Legacy routes ──────────────────────────────────────────

describe('Legacy /api/danger-room/* routes', () => {
  it('should block in remote mode', async () => {
    vi.mocked(isRemoteMode).mockReturnValue(true);
    const handler = registeredRoutes.get('GET /api/danger-room/campaign')!;
    const req = mockReq('/api/danger-room/campaign');
    const res = mockRes();
    await handler(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 404, {
      success: false,
      error: 'Use /api/projects/:id/danger-room/* endpoints',
    });
  });

  it('should block in LAN mode', async () => {
    vi.mocked(isLanMode).mockReturnValue(true);
    const handler = registeredRoutes.get('GET /api/danger-room/context')!;
    const req = mockReq('/api/danger-room/context');
    const res = mockRes();
    await handler(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 404, {
      success: false,
      error: 'Use project-scoped endpoints',
    });
  });
});
