/**
 * Users API tests — multi-user management (invite, remove, role change).
 * Tests route handlers registered in api/users.ts.
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

vi.mock('../lib/body-parser.js', () => ({
  parseJsonBody: vi.fn(),
}));

vi.mock('../lib/tower-auth.js', () => ({
  validateSession: vi.fn(),
  parseSessionCookie: vi.fn(),
  isRemoteMode: vi.fn(() => true),
  getClientIp: vi.fn(() => '127.0.0.1'),
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  isValidUsername: vi.fn((u: string) => /^[a-zA-Z0-9._-]{3,64}$/.test(u)),
}));

vi.mock('../lib/user-manager.js', () => ({
  createInvite: vi.fn(() => ({ token: 'abc'.repeat(21) + 'x', role: 'deployer', expiresAt: '2025-12-31' })),
  completeInvite: vi.fn(() => ({ totpSecret: 'TOTP', totpUri: 'otpauth://...', role: 'deployer' })),
  removeUser: vi.fn(),
  updateUserRole: vi.fn(),
  listUsers: vi.fn(() => [{ username: 'admin', role: 'admin' }]),
  hasRole: vi.fn((session: { role: string }, required: string) => {
    const hierarchy: Record<string, number> = { admin: 3, deployer: 2, viewer: 1 };
    return (hierarchy[session.role] ?? 0) >= (hierarchy[required] ?? 0);
  }),
  isValidRole: vi.fn((r: string) => ['admin', 'deployer', 'viewer'].includes(r)),
}));

vi.mock('../lib/audit-log.js', () => ({
  audit: vi.fn(),
}));

vi.mock('../lib/project-registry.js', () => ({
  removeUserFromAllProjects: vi.fn(() => 0),
}));

vi.mock('../lib/http-helpers.js', () => ({
  sendJson: vi.fn(),
}));

const { parseJsonBody } = await import('../lib/body-parser.js');
const { validateSession, parseSessionCookie, isRemoteMode } = await import('../lib/tower-auth.js');
const { removeUser, updateUserRole, completeInvite } = await import('../lib/user-manager.js');
const { sendJson } = await import('../lib/http-helpers.js');

await import('../api/users.js');

function mockReq(): IncomingMessage {
  return { headers: { cookie: 'session=token' }, url: '/' } as unknown as IncomingMessage;
}
function mockRes(): ServerResponse {
  return { writeHead: vi.fn(), end: vi.fn(), setHeader: vi.fn() } as unknown as ServerResponse;
}

function asAdmin() {
  vi.mocked(parseSessionCookie).mockReturnValue('valid-token');
  vi.mocked(validateSession).mockReturnValue({ username: 'admin', role: 'admin' });
}

function asViewer() {
  vi.mocked(parseSessionCookie).mockReturnValue('viewer-token');
  vi.mocked(validateSession).mockReturnValue({ username: 'viewer-user', role: 'viewer' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isRemoteMode).mockReturnValue(true);
});

// ── GET /api/users ─────────────────────────────────────────

describe('GET /api/users', () => {
  const handler = () => registeredRoutes.get('GET /api/users')!;

  it('should reject in non-remote mode', async () => {
    vi.mocked(isRemoteMode).mockReturnValue(false);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, expect.objectContaining({
      error: 'User management requires remote mode',
    }));
  });

  it('should reject unauthenticated request', async () => {
    vi.mocked(parseSessionCookie).mockReturnValue(null);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 401, expect.objectContaining({
      error: 'Authentication required',
    }));
  });

  it('should reject non-admin users', async () => {
    asViewer();
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 404, expect.objectContaining({
      error: 'Not found',
    }));
  });

  it('should list users for admin', async () => {
    asAdmin();
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, expect.objectContaining({
      success: true,
      data: expect.objectContaining({ users: expect.any(Array) }),
    }));
  });
});

// ── POST /api/users/invite ─────────────────────────────────

describe('POST /api/users/invite', () => {
  const handler = () => registeredRoutes.get('POST /api/users/invite')!;

  it('should reject non-admin users', async () => {
    asViewer();
    vi.mocked(parseJsonBody).mockResolvedValue({ role: 'deployer' });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 404, expect.objectContaining({ error: 'Not found' }));
  });

  it('should create invite for admin', async () => {
    asAdmin();
    vi.mocked(parseJsonBody).mockResolvedValue({ role: 'deployer' });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 201, expect.objectContaining({ success: true }));
  });

  it('should reject invalid role', async () => {
    asAdmin();
    vi.mocked(parseJsonBody).mockResolvedValue({ role: 'superadmin' });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, expect.objectContaining({
      error: expect.stringContaining('role must be'),
    }));
  });
});

// ── POST /api/users/complete-invite ────────────────────────

describe('POST /api/users/complete-invite', () => {
  const handler = () => registeredRoutes.get('POST /api/users/complete-invite')!;

  it('should reject short token', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({ token: 'short', username: 'newuser', password: 'longpassword12' });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, expect.objectContaining({
      error: 'Invalid invite token',
    }));
  });

  it('should reject short password', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({ token: 'a'.repeat(64), username: 'newuser', password: 'short' });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, expect.objectContaining({
      error: expect.stringContaining('12-256'),
    }));
  });

  it('should complete invite with valid data', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({ token: 'a'.repeat(64), username: 'newuser', password: 'longpassword12' });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 201, expect.objectContaining({ success: true }), true);
  });
});

// ── POST /api/users/remove ─────────────────────────────────

describe('POST /api/users/remove', () => {
  const handler = () => registeredRoutes.get('POST /api/users/remove')!;

  it('should prevent self-deletion', async () => {
    asAdmin();
    vi.mocked(parseJsonBody).mockResolvedValue({ username: 'admin' });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, expect.objectContaining({
      error: 'Cannot remove yourself',
    }));
  });

  it('should remove other user', async () => {
    asAdmin();
    vi.mocked(parseJsonBody).mockResolvedValue({ username: 'other-user' });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(removeUser).toHaveBeenCalledWith('other-user');
    expect(sendJson).toHaveBeenCalledWith(res, 200, { success: true });
  });
});

// ── POST /api/users/role ───────────────────────────────────

describe('POST /api/users/role', () => {
  const handler = () => registeredRoutes.get('POST /api/users/role')!;

  it('should prevent self-demotion', async () => {
    asAdmin();
    vi.mocked(parseJsonBody).mockResolvedValue({ username: 'admin', role: 'viewer' });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, expect.objectContaining({
      error: 'Cannot change your own role',
    }));
  });

  it('should change role for other user', async () => {
    asAdmin();
    vi.mocked(parseJsonBody).mockResolvedValue({ username: 'other-user', role: 'deployer' });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(updateUserRole).toHaveBeenCalledWith('other-user', 'deployer');
    expect(sendJson).toHaveBeenCalledWith(res, 200, { success: true });
  });
});
