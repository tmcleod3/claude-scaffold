/**
 * Auth API tests — login, logout, session check, initial setup.
 * Tests the route handlers registered in api/auth.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';

// ── Capture route handlers via addRoute mock ──────────────
const registeredRoutes = new Map<string, (req: IncomingMessage, res: ServerResponse) => Promise<void>>();

vi.mock('../router.js', () => ({
  addRoute: (method: string, path: string, handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>) => {
    registeredRoutes.set(`${method} ${path}`, handler);
  },
}));

// ── Mock dependencies ──────────────────────────────────────

vi.mock('../lib/body-parser.js', () => ({
  parseJsonBody: vi.fn(),
}));

vi.mock('../lib/tower-auth.js', () => ({
  hasUsers: vi.fn(),
  createUser: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  validateSession: vi.fn(),
  parseSessionCookie: vi.fn(),
  buildSessionCookie: vi.fn(() => 'session=abc; HttpOnly'),
  clearSessionCookie: vi.fn(() => 'session=; HttpOnly; Max-Age=0'),
  isRemoteMode: vi.fn(),
  isLanMode: vi.fn(),
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  getClientIp: vi.fn(() => '127.0.0.1'),
  getUserRole: vi.fn(),
  isValidUsername: vi.fn((u: string) => /^[a-zA-Z0-9._-]{3,64}$/.test(u)),
}));

vi.mock('../lib/audit-log.js', () => ({
  audit: vi.fn(),
}));

vi.mock('../lib/http-helpers.js', () => ({
  sendJson: vi.fn(),
}));

// ── Import modules (triggers route registration) ───────────

const { parseJsonBody } = await import('../lib/body-parser.js');
const {
  isRemoteMode, isLanMode, createUser, login, logout,
  validateSession, parseSessionCookie, hasUsers, getUserRole,
} = await import('../lib/tower-auth.js');
const { sendJson } = await import('../lib/http-helpers.js');

await import('../api/auth.js');

// ── Helpers ────────────────────────────────────────────────

function mockReq(opts: { cookie?: string; url?: string; headers?: Record<string, string> } = {}): IncomingMessage {
  const stream = new Readable({ read() {} }) as unknown as IncomingMessage;
  stream.headers = { cookie: opts.cookie ?? '', ...opts.headers };
  stream.url = opts.url ?? '/';
  stream.socket = {} as IncomingMessage['socket'];
  return stream;
}

function mockRes(): ServerResponse {
  return {
    writeHead: vi.fn(),
    end: vi.fn(),
    setHeader: vi.fn(),
  } as unknown as ServerResponse;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────

describe('POST /api/auth/setup', () => {
  const handler = () => registeredRoutes.get('POST /api/auth/setup')!;

  it('should reject when not in remote or LAN mode', async () => {
    vi.mocked(isRemoteMode).mockReturnValue(false);
    vi.mocked(isLanMode).mockReturnValue(false);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, expect.objectContaining({ error: expect.stringContaining('remote or LAN mode') }));
  });

  it('should create admin user with valid credentials', async () => {
    vi.mocked(isRemoteMode).mockReturnValue(true);
    vi.mocked(isLanMode).mockReturnValue(false);
    vi.mocked(parseJsonBody).mockResolvedValue({ username: 'admin', password: 'mysecretpassword123' });
    vi.mocked(createUser).mockResolvedValue({ totpSecret: 'TOTP123', totpUri: 'otpauth://...' });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 201, expect.objectContaining({ success: true }), true);
  });

  it('should reject short password', async () => {
    vi.mocked(isRemoteMode).mockReturnValue(true);
    vi.mocked(isLanMode).mockReturnValue(false);
    vi.mocked(parseJsonBody).mockResolvedValue({ username: 'admin', password: 'short' });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, expect.objectContaining({ error: expect.stringContaining('12-256 characters') }));
  });

  it('should reject invalid username', async () => {
    vi.mocked(isRemoteMode).mockReturnValue(true);
    vi.mocked(isLanMode).mockReturnValue(false);
    vi.mocked(parseJsonBody).mockResolvedValue({ username: 'ab', password: 'mysecretpassword123' });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, expect.objectContaining({ error: expect.stringContaining('3-64 characters') }));
  });

  it('should return 409 when admin already exists', async () => {
    vi.mocked(isRemoteMode).mockReturnValue(true);
    vi.mocked(isLanMode).mockReturnValue(false);
    vi.mocked(parseJsonBody).mockResolvedValue({ username: 'admin', password: 'mysecretpassword123' });
    vi.mocked(createUser).mockRejectedValue(new Error('Username already taken'));
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 409, expect.objectContaining({ error: 'Admin user already exists' }));
  });
});

describe('POST /api/auth/login', () => {
  const handler = () => registeredRoutes.get('POST /api/auth/login')!;

  it('should reject when not in remote or LAN mode', async () => {
    vi.mocked(isRemoteMode).mockReturnValue(false);
    vi.mocked(isLanMode).mockReturnValue(false);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, expect.objectContaining({ error: expect.stringContaining('remote or LAN mode') }));
  });

  it('should login successfully with valid credentials', async () => {
    vi.mocked(isRemoteMode).mockReturnValue(true);
    vi.mocked(isLanMode).mockReturnValue(false);
    vi.mocked(parseJsonBody).mockResolvedValue({ username: 'admin', password: 'correct-password', totpCode: '123456' });
    vi.mocked(login).mockResolvedValue({ token: 'session-token-xyz' });
    vi.mocked(getUserRole).mockResolvedValue('admin');
    const req = mockReq({ headers: {} });
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, expect.objectContaining({ success: true }), true);
  });

  it('should return 401 on wrong credentials', async () => {
    vi.mocked(isRemoteMode).mockReturnValue(true);
    vi.mocked(isLanMode).mockReturnValue(false);
    vi.mocked(parseJsonBody).mockResolvedValue({ username: 'admin', password: 'wrong', totpCode: '123456' });
    vi.mocked(login).mockResolvedValue({ error: 'Invalid credentials' });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 401, expect.objectContaining({ success: false }), true);
  });

  it('should reject missing TOTP in remote mode', async () => {
    vi.mocked(isRemoteMode).mockReturnValue(true);
    vi.mocked(isLanMode).mockReturnValue(false);
    vi.mocked(parseJsonBody).mockResolvedValue({ username: 'admin', password: 'correct-password' });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, expect.objectContaining({ error: expect.stringContaining('6 digits') }));
  });
});

describe('POST /api/auth/logout', () => {
  const handler = () => registeredRoutes.get('POST /api/auth/logout')!;

  it('should clear session cookie on logout', async () => {
    vi.mocked(parseSessionCookie).mockReturnValue('session-token');
    vi.mocked(validateSession).mockReturnValue({ username: 'admin', role: 'admin' });
    const req = mockReq({ cookie: 'session=session-token' });
    const res = mockRes();
    await handler()(req, res);
    expect(logout).toHaveBeenCalledWith('session-token');
    expect(res.setHeader).toHaveBeenCalledWith('Set-Cookie', expect.any(String));
    expect(sendJson).toHaveBeenCalledWith(res, 200, { success: true });
  });

  it('should handle logout without token gracefully', async () => {
    vi.mocked(parseSessionCookie).mockReturnValue(null);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, { success: true });
  });
});

describe('GET /api/auth/session', () => {
  const handler = () => registeredRoutes.get('GET /api/auth/session')!;

  it('should return local admin in non-remote mode', async () => {
    vi.mocked(isRemoteMode).mockReturnValue(false);
    vi.mocked(isLanMode).mockReturnValue(false);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, expect.objectContaining({
      success: true,
      data: expect.objectContaining({ authenticated: true, username: 'local' }),
    }));
  });

  it('should return authenticated false when no cookie in remote mode', async () => {
    vi.mocked(isRemoteMode).mockReturnValue(true);
    vi.mocked(isLanMode).mockReturnValue(false);
    vi.mocked(parseSessionCookie).mockReturnValue(null);
    vi.mocked(hasUsers).mockResolvedValue(false);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, expect.objectContaining({
      data: expect.objectContaining({ authenticated: false, needsSetup: true }),
    }));
  });

  it('should return session data for valid token', async () => {
    vi.mocked(isRemoteMode).mockReturnValue(true);
    vi.mocked(isLanMode).mockReturnValue(false);
    vi.mocked(parseSessionCookie).mockReturnValue('valid-token');
    vi.mocked(validateSession).mockReturnValue({ username: 'admin', role: 'admin' });
    const req = mockReq({ cookie: 'session=valid-token' });
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, expect.objectContaining({
      data: expect.objectContaining({ authenticated: true, username: 'admin' }),
    }));
  });
});
