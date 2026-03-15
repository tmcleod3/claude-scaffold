/**
 * Camelot Auth — Authentication engine for remote mode.
 *
 * 5-layer security: this module handles Layer 2 (Authentication).
 * Two-password architecture: login password ≠ vault password.
 * Session tokens in-memory only — never written to disk.
 *
 * TOTP: RFC 6238, 30-second rotation, replay protection.
 * Rate limiting: per-IP, 5/min, lockout after 10 consecutive failures.
 */

import { randomBytes, createHmac, pbkdf2 as pbkdf2Cb, timingSafeEqual } from 'node:crypto';
import { readFile, rename, mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const VOIDFORGE_DIR = join(homedir(), '.voidforge');
const AUTH_PATH = join(VOIDFORGE_DIR, 'auth.json');
const MAX_USERNAME_LENGTH = 64;
const MAX_PASSWORD_LENGTH = 256;

// ── Types ──────────────────────────────────────────

interface StoredUser {
  username: string;
  passwordHash: string;
  totpSecret: string; // Base32-encoded — stored encrypted via vault in production
  lastTotpStep: number; // Replay protection: last successfully used time step
  createdAt: string;
}

interface AuthStore {
  users: StoredUser[];
  remoteMode: boolean;
}

interface Session {
  token: string;
  username: string;
  ip: string;
  createdAt: number;
  expiresAt: number;
  ipBinding: boolean;
}

interface RateLimitEntry {
  attempts: number;
  firstAttempt: number;
  consecutiveFailures: number;
  lockedUntil: number;
}

// ── Configuration ──────────────────────────────────

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 5;
const LOCKOUT_THRESHOLD = 10;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000;
const TOTP_STEP = 30;
const TOTP_DIGITS = 6;
const PBKDF2_ITERATIONS = 210_000; // NIST SP 800-63B minimum
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = 'sha512';
const SALT_LENGTH = 32;
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// ── In-memory state (never persisted) ──────────────

const sessions = new Map<string, Session>();
const rateLimits = new Map<string, RateLimitEntry>();
let remoteMode = false;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

// ── Write serialization (prevents setup race condition) ──

let writeQueue: Promise<void> = Promise.resolve();

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(fn, () => fn());
  writeQueue = result.then(() => {}, () => {});
  return result;
}

// ── Remote mode ────────────────────────────────────

export function setRemoteMode(enabled: boolean): void {
  remoteMode = enabled;
  if (enabled && !cleanupTimer) {
    // Periodic cleanup of expired sessions and stale rate-limit entries
    cleanupTimer = setInterval(cleanupExpired, CLEANUP_INTERVAL_MS);
    cleanupTimer.unref();
  }
}

export function isRemoteMode(): boolean {
  return remoteMode;
}

/** Evict expired sessions and stale rate-limit entries (memory leak prevention). */
function cleanupExpired(): void {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (now > session.expiresAt) sessions.delete(token);
  }
  for (const [ip, entry] of rateLimits) {
    if (now - entry.firstAttempt > RATE_LIMIT_WINDOW_MS && entry.lockedUntil < now) {
      rateLimits.delete(ip);
    }
  }
}

// ── Password hashing (PBKDF2, NIST-strength) ───────

