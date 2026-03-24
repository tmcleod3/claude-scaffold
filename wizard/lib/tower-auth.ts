/**
 * Tower Auth — Authentication engine for remote mode.
 *
 * 5-layer security: this module handles Layer 2 (Authentication).
 * Two-password architecture: login password ≠ vault password.
 *
 * TOTP: RFC 6238, 30-second rotation, replay protection.
 * ARCH-R2-003: Split into tower-auth + tower-session + tower-rate-limit.
 */

import { randomBytes, createHmac, pbkdf2 as pbkdf2Cb, timingSafeEqual } from 'node:crypto';
import { readFile, rename, mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Re-export session + rate-limit modules for backward compatibility
export {
  type UserRole, type SessionInfo,
  createSession, validateSession, logout,
  invalidateUserSessions, updateSessionRole,
  cleanupExpiredSessions,
  getSessionCookieName, parseSessionCookie, buildSessionCookie, clearSessionCookie,
  isAuthExempt,
} from './tower-session.js';

export {
  checkRateLimit, recordFailure, clearFailures,
  cleanupStaleEntries,
} from './tower-rate-limit.js';

// Import for internal use
import { createSession, invalidateUserSessions, updateSessionRole, cleanupExpiredSessions } from './tower-session.js';
import type { UserRole } from './tower-session.js';
import { checkRateLimit, recordFailure, clearFailures, cleanupStaleEntries } from './tower-rate-limit.js';

const VOIDFORGE_DIR = join(homedir(), '.voidforge');
const AUTH_PATH = join(VOIDFORGE_DIR, 'auth.json');
const MAX_USERNAME_LENGTH = 64;
const MAX_PASSWORD_LENGTH = 256;

// ── Types ──────────────────────────────────────────

interface StoredUser {
  username: string;
  passwordHash: string;
  totpSecret: string;
  lastTotpStep: number;
  role: UserRole;
  createdAt: string;
}

interface AuthStore {
  users: StoredUser[];
  remoteMode: boolean;
}

// ── Configuration ──────────────────────────────────

const TOTP_STEP = 30;
const TOTP_DIGITS = 6;
const PBKDF2_ITERATIONS = 210_000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = 'sha512';
const SALT_LENGTH = 32;
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

// ── In-memory state ────────────────────────────────

let remoteMode = false;
let lanMode = false;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

// ── Write serialization ────────────────────────────

let writeQueue: Promise<void> = Promise.resolve();

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(fn, () => fn());
  writeQueue = result.then(() => {}, () => {});
  return result;
}

// ── Remote + LAN mode ──────────────────────────────

export function setRemoteMode(enabled: boolean): void {
  remoteMode = enabled;
  if (enabled && !cleanupTimer) {
    cleanupTimer = setInterval(() => {
      cleanupExpiredSessions();
      cleanupStaleEntries();
    }, CLEANUP_INTERVAL_MS);
    cleanupTimer.unref();
  } else if (!enabled && cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

export function isRemoteMode(): boolean {
  return remoteMode;
}

export function setLanMode(enabled: boolean): void {
  lanMode = enabled;
}

export function isLanMode(): boolean {
  return lanMode;
}

/** Get client IP — delegates to rate-limit module but passes remoteMode state. */
export function getClientIp(req: { headers: Record<string, string | string[] | undefined>; socket: { remoteAddress?: string } }): string {
  // Inline to avoid circular: trusts X-Forwarded-For only in remote mode.
  // Use leftmost entry (parts[0]) — the real client IP before any proxies.
  // Previously used rightmost (parts[parts.length - 1]) which returned 127.0.0.1
  // behind Caddy, making rate limiting and session IP binding ineffective.
  if (remoteMode) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      const parts = forwarded.split(',');
      return parts[0].trim();
    }
  }
  return req.socket.remoteAddress ?? 'unknown';
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

function verifyTotp(secret: string, code: string, lastUsedStep: number): number {
  const currentStep = Math.floor(Date.now() / 1000 / TOTP_STEP);
  for (let offset = -1; offset <= 1; offset++) {
    const step = currentStep + offset;
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
    if (typeof parsed !== 'object' || !Array.isArray(parsed.users)) {
      throw new Error('Invalid auth store format');
    }
    for (const user of parsed.users) {
      if (!user.role) user.role = 'admin';
    }
    return parsed as AuthStore;
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { users: [], remoteMode: false };
    }
    throw new Error(`Auth store corrupted: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

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

// ── Validation ─────────────────────────────────────

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

export function isValidUsername(username: string): boolean {
  return username.length >= 3 && username.length <= MAX_USERNAME_LENGTH && USERNAME_PATTERN.test(username);
}

// ── Public API ─────────────────────────────────────

export async function hasUsers(): Promise<boolean> {
  const store = await readAuthStore();
  return store.users.length > 0;
}

export function createUser(
  username: string,
  password: string,
  role?: UserRole,
): Promise<{ totpSecret: string; totpUri: string }> {
  return serialized(async () => {
    const store = await readAuthStore();
    const safeUsername = username.slice(0, MAX_USERNAME_LENGTH);

    for (const user of store.users) {
      const a = Buffer.from(user.username.padEnd(MAX_USERNAME_LENGTH));
      const b = Buffer.from(safeUsername.padEnd(MAX_USERNAME_LENGTH));
      if (a.length === b.length && timingSafeEqual(a, b)) {
        throw new Error('Username already taken');
      }
    }

    if (store.users.length > 0 && role === undefined) {
      throw new Error('Invitation required for additional users');
    }
    const assignedRole: UserRole = store.users.length === 0 ? 'admin' : role!;

    const passwordHash = await hashPassword(password);
    const totpSecret = generateTotpSecret();

    store.users.push({
      username: safeUsername,
      passwordHash,
      totpSecret,
      lastTotpStep: 0,
      role: assignedRole,
      createdAt: new Date().toISOString(),
    });
    store.remoteMode = true;

    await writeAuthStore(store);

    const totpUri = `otpauth://totp/VoidForge:${encodeURIComponent(safeUsername)}?secret=${totpSecret}&issuer=VoidForge&digits=${TOTP_DIGITS}&period=${TOTP_STEP}`;
    return { totpSecret, totpUri };
  });
}

