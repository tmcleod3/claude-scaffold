/**
 * Password-encrypted credential vault using Node.js built-in crypto.
 *
 * - AES-256-GCM encryption
 * - PBKDF2 key derivation (100k iterations, SHA-512)
 * - Stored at ~/.voidforge/vault.enc
 * - Works on macOS, Linux, Windows — zero dependencies
 * - User provides the password; they can store it however they want
 *   (memory, 1Password, macOS Keychain, etc.)
 */

import { createCipheriv, createDecipheriv, pbkdf2, randomBytes } from 'node:crypto';
import { readFile, writeFile, rename, mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

const VAULT_DIR = join(homedir(), '.voidforge');
const VAULT_PATH = join(VAULT_DIR, 'vault.enc');
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const AUTH_TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_DIGEST = 'sha512';
const MAX_PASSWORD_LENGTH = 256;

interface VaultData {
  [key: string]: string;
}

/** In-memory cache so we don't re-read the file on every call within a session */
let sessionCache: { password: string; data: VaultData } | null = null;

/** Write queue to serialize all vault operations and prevent race conditions */
let writeQueue: Promise<void> = Promise.resolve();

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(fn, () => fn());
  // Keep the chain going even if this operation fails
  writeQueue = result.then(() => {}, () => {});
  return result;
}

async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  const capped = password.slice(0, MAX_PASSWORD_LENGTH);
  return new Promise<Buffer>((resolve, reject) => {
    pbkdf2(capped, salt, PBKDF2_ITERATIONS, KEY_LENGTH, PBKDF2_DIGEST, (err, key) => {
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

async function readVault(password: string): Promise<VaultData> {
  // Check session cache first
  if (sessionCache && sessionCache.password === password) {
    return sessionCache.data;
  }

  if (!existsSync(VAULT_PATH)) {
    return {};
  }

  const raw = await readFile(VAULT_PATH);
  const json = await decrypt(raw, password);
  const data = JSON.parse(json) as VaultData;

  sessionCache = { password, data };
  return data;
}

async function writeVault(password: string, data: VaultData): Promise<void> {
  await mkdir(VAULT_DIR, { recursive: true });
  const json = JSON.stringify(data);
  const encrypted = await encrypt(json, password);

  // Atomic write: write to temp file, fsync, then rename over the real file.
  // This prevents corruption if the process crashes mid-write.
  const tmpPath = VAULT_PATH + '.tmp';
  const fh = await open(tmpPath, 'w', 0o600);
  try {
    await fh.writeFile(encrypted);
    await fh.sync();
  } finally {
    await fh.close();
  }
  await rename(tmpPath, VAULT_PATH);

  sessionCache = { password, data };
}

/** Store a credential in the encrypted vault */
export function vaultSet(password: string, key: string, value: string): Promise<void> {
  return serialized(async () => {
    const data = await readVault(password);
    data[key] = value;
    await writeVault(password, data);
  });
}

/** Retrieve a credential from the encrypted vault */
export function vaultGet(password: string, key: string): Promise<string | null> {
  return serialized(async () => {
    const data = await readVault(password);
    return data[key] ?? null;
  });
}

/** Delete a credential from the vault */
export function vaultDelete(password: string, key: string): Promise<void> {
  return serialized(async () => {
    const data = await readVault(password);
    delete data[key];
    await writeVault(password, data);
  });
}

/** Check if a vault file exists (doesn't need password) */
export function vaultExists(): boolean {
  return existsSync(VAULT_PATH);
}

/** Check if the password can decrypt the vault (password verification) */
export function vaultUnlock(password: string): Promise<boolean> {
  if (!existsSync(VAULT_PATH)) {
    return Promise.resolve(true);
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

/** List which keys are stored (requires password) */
export function vaultKeys(password: string): Promise<string[]> {
  return serialized(async () => {
    const data = await readVault(password);
    return Object.keys(data);
  });
}

/** Clear the in-memory session cache */
export function vaultLock(): void {
  sessionCache = null;
}

/** Return the vault file path (for display purposes) */
export function vaultPath(): string {
  return VAULT_PATH;
}
