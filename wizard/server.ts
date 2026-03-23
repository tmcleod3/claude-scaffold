import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat, readdir } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { route } from './router.js';

// Node 20 LTS compatibility — import.meta.dirname requires Node 21.2+ (field report #122)
// @ts-ignore — polyfill for environments where import.meta.dirname is undefined
if (!import.meta.dirname) (import.meta as Record<string, unknown>).dirname = fileURLToPath(new URL('.', import.meta.url));

import './api/credentials.js';
import './api/cloud-providers.js';
import './api/prd.js';
import './api/project.js';
import './api/provision.js';
import './api/deploy.js';
// Lazy terminal import — node-pty is a native C++ module that may not be installed (field report #122)
try { await import('./api/terminal.js'); } catch { console.warn('Terminal module not available (node-pty not installed). PTY features disabled.'); }
import './api/projects.js';
import './api/auth.js';
import './api/users.js';
import './api/danger-room.js';
import './api/war-room.js';

// Lazy import — may not exist if node-pty is not installed
let handleTerminalUpgrade: ((req: IncomingMessage, socket: import('node:stream').Duplex, head: Buffer, session?: unknown) => void) | null = null;
try { handleTerminalUpgrade = (await import('./api/terminal.js')).handleTerminalUpgrade; } catch { /* node-pty not available */ }
import { handleDangerRoomUpgrade, closeDangerRoom } from './api/danger-room.js';
import { handleWarRoomUpgrade, closeWarRoom } from './api/war-room.js';
let killAllSessions: (() => void) | null = null;
try { killAllSessions = (await import('./lib/pty-manager.js')).killAllSessions; } catch { /* node-pty not available */ }
import { startHealthPoller, stopHealthPoller } from './lib/health-poller.js';
import { isRemoteMode, setRemoteMode, isLanMode, setLanMode, validateSession, parseSessionCookie, isAuthExempt, getClientIp, type SessionInfo, type UserRole } from './lib/tower-auth.js';
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
  { prefix: '/api/projects/access', minRole: 'deployer' }, // Fine-grained owner check in handler
  { prefix: '/api/projects/link', minRole: 'deployer' }, // Owner check in handler
  { prefix: '/api/projects/unlink', minRole: 'deployer' }, // Owner check in handler
  { prefix: '/api/projects/deploy-check', minRole: 'deployer' },
  { prefix: '/api/projects/import', minRole: 'deployer' },
  { prefix: '/api/projects/delete', minRole: 'deployer' },
  { prefix: '/api/prd', minRole: 'deployer' },
  { prefix: '/api/cloud', minRole: 'deployer' },
  { prefix: '/api/deploys', minRole: 'deployer' },
  { prefix: '/api/project/validate', minRole: 'deployer' },
  { prefix: '/api/project/defaults', minRole: 'deployer' },
  // Viewer: read-only endpoints (GET /api/projects, GET /api/auth/session, /api/danger-room/*) — no entry needed
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
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': 'no-cache, must-revalidate',
    });
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
  // SEC-R2-003: HSTS in remote mode — prevent downgrade attacks before Caddy redirect
  if (isRemoteMode()) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  const connectSrc = isRemoteMode() && serverHost
    ? `'self' ws://localhost:${serverPort} ws://127.0.0.1:${serverPort} wss://${serverHost}`
    : `'self' ws://localhost:${serverPort} ws://127.0.0.1:${serverPort}`;
  res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data:; connect-src ${connectSrc} https://cdn.jsdelivr.net; frame-ancestors 'none'`);

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

  // Server status endpoint — native module mtime check for restart detection
  const reqUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (reqUrl.pathname === '/api/server/status' && req.method === 'GET') {
    const needsRestart = await checkNativeModulesChanged();
    sendJson(res, 200, { needsRestart });
    return;
  }

  // Static file serving
  const url = reqUrl;
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

// ── Native module mtime detection (tech debt #11) ──
// At startup, snapshot the mtimes of all .node files. On each Lobby request,
// compare. If any changed, the server is running stale native modules.
let nativeModuleMtimes: Map<string, number> = new Map();

async function findNodeFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        results.push(...await findNodeFiles(fullPath));
      } else if (entry.name.endsWith('.node')) {
        results.push(fullPath);
      }
    }
  } catch { /* skip unreadable directories */ }
  return results;
}

async function snapshotNativeModules(): Promise<void> {
  try {
    const nodeModulesDir = resolve(join(import.meta.dirname, '..', 'node_modules'));
    const files = await findNodeFiles(nodeModulesDir);
    for (const fullPath of files) {
      const s = await stat(fullPath);
      nativeModuleMtimes.set(fullPath, s.mtimeMs);
    }
  } catch { /* non-fatal — if scan fails, we just can't detect changes */ }
}

export async function checkNativeModulesChanged(): Promise<boolean> {
  try {
    for (const [path, mtime] of nativeModuleMtimes) {
      const s = await stat(path);
      if (s.mtimeMs !== mtime) return true;
    }
  } catch { /* file missing = changed */ return true; }
  return false;
}

export function startServer(port: number, options?: { remote?: boolean; lan?: boolean; host?: string }): Promise<void> {
  serverPort = port;
  if (options?.remote) {
    setRemoteMode(true);
    serverHost = options.host ?? '';
  }
  if (options?.lan) {
    setLanMode(true);
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

    // WebSocket upgrade handler for terminal and Danger Room connections
    server.on('upgrade', (req, socket, head) => {
      console.error('[UPGRADE]', req.url, 'from', req.socket.remoteAddress);
      const url = new URL(req.url || '', `http://localhost:${port}`);

      if (url.pathname === '/ws/terminal') {
        // Terminal: deployer minimum in remote mode
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
          if (!hasRole(session, 'deployer')) {
            socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
            socket.destroy();
            return;
          }
          wsSession = session;
        }
        handleTerminalUpgrade(req, socket, head, wsSession);
      } else if (url.pathname === '/ws/danger-room') {
        // Danger Room: any authenticated user in remote mode (read-only dashboard)
        if (isRemoteMode()) {
          const token = parseSessionCookie(req.headers.cookie);
          const ip = getClientIp(req);
          const session = token ? validateSession(token, ip) : null;
          if (!session) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
          }
        }
        handleDangerRoomUpgrade(req, socket, head);
      } else if (url.pathname === '/ws/war-room') {
        // War Room: same auth rules as Danger Room
        if (isRemoteMode()) {
          const token = parseSessionCookie(req.headers.cookie);
          const ip = getClientIp(req);
          const session = token ? validateSession(token, ip) : null;
          if (!session) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
          }
        }
        handleWarRoomUpgrade(req, socket, head);
      } else {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
      }
    });

    // Bind to '::' (dual-stack) in local mode — macOS resolves 'localhost' to ::1 (IPv6),
    // so binding only to 127.0.0.1 breaks WebSocket connections from browsers.
    // LAN mode binds 0.0.0.0 for private network access (ZeroTier/Tailscale/WireGuard).
    const bindAddress = (isRemoteMode() || isLanMode()) ? '0.0.0.0' : '::';

    server.listen(port, bindAddress, async () => {
      await initAuditLog();
      startHealthPoller();
      await snapshotNativeModules();
      resolve();
    });

    // Graceful shutdown — stop health poller, then kill all PTY sessions
    let shuttingDown = false;
    const shutdown = (): void => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log('\n  Shutting down...');
      stopHealthPoller();
      closeDangerRoom();
      closeWarRoom();
      killAllSessions();
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 2000);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}
