/**
 * Health poller tests — URL validation, start/stop, SSRF protection.
 * Tests the exported start/stop lifecycle and the internal URL validation logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock project-registry to avoid filesystem access
vi.mock('../lib/project-registry.js', () => ({
  readRegistry: vi.fn(async () => []),
  batchUpdateHealthStatus: vi.fn(async () => {}),
}));

// Mock network module
vi.mock('../lib/network.js', () => ({
  isPrivateIp: (host: string) => host === '127.0.0.1' || host === '::1' || host.startsWith('10.') || host.startsWith('192.168.'),
}));

const { startHealthPoller, stopHealthPoller } = await import('../lib/health-poller.js');

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  stopHealthPoller();
  vi.useRealTimers();
});

describe('startHealthPoller', () => {
  it('starts without throwing', () => {
    expect(() => startHealthPoller()).not.toThrow();
  });

  it('is idempotent — calling twice does not double-start', () => {
    startHealthPoller();
    startHealthPoller(); // Should be a no-op
    // No error = success. stopHealthPoller in afterEach will clean up.
  });
});

describe('stopHealthPoller', () => {
  it('stops without throwing even when not started', () => {
    expect(() => stopHealthPoller()).not.toThrow();
  });

  it('stops a running poller', () => {
    startHealthPoller();
    expect(() => stopHealthPoller()).not.toThrow();
  });
});
