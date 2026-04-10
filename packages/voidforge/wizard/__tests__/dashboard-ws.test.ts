/**
 * Dashboard WebSocket tests — creation, broadcast, connection management.
 * Mocks ws library and dependency modules.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before import
vi.mock('ws', () => {
  class MockWebSocketServer {
    handleUpgrade = vi.fn((req: unknown, socket: unknown, head: unknown, cb: (ws: unknown) => void) => {
      cb(new MockWebSocket());
    });
    close = vi.fn();
  }
  class MockWebSocket {
    static OPEN = 1;
    readyState = 1;
    on = vi.fn();
    send = vi.fn();
    ping = vi.fn();
    close = vi.fn();
    terminate = vi.fn();
  }
  return { WebSocketServer: MockWebSocketServer, WebSocket: MockWebSocket };
});

vi.mock('../lib/server-config.js', () => ({
  getServerPort: () => 3000,
  getServerHost: () => '',
}));

vi.mock('../lib/tower-auth.js', () => ({
  isLanMode: () => false,
}));

vi.mock('../lib/network.js', () => ({
  isPrivateOrigin: () => false,
}));

const { createDashboardWs } = await import('../lib/dashboard-ws.js');

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createDashboardWs', () => {
  it('creates a dashboard with zero initial clients', () => {
    const ws = createDashboardWs('Test Dashboard');
    expect(ws.clientCount()).toBe(0);
    ws.close();
  });

  it('exposes broadcast, handleUpgrade, close, clientCount', () => {
    const ws = createDashboardWs('Test');
    expect(typeof ws.broadcast).toBe('function');
    expect(typeof ws.handleUpgrade).toBe('function');
    expect(typeof ws.close).toBe('function');
    expect(typeof ws.clientCount).toBe('function');
    ws.close();
  });

  it('rejects upgrade with missing origin', () => {
    const ws = createDashboardWs('Test');
    const socket = { write: vi.fn(), destroy: vi.fn() };
    const req = { headers: {} };

    ws.handleUpgrade(req as never, socket as never, Buffer.alloc(0));
    expect(socket.write).toHaveBeenCalledWith(expect.stringContaining('403'));
    expect(socket.destroy).toHaveBeenCalled();
    ws.close();
  });

  it('rejects upgrade with invalid origin', () => {
    const ws = createDashboardWs('Test');
    const socket = { write: vi.fn(), destroy: vi.fn() };
    const req = { headers: { origin: 'https://evil.com' } };

    ws.handleUpgrade(req as never, socket as never, Buffer.alloc(0));
    expect(socket.write).toHaveBeenCalledWith(expect.stringContaining('403'));
    ws.close();
  });

  it('broadcast does not throw with no clients', () => {
    const ws = createDashboardWs('Test');
    expect(() => ws.broadcast({ type: 'test' })).not.toThrow();
    ws.close();
  });
});
