/**
 * War Room API tests — project-scoped dashboard data feeds.
 * Tests route handlers registered in api/war-room.ts.
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
}));

vi.mock('../lib/project-scope.js', () => ({
  resolveProject: vi.fn(),
  createProjectContext: vi.fn((project: Record<string, unknown>) => ({
    ...project,
    logsDir: '/tmp/logs',
    directory: '/tmp/project',
    treasuryDir: '/tmp/treasury',
  })),
}));

vi.mock('../lib/project-registry.js', () => ({
  getProjectsForUser: vi.fn(() => [
    { id: 'p1', name: 'Test', directory: '/tmp/project', owner: 'local', access: [] },
  ]),
  getProject: vi.fn(),
}));

vi.mock('../lib/dashboard-data.js', () => ({
  parseCampaignState: vi.fn(() => ({ missions: [], active: null })),
  parseBuildState: vi.fn(() => ({ phase: 0, status: 'not started' })),
  parseFindings: vi.fn(() => ({ findings: [], total: 0 })),
  readDeployLog: vi.fn(() => ({ deploys: [] })),
  readVersion: vi.fn(() => ({ version: '1.0.0' })),
  readContextStats: vi.fn(() => ({ usage: 0, limit: 1000000 })),
}));

vi.mock('../lib/dashboard-ws.js', () => ({
  createDashboardWs: vi.fn(() => ({
    broadcast: vi.fn(),
    close: vi.fn(),
    handleUpgrade: vi.fn(),
  })),
}));

const { sendJson } = await import('../lib/http-helpers.js');
const { resolveProject } = await import('../lib/project-scope.js');
const {
  parseCampaignState, parseBuildState, parseFindings,
  readDeployLog, readVersion, readContextStats,
} = await import('../lib/dashboard-data.js');

await import('../api/war-room.js');

function mockReq(url = '/'): IncomingMessage {
  return { headers: { host: 'localhost' }, url } as unknown as IncomingMessage;
}
function mockRes(): ServerResponse {
  return { writeHead: vi.fn(), end: vi.fn(), setHeader: vi.fn() } as unknown as ServerResponse;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Project-scoped route tests ─────────────────────────────

describe('GET /api/projects/:id/war-room/campaign', () => {
  const handler = () => registeredRoutes.get('GET /api/projects/:id/war-room/campaign')!;

  it('should return campaign state for resolved project', async () => {
    vi.mocked(resolveProject).mockResolvedValue({
      context: { logsDir: '/tmp/logs', directory: '/tmp/project' },
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
    // resolveProject sends its own error response when returning null
    expect(parseCampaignState).not.toHaveBeenCalled();
  });
});

describe('GET /api/projects/:id/war-room/build', () => {
  const handler = () => registeredRoutes.get('GET /api/projects/:id/war-room/build')!;

  it('should return build state', async () => {
    vi.mocked(resolveProject).mockResolvedValue({
      context: { logsDir: '/tmp/logs' },
      role: 'admin',
    } as never);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(parseBuildState).toHaveBeenCalledWith('/tmp/logs');
    expect(sendJson).toHaveBeenCalledWith(res, 200, expect.objectContaining({ phase: 0 }));
  });
});

describe('GET /api/projects/:id/war-room/findings', () => {
  const handler = () => registeredRoutes.get('GET /api/projects/:id/war-room/findings')!;

  it('should return findings', async () => {
    vi.mocked(resolveProject).mockResolvedValue({
      context: { logsDir: '/tmp/logs' },
      role: 'admin',
    } as never);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(parseFindings).toHaveBeenCalledWith('/tmp/logs');
  });
});

describe('GET /api/projects/:id/war-room/version', () => {
  const handler = () => registeredRoutes.get('GET /api/projects/:id/war-room/version')!;

  it('should return version', async () => {
    vi.mocked(resolveProject).mockResolvedValue({
      context: { directory: '/tmp/project' },
      role: 'admin',
    } as never);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(readVersion).toHaveBeenCalledWith('/tmp/project');
  });
});

// ── Legacy routes removed (ADR-046, v23.4) ─────────────────
// Legacy /api/war-room/* shim routes have been removed.
// The standalone war-room.html now redirects to the project dashboard.
// All data is served via the project-scoped routes tested above.