async function hashPassword(password: string): Promise<string> {
  const capped = password.slice(0, MAX_PASSWORD_LENGTH);
  const salt = randomBytes(SALT_LENGTH);
  const key = await new Promise<Buffer>((resolve, reject) => {
    pbkdf2Cb(capped, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST, (err, k) => {
      if (err) reject(err); else resolve(k);
    });
  });
  return `pbkdf2:${PBKDF2_ITERATIONS}:${salt.toString('hex')}:${key.toString('hex')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const capped = password.slice(0, MAX_PASSWORD_LENGTH);
  const parts = stored.split(':');
  if (parts[0] !== 'pbkdf2' || parts.length !== 4) return false;

  const iterations = parseInt(parts[1], 10);
  const salt = Buffer.from(parts[2], 'hex');
  const expectedKey = Buffer.from(parts[3], 'hex');

  const actualKey = await new Promise<Buffer>((resolve, reject) => {
    pbkdf2Cb(capped, salt, iterations, expectedKey.length, PBKDF2_DIGEST, (err, k) => {
      if (err) reject(err); else resolve(k);
    });
  });

  return timingSafeEqual(actualKey, expectedKey);
}

// ── TOTP (RFC 6238) ────────────────────────────────

function generateTotpSecret(): string {
  const bytes = randomBytes(20);
  return base32Encode(bytes);
}

function base32Encode(buffer: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, '0');
  }
  let result = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, '0');
    result += alphabet[parseInt(chunk, 2)];
  }
  return result;
}

function base32Decode(encoded: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of encoded.toUpperCase()) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTotp(secret: string, timeStep?: number): string {
  const time = timeStep ?? Math.floor(Date.now() / 1000 / TOTP_STEP);
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeUInt32BE(0, 0);
  timeBuffer.writeUInt32BE(time, 4);

  const key = base32Decode(secret);
  const hmac = createHmac('sha1', key).update(timeBuffer).digest();

  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24 |
    (hmac[offset + 1] & 0xff) << 16 |
    (hmac[offset + 2] & 0xff) << 8 |
    (hmac[offset + 3] & 0xff)) % (10 ** TOTP_DIGITS);

  return code.toString().padStart(TOTP_DIGITS, '0');
}

/**
 * Verify TOTP with replay protection (RFC 6238 Section 5.2).
 * Returns the time step used if valid, or -1 if invalid.
 */
function verifyTotp(secret: string, code: string, lastUsedStep: number): number {
  const currentStep = Math.floor(Date.now() / 1000 / TOTP_STEP);
  for (let offset = -1; offset <= 1; offset++) {
    const step = currentStep + offset;
    // Replay protection: reject codes at or before the last used step
    if (step <= lastUsedStep) continue;

    const expected = generateTotp(secret, step);
    if (expected.length === code.length) {
      const a = Buffer.from(expected);
      const b = Buffer.from(code);
      if (timingSafeEqual(a, b)) return step;
    }
  }
  return -1;
}

// ── Auth store I/O (serialized + atomic writes) ────

async function readAuthStore(): Promise<AuthStore> {
  try {
    const raw = await readFile(AUTH_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    // Basic validation
    if (typeof parsed !== 'object' || !Array.isArray(parsed.users)) {
      throw new Error('Invalid auth store format');
    }
    return parsed as AuthStore;
  } catch (err: unknown) {
    // File not found — return empty store (setup needed)
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { users: [], remoteMode: false };
    }
    // Parse error or invalid format — THROW (prevents re-setup attack)
    throw new Error(`Auth store corrupted: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

/** Atomic write (temp + fsync + rename) matching vault.ts pattern. */
async function writeAuthStore(store: AuthStore): Promise<void> {
  await mkdir(VOIDFORGE_DIR, { recursive: true });
  const data = JSON.stringify(store, null, 2);
  const tmpPath = AUTH_PATH + '.tmp';
  const fh = await open(tmpPath, 'w', 0o600);
  try {
    await fh.writeFile(data);
    await fh.sync();
  } finally {
    await fh.close();
  }
  await rename(tmpPath, AUTH_PATH);
}

// ── Rate limiting ──────────────────────────────────

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = rateLimits.get(ip);

  if (!entry) {
    rateLimits.set(ip, { attempts: 1, firstAttempt: now, consecutiveFailures: 0, lockedUntil: 0 });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (entry.lockedUntil > now) {
    return { allowed: false, retryAfterMs: entry.lockedUntil - now };
  }

  if (now - entry.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    entry.attempts = 1;
    entry.firstAttempt = now;
    return { allowed: true, retryAfterMs: 0 };
  }

  entry.attempts++;
  if (entry.attempts > RATE_LIMIT_MAX) {
    return { allowed: false, retryAfterMs: RATE_LIMIT_WINDOW_MS - (now - entry.firstAttempt) };
  }

  return { allowed: true, retryAfterMs: 0 };
}

function recordFailure(ip: string): void {
  const entry = rateLimits.get(ip);
  if (!entry) return;
  entry.consecutiveFailures++;
  if (entry.consecutiveFailures >= LOCKOUT_THRESHOLD) {
    entry.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    entry.consecutiveFailures = 0;
  }
}

function clearFailures(ip: string): void {
  const entry = rateLimits.get(ip);
  if (entry) entry.consecutiveFailures = 0;
}

// ── Client IP resolution ───────────────────────────

/**
 * Get the real client IP. Only trusts X-Forwarded-For in remote mode
 * (where Caddy is the trusted reverse proxy).
 */
export function getClientIp(req: { headers: Record<string, string | string[] | undefined>; socket: { remoteAddress?: string } }): string {
  // Only trust X-Forwarded-For behind our reverse proxy (remote mode)
  if (remoteMode) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      // Take the rightmost IP that isn't a known proxy (Caddy adds to the left)
      // For simplicity with single-proxy setup, take the first entry
      return forwarded.split(',')[0].trim();
    }
  }
  return req.socket.remoteAddress ?? 'unknown';
}

// ── Public API ─────────────────────────────────────

/** Check if any users exist (determines if setup is needed). */
export async function hasUsers(): Promise<boolean> {
  const store = await readAuthStore();
  return store.users.length > 0;
}

/**
 * Create the initial user (first-time setup only, serialized).
 * Returns the TOTP secret for QR code generation.
 */
