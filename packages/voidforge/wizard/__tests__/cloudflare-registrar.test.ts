/**
 * Cloudflare Registrar tests — domain availability check and registration.
 * Mocks the HTTP client to avoid real Cloudflare API calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/provisioners/http-client.js', () => ({
  httpsGet: vi.fn(),
  httpsPost: vi.fn(),
  safeJsonParse: (s: string) => { try { return JSON.parse(s); } catch { return null; } },
}));

const { httpsGet, httpsPost } = await import('../lib/provisioners/http-client.js');
const { checkDomainAvailability, registerDomain } = await import('../lib/dns/cloudflare-registrar.js');

const mockGet = httpsGet as ReturnType<typeof vi.fn>;
const mockPost = httpsPost as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// ── checkDomainAvailability ──────────────────────────

describe('checkDomainAvailability', () => {
  const validAccount = 'a'.repeat(32);

  it('rejects invalid account ID format', async () => {
    const result = await checkDomainAvailability('token', 'bad-id', 'example.com');
    expect(result.canRegister).toBe(false);
    expect(result.error).toContain('account ID format');
  });

  it('rejects invalid domain format', async () => {
    const result = await checkDomainAvailability('token', validAccount, 'not a domain!!');
    expect(result.canRegister).toBe(false);
    expect(result.error).toContain('Invalid domain format');
  });

  it('returns available domain with price', async () => {
    mockGet.mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        success: true,
        result: [{
          domain: 'example.com',
          available: true,
          premium: false,
          pricing: { registration: { price: 899, currency: 'USD' } },
        }],
      }),
    });

    const result = await checkDomainAvailability('token', validAccount, 'example.com');
    expect(result.available).toBe(true);
    expect(result.canRegister).toBe(true);
    expect(result.price).toBe(899);
    expect(result.currency).toBe('USD');
  });

  it('marks premium domains as not registrable', async () => {
    mockGet.mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        success: true,
        result: [{
          domain: 'premium.com',
          available: true,
          premium: true,
          pricing: { registration: { price: 100000, currency: 'USD' } },
        }],
      }),
    });

    const result = await checkDomainAvailability('token', validAccount, 'premium.com');
    expect(result.available).toBe(true);
    expect(result.premium).toBe(true);
    expect(result.canRegister).toBe(false);
  });

  it('returns error on 403 (permission denied)', async () => {
    mockGet.mockResolvedValue({ status: 403, body: '' });

    const result = await checkDomainAvailability('token', validAccount, 'example.com');
    expect(result.canRegister).toBe(false);
    expect(result.error).toContain('Registrar:Read');
  });

  it('falls back to status endpoint when result is empty', async () => {
    // First call: no results
    mockGet
      .mockResolvedValueOnce({
        status: 200,
        body: JSON.stringify({ success: true, result: [] }),
      })
      // Second call: domain status — 404 means not on this account
      .mockResolvedValueOnce({ status: 404, body: '' });

    const result = await checkDomainAvailability('token', validAccount, 'example.com');
    expect(result.available).toBe(true);
    expect(result.canRegister).toBe(true);
  });
});

// ── registerDomain ───────────────────────────────────

describe('registerDomain', () => {
  const validAccount = 'b'.repeat(32);
  const emit = vi.fn();

  it('rejects invalid account ID', async () => {
    const result = await registerDomain('token', 'bad', 'example.com', emit);
    expect(result.success).toBe(false);
    expect(result.error).toContain('account ID format');
  });

  it('returns error when domain is not available', async () => {
    mockGet.mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        success: true,
        result: [{ domain: 'taken.com', available: false, premium: false }],
      }),
    });

    const result = await registerDomain('token', validAccount, 'taken.com', emit);
    expect(result.success).toBe(false);
  });

  it('registers an available domain successfully', async () => {
    // checkDomainAvailability call
    mockGet.mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        success: true,
        result: [{
          domain: 'new-domain.com',
          available: true,
          premium: false,
          pricing: { registration: { price: 899, currency: 'USD' } },
        }],
      }),
    });

    // registerDomain POST
    mockPost.mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        success: true,
        result: {
          domain_name: 'new-domain.com',
          expires_at: '2027-01-01T00:00:00Z',
          auto_renew: true,
        },
      }),
    });

    const result = await registerDomain('token', validAccount, 'new-domain.com', emit);
    expect(result.success).toBe(true);
    expect(result.domain).toBe('new-domain.com');
    expect(result.autoRenew).toBe(true);
  });
});
