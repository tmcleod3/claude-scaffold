/**
 * Terminal API tests — PTY session management REST endpoints.
 * Tests route handlers registered in api/terminal.ts.
 * Note: WebSocket upgrade handler is not tested here (requires socket mocking).
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

vi.mock('../api/credentials.js', () => ({
  getSessionPassword: vi.fn(),
}));

vi.mock('../lib/body-parser.js', () => ({
  parseJsonBody: vi.fn(),
}));

vi.mock('../lib/server-config.js', () => ({
  getServerPort: vi.fn(() => 3000),
  getServerHost: vi.fn(() => ''),
}));

vi.mock('../lib/pty-manager.js', () => ({
  createSession: vi.fn(() => ({ id: 'pty-001', pid: 1234, projectDir: '/tmp/proj' })),
  writeToSession: vi.fn(),
  onSessionData: vi.fn(() => () => {}),
  resizeSession: vi.fn(),
  killSession: vi.fn(),
  listSessions: vi.fn(() => []),
  killAllSessions: vi.fn(),
  sessionCount: vi.fn(() => 0),
}));

vi.mock('../lib/tower-auth.js', () => ({
  validateSession: vi.fn(),
  parseSessionCookie: vi.fn(),
  getClientIp: vi.fn(() => '127.0.0.1'),
  isRemoteMode: vi.fn(() => false),
  isLanMode: vi.fn(() => false),
}));

vi.mock('../lib/network.js', () => ({
  isPrivateOrigin: vi.fn(() => false),
}));

vi.mock('../lib/user-manager.js', () => ({
  hasProjectAccess: vi.fn(() => true),
}));

vi.mock('../lib/project-registry.js', () => ({
  findByDirectory: vi.fn(() => ({ id: 'proj-1' })),
}));

vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
  realpath: vi.fn((p: string) => Promise.resolve(p)),
}));

vi.mock('../lib/http-helpers.js', () => ({
  sendJson: vi.fn(),
}));

// Mock ws library to prevent module initialization issues
vi.mock('ws', () => ({
  WebSocketServer: vi.fn(() => ({
    handleUpgrade: vi.fn(),
  })),
  WebSocket: { OPEN: 1 },
}));

const { getSessionPassword } = await import('../api/credentials.js');
const { parseJsonBody } = await import('../lib/body-parser.js');
const { listSessions, killSession } = await import('../lib/pty-manager.js');
const { isRemoteMode } = await import('../lib/tower-auth.js');
const { access: fsAccess } = await import('node:fs/promises');
const { sendJson } = await import('../lib/http-helpers.js');

await import('../api/terminal.js');

function mockReq(): IncomingMessage {
  return { headers: { cookie: '' }, url: '/', socket: {} } as unknown as IncomingMessage;
}
function mockRes(): ServerResponse {
  return { writeHead: vi.fn(), end: vi.fn(), setHeader: vi.fn() } as unknown as ServerResponse;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── GET /api/terminal/sessions ─────────────────────────────

describe('GET /api/terminal/sessions', () => {
  const handler = () => registeredRoutes.get('GET /api/terminal/sessions')!;

  it('should reject when vault is locked', async () => {
    vi.mocked(getSessionPassword).mockReturnValue(null);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 401, { error: 'Vault is locked.' });
  });

  it('should return session list when vault is unlocked', async () => {
    vi.mocked(getSessionPassword).mockReturnValue('password');
    vi.mocked(listSessions).mockReturnValue([]);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, { sessions: [], count: 0 });
  });

  it('should return sessions for local mode', async () => {
    vi.mocked(getSessionPassword).mockReturnValue('password');
    vi.mocked(isRemoteMode).mockReturnValue(false);
    vi.mocked(listSessions).mockReturnValue([
      { id: 'pty-1', projectDir: '/tmp/a', username: '' },
      { id: 'pty-2', projectDir: '/tmp/b', username: '' },
    ] as never);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, expect.objectContaining({ count: 2 }));
  });
});

// ── POST /api/terminal/sessions ────────────────────────────

describe('POST /api/terminal/sessions', () => {
  const handler = () => registeredRoutes.get('POST /api/terminal/sessions')!;

  it('should reject when vault is locked', async () => {
    vi.mocked(getSessionPassword).mockReturnValue(null);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 401, { error: 'Vault is locked.' });
  });

  it('should reject missing projectDir', async () => {
    vi.mocked(getSessionPassword).mockReturnValue('password');
    vi.mocked(parseJsonBody).mockResolvedValue({ projectName: 'Test' });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, expect.objectContaining({
      error: expect.stringContaining('required'),
    }));
  });

  it('should reject path traversal', async () => {
    vi.mocked(getSessionPassword).mockReturnValue('password');
    vi.mocked(parseJsonBody).mockResolvedValue({ projectDir: '/tmp/../etc', projectName: 'Test' });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, expect.objectContaining({
      error: expect.stringContaining('no ".."'),
    }));
  });

  it('should reject relative path', async () => {
    vi.mocked(getSessionPassword).mockReturnValue('password');
    vi.mocked(parseJsonBody).mockResolvedValue({ projectDir: 'relative/path', projectName: 'Test' });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, expect.objectContaining({
      error: expect.stringContaining('absolute path'),
    }));
  });

  it('should create session for valid project', async () => {
    vi.mocked(getSessionPassword).mockReturnValue('password');
    vi.mocked(parseJsonBody).mockResolvedValue({ projectDir: '/tmp/project', projectName: 'Test' });
    vi.mocked(fsAccess).mockResolvedValue(undefined);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, expect.objectContaining({
      session: expect.objectContaining({ id: 'pty-001' }),
      authToken: expect.any(String),
    }));
  });
});

// ── POST /api/terminal/kill ────────────────────────────────

describe('POST /api/terminal/kill', () => {
  const handler = () => registeredRoutes.get('POST /api/terminal/kill')!;

  it('should reject when vault is locked', async () => {
    vi.mocked(getSessionPassword).mockReturnValue(null);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 401, { error: 'Vault is locked.' });
  });

  it('should reject missing sessionId', async () => {
    vi.mocked(getSessionPassword).mockReturnValue('password');
    vi.mocked(parseJsonBody).mockResolvedValue({});
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, { error: 'sessionId is required' });
  });

  it('should kill session successfully', async () => {
    vi.mocked(getSessionPassword).mockReturnValue('password');
    vi.mocked(parseJsonBody).mockResolvedValue({ sessionId: 'pty-001' });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(killSession).toHaveBeenCalledWith('pty-001');
    expect(sendJson).toHaveBeenCalledWith(res, 200, { killed: true });
  });
});