export function createUser(username: string, password: string): Promise<{ totpSecret: string; totpUri: string }> {
  return serialized(async () => {
    const store = await readAuthStore();
    if (store.users.length > 0) {
      throw new Error('User already exists. Only one admin user is supported in v6.5.');
    }

    const safeUsername = username.slice(0, MAX_USERNAME_LENGTH);
    const passwordHash = await hashPassword(password);
    const totpSecret = generateTotpSecret();

    store.users.push({
      username: safeUsername,
      passwordHash,
      totpSecret,
      lastTotpStep: 0,
      createdAt: new Date().toISOString(),
    });
    store.remoteMode = true;

    await writeAuthStore(store);

    const totpUri = `otpauth://totp/VoidForge:${encodeURIComponent(safeUsername)}?secret=${totpSecret}&issuer=VoidForge&digits=${TOTP_DIGITS}&period=${TOTP_STEP}`;
    return { totpSecret, totpUri };
  });
}

/**
 * Authenticate a user. Returns session token on success.
 * No username enumeration: same error for invalid user and wrong password.
 */
export async function login(
  username: string,
  password: string,
  totpCode: string,
  ip: string,
): Promise<{ token: string } | { error: string; retryAfterMs?: number }> {
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    return { error: 'Too many attempts. Try again later.', retryAfterMs: rateCheck.retryAfterMs };
  }

  const safeUsername = username.slice(0, MAX_USERNAME_LENGTH);
  const safePassword = password.slice(0, MAX_PASSWORD_LENGTH);

  const store = await readAuthStore();

  // Iterate all users for constant-time-ish comparison
  let matchedUser: StoredUser | null = null;
  for (const user of store.users) {
    const usernameA = Buffer.from(user.username.padEnd(MAX_USERNAME_LENGTH));
    const usernameB = Buffer.from(safeUsername.padEnd(MAX_USERNAME_LENGTH));
    if (usernameA.length === usernameB.length && timingSafeEqual(usernameA, usernameB)) {
      matchedUser = user;
    }
  }

  if (!matchedUser) {
    await hashPassword(safePassword); // Burn time
    recordFailure(ip);
    return { error: 'Invalid credentials' };
  }

  const passwordValid = await verifyPassword(safePassword, matchedUser.passwordHash);
  if (!passwordValid) {
    recordFailure(ip);
    return { error: 'Invalid credentials' };
  }

  // Verify TOTP with replay protection
  const usedStep = verifyTotp(matchedUser.totpSecret, totpCode, matchedUser.lastTotpStep);
  if (usedStep === -1) {
    recordFailure(ip);
    return { error: 'Invalid credentials' };
  }

  // Update lastTotpStep for replay protection (serialized write)
  await serialized(async () => {
    const currentStore = await readAuthStore();
    const user = currentStore.users.find((u) => u.username === matchedUser!.username);
    if (user) {
      user.lastTotpStep = usedStep;
      await writeAuthStore(currentStore);
    }
  });

  clearFailures(ip);

  // Invalidate existing sessions for this user (single active session)
  const toDelete: string[] = [];
  for (const [token, session] of sessions) {
    if (session.username === matchedUser.username) toDelete.push(token);
  }
  for (const token of toDelete) sessions.delete(token);

  const token = randomBytes(32).toString('hex');
  sessions.set(token, {
    token,
    username: matchedUser.username,
    ip,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
    ipBinding: true,
  });

  return { token };
}

/** Validate a session token. Returns username on success, null on failure. */
export function validateSession(token: string, ip: string): string | null {
  const session = sessions.get(token);
  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }

  if (session.ipBinding && session.ip !== ip) {
    // IP mismatch — potential token theft. Invalidate the session entirely.
    sessions.delete(token);
    return null;
  }

  return session.username;
}

/** Invalidate a session (logout). */
export function logout(token: string): void {
  sessions.delete(token);
}

/** Get the session cookie name. */
export function getSessionCookieName(): string {
  return 'voidforge_session';
}

/** Parse session token from cookie header. */
export function parseSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const name = getSessionCookieName();
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}

/** Build Set-Cookie header value for a session token. */
export function buildSessionCookie(token: string, secure: boolean): string {
  const name = getSessionCookieName();
  const maxAge = SESSION_TTL_MS / 1000;
  const flags = [
    `${name}=${token}`,
    `Max-Age=${maxAge}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
  ];
  if (secure) flags.push('Secure');
  return flags.join('; ');
}

/** Build Set-Cookie header to clear the session. */
export function clearSessionCookie(): string {
  return `${getSessionCookieName()}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict`;
}

/** Check if a request path is exempt from auth. */
export function isAuthExempt(pathname: string): boolean {
  const exempt = [
    '/api/auth/login',
    '/api/auth/logout',
    '/api/auth/setup',
    '/api/auth/session',
    '/login.html',
    '/login.js',
    '/styles.css',
    '/favicon.svg',
  ];
  return exempt.includes(pathname);
}
