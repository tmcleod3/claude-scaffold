import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { route } from './router.js';

import './api/credentials.js';
import './api/cloud-providers.js';
import './api/prd.js';
import './api/project.js';
import './api/provision.js';
import './api/deploy.js';
import './api/terminal.js';
import './api/projects.js';
import './api/auth.js';
import './api/users.js';

import { handleTerminalUpgrade } from './api/terminal.js';
import { killAllSessions } from './lib/pty-manager.js';
import { startHealthPoller, stopHealthPoller } from './lib/health-poller.js';
import { isRemoteMode, setRemoteMode, validateSession, parseSessionCookie, isAuthExempt, getClientIp, type SessionInfo, type UserRole } from './lib/tower-auth.js';
import { initAuditLog, audit } from './lib/audit-log.js';
import { hasRole } from './lib/user-manager.js';

// ── Route-level RBAC ────────────────────────────────
// Maps API path prefixes to minimum required role.
// Routes not listed here are accessible to any authenticated user.
// Auth-exempt routes bypass this entirely (handled by isAuthExempt).
const ROUTE_ROLES: Array<{ prefix: string; minRole: UserRole }> = [
  // Admin-only: user management
  { prefix: '/api/users/invite', minRole: 'admin' },
  { prefix: '/api/users/remove', minRole: 'admin' },
  { prefix: '/api/users/role', minRole: 'admin' },
  { prefix: '/api/users', minRole: 'admin' }, // GET /api/users (list)
  // Deployer+: infrastructure, credentials, terminals, project mutations
  { prefix: '/api/credentials', minRole: 'deployer' },
  { prefix: '/api/provision', minRole: 'deployer' },
  { prefix: '/api/deploy', minRole: 'deployer' },
  { prefix: '/api/terminal', minRole: 'deployer' },
  { prefix: '/api/project/create', minRole: 'deployer' },
  { prefix: '/api/projects/import', minRole: 'deployer' },
  { prefix: '/api/projects/delete', minRole: 'deployer' },
  { prefix: '/api/prd', minRole: 'deployer' },
  { prefix: '/api/cloud', minRole: 'deployer' },
  { prefix: '/api/deploys', minRole: 'deployer' },
  { prefix: '/api/project/validate', minRole: 'deployer' },
  { prefix: '/api/project/defaults', minRole: 'deployer' },
  // Viewer: read-only endpoints (GET /api/projects, GET /api/auth/session) — no entry needed
];

function getMinRole(pathname: string): UserRole | null {
  for (const rule of ROUTE_ROLES) {
    if (pathname === rule.prefix || pathname.startsWith(rule.prefix + '/')) {
      return rule.minRole;
    }
  }
  return null; // No restriction — any authenticated user
}

const UI_DIR = join(import.meta.dirname, 'ui');

/** Set by startServer so handleRequest can scope CORS to the actual origin. */
let serverPort = 0;
let serverHost = ''; // Set for remote mode (e.g., 'forge.yourdomain.com')

/** Expose the server port for WebSocket origin validation. */
export function getServerPort(): number {
  return serverPort;
}

/** Expose the server host for remote-mode WebSocket origin validation. */
export function getServerHost(): string {
  return serverHost;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function serveStatic(res: ServerResponse, filePath: string): Promise<void> {
  try {
    const content = await readFile(filePath);
    const ext = extname(filePath);
    const mime = MIME_TYPES[ext] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // CORS — scoped to the wizard's own origin (expanded for remote mode)
  const origin = req.headers.origin ?? '';
  const allowedOrigins = [`http://127.0.0.1:${serverPort}`, `http://localhost:${serverPort}`];
  if (isRemoteMode() && serverHost) {
    allowedOrigins.push(`https://${serverHost}`);
  }
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-VoidForge-Request');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  const connectSrc = isRemoteMode() && serverHost
    ? `'self' ws://localhost:${serverPort} ws://127.0.0.1:${serverPort} wss://${serverHost}`
    : `'self' ws://localhost:${serverPort} ws://127.0.0.1:${serverPort}`;
  res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data:; connect-src ${connectSrc}; frame-ancestors 'none'`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // CSRF protection — require custom header on all POST requests (F-06)
  if (req.method === 'POST' && !req.headers['x-voidforge-request']) {
    sendJson(res, 403, { success: false, error: 'Missing X-VoidForge-Request header' });
    return;
  }

  // Auth middleware — in remote mode, require valid session for non-exempt paths
  if (isRemoteMode()) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (!isAuthExempt(url.pathname)) {
      const token = parseSessionCookie(req.headers.cookie);
      const ip = getClientIp(req);
      const session = token ? validateSession(token, ip) : null;

      if (!session) {
        // API requests get 401, page requests get redirected to login
        if (url.pathname.startsWith('/api/')) {
          sendJson(res, 401, { success: false, error: 'Authentication required' });
        } else {
          res.writeHead(302, { Location: '/login.html' });
          res.end();
        }
        return;
      }

      // RBAC — check route-level minimum role
      const minRole = getMinRole(url.pathname);
      if (minRole && !hasRole(session, minRole)) {
        await audit('access_denied', ip, session.username, {
          path: url.pathname,
          role: session.role,
          required: minRole,
        });
        // Return 404 not 403 — no information leakage (per CLAUDE.md)
        sendJson(res, 404, { success: false, error: 'Not found' });
        return;
      }
    }
  }

  // Try API routes first
  const handler = route(req, res);
  if (handler) {
    try {
      await handler(req, res);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      console.error('API error:', message);
      sendJson(res, 500, { success: false, error: 'Internal server error' });
    }
    return;
  }

  // Static file serving
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  let pathname = url.pathname;

  if (pathname === '/' || pathname === '') {
    pathname = '/lobby.html';
  }

  // Prevent directory traversal — resolve then verify prefix
  const safePath = resolve(UI_DIR, '.' + pathname);
  if (!safePath.startsWith(UI_DIR)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }
  await serveStatic(res, safePath);
}

export function startServer(port: number, options?: { remote?: boolean; host?: string }): Promise<void> {
  serverPort = port;
  if (options?.remote) {
    setRemoteMode(true);
    serverHost = options.host ?? '';
  }
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      handleRequest(req, res).catch((err: unknown) => {
        console.error('Unhandled error:', err);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end('Internal Server Error');
        }
      });
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${port} is in use. Set VOIDFORGE_PORT to use a different port.`);
        process.exit(1);
      }
      reject(err);
    });

    // WebSocket upgrade handler for terminal connections
    server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url || '', `http://localhost:${port}`);
      if (url.pathname !== '/ws/terminal') {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }

      // In remote mode, validate Tower session before allowing WebSocket upgrade
      let wsSession: SessionInfo | undefined;
      if (isRemoteMode()) {
        const token = parseSessionCookie(req.headers.cookie);
        const ip = getClientIp(req);
        const session = token ? validateSession(token, ip) : null;
        if (!session) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
        // Viewers cannot access terminals — read-only dashboard only
        if (session.role === 'viewer') {
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
          socket.destroy();
          return;
        }
        wsSession = session;
      }

      handleTerminalUpgrade(req, socket, head, wsSession);
    });

    const bindAddress = isRemoteMode() ? '0.0.0.0' : '127.0.0.1';

    server.listen(port, bindAddress, async () => {
      await initAuditLog();
      startHealthPoller();
      resolve();
    });

    // Graceful shutdown — stop health poller, then kill all PTY sessions
    let shuttingDown = false;
    const shutdown = (): void => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log('\n  Shutting down...');
      stopHealthPoller();
      killAllSessions();
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 2000);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}
