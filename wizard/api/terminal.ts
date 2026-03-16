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
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { addRoute } from '../router.js';
import { getSessionPassword } from './credentials.js';
import { getServerPort, getServerHost } from '../server.js';
import { parseJsonBody } from '../lib/body-parser.js';
import {
  createSession, writeToSession, onSessionData, resizeSession,
  killSession, listSessions, killAllSessions, sessionCount,
} from '../lib/pty-manager.js';
import { validateSession, parseSessionCookie, getClientIp, isRemoteMode } from '../lib/tower-auth.js';
import { hasProjectAccess, type SessionInfo } from '../lib/user-manager.js';
import { findByDirectory } from '../lib/project-registry.js';

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

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
    const authToken = createHmac('sha256', password).update(session.id).digest('hex');
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

// ── WebSocket upgrade handler ──────────────────────────

/**
 * Generate the WebSocket accept key per RFC 6455.
 */
function computeAcceptKey(wsKey: string): string {
  return createHash('sha1')
    .update(wsKey + '258EAFA5-E914-47DA-95CA-5AB5DC11E5B3')
    .digest('base64');
}

/**
 * Encode a string as a WebSocket text frame.
 * Handles payloads up to 65535 bytes (sufficient for terminal chunks).
 */
function encodeWsFrame(data: string): Buffer {
  const payload = Buffer.from(data, 'utf-8');
  const len = payload.length;

  let header: Buffer;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + text opcode
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    // For very large frames (unlikely for terminal output)
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  return Buffer.concat([header, payload]);
}

/**
 * Decode a WebSocket frame from client (masked per RFC 6455).
 * Returns the unmasked payload string, or null if not a complete text frame.
 */
function decodeWsFrame(buf: Buffer): { data: string; bytesConsumed: number } | null {
  if (buf.length < 2) return null;

  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let payloadLen = buf[1] & 0x7f;
  let offset = 2;

  if (payloadLen === 126) {
    if (buf.length < 4) return null;
    payloadLen = buf.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buf.length < 10) return null;
    payloadLen = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }

  const maskLen = masked ? 4 : 0;
  const totalLen = offset + maskLen + payloadLen;
  if (buf.length < totalLen) return null;

  let payload: Buffer;
  if (masked) {
    const mask = buf.subarray(offset, offset + 4);
    payload = Buffer.alloc(payloadLen);
    for (let i = 0; i < payloadLen; i++) {
      payload[i] = buf[offset + 4 + i] ^ mask[i % 4];
    }
  } else {
    payload = buf.subarray(offset, offset + payloadLen);
  }

  // Close frame
  if (opcode === 0x08) {
    return { data: '', bytesConsumed: totalLen };
  }

  // Ping → we should pong (handled in the connection loop)
  if (opcode === 0x09) {
    return { data: '\x09', bytesConsumed: totalLen };
  }

  // Text frame
  if (opcode === 0x01) {
    return { data: payload.toString('utf-8'), bytesConsumed: totalLen };
  }

  // Binary frame — treat as text
  if (opcode === 0x02) {
    return { data: payload.toString('utf-8'), bytesConsumed: totalLen };
  }

  return { data: '', bytesConsumed: totalLen };
}

/** Maximum WebSocket buffer size (1 MB) — prevents memory exhaustion from slow reads. */
const MAX_BUFFER_SIZE = 1024 * 1024;

/**
 * Handle a WebSocket upgrade request for a terminal session.
 * URL: /ws/terminal?session=<id>&token=<authToken>
 */
