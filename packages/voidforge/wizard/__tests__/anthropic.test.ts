/**
 * Anthropic API tests — model resolution, caching, max token limits.
 * Mocks node:https to avoid real API calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ClientRequest } from 'node:http';
import { EventEmitter } from 'node:events';

// Create mock request function
const mockRequest = vi.fn();

vi.mock('node:https', () => ({
  request: mockRequest,
}));

const { resolveBestModel, resolveModelWithLimits, clearModelCache } = await import('../lib/anthropic.js');

function createMockResponse(statusCode: number, body: string): EventEmitter & { statusCode: number } {
  const res = new EventEmitter() as EventEmitter & { statusCode: number };
  res.statusCode = statusCode;
  // Emit data and end asynchronously
  setTimeout(() => {
    res.emit('data', Buffer.from(body));
    res.emit('end');
  }, 0);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  clearModelCache();
});

describe('resolveBestModel', () => {
  it('picks opus model when available', async () => {
    mockRequest.mockImplementation((_opts: unknown, cb: (res: unknown) => void) => {
      const res = createMockResponse(200, JSON.stringify({
        data: [
          { id: 'claude-opus-4-20250514', display_name: 'Opus', created_at: '2025-05-14', type: 'model' },
          { id: 'claude-sonnet-4-20250514', display_name: 'Sonnet', created_at: '2025-05-14', type: 'model' },
        ],
      }));
      cb(res);
      const req = new EventEmitter();
      (req as unknown as { end: () => void }).end = vi.fn();
      return req;
    });

    const model = await resolveBestModel('test-key');
    expect(model).toContain('claude-opus');
  });

  it('falls back to sonnet when opus is unavailable', async () => {
    mockRequest.mockImplementation((_opts: unknown, cb: (res: unknown) => void) => {
      const res = createMockResponse(200, JSON.stringify({
        data: [
          { id: 'claude-sonnet-4-20250514', display_name: 'Sonnet', created_at: '2025-05-14', type: 'model' },
          { id: 'claude-haiku-3-20250514', display_name: 'Haiku', created_at: '2025-05-14', type: 'model' },
        ],
      }));
      cb(res);
      const req = new EventEmitter();
      (req as unknown as { end: () => void }).end = vi.fn();
      return req;
    });

    const model = await resolveBestModel('test-key');
    expect(model).toContain('claude-sonnet');
  });

  it('falls back to claude-sonnet-4-6 on API error', async () => {
    mockRequest.mockImplementation((_opts: unknown, _cb: unknown) => {
      const req = new EventEmitter();
      (req as unknown as { end: () => void; destroy: () => void }).end = vi.fn();
      (req as unknown as { end: () => void; destroy: () => void }).destroy = vi.fn();
      setTimeout(() => req.emit('error', new Error('connection refused')), 0);
      return req;
    });

    const model = await resolveBestModel('test-key');
    expect(model).toBe('claude-sonnet-4-6');
  });

  it('caches model after first resolution', async () => {
    let callCount = 0;
    mockRequest.mockImplementation((_opts: unknown, cb: (res: unknown) => void) => {
      callCount++;
      const res = createMockResponse(200, JSON.stringify({
        data: [{ id: 'claude-opus-4-20250514', display_name: 'Opus', created_at: '2025-05-14', type: 'model' }],
      }));
      cb(res);
      const req = new EventEmitter();
      (req as unknown as { end: () => void }).end = vi.fn();
      return req;
    });

    await resolveBestModel('test-key');
    await resolveBestModel('test-key');
    expect(callCount).toBe(1); // Only one API call
  });
});

describe('clearModelCache', () => {
  it('forces re-fetch on next call', async () => {
    let callCount = 0;
    mockRequest.mockImplementation((_opts: unknown, cb: (res: unknown) => void) => {
      callCount++;
      const res = createMockResponse(200, JSON.stringify({
        data: [{ id: 'claude-sonnet-4-20250514', display_name: 'Sonnet', created_at: '2025-05-14', type: 'model' }],
      }));
      cb(res);
      const req = new EventEmitter();
      (req as unknown as { end: () => void }).end = vi.fn();
      return req;
    });

    await resolveBestModel('test-key');
    clearModelCache();
    await resolveBestModel('test-key');
    expect(callCount).toBe(2);
  });
});

describe('resolveModelWithLimits', () => {
  it('returns model ID and max tokens', async () => {
    mockRequest.mockImplementation((_opts: unknown, cb: (res: unknown) => void) => {
      const res = createMockResponse(200, JSON.stringify({
        data: [{ id: 'claude-opus-4-20250514', display_name: 'Opus', created_at: '2025-05-14', type: 'model' }],
      }));
      cb(res);
      const req = new EventEmitter();
      (req as unknown as { end: () => void }).end = vi.fn();
      return req;
    });

    const result = await resolveModelWithLimits('test-key');
    expect(result.id).toContain('claude-opus');
    expect(result.maxTokens).toBe(32768);
  });
});
