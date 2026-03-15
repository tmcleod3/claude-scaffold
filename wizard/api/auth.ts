/**
 * Auth API — Login, logout, session check, initial setup.
 * All responses use { success, data?, error? } format.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { addRoute } from '../router.js';
import { parseJsonBody } from '../lib/body-parser.js';
import {
  hasUsers,
  createUser,
  login,
  logout,
  validateSession,
  parseSessionCookie,
  buildSessionCookie,
  clearSessionCookie,
  isRemoteMode,
  checkRateLimit,
  getClientIp,
  getUserRole,
  isValidUsername,
} from '../lib/tower-auth.js';
import { audit } from '../lib/audit-log.js';

function sendJson(res: ServerResponse, status: number, data: unknown, noCache = false): void {
  const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' };
  if (noCache) {
    headers['Cache-Control'] = 'no-store';
    headers['Pragma'] = 'no-cache';
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(data));
}

// POST /api/auth/setup — Create initial admin user (only when no users exist)
addRoute('POST', '/api/auth/setup', async (req: IncomingMessage, res: ServerResponse) => {
  if (!isRemoteMode()) {
    sendJson(res, 400, { success: false, error: 'Auth setup is only available in remote mode' });
    return;
  }

  // Rate-limit the setup endpoint (prevents race-to-setup attacks)
  const ip = getClientIp(req);
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    sendJson(res, 429, { success: false, error: 'Too many attempts. Try again later.' });
    return;
  }

  // Validate body BEFORE the hasUsers check — body parsing is not security-sensitive
  const body = await parseJsonBody(req);
  if (typeof body !== 'object' || body === null) {
    sendJson(res, 400, { success: false, error: 'Request body must be a JSON object' });
    return;
  }

  const { username, password } = body as Record<string, unknown>;
  if (typeof username !== 'string' || !isValidUsername(username.trim())) {
    sendJson(res, 400, { success: false, error: 'Username must be 3-64 characters (letters, numbers, . _ -)' });
    return;
  }
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) {
    sendJson(res, 400, { success: false, error: 'Password must be 12-256 characters' });
    return;
  }

  try {
    // createUser is serialized — the hasUsers check inside it is atomic with creation.
    // This prevents the TOCTOU race where two concurrent setup requests both pass hasUsers().
    const existing = await hasUsers();
    if (existing) {
      sendJson(res, 409, { success: false, error: 'Admin user already exists' });
      return;
    }

    const { totpSecret, totpUri } = await createUser(username.trim(), password);
    await audit('user_create', ip, username.trim(), { action: 'initial_setup' });
    sendJson(res, 201, {
      success: true,
      data: { totpSecret, totpUri, message: 'Scan the QR code with your authenticator app.' },
    }, true); // no-cache — TOTP secret must not be cached
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Setup failed';
    if (message.includes('already taken')) {
      sendJson(res, 409, { success: false, error: 'Admin user already exists' });
    } else {
      sendJson(res, 500, { success: false, error: 'Failed to create user' });
    }
  }
});

// POST /api/auth/login — Authenticate with username + password + TOTP
addRoute('POST', '/api/auth/login', async (req: IncomingMessage, res: ServerResponse) => {
  if (!isRemoteMode()) {
    sendJson(res, 400, { success: false, error: 'Auth is only required in remote mode' });
    return;
  }

  const body = await parseJsonBody(req);
  if (typeof body !== 'object' || body === null) {
    sendJson(res, 400, { success: false, error: 'Request body must be a JSON object' });
    return;
  }

  const { username, password, totpCode } = body as Record<string, unknown>;
  if (typeof username !== 'string' || typeof password !== 'string' || typeof totpCode !== 'string') {
    sendJson(res, 400, { success: false, error: 'username, password, and totpCode are required strings' });
    return;
  }

  // Cap field lengths to prevent DoS via oversized PBKDF2 input
  if (username.length > 64 || password.length > 256 || totpCode.length > 6) {
    sendJson(res, 400, { success: false, error: 'Field length exceeded' });
    return;
  }

  const ip = getClientIp(req);
  await audit('login_attempt', ip, username.slice(0, 64), { method: 'password+totp' });

  const result = await login(username, password, totpCode, ip);

  if ('error' in result) {
    await audit('login_failure', ip, username.slice(0, 64), { reason: result.error });
    const status = result.retryAfterMs ? 429 : 401;
    sendJson(res, status, { success: false, error: result.error }, true);
    return;
  }

  const role = await getUserRole(username.slice(0, 64));
  await audit('login_success', ip, username.slice(0, 64), { role: role ?? 'unknown' });

  // In remote mode, always set Secure flag (Caddy provides HTTPS).
  // Don't rely on X-Forwarded-Proto which could be omitted if proxy is bypassed.
  const secure = isRemoteMode() || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', buildSessionCookie(result.token, secure));
  sendJson(res, 200, { success: true, data: { username: username.slice(0, 64), role } }, true);
});

// POST /api/auth/logout — Invalidate session
addRoute('POST', '/api/auth/logout', async (req: IncomingMessage, res: ServerResponse) => {
  const token = parseSessionCookie(req.headers.cookie);
  const ip = getClientIp(req);

  if (token) {
    const session = validateSession(token, ip);
    logout(token);
    if (session) {
      await audit('logout', ip, session.username, {});
    }
  }

  res.setHeader('Set-Cookie', clearSessionCookie());
  sendJson(res, 200, { success: true });
});

// GET /api/auth/session — Check if current session is valid
addRoute('GET', '/api/auth/session', async (req: IncomingMessage, res: ServerResponse) => {
  if (!isRemoteMode()) {
    sendJson(res, 200, { success: true, data: { authenticated: true, username: 'local', role: 'admin', remoteMode: false } });
    return;
  }

  const token = parseSessionCookie(req.headers.cookie);
  const ip = getClientIp(req);

  if (!token) {
    sendJson(res, 200, { success: true, data: { authenticated: false, needsSetup: !(await hasUsers()) } });
    return;
  }

  const session = validateSession(token, ip);
  if (!session) {
    sendJson(res, 200, { success: true, data: { authenticated: false, needsSetup: false } });
    return;
  }

  sendJson(res, 200, { success: true, data: { authenticated: true, username: session.username, role: session.role, remoteMode: true } });
});
