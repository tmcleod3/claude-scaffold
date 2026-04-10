/**
 * Credentials API tests — vault unlock, API key storage, env-batch.
 * Tests route handlers registered in api/credentials.ts.
 *
 * Note: sessionPassword is a module-level variable. Tests that depend on
 * locked/unlocked state must be ordered carefully. The vault starts locked
 * and stays unlocked once the unlock handler succeeds.
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

vi.mock('../lib/vault.js', () => ({
  vaultSet: vi.fn(),
  vaultGet: vi.fn(),
  vaultExists: vi.fn(() => false),
  vaultUnlock: vi.fn(() => true),
  vaultKeys: vi.fn(() => []),
  vaultPath: vi.fn(() => '/tmp/.voidforge/vault.enc'),
  vaultLock: vi.fn(),
}));

vi.mock('../lib/body-parser.js', () => ({
  parseJsonBody: vi.fn(),
}));

vi.mock('../lib/anthropic.js', () => ({
  clearModelCache: vi.fn(),
}));

vi.mock('../lib/tower-auth.js', () => ({
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

vi.mock('../lib/http-helpers.js', () => ({
  sendJson: vi.fn(),
}));

// Mock node:https to prevent real network calls
vi.mock('node:https', () => ({
  request: vi.fn(),
}));

const { parseJsonBody } = await import('../lib/body-parser.js');
const { vaultExists, vaultUnlock, vaultKeys, vaultSet } = await import('../lib/vault.js');
const { sendJson } = await import('../lib/http-helpers.js');

// Import triggers route registration
await import('../api/credentials.js');

function mockReq(): IncomingMessage {
  return {
    headers: {},
    url: '/',
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as IncomingMessage;
}
function mockRes(): ServerResponse {
  return { writeHead: vi.fn(), end: vi.fn(), setHeader: vi.fn() } as unknown as ServerResponse;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── GET /api/credentials/status ────────────────────────────

describe('GET /api/credentials/status', () => {
  const handler = () => registeredRoutes.get('GET /api/credentials/status')!;

  it('should return vault status when locked', async () => {
    vi.mocked(vaultExists).mockReturnValue(false);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, expect.objectContaining({
      vaultExists: false,
      unlocked: false,
      anthropic: false,
    }));
  });
});

// ── Tests that require LOCKED vault (run BEFORE unlock) ────

describe('POST /api/credentials/anthropic (vault locked)', () => {
  const handler = () => registeredRoutes.get('POST /api/credentials/anthropic')!;

  it('should reject when vault is locked', async () => {
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 401, expect.objectContaining({
      error: expect.stringContaining('locked'),
    }));
  });
});

// ── POST /api/credentials/unlock ───────────────────────────

describe('POST /api/credentials/unlock', () => {
  const handler = () => registeredRoutes.get('POST /api/credentials/unlock')!;

  it('should reject missing password', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({});
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, { error: 'password is required' });
  });

  it('should reject short password', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({ password: 'short' });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, { error: 'Password must be at least 8 characters' });
  });

  it('should reject oversized password', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({ password: 'x'.repeat(257) });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, { error: 'Password must be 256 characters or fewer' });
  });

  it('should return 401 on wrong password', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({ password: 'wrongpassword' });
    vi.mocked(vaultUnlock).mockResolvedValue(false);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 401, { error: 'Wrong password' });
  });

  it('should unlock vault with valid password', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({ password: 'validpassword' });
    vi.mocked(vaultUnlock).mockResolvedValue(true);
    vi.mocked(vaultExists).mockReturnValue(false);
    vi.mocked(vaultKeys).mockResolvedValue([]);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, expect.objectContaining({
      unlocked: true,
      isNew: true,
    }));
  });
});

// ── Tests that require UNLOCKED vault (run AFTER unlock) ───

describe('POST /api/credentials/anthropic (vault unlocked)', () => {
  const handler = () => registeredRoutes.get('POST /api/credentials/anthropic')!;

  it('should reject missing API key', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({});
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, { error: 'apiKey is required' });
  });

  it('should reject invalid API key format', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({ apiKey: 'not-an-anthropic-key' });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, expect.objectContaining({
      error: expect.stringContaining('sk-ant-'),
    }));
  });
});

describe('POST /api/credentials/env-batch (vault unlocked)', () => {
  const handler = () => registeredRoutes.get('POST /api/credentials/env-batch')!;

  it('should reject empty credentials', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({ credentials: {} });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, { error: 'No non-empty credentials provided' });
  });

  it('should reject invalid key format', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({ credentials: { 'bad-key': 'value' } });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, expect.objectContaining({
      error: expect.stringContaining('Invalid credential key format'),
    }));
  });

  it('should store valid env credentials', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({ credentials: { API_KEY: 'test-key-123' } });
    vi.mocked(vaultSet).mockResolvedValue(undefined);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, { stored: true, count: 1 });
  });

  it('should reject too many credentials', async () => {
    const creds: Record<string, string> = {};
    for (let i = 0; i < 101; i++) {
      creds[`VAR_${String(i).padStart(3, '0')}`] = 'value';
    }
    vi.mocked(parseJsonBody).mockResolvedValue({ credentials: creds });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, { error: 'Too many credentials (max 100)' });
  });
});
