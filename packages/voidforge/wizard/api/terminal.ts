/**
 * Terminal API — WebSocket bridge between browser (xterm.js) and server (node-pty).
 * Also REST endpoints for session management.
 *
 * WebSocket protocol:
 *   Client → Server: raw keystrokes (text frames)
 *   Server → Client: raw terminal output (text frames)
 *   Client → Server: JSON control messages: { type: "resize", cols, rows }
 *   Server → Client: JSON control messages: { type: "exit", code }
 *
 * Auth: vault password required in the WebSocket URL query string.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

// SEC-R2-108: Per-boot random HMAC key — decoupled from vault password to prevent offline brute-force
const TERMINAL_HMAC_KEY = randomBytes(32);
import { WebSocketServer, WebSocket } from 'ws';
import { access, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { addRoute } from '../router.js';
import { getSessionPassword } from './credentials.js';
import { getServerPort, getServerHost } from '../lib/server-config.js';
import { parseJsonBody } from '../lib/body-parser.js';
import {
  createSession, writeToSession, onSessionData, resizeSession,
  killSession, listSessions, killAllSessions, sessionCount,
} from '../lib/pty-manager.js';
import { validateSession, parseSessionCookie, getClientIp, isRemoteMode, isLanMode } from '../lib/tower-auth.js';
import { isPrivateOrigin } from '../lib/network.js';
import { hasProjectAccess, type SessionInfo } from '../lib/user-manager.js';
import { findByDirectory } from '../lib/project-registry.js';
import { sendJson } from '../lib/http-helpers.js';

// ── REST endpoints for session management ──────────────

// GET /api/terminal/sessions — list active PTY sessions (filtered by project access)
addRoute('GET', '/api/terminal/sessions', async (req: IncomingMessage, res: ServerResponse) => {
  const password = getSessionPassword();
  if (!password) {
    sendJson(res, 401, { error: 'Vault is locked.' });
    return;
  }

  let allSessions = listSessions();

  // In remote mode, filter sessions by user's project access
  if (isRemoteMode()) {
    const token = parseSessionCookie(req.headers.cookie);
    const ip = getClientIp(req);
    const userSession = token ? validateSession(token, ip) : null;
    if (userSession && userSession.role !== 'admin') {
      // Non-admins only see their own sessions
      allSessions = allSessions.filter((s) => s.username === userSession.username);
    }
  }

  sendJson(res, 200, { sessions: allSessions, count: allSessions.length });
});

// POST /api/terminal/sessions — create a new PTY session
addRoute('POST', '/api/terminal/sessions', async (req: IncomingMessage, res: ServerResponse) => {
  const password = getSessionPassword();
  if (!password) {
    sendJson(res, 401, { error: 'Vault is locked.' });
    return;
  }

  const body = await parseJsonBody(req) as {
    projectDir?: string;
    projectName?: string;
    label?: string;
    initialCommand?: string;
    cols?: number;
    rows?: number;
  };

  if (!body.projectDir || !body.projectName) {
    sendJson(res, 400, { error: 'projectDir and projectName are required' });
    return;
  }

  // SEC-003/QA-002: Validate projectDir — absolute path, no traversal
  if (!body.projectDir.startsWith('/') || body.projectDir.includes('..')) {
    sendJson(res, 400, { error: 'projectDir must be an absolute path with no ".." segments' });
    return;
  }

  // IG-R4: Resolve symlinks and use real path for all operations
  try {
    body.projectDir = await realpath(body.projectDir);
  } catch {
    sendJson(res, 400, { error: 'Could not resolve project directory path' });
    return;
  }

  // Verify this is a VoidForge project (CLAUDE.md exists)
  try {
    await access(join(body.projectDir, 'CLAUDE.md'));
  } catch {
    sendJson(res, 400, { error: 'Not a VoidForge project — no CLAUDE.md found' });
    return;
  }

  // Extract user context and check per-project access
  let sessionUsername = '';
  if (isRemoteMode()) {
    const token = parseSessionCookie(req.headers.cookie);
    const ip = getClientIp(req);
    const userSession = token ? validateSession(token, ip) : null;
    if (!userSession) {
      sendJson(res, 401, { error: 'Authentication required' });
      return;
    }
    sessionUsername = userSession.username;
    // Check per-project access — deployer minimum for terminal
    const project = await findByDirectory(body.projectDir);
    if (!project) {
      // Project not in registry — deny access (cannot verify permissions)
      sendJson(res, 404, { error: 'Project not found in registry' });
      return;
    }
    const projectAccess = await hasProjectAccess(userSession, project.id, 'deployer');
    if (!projectAccess) {
      sendJson(res, 404, { error: 'Project not found' });
      return;
    }
  }

  try {
    const session = await createSession(
      body.projectDir,
      body.projectName,
      body.label || 'Shell',
      body.initialCommand,
      body.cols || 120,
      body.rows || 30,
      sessionUsername,
    );
    // SEC-001/SEC-002: Generate per-session auth token for WebSocket upgrade
    const authToken = createHmac('sha256', TERMINAL_HMAC_KEY).update(session.id).digest('hex');
    sendJson(res, 200, { session, authToken });
  } catch (err) {
    sendJson(res, 400, { error: (err as Error).message });
  }
});

// POST /api/terminal/sessions/:id/kill — kill a session (ownership check in remote mode)
addRoute('POST', '/api/terminal/kill', async (req: IncomingMessage, res: ServerResponse) => {
  const password = getSessionPassword();
  if (!password) {
    sendJson(res, 401, { error: 'Vault is locked.' });
    return;
  }

  const body = await parseJsonBody(req) as { sessionId?: string };
  if (!body.sessionId) {
    sendJson(res, 400, { error: 'sessionId is required' });
    return;
  }

  // In remote mode, non-admins can only kill their own sessions
  if (isRemoteMode()) {
    const token = parseSessionCookie(req.headers.cookie);
    const ip = getClientIp(req);
    const userSession = token ? validateSession(token, ip) : null;
    if (userSession && userSession.role !== 'admin') {
      const sessions = listSessions();
      const target = sessions.find((s) => s.id === body.sessionId);
      if (!target || target.username !== userSession.username) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }
    }
  }

  killSession(body.sessionId);
  sendJson(res, 200, { killed: true });
});

// ── WebSocket upgrade handler (using 'ws' library) ─────

/** Shared WebSocketServer instance — noServer mode lets us handle upgrade manually. */
const wss = new WebSocketServer({ noServer: true });

