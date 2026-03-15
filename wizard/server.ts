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

import { handleTerminalUpgrade } from './api/terminal.js';
import { killAllSessions } from './lib/pty-manager.js';
import { startHealthPoller, stopHealthPoller } from './lib/health-poller.js';

const UI_DIR = join(import.meta.dirname, 'ui');

/** Set by startServer so handleRequest can scope CORS to the actual origin. */
let serverPort = 0;

/** Expose the server port for WebSocket origin validation. */
export function getServerPort(): number {
  return serverPort;
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
  // CORS — scoped to the wizard's own origin
  // Allow both localhost and 127.0.0.1 — browser may use either
  const origin = req.headers.origin ?? '';
  const allowedOrigins = [`http://127.0.0.1:${serverPort}`, `http://localhost:${serverPort}`];
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  // Non-matching origins: no Access-Control-Allow-Origin header (browser blocks)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-VoidForge-Request');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data:; connect-src 'self' ws://localhost:${serverPort} ws://127.0.0.1:${serverPort}; frame-ancestors 'none'`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // CSRF protection — require custom header on all POST requests (F-06)
  if (req.method === 'POST' && !req.headers['x-voidforge-request']) {
    sendJson(res, 403, { error: 'Missing X-VoidForge-Request header' });
    return;
  }

  // Try API routes first
  const handler = route(req, res);
  if (handler) {
    try {
      await handler(req, res);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      console.error('API error:', message);
      sendJson(res, 500, { error: 'Internal server error' });
    }
    return;
  }

  // Static file serving
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  let pathname = url.pathname;

  if (pathname === '/' || pathname === '') {
    pathname = '/hall.html';
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

export function startServer(port: number): Promise<void> {
  serverPort = port;
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
      if (url.pathname === '/ws/terminal') {
        handleTerminalUpgrade(req, socket, head);
      } else {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
      }
    });

    server.listen(port, '127.0.0.1', () => {
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