export function handleTerminalUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, userSession?: { username: string; role: 'admin' | 'deployer' | 'viewer' }): void {
  // userSession is available for audit/logging — passed from server.ts auth middleware
  void userSession; // Used for future per-connection audit enrichment
  console.error('[WS] Upgrade request:', req.url, 'Origin:', req.headers.origin, 'Head:', head.length, 'bytes');
  const password = getSessionPassword();
  if (!password) {
    console.error('[WS] REJECTED: vault locked');
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  // SEC-001: Origin validation — reject cross-origin WebSocket upgrades
  const origin = req.headers.origin || '';
  const port = getServerPort();
  const allowedOrigins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  // Add HTTPS origin for remote mode
  const remoteHost = getServerHost();
  if (remoteHost) {
    allowedOrigins.push(`https://${remoteHost}`);
  }
  if (!origin || !allowedOrigins.includes(origin)) {
    console.error('[WS] REJECTED: origin mismatch. Got:', JSON.stringify(origin), 'Allowed:', allowedOrigins);
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
  const expectedToken = createHmac('sha256', password).update(sessionId).digest('hex');
  if (!token || token.length !== expectedToken.length || !timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken))) {
    console.error('[WS] REJECTED: token mismatch');
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }

  // Verify the session exists
  const sessions = listSessions();
  if (!sessions.find((s) => s.id === sessionId)) {
    console.error('[WS] REJECTED: session not found:', sessionId);
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }

  // Complete WebSocket handshake
  const wsKey = req.headers['sec-websocket-key'];
  if (!wsKey) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }

  console.error('[WS] ACCEPTED: session', sessionId, '— completing handshake');
  const acceptKey = computeAcceptKey(wsKey);
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
    '\r\n'
  );

  // Defer PTY subscription to next tick — ensure the handshake response
  // is fully flushed before we start sending WebSocket frames.
  // Without this, PTY output buffered during session creation can be sent
  // as raw data interleaved with the handshake headers.
  let unsubscribe: (() => void) | null = null;
  setImmediate(() => {
    unsubscribe = onSessionData(sessionId, (data: string) => {
      if (!socket.destroyed) {
        try { socket.write(encodeWsFrame(data)); } catch { /* socket gone */ }
      }
    });
  });

  // Process any data that arrived with the upgrade request (head buffer)
  let buffer = head.length > 0 ? Buffer.from(head) : Buffer.alloc(0);

  socket.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);

    // QA-004/SEC-005: Prevent memory exhaustion from slow reads or malicious clients
    if (buffer.length > MAX_BUFFER_SIZE) {
      socket.destroy();
      return;
    }

    while (buffer.length > 0) {
      const frame = decodeWsFrame(buffer);
      if (!frame) break; // incomplete frame, wait for more data

      // QA-005: Guard against zero-length consumption (infinite loop)
      if (frame.bytesConsumed === 0) break;

      buffer = buffer.subarray(frame.bytesConsumed);

      // QA-005: Handle close frame — send close frame back per RFC 6455
      if (!frame.data && frame.bytesConsumed > 0) {
        const closeFrame = Buffer.alloc(2);
        closeFrame[0] = 0x88; // FIN + close opcode
        closeFrame[1] = 0;
        socket.write(closeFrame);
        socket.destroy();
        return;
      }

      if (!frame.data) continue;

      // Ping → send pong
      if (frame.data === '\x09') {
        const pong = Buffer.alloc(2);
        pong[0] = 0x8a; // FIN + pong
        pong[1] = 0;
        socket.write(pong);
        continue;
      }

      // Try to parse as JSON control message
      if (frame.data.startsWith('{')) {
        try {
          const msg = JSON.parse(frame.data) as { type: string; cols?: number; rows?: number };
          if (msg.type === 'resize' && msg.cols && msg.rows) {
            resizeSession(sessionId, msg.cols, msg.rows);
            continue;
          }
        } catch {
          // Not JSON — treat as regular input
        }
      }

      // Regular input → send to PTY
      try {
        writeToSession(sessionId, frame.data);
      } catch {
        // Session may have been killed
        socket.destroy();
      }
    }
  });

  // Handle disconnection
  socket.on('close', () => {
    if (unsubscribe) unsubscribe();
    // Don't kill the session on disconnect — allow reconnection
    // Session will be killed by idle timeout if not reconnected
  });

  socket.on('error', () => {
    if (unsubscribe) unsubscribe();
  });

  // Write the head buffer if it contains data
  if (head.length > 0) {
    socket.emit('data', head);
  }
}
