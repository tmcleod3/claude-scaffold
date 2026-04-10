/**
 * Cloud Providers API tests — provider listing, credential status, validation.
 * Tests the PROVIDERS export and route handlers for cloud credential management.
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
  vaultKeys: vi.fn(() => []),
  vaultDelete: vi.fn(),
}));

vi.mock('../api/credentials.js', () => ({
  getSessionPassword: vi.fn(),
}));

vi.mock('../lib/body-parser.js', () => ({
  parseJsonBody: vi.fn(),
}));

vi.mock('../lib/http-helpers.js', () => ({
  sendJson: vi.fn(),
}));

// Mock node:https to avoid real HTTP calls
vi.mock('node:https', () => ({
  request: vi.fn(),
}));

const { getSessionPassword } = await import('../api/credentials.js');
const { vaultKeys } = await import('../lib/vault.js');
const { parseJsonBody } = await import('../lib/body-parser.js');
const { sendJson } = await import('../lib/http-helpers.js');

const { PROVIDERS } = await import('../api/cloud-providers.js');

function mockReq(): IncomingMessage {
  return { headers: {}, url: '/' } as unknown as IncomingMessage;
}
function mockRes(): ServerResponse {
  return { writeHead: vi.fn(), end: vi.fn(), setHeader: vi.fn() } as unknown as ServerResponse;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── PROVIDERS export tests ─────────────────────────────────

describe('PROVIDERS', () => {
  it('should export 5 cloud providers', () => {
    expect(PROVIDERS).toHaveLength(5);
  });

  it('should include AWS, Vercel, Railway, Cloudflare, GitHub', () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['aws', 'vercel', 'railway', 'cloudflare', 'github']));
  });

  it('should have fields array for each provider', () => {
    for (const provider of PROVIDERS) {
      expect(provider.fields.length).toBeGreaterThan(0);
      for (const field of provider.fields) {
        expect(field.key).toBeDefined();
        expect(field.label).toBeDefined();
      }
    }
  });

  it('should have help HTML for each provider', () => {
    for (const provider of PROVIDERS) {
      expect(provider.help.length).toBeGreaterThan(0);
      expect(provider.credentialUrl).toMatch(/^https?:\/\//);
    }
  });
});

// ── GET /api/cloud/providers ───────────────────────────────

describe('GET /api/cloud/providers', () => {
  const handler = () => registeredRoutes.get('GET /api/cloud/providers')!;

  it('should return all providers', async () => {
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, { providers: PROVIDERS });
  });
});

// ── GET /api/cloud/status ──────────────────────────────────

describe('GET /api/cloud/status', () => {
  const handler = () => registeredRoutes.get('GET /api/cloud/status')!;

  it('should return 401 when vault is locked', async () => {
    vi.mocked(getSessionPassword).mockReturnValue(null);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 401, { error: 'Vault is locked.' });
  });

  it('should return provider status when vault is unlocked', async () => {
    vi.mocked(getSessionPassword).mockReturnValue('password123');
    vi.mocked(vaultKeys).mockResolvedValue(['aws-access-key-id', 'aws-secret-access-key', 'aws-region']);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, expect.objectContaining({
      status: expect.objectContaining({ aws: true }),
    }));
  });
});

// ── POST /api/cloud/validate ───────────────────────────────

describe('POST /api/cloud/validate', () => {
  const handler = () => registeredRoutes.get('POST /api/cloud/validate')!;

  it('should return 401 when vault is locked', async () => {
    vi.mocked(getSessionPassword).mockReturnValue(null);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 401, { error: 'Vault is locked.' });
  });

  it('should return 400 when provider is missing', async () => {
    vi.mocked(getSessionPassword).mockReturnValue('password123');
    vi.mocked(parseJsonBody).mockResolvedValue({});
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, { error: 'provider and credentials are required' });
  });

  it('should return 400 for unknown provider', async () => {
    vi.mocked(getSessionPassword).mockReturnValue('password123');
    vi.mocked(parseJsonBody).mockResolvedValue({ provider: 'azure', credentials: { key: 'val' } });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, { error: 'Unknown provider: azure' });
  });

  it('should reject non-string credential values', async () => {
    vi.mocked(getSessionPassword).mockReturnValue('password123');
    vi.mocked(parseJsonBody).mockResolvedValue({ provider: 'aws', credentials: { 'aws-access-key-id': 123 } });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, { error: 'All credential values must be strings' });
  });
});

// ── POST /api/cloud/remove ─────────────────────────────────

describe('POST /api/cloud/remove', () => {
  const handler = () => registeredRoutes.get('POST /api/cloud/remove')!;

  it('should return 401 when vault is locked', async () => {
    vi.mocked(getSessionPassword).mockReturnValue(null);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 401, { error: 'Vault is locked.' });
  });

  it('should return 400 when provider is missing', async () => {
    vi.mocked(getSessionPassword).mockReturnValue('password123');
    vi.mocked(parseJsonBody).mockResolvedValue({});
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, { error: 'provider is required' });
  });
});
