/**
 * Kongo Provisioner tests — API key validation, connection verification, vault storage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ClientRequest } from 'node:http';
import { EventEmitter } from 'node:events';

// ── Mock Setup ───────────────────────────────────────────

let mockRequestFn: ReturnType<typeof vi.fn>;

vi.mock('node:https', () => ({
  request: (...args: unknown[]) => mockRequestFn(...args),
}));

function createMockResponse(statusCode: number, body: unknown): IncomingMessage {
  const res = new EventEmitter() as IncomingMessage;
  res.statusCode = statusCode;
  res.headers = { 'content-type': 'application/json' };
  process.nextTick(() => {
    res.emit('data', Buffer.from(JSON.stringify(body)));
    res.emit('end');
  });
  return res;
}

function createMockRequest(): ClientRequest {
  const req = new EventEmitter() as ClientRequest;
  req.write = vi.fn();
  req.end = vi.fn();
  req.destroy = vi.fn();
  return req;
}

const {
  verifyKongoConnection,
  provisionKongo,
  isKongoConnected,
  getKongoClient,
  disconnectKongo,
  KONGO_API_KEY_VAULT_KEY,
  KONGO_WEBHOOK_SECRET_VAULT_KEY,
} = await import('../../lib/kongo/provisioner.js');

// ── Tests ────────────────────────────────────────────────

describe('verifyKongoConnection', () => {
  beforeEach(() => {
    mockRequestFn = vi.fn();
  });

  it('returns connected on successful API call', async () => {
    const mockReq = createMockRequest();
    mockRequestFn.mockImplementation((_url: unknown, _opts: unknown, cb: (res: IncomingMessage) => void) => {
      cb(createMockResponse(200, {
        success: true,
        data: { items: [], hasMore: false },
      }));
      return mockReq;
    });

    const result = await verifyKongoConnection('ke_live_test123');
    expect(result.connected).toBe(true);
  });

  it('returns not connected on auth failure', async () => {
    const mockReq = createMockRequest();
    mockRequestFn.mockImplementation((_url: unknown, _opts: unknown, cb: (res: IncomingMessage) => void) => {
      cb(createMockResponse(401, {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
      }));
      return mockReq;
    });

    const result = await verifyKongoConnection('ke_live_bad_key');
    expect(result.connected).toBe(false);
    expect(result.error).toContain('UNAUTHORIZED');
  });

  it('returns not connected on network error', async () => {
    const mockReq = createMockRequest();
    mockRequestFn.mockImplementation(() => {
      process.nextTick(() => mockReq.emit('error', new Error('ECONNREFUSED')));
      return mockReq;
    });

    const result = await verifyKongoConnection('ke_live_test123');
    expect(result.connected).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  }, 15_000);
});

describe('provisionKongo', () => {
  let mockVaultSet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockRequestFn = vi.fn();
    mockVaultSet = vi.fn().mockResolvedValue(undefined);
  });

  it('validates, verifies, and stores API key', async () => {
    const mockReq = createMockRequest();
    mockRequestFn.mockImplementation((_url: unknown, _opts: unknown, cb: (res: IncomingMessage) => void) => {
      cb(createMockResponse(200, { success: true, data: { items: [], hasMore: false } }));
      return mockReq;
    });

    const result = await provisionKongo(
      { apiKey: 'ke_live_valid_key', webhookSecret: 'whsec_123' },
      mockVaultSet,
    );

    expect(result.success).toBe(true);
    expect(result.connection?.connected).toBe(true);
    expect(mockVaultSet).toHaveBeenCalledWith(KONGO_API_KEY_VAULT_KEY, 'ke_live_valid_key');
    expect(mockVaultSet).toHaveBeenCalledWith(KONGO_WEBHOOK_SECRET_VAULT_KEY, 'whsec_123');
  });

  it('rejects invalid key format', async () => {
    const result = await provisionKongo(
      { apiKey: 'invalid_key' },
      mockVaultSet,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('ke_live_');
    expect(mockVaultSet).not.toHaveBeenCalled();
  });

  it('does not store key if connection fails', async () => {
    const mockReq = createMockRequest();
    mockRequestFn.mockImplementation((_url: unknown, _opts: unknown, cb: (res: IncomingMessage) => void) => {
      cb(createMockResponse(401, {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Bad key' },
      }));
      return mockReq;
    });

    const result = await provisionKongo(
      { apiKey: 'ke_live_bad_key' },
      mockVaultSet,
    );

    expect(result.success).toBe(false);
    expect(mockVaultSet).not.toHaveBeenCalled();
  });

  it('skips webhook secret when not provided', async () => {
    const mockReq = createMockRequest();
    mockRequestFn.mockImplementation((_url: unknown, _opts: unknown, cb: (res: IncomingMessage) => void) => {
      cb(createMockResponse(200, { success: true, data: { items: [], hasMore: false } }));
      return mockReq;
    });

    await provisionKongo({ apiKey: 'ke_live_valid' }, mockVaultSet);

    expect(mockVaultSet).toHaveBeenCalledTimes(1); // Only API key, not webhook secret
  });
});

describe('isKongoConnected', () => {
  it('returns true when valid key exists in vault', async () => {
    const vaultGet = vi.fn().mockResolvedValue('ke_live_stored_key');
    expect(await isKongoConnected(vaultGet)).toBe(true);
  });

  it('returns false when no key in vault', async () => {
    const vaultGet = vi.fn().mockResolvedValue(null);
    expect(await isKongoConnected(vaultGet)).toBe(false);
  });

  it('returns false when key has wrong format', async () => {
    const vaultGet = vi.fn().mockResolvedValue('wrong_format');
    expect(await isKongoConnected(vaultGet)).toBe(false);
  });
});

describe('getKongoClient', () => {
  it('returns client when key exists', async () => {
    const vaultGet = vi.fn().mockResolvedValue('ke_live_test123');
    const client = await getKongoClient(vaultGet);
    expect(client).not.toBeNull();
  });

  it('returns null when no key', async () => {
    const vaultGet = vi.fn().mockResolvedValue(null);
    const client = await getKongoClient(vaultGet);
    expect(client).toBeNull();
  });
});

describe('disconnectKongo', () => {
  it('removes both vault keys', async () => {
    const vaultDelete = vi.fn().mockResolvedValue(undefined);
    await disconnectKongo(vaultDelete);

    expect(vaultDelete).toHaveBeenCalledWith(KONGO_API_KEY_VAULT_KEY);
    expect(vaultDelete).toHaveBeenCalledWith(KONGO_WEBHOOK_SECRET_VAULT_KEY);
  });
});