/**
 * Handle a WebSocket upgrade request for a terminal session.
 * URL: /ws/terminal?session=<id>&token=<authToken>
 *
 * Auth flow: vault password → origin check → HMAC token → session existence.
 * Then ws library handles the protocol handshake.
 */
export function handleTerminalUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, userSession?: { username: string; role: 'admin' | 'deployer' | 'viewer' }): void {
  void userSession;
  const password = getSessionPassword();
  if (!password) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  // SEC-001: Origin validation
  const origin = req.headers.origin || '';
  const port = getServerPort();
  const allowedOrigins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  const remoteHost = getServerHost();
  if (remoteHost) {
    allowedOrigins.push(`https://${remoteHost}`);
  }
  // LAN mode: accept any private IP origin (matches CORS handler in server.ts)
  const isAllowed = allowedOrigins.includes(origin)
    || (isLanMode() && isPrivateOrigin(origin));
  if (!origin || !isAllowed) {
    console.log(`  PTY WS rejected: origin=${origin} allowed=${JSON.stringify(allowedOrigins)} lan=${isLanMode()}`);
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }

  const url = new URL(req.url || '', 'http://localhost');
  const sessionId = url.searchParams.get('session');
  if (!sessionId) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }

  // SEC-002: Validate per-session auth token
  const token = url.searchParams.get('token');
  const expectedToken = createHmac('sha256', TERMINAL_HMAC_KEY).update(sessionId).digest('hex');
  if (!token || token.length !== expectedToken.length || !timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken))) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }

  // Verify session exists
  const sessions = listSessions();
  if (!sessions.find((s) => s.id === sessionId)) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }

  // Let the ws library handle the WebSocket handshake
  wss.handleUpgrade(req, socket, head, (ws) => {
    // Subscribe to PTY output → send to browser
    const unsubscribe = onSessionData(sessionId, (data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(data); } catch { /* client gone */ }
      }
    });

    // Browser → PTY: keystrokes and control messages
    ws.on('message', (raw: Buffer | string) => {
      const msg = typeof raw === 'string' ? raw : raw.toString('utf-8');

      // JSON control messages (resize)
      if (msg.startsWith('{')) {
        try {
          const parsed = JSON.parse(msg) as { type: string; cols?: number; rows?: number };
          // IG-R2: Validate numeric types to prevent NaN propagation to node-pty
          if (parsed.type === 'resize' && typeof parsed.cols === 'number' && typeof parsed.rows === 'number'
              && Number.isFinite(parsed.cols) && Number.isFinite(parsed.rows)) {
            resizeSession(sessionId, parsed.cols, parsed.rows);
            return;
          }
        } catch { /* not JSON — treat as keystroke input */ }
      }

      // Regular input → PTY
      try {
        writeToSession(sessionId, msg);
      } catch {
        ws.close();
      }
    });

    ws.on('close', () => {
      unsubscribe();
      // Don't kill session — allow reconnection. Idle timeout handles cleanup.
    });

    ws.on('error', () => {
      unsubscribe();
    });
  });
}
