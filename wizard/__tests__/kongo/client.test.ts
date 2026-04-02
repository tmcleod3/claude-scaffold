/**
 * KongoClient tests — auth, rate limiting, error handling, retries.
 *
 * Mocks node:https to avoid live API calls. All tests use sandbox responses
 * matching the real Kongo API shape.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IncomingMessage, ClientRequest } from 'node:http';
import { EventEmitter } from 'node:events';

// ── Mock Setup ───────────────────────────────────────────

function createMockResponse(statusCode: number, body: unknown, headers: Record<string, string> = {}): IncomingMessage {
  const res = new EventEmitter() as IncomingMessage;
  res.statusCode = statusCode;
  res.headers = { 'content-type': 'application/json', ...headers };
  // Use process.nextTick to avoid fake timer issues
  process.nextTick(() => {
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    res.emit('data', Buffer.from(data));
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

let mockRequestFn: ReturnType<typeof vi.fn>;

vi.mock('node:https', () => ({
  request: (...args: unknown[]) => mockRequestFn(...args),
}));

const { KongoClient, KongoApiError, SlidingWindowLimiter } = await import('../../lib/kongo/client.js');

// ── Tests ────────────────────────────────────────────────

describe('KongoClient', () => {
  beforeEach(() => {
    mockRequestFn = vi.fn();
  });

  describe('constructor', () => {
    it('rejects invalid API key format', () => {
      expect(() => new KongoClient({ apiKey: 'invalid_key' })).toThrow(KongoApiError);
      expect(() => new KongoClient({ apiKey: 'invalid_key' })).toThrow('ke_live_');
    });

    it('rejects empty API key', () => {
      expect(() => new KongoClient({ apiKey: '' })).toThrow(KongoApiError);
    });

    it('accepts valid API key', () => {
      const client = new KongoClient({ apiKey: 'ke_live_test123' });
      expect(client).toBeDefined();
    });

    it('uses default base URL and timeout', () => {
      const client = new KongoClient({ apiKey: 'ke_live_test123' });
      expect(client).toBeDefined();
      expect(client.getRateLimitStatus().total).toBe(60);
    });

    it('accepts custom config', () => {
      const client = new KongoClient({
        apiKey: 'ke_live_test123',
        baseUrl: 'https://custom.kongo.io/api/v1',
        timeoutMs: 60_000,
        rateLimitPerMinute: 100,
      });
      expect(client.getRateLimitStatus().total).toBe(100);
    });
  });

  describe('GET requests', () => {
    it('sends GET with auth header and parses success response', async () => {
      const mockReq = createMockRequest();
      mockRequestFn.mockImplementation((_url: unknown, _opts: unknown, cb: (res: IncomingMessage) => void) => {
        cb(createMockResponse(200, {
          success: true,
          data: { pageId: 'pg_abc123', status: 'READY' },
        }));
        return mockReq;
      });

      const client = new KongoClient({ apiKey: 'ke_live_test123' });
      const result = await client.get<{ pageId: string }>('/engine/pages/pg_abc123');

      expect(result).toEqual({ pageId: 'pg_abc123', status: 'READY' });

      const callArgs = mockRequestFn.mock.calls[0];
      const url = callArgs[0] as URL;
      expect(url.pathname).toBe('/api/v1/engine/pages/pg_abc123');

      const opts = callArgs[1] as Record<string, unknown>;
      expect(opts.method).toBe('GET');
      expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer ke_live_test123');
    });

    it('appends query parameters', async () => {
      const mockReq = createMockRequest();
      mockRequestFn.mockImplementation((_url: unknown, _opts: unknown, cb: (res: IncomingMessage) => void) => {
        cb(createMockResponse(200, { success: true, data: { items: [] } }));
        return mockReq;
      });

      const client = new KongoClient({ apiKey: 'ke_live_test123' });
      await client.get('/engine/pages', { limit: 10, status: 'READY', extra: undefined });

      const url = mockRequestFn.mock.calls[0][0] as URL;
      expect(url.searchParams.get('limit')).toBe('10');
      expect(url.searchParams.get('status')).toBe('READY');
      expect(url.searchParams.has('extra')).toBe(false);
    });
  });

  describe('POST requests', () => {
    it('sends POST with JSON body', async () => {
      const mockReq = createMockRequest();
      mockRequestFn.mockImplementation((_url: unknown, _opts: unknown, cb: (res: IncomingMessage) => void) => {
        cb(createMockResponse(202, {
          success: true,
          data: { pageId: 'pg_new123', status: 'GENERATING' },
        }));
        return mockReq;
      });

      const client = new KongoClient({ apiKey: 'ke_live_test123' });
      const result = await client.post('/engine/pages', {
        companyName: 'Test Corp',
        content: 'Test content',
      });

      expect(result).toEqual({ pageId: 'pg_new123', status: 'GENERATING' });

      const opts = mockRequestFn.mock.calls[0][1] as Record<string, unknown>;
      expect(opts.method).toBe('POST');
      expect((opts.headers as Record<string, string>)['Content-Type']).toBe('application/json');
      expect(mockReq.write).toHaveBeenCalled();
    });

    it('sends extra headers when provided', async () => {
      const mockReq = createMockRequest();
      mockRequestFn.mockImplementation((_url: unknown, _opts: unknown, cb: (res: IncomingMessage) => void) => {
        cb(createMockResponse(202, { success: true, data: {} }));
        return mockReq;
      });

      const client = new KongoClient({ apiKey: 'ke_live_test123' });
      await client.post('/engine/pages', { companyName: 'Test' }, { 'Idempotency-Key': 'req_123' });

      const headers = (mockRequestFn.mock.calls[0][1] as Record<string, unknown>).headers as Record<string, string>;
      expect(headers['Idempotency-Key']).toBe('req_123');
    });
  });

  describe('error handling', () => {
    it('throws KongoApiError on API error response', async () => {
      const mockReq = createMockRequest();
      mockRequestFn.mockImplementation((_url: unknown, _opts: unknown, cb: (res: IncomingMessage) => void) => {
        cb(createMockResponse(404, {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Page not found' },
        }));
        return mockReq;
      });

      const client = new KongoClient({ apiKey: 'ke_live_test123' });

      try {
        await client.get('/engine/pages/pg_nonexistent');
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(KongoApiError);
        const apiErr = err as InstanceType<typeof KongoApiError>;
        expect(apiErr.code).toBe('NOT_FOUND');
        expect(apiErr.status).toBe(404);
        expect(apiErr.retryable).toBe(false);
      }
    });

    it('retries on 429 and succeeds', async () => {
      const mockReq = createMockRequest();
      let callCount = 0;
      mockRequestFn.mockImplementation((_url: unknown, _opts: unknown, cb: (res: IncomingMessage) => void) => {
        callCount++;
        if (callCount <= 2) {
          cb(createMockResponse(429, {
            success: false,
            error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' },
          }, { 'retry-after': '0' }));
        } else {
          cb(createMockResponse(200, { success: true, data: { ok: true } }));
        }
        return mockReq;
      });

      // Use a high rate limit to avoid client-side limiter interference
      const client = new KongoClient({ apiKey: 'ke_live_test123', rateLimitPerMinute: 1000 });
      const result = await client.get('/engine/pages');

      expect(result).toEqual({ ok: true });
      expect(callCount).toBe(3);
    }, 15_000);

    it('throws after max retries on persistent 429', async () => {
      const mockReq = createMockRequest();
      mockRequestFn.mockImplementation((_url: unknown, _opts: unknown, cb: (res: IncomingMessage) => void) => {
        cb(createMockResponse(429, {
          success: false,
          error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' },
        }, { 'retry-after': '0' }));
        return mockReq;
      });

      const client = new KongoClient({ apiKey: 'ke_live_test123', rateLimitPerMinute: 1000 });

      try {
        await client.get('/engine/pages');
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(KongoApiError);
        const apiErr = err as InstanceType<typeof KongoApiError>;
        expect(apiErr.code).toBe('RATE_LIMITED');
        expect(apiErr.retryable).toBe(true);
      }
    }, 15_000);

    it('handles network errors', async () => {
      const mockReq = createMockRequest();
      mockRequestFn.mockImplementation(() => {
        process.nextTick(() => mockReq.emit('error', new Error('ECONNREFUSED')));
        return mockReq;
      });

      const client = new KongoClient({ apiKey: 'ke_live_test123' });

      try {
        await client.get('/engine/pages');
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(KongoApiError);
        const apiErr = err as InstanceType<typeof KongoApiError>;
        expect(apiErr.code).toBe('NETWORK_ERROR');
        expect(apiErr.message).toContain('ECONNREFUSED');
      }
    }, 15_000);

    it('handles malformed JSON responses', async () => {
      const mockReq = createMockRequest();
      mockRequestFn.mockImplementation((_url: unknown, _opts: unknown, cb: (res: IncomingMessage) => void) => {
        cb(createMockResponse(200, 'not json at all'));
        return mockReq;
      });

      const client = new KongoClient({ apiKey: 'ke_live_test123' });
      await expect(client.get('/engine/pages')).rejects.toThrow('Failed to parse');
    });
  });

  describe('HTML response handling', () => {
    it('returns raw HTML when content-type is text/html', async () => {
      const mockReq = createMockRequest();
      const htmlContent = '<html><body>Hello</body></html>';
      mockRequestFn.mockImplementation((_url: unknown, _opts: unknown, cb: (res: IncomingMessage) => void) => {
        const res = new EventEmitter() as IncomingMessage;
        res.statusCode = 200;
        res.headers = { 'content-type': 'text/html; charset=utf-8' };
        process.nextTick(() => {
          res.emit('data', Buffer.from(htmlContent));
          res.emit('end');
        });
        cb(res);
        return mockReq;
      });

      const client = new KongoClient({ apiKey: 'ke_live_test123' });
      const result = await client.get<string>('/engine/pages/pg_123/html');
      expect(result).toBe(htmlContent);
    });
  });
});

describe('SlidingWindowLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests within limit', () => {
    const limiter = new SlidingWindowLimiter(5);
    expect(() => {
      for (let i = 0; i < 5; i++) limiter.acquire();
    }).not.toThrow();
  });

  it('throws when limit exceeded', () => {
    const limiter = new SlidingWindowLimiter(3);
    limiter.acquire();
    limiter.acquire();
    limiter.acquire();
    expect(() => limiter.acquire()).toThrow(KongoApiError);
  });

  it('allows requests after window expires', () => {
    const limiter = new SlidingWindowLimiter(2);
    limiter.acquire();
    limiter.acquire();
    expect(() => limiter.acquire()).toThrow();

    vi.advanceTimersByTime(60_001);

    expect(() => limiter.acquire()).not.toThrow();
  });

  it('reports correct status', () => {
    const limiter = new SlidingWindowLimiter(10);
    limiter.acquire();
    limiter.acquire();

    const status = limiter.getStatus();
    expect(status.available).toBe(8);
    expect(status.total).toBe(10);
    expect(status.windowMs).toBe(60_000);
  });
});