export function removeUser(targetUsername: string): Promise<void> {
  return serialized(async () => {
    const store = await readAuthStore();
    const idx = store.users.findIndex((u) => u.username === targetUsername);
    if (idx === -1) throw new Error('User not found');

    const user = store.users[idx];
    if (user.role === 'admin') {
      const adminCount = store.users.filter((u) => u.role === 'admin').length;
      if (adminCount <= 1) throw new Error('Cannot remove the last admin');
    }

    store.users.splice(idx, 1);
    await writeAuthStore(store);
    invalidateUserSessions(targetUsername);
  });
}

export function updateUserRole(targetUsername: string, newRole: UserRole): Promise<void> {
  return serialized(async () => {
    const store = await readAuthStore();
    const user = store.users.find((u) => u.username === targetUsername);
    if (!user) throw new Error('User not found');

    if (user.role === 'admin' && newRole !== 'admin') {
      const adminCount = store.users.filter((u) => u.role === 'admin').length;
      if (adminCount <= 1) throw new Error('Cannot demote the last admin');
    }

    user.role = newRole;
    await writeAuthStore(store);
    updateSessionRole(targetUsername, newRole);
  });
}

export async function listUsers(): Promise<Array<{ username: string; role: UserRole; createdAt: string }>> {
  const store = await readAuthStore();
  return store.users.map((u) => ({
    username: u.username,
    role: u.role,
    createdAt: u.createdAt,
  }));
}

export async function getUserRole(username: string): Promise<UserRole | null> {
  const store = await readAuthStore();
  const user = store.users.find((u) => u.username === username);
  return user?.role ?? null;
}

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

  let matchedUser: StoredUser | null = null;
  for (const user of store.users) {
    const usernameA = Buffer.from(user.username.padEnd(MAX_USERNAME_LENGTH));
    const usernameB = Buffer.from(safeUsername.padEnd(MAX_USERNAME_LENGTH));
    if (usernameA.length === usernameB.length && timingSafeEqual(usernameA, usernameB)) {
      matchedUser = user;
    }
  }

  if (!matchedUser) {
    await hashPassword(safePassword);
    recordFailure(ip);
    return { error: 'Invalid credentials' };
  }

  const passwordValid = await verifyPassword(safePassword, matchedUser.passwordHash);
  if (!passwordValid) {
    recordFailure(ip);
    return { error: 'Invalid credentials' };
  }

  const usedStep = verifyTotp(matchedUser.totpSecret, totpCode, matchedUser.lastTotpStep);
  if (usedStep === -1) {
    recordFailure(ip);
    return { error: 'Invalid credentials' };
  }

  await serialized(async () => {
    const currentStore = await readAuthStore();
    const user = currentStore.users.find((u) => u.username === matchedUser!.username);
    if (user) {
      user.lastTotpStep = usedStep;
      await writeAuthStore(currentStore);
    }
  });

  clearFailures(ip);

  const currentRole = matchedUser.role ?? 'viewer';
  const token = createSession(matchedUser.username, currentRole, ip);
  return { token };
}
