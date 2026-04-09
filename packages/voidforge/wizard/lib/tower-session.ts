/**
 * Tower Session — In-memory session management for remote mode.
 * Extracted from tower-auth.ts (ARCH-R2-003).
 *
 * Sessions are never persisted to disk. Server restart = all sessions invalidated.
 */

import { randomBytes } from 'node:crypto';

export type UserRole = 'admin' | 'deployer' | 'viewer';

export interface SessionInfo {
  username: string;
  role: UserRole;
}

interface Session {
  token: string;
  username: string;
  role: UserRole;
  ip: string;
  createdAt: number;
  expiresAt: number;
  ipBinding: boolean;
}

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

const sessions = new Map<string, Session>();

/** Create a new session. Invalidates existing sessions for the same user. */
export function createSession(username: string, role: UserRole, ip: string): string {
  // Invalidate existing sessions for this user (single active session)
  const toDelete: string[] = [];
  for (const [token, session] of sessions) {
    if (session.username === username) toDelete.push(token);
  }
  for (const token of toDelete) sessions.delete(token);

  const token = randomBytes(32).toString('hex');
  sessions.set(token, {
    token,
    username,
    role,
    ip,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
    ipBinding: true,
  });
  return token;
}

/** Validate a session token. Returns session info on success, null on failure. */
export function validateSession(token: string, ip: string): SessionInfo | null {
  const session = sessions.get(token);
  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }

  if (session.ipBinding && session.ip !== ip) {
    sessions.delete(token);
    return null;
  }

  return { username: session.username, role: session.role };
}

/** Invalidate a session (logout). */
export function logout(token: string): void {
  sessions.delete(token);
}

/** Invalidate all sessions for a specific user. */
export function invalidateUserSessions(username: string): void {
  const toDelete: string[] = [];
  for (const [token, session] of sessions) {
    if (session.username === username) toDelete.push(token);
  }
  for (const token of toDelete) sessions.delete(token);
}

/** Update role on active sessions for a user. */
export function updateSessionRole(username: string, newRole: UserRole): void {
  for (const [, session] of sessions) {
    if (session.username === username) session.role = newRole;
  }
}

/** Evict expired sessions (called by periodic cleanup). */
export function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (now > session.expiresAt) sessions.delete(token);
  }
}

// ── Cookie helpers ────────────────────────────────────

const COOKIE_NAME = 'voidforge_session';

export function getSessionCookieName(): string {
  return COOKIE_NAME;
}

export function parseSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

export function buildSessionCookie(token: string, secure: boolean): string {
  const maxAge = SESSION_TTL_MS / 1000;
  const flags = [
    `${COOKIE_NAME}=${token}`,
    `Max-Age=${maxAge}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
  ];
  if (secure) flags.push('Secure');
  return flags.join('; ');
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict`;
}

// ── Auth exemptions ───────────────────────────────────

const AUTH_EXEMPT_PATHS = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/setup',
  '/api/auth/session',
  '/api/users/complete-invite',
  '/login.html',
  '/login.js',
  '/invite.html',
  '/invite.js',
  '/styles.css',
  '/favicon.svg',
];

export function isAuthExempt(pathname: string): boolean {
  return AUTH_EXEMPT_PATHS.includes(pathname);
}
