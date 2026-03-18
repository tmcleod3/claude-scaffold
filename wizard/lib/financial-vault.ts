/**
 * Financial Vault — Separate encrypted storage for ad platform and bank credentials.
 *
 * Key differences from the infrastructure vault (vault.ts):
 * - Stored at ~/.voidforge/treasury/vault.enc (not ~/.voidforge/vault.enc)
 * - Uses scrypt key derivation (memory-hard, unlike PBKDF2 in the infra vault)
 *   Note: PRD specifies Argon2id but Node.js has no built-in Argon2id.
 *   scrypt is the closest built-in memory-hard KDF. Zero-dependency constraint wins.
 * - Separate password from the infrastructure vault
 * - TOTP 2FA required for write operations (see totp.ts)
 *
 * PRD Reference: §9.11 (Financial Security), ADR-4 (TOTP storage), §9.18 (macOS fsync)
 *
 * Threat model: compromise of the infrastructure vault should NOT automatically
 * compromise the financial vault. Different password, different file, different KDF.
 */

import { createCipheriv, createDecipheriv, scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, mkdir, open, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';

const TREASURY_DIR = join(homedir(), '.voidforge', 'treasury');
const VAULT_PATH = join(TREASURY_DIR, 'vault.enc');
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const AUTH_TAG_LENGTH = 16;
const MAX_PASSWORD_LENGTH = 256;

// scrypt parameters — memory-hard to resist brute force
// N=2^17 (131072), r=8, p=1 — ~128MB memory, ~1s on modern hardware
const SCRYPT_N = 131072;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

interface FinancialVaultData {
  [key: string]: string;
}

/** In-memory cache — zeroed on lock or vault timeout */
let sessionCache: { password: string; data: FinancialVaultData } | null = null;

/** Write queue to serialize vault operations */
let writeQueue: Promise<void> = Promise.resolve();

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(fn, () => fn());
  writeQueue = result.then(() => {}, () => {});
  return result;
}

async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  const capped = password.slice(0, MAX_PASSWORD_LENGTH);
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(capped, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

async function encrypt(plaintext: string, password: string): Promise<Buffer> {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = await deriveKey(password, salt);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: salt (32) + iv (16) + authTag (16) + ciphertext
  return Buffer.concat([salt, iv, authTag, encrypted]);
}

async function decrypt(data: Buffer, password: string): Promise<string> {
  if (data.length < SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('Financial vault data is corrupted or empty');
  }

  const salt = data.subarray(0, SALT_LENGTH);
  const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = data.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

  const key = await deriveKey(password, salt);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf-8');
}

async function readVault(password: string): Promise<FinancialVaultData> {
  if (sessionCache) {
    const a = Buffer.from(sessionCache.password, 'utf-8');
    const b = Buffer.from(password, 'utf-8');
    if (a.length === b.length && timingSafeEqual(a, b)) {
      return { ...sessionCache.data }; // Return copy to prevent mutation
    }
  }

  if (!existsSync(VAULT_PATH)) {
    return {};
  }

  const raw = await readFile(VAULT_PATH);
  const json = await decrypt(raw, password);
  const data = JSON.parse(json) as FinancialVaultData;

  sessionCache = { password, data };
  return { ...data };
}

async function writeVault(password: string, data: FinancialVaultData): Promise<void> {
  await mkdir(TREASURY_DIR, { recursive: true });
  const json = JSON.stringify(data);
  const encrypted = await encrypt(json, password);

  // Atomic write: temp → fsync → rename (per ADR-1)
  const tmpPath = VAULT_PATH + '.tmp.' + process.pid;
  const fh = await open(tmpPath, 'w', 0o600);
  try {
    await fh.writeFile(encrypted);
    // macOS: fsync() doesn't guarantee physical durability (§9.18)
    // F_FULLFSYNC (fcntl flag 51) is required for financial files
    // Node.js datasync is the closest built-in; document the gap
    if (platform() === 'darwin') {
      await fh.datasync();
    } else {
      await fh.sync();
    }
  } finally {
    await fh.close();
  }
  await rename(tmpPath, VAULT_PATH);

  sessionCache = { password, data: { ...data } };
}

// ── Public API ────────────────────────────────────────

/** Store a financial credential */
export function financialVaultSet(password: string, key: string, value: string): Promise<void> {
  return serialized(async () => {
    const data = await readVault(password);
    data[key] = value;
    await writeVault(password, data);
  });
}

/** Retrieve a financial credential */
export function financialVaultGet(password: string, key: string): Promise<string | null> {
  return serialized(async () => {
    const data = await readVault(password);
    return data[key] ?? null;
  });
}

/** Delete a financial credential */
export function financialVaultDelete(password: string, key: string): Promise<void> {
  return serialized(async () => {
    const data = await readVault(password);
    delete data[key];
    await writeVault(password, data);
  });
}

/** Check if the financial vault exists */
export function financialVaultExists(): boolean {
  return existsSync(VAULT_PATH);
}

/** Verify password can decrypt the vault */
export function financialVaultUnlock(password: string): Promise<boolean> {
  if (!existsSync(VAULT_PATH)) {
    return Promise.resolve(true); // No vault yet = password is for creation
  }
  return serialized(async () => {
    try {
      await readVault(password);
      return true;
    } catch {
      return false;
    }
  });
}

/** List stored keys (requires password) */
export function financialVaultKeys(password: string): Promise<string[]> {
  return serialized(async () => {
    const data = await readVault(password);
    return Object.keys(data);
  });
}

/** Zero the in-memory cache — call on SIGTERM, vault timeout, or manual lock */
export function financialVaultLock(): void {
  if (sessionCache) {
    // Best-effort memory zeroing — V8 doesn't guarantee this but it's defense in depth
    sessionCache.password = '\0'.repeat(sessionCache.password.length);
    sessionCache = null;
  }
}

/** Return the vault file path */
export function financialVaultPath(): string {
  return VAULT_PATH;
}

/** Return the treasury directory path */
export function treasuryDir(): string {
  return TREASURY_DIR;
}
