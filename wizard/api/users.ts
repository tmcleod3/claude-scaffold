/**
 * Users API — Multi-user management endpoints.
 * All user management requires admin role.
 * Invite completion is public (token-authenticated).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { addRoute } from '../router.js';
import { parseJsonBody } from '../lib/body-parser.js';
import {
  validateSession,
  parseSessionCookie,
  isRemoteMode,
  getClientIp,
  checkRateLimit,
  isValidUsername,
} from '../lib/tower-auth.js';
import {
  createInvite,
  completeInvite,
  removeUser,
  updateUserRole,
  listUsers,
  hasRole,
  isValidRole,
} from '../lib/user-manager.js';
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

/** Extract and validate session from request. Returns null if not authenticated. */
function getSession(req: IncomingMessage) {
  const token = parseSessionCookie(req.headers.cookie);
  const ip = getClientIp(req);
  if (!token) return null;
  return validateSession(token, ip);
}

// GET /api/users — List all users (admin only)
addRoute('GET', '/api/users', async (req: IncomingMessage, res: ServerResponse) => {
  if (!isRemoteMode()) {
    sendJson(res, 400, { success: false, error: 'User management requires remote mode' });
    return;
  }

  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { success: false, error: 'Authentication required' });
    return;
  }

  if (!hasRole(session, 'admin')) {
    const ip = getClientIp(req);
    await audit('access_denied', ip, session.username, { action: 'list_users' });
    sendJson(res, 404, { success: false, error: 'Not found' });
    return;
  }

  const users = await listUsers();
  sendJson(res, 200, { success: true, data: { users } });
});

// POST /api/users/invite — Create invitation (admin only)
addRoute('POST', '/api/users/invite', async (req: IncomingMessage, res: ServerResponse) => {
  if (!isRemoteMode()) {
    sendJson(res, 400, { success: false, error: 'User management requires remote mode' });
    return;
  }

  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { success: false, error: 'Authentication required' });
    return;
  }

  // Admin check at route level (defense-in-depth — createInvite also checks)
  if (!hasRole(session, 'admin')) {
    const ip = getClientIp(req);
    await audit('access_denied', ip, session.username, { action: 'create_invite' });
    sendJson(res, 404, { success: false, error: 'Not found' });
    return;
  }

  const body = await parseJsonBody(req);
  if (typeof body !== 'object' || body === null) {
    sendJson(res, 400, { success: false, error: 'Request body must be a JSON object' });
    return;
  }

  const { role } = body as Record<string, unknown>;
  if (typeof role !== 'string' || !isValidRole(role)) {
    sendJson(res, 400, { success: false, error: 'role must be one of: admin, deployer, viewer' });
    return;
  }

  const ip = getClientIp(req);

  try {
    const invite = await createInvite(role, session, ip);
    sendJson(res, 201, { success: true, data: invite });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create invite';
    if (message === 'Too many pending invites' || message === 'Invalid role') {
      sendJson(res, 400, { success: false, error: message });
    } else {
      sendJson(res, 400, { success: false, error: 'Failed to create invite' });
    }
  }
});

// POST /api/users/complete-invite — New user completes invitation setup
addRoute('POST', '/api/users/complete-invite', async (req: IncomingMessage, res: ServerResponse) => {
  if (!isRemoteMode()) {
    sendJson(res, 400, { success: false, error: 'User management requires remote mode' });
    return;
  }

  // Rate limit — this is a public endpoint (auth-exempt)
  const ip = getClientIp(req);
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    sendJson(res, 429, { success: false, error: 'Too many attempts. Try again later.' });
    return;
  }

  const body = await parseJsonBody(req);
  if (typeof body !== 'object' || body === null) {
    sendJson(res, 400, { success: false, error: 'Request body must be a JSON object' });
    return;
  }

  const { token, username, password } = body as Record<string, unknown>;
  if (typeof token !== 'string' || token.length !== 64) {
    sendJson(res, 400, { success: false, error: 'Invalid invite token' });
    return;
  }
  if (typeof username !== 'string' || !isValidUsername(username.trim())) {
    sendJson(res, 400, { success: false, error: 'Username must be 3-64 characters (letters, numbers, . _ -)' });
    return;
  }
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) {
    sendJson(res, 400, { success: false, error: 'Password must be 12-256 characters' });
    return;
  }

  try {
    const result = await completeInvite(token, username.trim(), password, ip);
    sendJson(res, 201, {
      success: true,
      data: {
        totpSecret: result.totpSecret,
        totpUri: result.totpUri,
        role: result.role,
        message: 'Scan the QR code with your authenticator app.',
      },
    }, true); // no-cache — TOTP secret must not be cached
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to complete invite';
    if (message === 'Invalid or expired invite') {
      sendJson(res, 404, { success: false, error: 'Invalid or expired invite' });
    } else if (message === 'Username already taken') {
      sendJson(res, 409, { success: false, error: 'Username already taken' });
    } else {
      sendJson(res, 400, { success: false, error: 'Failed to complete setup' });
    }
  }
});

