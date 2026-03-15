/**
 * User Manager — Multi-user RBAC for Avengers Tower v7.0.
 *
 * Invitation-only user creation. No self-registration.
 * Three roles: admin (full), deployer (build/deploy), viewer (read-only).
 * Invite tokens: cryptographically random, single-use, 24h expiry.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, mkdir, open, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  createUser,
  removeUser,
  updateUserRole,
  listUsers,
  getUserRole,
  type UserRole,
  type SessionInfo,
} from './tower-auth.js';
import { audit } from './audit-log.js';

const VOIDFORGE_DIR = join(homedir(), '.voidforge');
const INVITES_PATH = join(VOIDFORGE_DIR, 'invites.json');
const INVITE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_PENDING_INVITES = 50;

// ── Types ──────────────────────────────────────────

interface Invite {
  token: string;
  role: UserRole;
  createdBy: string;
  createdAt: string;
  expiresAt: number;
}

interface InviteStore {
  invites: Invite[];
}

// ── Write serialization ────────────────────────────

let writeQueue: Promise<void> = Promise.resolve();

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(fn, () => fn());
  writeQueue = result.then(() => {}, () => {});
  return result;
}

// ── Invite store I/O ───────────────────────────────

async function readInviteStore(): Promise<InviteStore> {
  try {
    const raw = await readFile(INVITES_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || !Array.isArray(parsed.invites)) {
      throw new Error('Invalid invite store format');
    }
    return parsed as InviteStore;
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { invites: [] };
    }
    throw err;
  }
}

async function writeInviteStore(store: InviteStore): Promise<void> {
  await mkdir(VOIDFORGE_DIR, { recursive: true });
  const data = JSON.stringify(store, null, 2);
  const tmpPath = INVITES_PATH + '.tmp';
  const fh = await open(tmpPath, 'w', 0o600);
  try {
    await fh.writeFile(data);
    await fh.sync();
  } finally {
    await fh.close();
  }
  await rename(tmpPath, INVITES_PATH);
}

// ── Role validation ────────────────────────────────

const VALID_ROLES: ReadonlySet<string> = new Set(['admin', 'deployer', 'viewer']);

export function isValidRole(role: string): role is UserRole {
  return VALID_ROLES.has(role);
}

/**
 * Check if a session has the required role.
 * Role hierarchy: admin > deployer > viewer.
 */
export function hasRole(session: SessionInfo, requiredRole: UserRole): boolean {
  if (session.role === 'admin') return true;
  if (session.role === 'deployer') return requiredRole !== 'admin';
  return requiredRole === 'viewer';
}

// ── Invite management ──────────────────────────────

/**
 * Create an invitation token for a new user.
 * Only admins can create invites.
 */
export async function createInvite(
  role: UserRole,
  callerSession: SessionInfo,
  ip: string,
): Promise<{ token: string; expiresAt: number }> {
  if (!hasRole(callerSession, 'admin')) {
    await audit('access_denied', ip, callerSession.username, {
      action: 'create_invite',
      reason: 'insufficient_role',
    });
    throw new Error('Admin role required');
  }

  if (!isValidRole(role)) {
    throw new Error('Invalid role');
  }

  return serialized(async () => {
    const store = await readInviteStore();

    // Purge expired invites
    const now = Date.now();
    store.invites = store.invites.filter((inv) => inv.expiresAt > now);

    if (store.invites.length >= MAX_PENDING_INVITES) {
      throw new Error('Too many pending invites');
    }

    const token = randomBytes(32).toString('hex');
    const invite: Invite = {
      token,
      role,
      createdBy: callerSession.username,
      createdAt: new Date().toISOString(),
      expiresAt: now + INVITE_TTL_MS,
    };

    store.invites.push(invite);
    await writeInviteStore(store);

    await audit('invite_create', ip, callerSession.username, {
      role,
      expiresIn: '24h',
    });

    return { token, expiresAt: invite.expiresAt };
  });
}

/**
 * Complete an invitation — new user sets username, password, and gets TOTP secret.
 * The invite token is consumed (single-use). If user creation fails, the invite
 * is restored so it can be retried.
 */
export async function completeInvite(
  inviteToken: string,
  username: string,
  password: string,
  ip: string,
): Promise<{ totpSecret: string; totpUri: string; role: UserRole }> {
  // Validate and consume the invite token (timing-safe comparison)
  const invite = await serialized(async () => {
    const store = await readInviteStore();
    const now = Date.now();

    // Purge expired
    store.invites = store.invites.filter((inv) => inv.expiresAt > now);

    // Timing-safe token lookup — prevent timing side-channel on public endpoint
    const tokenBuf = Buffer.from(inviteToken);
    let matchIdx = -1;
    for (let i = 0; i < store.invites.length; i++) {
      const storedBuf = Buffer.from(store.invites[i].token);
      if (tokenBuf.length === storedBuf.length && timingSafeEqual(tokenBuf, storedBuf)) {
        matchIdx = i;
      }
    }

    if (matchIdx === -1) {
      throw new Error('Invalid or expired invite');
    }

    const found = store.invites[matchIdx];
    store.invites.splice(matchIdx, 1); // Consume the token
    await writeInviteStore(store);
    return found;
  });

  // Create the user via tower-auth (handles password hashing, TOTP generation)
  // If creation fails, restore the invite so it can be retried
  let result: { totpSecret: string; totpUri: string };
  try {
    result = await createUser(username, password, invite.role);
  } catch (err) {
    // Rollback: re-insert the invite token
    await serialized(async () => {
      const store = await readInviteStore();
      store.invites.push(invite);
      await writeInviteStore(store);
    });
    throw err;
  }

  await audit('invite_complete', ip, username, {
    role: invite.role,
    invitedBy: invite.createdBy,
  });

  return { ...result, role: invite.role };
}

// ── Re-exports for convenience ─────────────────────

export {
  removeUser,
  updateUserRole,
  listUsers,
  getUserRole,
  type UserRole,
  type SessionInfo,
};
