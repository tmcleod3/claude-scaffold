/**
 * Projects API tests — multi-project CRUD, access control, linked services.
 * Tests route handlers registered in api/projects.ts.
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

vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
  readFile: vi.fn(),
  realpath: vi.fn((p: string) => Promise.resolve(p)),
}));

vi.mock('../lib/body-parser.js', () => ({
  parseJsonBody: vi.fn(),
}));

vi.mock('../lib/frontmatter.js', () => ({
  parseFrontmatter: vi.fn(() => ({ frontmatter: {} })),
}));

vi.mock('../lib/project-registry.js', () => ({
  addProject: vi.fn((input: Record<string, unknown>) => ({ ...input, id: 'proj-123' })),
  getProject: vi.fn(),
  removeProject: vi.fn(),
  findByDirectory: vi.fn(),
  getProjectsForUser: vi.fn(() => []),
  grantAccess: vi.fn(),
  revokeAccess: vi.fn(),
  getProjectAccess: vi.fn(),
  checkProjectAccess: vi.fn(),
  linkProjects: vi.fn(),
  unlinkProjects: vi.fn(),
  getLinkedGroup: vi.fn(() => []),
}));

vi.mock('../lib/deploy-coordinator.js', () => ({
  getDeployPlan: vi.fn(),
}));

vi.mock('../lib/cost-tracker.js', () => ({
  getAggregateCosts: vi.fn(() => ({ totalMonthlyCost: 0, projects: [] })),
}));

vi.mock('../lib/treasury-reader.js', () => ({
  readTreasurySummary: vi.fn(() => ({ spend: 0, revenue: 0 })),
}));

vi.mock('../lib/project-scope.js', () => ({
  createProjectContext: vi.fn((project: Record<string, unknown>) => ({
    ...project,
    treasuryDir: '/tmp/treasury',
  })),
}));

vi.mock('../lib/agent-memory.js', () => ({
  addLesson: vi.fn((input: Record<string, unknown>) => ({ ...input, id: 'lesson-1', createdAt: '2025-01-01' })),
  getLessons: vi.fn(() => []),
  getLessonCount: vi.fn(() => 0),
}));

vi.mock('../lib/audit-log.js', () => ({
  audit: vi.fn(),
}));

vi.mock('../lib/tower-auth.js', () => ({
  validateSession: vi.fn(),
  parseSessionCookie: vi.fn(),
  isRemoteMode: vi.fn(() => false),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

vi.mock('../lib/user-manager.js', () => ({
  isValidRole: vi.fn((r: string) => ['admin', 'deployer', 'viewer'].includes(r)),
  hasRole: vi.fn((session: { role: string }, required: string) => {
    const hierarchy: Record<string, number> = { admin: 3, deployer: 2, viewer: 1 };
    return (hierarchy[session.role] ?? 0) >= (hierarchy[required] ?? 0);
  }),
}));

vi.mock('../lib/http-helpers.js', () => ({
  sendJson: vi.fn(),
}));

const { getProjectsForUser, checkProjectAccess, getProject, removeProject, findByDirectory } =
  await import('../lib/project-registry.js');
const { parseJsonBody } = await import('../lib/body-parser.js');
const { sendJson } = await import('../lib/http-helpers.js');
const { isRemoteMode } = await import('../lib/tower-auth.js');
const { access: fsAccess } = await import('node:fs/promises');

await import('../api/projects.js');

function mockReq(url = '/'): IncomingMessage {
  return { headers: { host: 'localhost', cookie: '' }, url } as unknown as IncomingMessage;
}
function mockRes(): ServerResponse {
  return { writeHead: vi.fn(), end: vi.fn(), setHeader: vi.fn() } as unknown as ServerResponse;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: local mode (not remote) — getSession returns synthetic local admin
  vi.mocked(isRemoteMode).mockReturnValue(false);
});

// ── GET /api/projects ──────────────────────────────────────

describe('GET /api/projects', () => {
  const handler = () => registeredRoutes.get('GET /api/projects')!;

  it('should return projects list in local mode', async () => {
    vi.mocked(getProjectsForUser).mockResolvedValue([
      { id: 'p1', name: 'Test', owner: 'local', access: [], directory: '/tmp/test' } as never,
    ]);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, expect.objectContaining({
      success: true,
      data: expect.arrayContaining([expect.objectContaining({ id: 'p1', userRole: 'owner' })]),
    }));
  });

  it('should return 401 in remote mode without auth', async () => {
    vi.mocked(isRemoteMode).mockReturnValue(true);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 401, expect.objectContaining({
      error: 'Authentication required',
    }));
  });
});

// ── GET /api/projects/get ──────────────────────────────────

describe('GET /api/projects/get', () => {
  const handler = () => registeredRoutes.get('GET /api/projects/get')!;

  it('should reject missing id parameter', async () => {
    const req = mockReq('/api/projects/get');
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, expect.objectContaining({
      error: 'id query parameter is required',
    }));
  });

  it('should return 404 when access denied', async () => {
    vi.mocked(checkProjectAccess).mockResolvedValue(null);
    const req = mockReq('/api/projects/get?id=proj-123');
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 404, expect.objectContaining({
      error: 'Project not found',
    }));
  });

  it('should return project with user role', async () => {
    vi.mocked(checkProjectAccess).mockResolvedValue('admin');
    vi.mocked(getProject).mockResolvedValue({ id: 'proj-123', name: 'Test' } as never);
    const req = mockReq('/api/projects/get?id=proj-123');
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, expect.objectContaining({
      data: expect.objectContaining({ id: 'proj-123', userRole: 'admin' }),
    }));
  });
});

// ── POST /api/projects/import ──────────────────────────────

describe('POST /api/projects/import', () => {
  const handler = () => registeredRoutes.get('POST /api/projects/import')!;

  it('should reject missing directory', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({});
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, expect.objectContaining({
      error: expect.stringContaining('non-empty string'),
    }));
  });

  it('should reject path traversal', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({ directory: '/tmp/../etc' });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, expect.objectContaining({
      error: expect.stringContaining('..'),
    }));
  });

  it('should return 409 for already registered project', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({ directory: '/tmp/existing' });
    vi.mocked(fsAccess).mockResolvedValue(undefined);
    vi.mocked(findByDirectory).mockResolvedValue({ id: 'existing-id' } as never);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 409, expect.objectContaining({
      error: 'Project already registered',
    }));
  });
});

// ── POST /api/projects/delete ──────────────────────────────

describe('POST /api/projects/delete', () => {
  const handler = () => registeredRoutes.get('POST /api/projects/delete')!;

  it('should reject missing id', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({});
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, expect.objectContaining({
      error: expect.stringContaining('non-empty string'),
    }));
  });

  it('should return 404 when not admin', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({ id: 'proj-123' });
    vi.mocked(checkProjectAccess).mockResolvedValue('viewer');
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 404, expect.objectContaining({
      error: 'Project not found',
    }));
  });

  it('should delete project when admin', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({ id: 'proj-123' });
    vi.mocked(checkProjectAccess).mockResolvedValue('admin');
    vi.mocked(removeProject).mockResolvedValue(true);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, { success: true });
  });
});

// ── GET /api/projects/costs ────────────────────────────────

describe('GET /api/projects/costs', () => {
  const handler = () => registeredRoutes.get('GET /api/projects/costs')!;

  it('should return cost data in local mode', async () => {
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, expect.objectContaining({
      success: true,
    }));
  });
});