// POST /api/users/remove — Remove a user (admin only)
addRoute('POST', '/api/users/remove', async (req: IncomingMessage, res: ServerResponse) => {
  if (!isRemoteMode()) {
    sendJson(res, 400, { success: false, error: 'User management requires remote mode' });
    return;
  }

  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { success: false, error: 'Authentication required' });
    return;
  }

  if (!hasRole(session, 'admin')) {
    const ip = getClientIp(req);
    await audit('access_denied', ip, session.username, { action: 'remove_user' });
    sendJson(res, 404, { success: false, error: 'Not found' });
    return;
  }

  const body = await parseJsonBody(req);
  if (typeof body !== 'object' || body === null) {
    sendJson(res, 400, { success: false, error: 'Request body must be a JSON object' });
    return;
  }

  const { username } = body as Record<string, unknown>;
  if (typeof username !== 'string' || username.trim().length === 0) {
    sendJson(res, 400, { success: false, error: 'username is required' });
    return;
  }

  // Prevent self-deletion
  if (username.trim() === session.username) {
    sendJson(res, 400, { success: false, error: 'Cannot remove yourself' });
    return;
  }

  const ip = getClientIp(req);

  try {
    await removeUser(username.trim());
    await audit('user_remove', ip, session.username, { target: username.trim() });
    sendJson(res, 200, { success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to remove user';
    if (message === 'User not found' || message === 'Cannot remove the last admin') {
      sendJson(res, 400, { success: false, error: message });
    } else {
      sendJson(res, 400, { success: false, error: 'Failed to remove user' });
    }
  }
});

// POST /api/users/role — Change a user's role (admin only)
addRoute('POST', '/api/users/role', async (req: IncomingMessage, res: ServerResponse) => {
  if (!isRemoteMode()) {
    sendJson(res, 400, { success: false, error: 'User management requires remote mode' });
    return;
  }

  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { success: false, error: 'Authentication required' });
    return;
  }

  if (!hasRole(session, 'admin')) {
    const ip = getClientIp(req);
    await audit('access_denied', ip, session.username, { action: 'change_role' });
    sendJson(res, 404, { success: false, error: 'Not found' });
    return;
  }

  const body = await parseJsonBody(req);
  if (typeof body !== 'object' || body === null) {
    sendJson(res, 400, { success: false, error: 'Request body must be a JSON object' });
    return;
  }

  const { username, role } = body as Record<string, unknown>;
  if (typeof username !== 'string' || username.trim().length === 0) {
    sendJson(res, 400, { success: false, error: 'username is required' });
    return;
  }
  if (typeof role !== 'string' || !isValidRole(role)) {
    sendJson(res, 400, { success: false, error: 'role must be one of: admin, deployer, viewer' });
    return;
  }

  // Prevent self-demotion (accidental lockout)
  if (username.trim() === session.username && role !== session.role) {
    sendJson(res, 400, { success: false, error: 'Cannot change your own role' });
    return;
  }

  const ip = getClientIp(req);

  try {
    await updateUserRole(username.trim(), role);
    await audit('role_change', ip, session.username, {
      target: username.trim(),
      newRole: role,
    });
    sendJson(res, 200, { success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update role';
    if (message === 'User not found' || message === 'Cannot demote the last admin') {
      sendJson(res, 400, { success: false, error: message });
    } else {
      sendJson(res, 400, { success: false, error: 'Failed to update role' });
    }
  }
});
