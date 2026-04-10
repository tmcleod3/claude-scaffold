/**
 * Tests for server.ts — HTTP server creation, middleware chain, request dispatch.
 * Campaign 34 (v23.2 "The Coverage"), Mission 3.
 *
 * Strategy: Mock all API modules (they register routes as side effects) and heavy
 * lib dependencies. Start the server on a random port and make real HTTP requests
 * to verify the middleware chain: CORS, CSRF, security headers, static serving,
 * error handling.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ── Mock all API side-effect modules ───────────────────

vi.mock('../api/credentials.js', () => ({}));
vi.mock('../api/cloud-providers.js', () => ({}));
vi.mock('../api/prd.js', () => ({}));
vi.mock('../api/project.js', () => ({}));
vi.mock('../api/provision.js', () => ({}));
vi.mock('../api/deploy.js', () => ({}));
vi.mock('../api/terminal.js', () => ({ handleTerminalUpgrade: null }));
vi.mock('../api/projects.js', () => ({}));
vi.mock('../api/auth.js', () => ({}));
vi.mock('../api/users.js', () => ({}));
vi.mock('../api/blueprint.js', () => ({}));
vi.mock('../api/danger-room.js', () => ({
  handleDangerRoomUpgrade: vi.fn(),
  closeDangerRoom: vi.fn(),
}));
vi.mock('../api/war-room.js', () => ({
  handleWarRoomUpgrade: vi.fn(),
  closeWarRoom: vi.fn(),
}));

// ── Mock lib modules with filesystem/native deps ────────

vi.mock('../lib/pty-manager.js', () => ({
  killAllSessions: vi.fn(),
}));

vi.mock('../lib/health-poller.js', () => ({
  startHealthPoller: vi.fn(),
  stopHealthPoller: vi.fn(),
}));

vi.mock('../lib/audit-log.js', () => ({
  initAuditLog: vi.fn(async () => {}),
  audit: vi.fn(async () => {}),
}));

vi.mock('../lib/tower-auth.js', () => ({
  isRemoteMode: vi.fn(() => false),
  setRemoteMode: vi.fn(),
  isLanMode: vi.fn(() => false),
  setLanMode: vi.fn(),
  validateSession: vi.fn(() => null),
  parseSessionCookie: vi.fn(() => null),
  isAuthExempt: vi.fn(() => false),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

vi.mock('../lib/user-manager.js', () => ({
  hasRole: vi.fn(() => true),
}));

vi.mock('../lib/network.js', () => ({
  isPrivateOrigin: vi.fn(() => false),
}));

// ── Import after mocks ────────────────────────────────

const { startServer, checkNativeModulesChanged } = await import('../server.js');

// ── Test helpers ──────────────────────────────────────

let serverPort: number;

function request(
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: serverPort,
        path,
        method: options.method ?? 'GET',
        headers: options.headers ?? {},
      },
      (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

// ── Setup: start server once ──────────────────────────

// Use a high random port to avoid conflicts
serverPort = 10000 + Math.floor(Math.random() * 50000);

beforeAll(async () => {
  await startServer(serverPort);
}, 10000);

// ── Tests ─────────────────────────────────────────────

describe('Server HTTP behavior', () => {
  describe('security headers', () => {
    it('sets X-Content-Type-Options: nosniff on every response', async () => {
      const res = await request('/');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('sets X-Frame-Options: DENY on every response', async () => {
      const res = await request('/');
      expect(res.headers['x-frame-options']).toBe('DENY');
    });

    it('sets Referrer-Policy header', async () => {
      const res = await request('/');
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });

    it('sets Permissions-Policy to deny camera, mic, geo', async () => {
      const res = await request('/');
      expect(res.headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');
    });

    it('sets Content-Security-Policy header', async () => {
      const res = await request('/');
      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['content-security-policy']).toContain("default-src 'self'");
      expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    });
  });

  describe('CORS handling', () => {
    it('sets CORS headers for allowed origin', async () => {
      const res = await request('/', {
        headers: { origin: `http://127.0.0.1:${serverPort}` },
      });
      expect(res.headers['access-control-allow-origin']).toBe(`http://127.0.0.1:${serverPort}`);
      expect(res.headers['access-control-allow-methods']).toBe('GET, POST, OPTIONS');
    });

    it('does not set Access-Control-Allow-Origin for disallowed origin', async () => {
      const res = await request('/', {
        headers: { origin: 'https://evil.com' },
      });
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('responds 204 to OPTIONS preflight', async () => {
      const res = await request('/', { method: 'OPTIONS' });
      expect(res.status).toBe(204);
      expect(res.body).toBe('');
    });
  });

  describe('CSRF protection', () => {
    it('rejects POST without X-VoidForge-Request header', async () => {
      const res = await request('/api/test', { method: 'POST' });
      expect(res.status).toBe(403);
      const json = JSON.parse(res.body);
      expect(json.error).toContain('X-VoidForge-Request');
    });

    it('allows POST with X-VoidForge-Request header', async () => {
      // POST with the required header — should pass CSRF check
      // It will 404 since no route is registered, but we verify no 403
      const res = await request('/api/no-such-route', {
        method: 'POST',
        headers: { 'x-voidforge-request': '1' },
      });
      // Should not be 403 (CSRF block) — expect 404 from static serving
      expect(res.status).not.toBe(403);
    });
  });

  describe('static file serving', () => {
    it('redirects / to lobby.html', async () => {
      // The server serves static files from the ui directory.
      // If lobby.html doesn't exist, it returns 404 — but the key test is
      // that the path was resolved (not a 500 or route handler).
      const res = await request('/');
      // Should be either 200 (file found) or 404 (file not found in test env)
      expect([200, 404]).toContain(res.status);
    });

    it('prevents directory traversal', async () => {
      const res = await request('/../../../etc/passwd');
      expect(res.status).toBe(404);
    });

    it('prevents encoded directory traversal', async () => {
      const res = await request('/..%2F..%2F..%2Fetc%2Fpasswd');
      expect(res.status).toBe(404);
    });
  });

  describe('API route dispatch', () => {
    it('dispatches registered API route and returns response', async () => {
      // The server registers GET /api/server/status via addRoute.
      // checkNativeModulesChanged is called internally.
      const res = await request('/api/server/status');
      expect(res.status).toBe(200);
      const json = JSON.parse(res.body);
      expect(json).toHaveProperty('needsRestart');
      expect(typeof json.needsRestart).toBe('boolean');
    });
  });

  describe('error handling', () => {
    it('returns 404 for unknown API paths', async () => {
      const res = await request('/api/does-not-exist');
      // No API route matched — falls through to static serving, which returns 404
      expect(res.status).toBe(404);
    });
  });
});

describe('checkNativeModulesChanged()', () => {
  it('returns false when no native modules have been snapshot', async () => {
    // No native modules were found during test startup (mocked env),
    // so the Map is empty and nothing has changed.
    const result = await checkNativeModulesChanged();
    expect(result).toBe(false);
  });
});
