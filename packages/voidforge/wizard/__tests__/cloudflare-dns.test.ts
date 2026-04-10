/**
 * Cloudflare DNS tests — zone lookup, record CRUD, DNS provisioning flow.
 * Mocks the HTTP client to avoid real Cloudflare API calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the HTTP client
vi.mock('../lib/provisioners/http-client.js', () => ({
  httpsGet: vi.fn(),
  httpsPost: vi.fn(),
  httpsDelete: vi.fn(),
  safeJsonParse: (s: string) => { try { return JSON.parse(s); } catch { return null; } },
}));

// Mock provision-manifest (side-effect module)
vi.mock('../lib/provision-manifest.js', () => ({
  recordResourcePending: vi.fn(async () => {}),
  recordResourceCreated: vi.fn(async () => {}),
}));

const { httpsGet, httpsPost, httpsDelete } = await import('../lib/provisioners/http-client.js');
const { extractZoneName, findZone, listRecords, createRecord, deleteRecord, provisionDns, cleanupDnsRecords } = await import('../lib/dns/cloudflare-dns.js');

const mockGet = httpsGet as ReturnType<typeof vi.fn>;
const mockPost = httpsPost as ReturnType<typeof vi.fn>;
const mockDelete = httpsDelete as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// ── extractZoneName ──────────────────────────────────

describe('extractZoneName', () => {
  it('extracts root zone from subdomain', () => {
    expect(extractZoneName('app.voidforge.dev')).toBe('voidforge.dev');
  });

  it('returns root domain as-is', () => {
    expect(extractZoneName('voidforge.dev')).toBe('voidforge.dev');
  });

  it('handles deeply nested subdomains', () => {
    expect(extractZoneName('a.b.c.example.com')).toBe('example.com');
  });

  it('strips trailing dot', () => {
    expect(extractZoneName('voidforge.dev.')).toBe('voidforge.dev');
  });
});

// ── findZone ─────────────────────────────────────────

describe('findZone', () => {
  it('returns zone info on success', async () => {
    mockGet.mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        success: true,
        result: [{ id: 'zone-1', name: 'voidforge.dev', status: 'active' }],
      }),
    });

    const zone = await findZone('token', 'app.voidforge.dev');
    expect(zone).toEqual({ id: 'zone-1', name: 'voidforge.dev', status: 'active' });
  });

  it('returns null when no zone found', async () => {
    mockGet.mockResolvedValue({
      status: 200,
      body: JSON.stringify({ success: true, result: [] }),
    });

    const zone = await findZone('token', 'missing.dev');
    expect(zone).toBeNull();
  });

  it('throws on 403 with permission message', async () => {
    mockGet.mockResolvedValue({ status: 403, body: '' });

    await expect(findZone('token', 'voidforge.dev')).rejects.toThrow('Zone:Read permission');
  });

  it('throws on non-200 status', async () => {
    mockGet.mockResolvedValue({ status: 500, body: '' });

    await expect(findZone('token', 'voidforge.dev')).rejects.toThrow('returned 500');
  });
});

// ── listRecords ──────────────────────────────────────

describe('listRecords', () => {
  it('returns mapped records on success', async () => {
    mockGet.mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        result: [{ id: 'rec-1', type: 'A', name: 'voidforge.dev', content: '1.2.3.4', proxied: true, ttl: 1 }],
      }),
    });

    const records = await listRecords('token', 'zone-1', 'voidforge.dev');
    expect(records).toHaveLength(1);
    expect(records[0].type).toBe('A');
    expect(records[0].content).toBe('1.2.3.4');
  });

  it('returns empty array on non-200', async () => {
    mockGet.mockResolvedValue({ status: 500, body: '' });

    const records = await listRecords('token', 'zone-1', 'voidforge.dev');
    expect(records).toEqual([]);
  });
});

// ── createRecord ─────────────────────────────────────

describe('createRecord', () => {
  it('returns created record on 200', async () => {
    mockPost.mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        result: { id: 'rec-2', type: 'A', name: 'voidforge.dev', content: '1.2.3.4', proxied: true, ttl: 1 },
      }),
    });

    const record = await createRecord('token', 'zone-1', 'A', 'voidforge.dev', '1.2.3.4', true);
    expect(record.id).toBe('rec-2');
  });

  it('throws with API error message on failure', async () => {
    mockPost.mockResolvedValue({
      status: 400,
      body: JSON.stringify({ errors: [{ message: 'Record already exists' }] }),
    });

    await expect(createRecord('token', 'zone-1', 'A', 'x.dev', '1.2.3.4', true)).rejects.toThrow('Record already exists');
  });
});

// ── deleteRecord ─────────────────────────────────────

describe('deleteRecord', () => {
  it('calls httpsDelete with correct path', async () => {
    mockDelete.mockResolvedValue({ status: 200, body: '' });

    await deleteRecord('token', 'zone-1', 'rec-1');
    expect(mockDelete).toHaveBeenCalledWith(
      'api.cloudflare.com',
      '/client/v4/zones/zone-1/dns_records/rec-1',
      expect.objectContaining({ Authorization: 'Bearer token' }),
    );
  });
});

// ── provisionDns ─────────────────────────────────────

describe('provisionDns', () => {
  const emit = vi.fn();

  it('returns success:false when zone not found', async () => {
    mockGet.mockResolvedValue({
      status: 200,
      body: JSON.stringify({ success: true, result: [] }),
    });

    const result = await provisionDns('run-1', 'token', 'app.missing.dev', 'vps', { SSH_HOST: '1.2.3.4' }, emit);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Zone not found');
  });

  it('returns success:false for unknown deploy target', async () => {
    mockGet.mockResolvedValue({
      status: 200,
      body: JSON.stringify({ success: true, result: [{ id: 'z1', name: 'example.dev', status: 'active' }] }),
    });

    const result = await provisionDns('run-1', 'token', 'example.dev', 'unknown-target', {}, emit);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No DNS target');
  });
});

// ── cleanupDnsRecords ────────────────────────────────

describe('cleanupDnsRecords', () => {
  it('deletes records by splitting zoneId:recordId', async () => {
    mockDelete.mockResolvedValue({ status: 200, body: '' });

    await cleanupDnsRecords('token', ['zone-1:rec-1', 'zone-1:rec-2']);
    expect(mockDelete).toHaveBeenCalledTimes(2);
  });

  it('handles malformed resource IDs gracefully', async () => {
    // No colon separator — should not call delete
    await cleanupDnsRecords('token', ['bad-id']);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('continues cleanup even if one delete fails', async () => {
    mockDelete
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ status: 200, body: '' });

    await cleanupDnsRecords('token', ['zone-1:rec-1', 'zone-1:rec-2']);
    expect(mockDelete).toHaveBeenCalledTimes(2);
  });
});
