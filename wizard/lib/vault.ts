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

import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
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

interface VaultData {
  [key: string]: string;
}

/** In-memory cache so we don't re-read the file on every call within a session */
let sessionCache: { password: string; data: VaultData } | null = null;

function deriveKey(password: string, salt: Buffer): Buffer {
  return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, PBKDF2_DIGEST);
}

function encrypt(plaintext: string, password: string): Buffer {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKey(password, salt);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: salt (32) + iv (16) + authTag (16) + ciphertext
  return Buffer.concat([salt, iv, authTag, encrypted]);
}

function decrypt(data: Buffer, password: string): string {
  const salt = data.subarray(0, SALT_LENGTH);
  const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = data.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

  const key = deriveKey(password, salt);
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
  const json = decrypt(raw, password);
  const data = JSON.parse(json) as VaultData;

  sessionCache = { password, data };
  return data;
}

async function writeVault(password: string, data: VaultData): Promise<void> {
  await mkdir(VAULT_DIR, { recursive: true });
  const json = JSON.stringify(data);
  const encrypted = encrypt(json, password);
  await writeFile(VAULT_PATH, encrypted, { mode: 0o600 });

  sessionCache = { password, data };
}

/** Store a credential in the encrypted vault */
export async function vaultSet(password: string, key: string, value: string): Promise<void> {
  const data = await readVault(password);
  data[key] = value;
  await writeVault(password, data);
}

/** Retrieve a credential from the encrypted vault */
export async function vaultGet(password: string, key: string): Promise<string | null> {
  const data = await readVault(password);
  return data[key] ?? null;
}

/** Delete a credential from the vault */
export async function vaultDelete(password: string, key: string): Promise<void> {
  const data = await readVault(password);
  delete data[key];
  await writeVault(password, data);
}

/** Check if a vault file exists (doesn't need password) */
export function vaultExists(): boolean {
  return existsSync(VAULT_PATH);
}

/** Check if the password can decrypt the vault (password verification) */
export async function vaultUnlock(password: string): Promise<boolean> {
  if (!existsSync(VAULT_PATH)) {
    // No vault yet — any password is valid (will create on first write)
    return true;
  }
  try {
    await readVault(password);
    return true;
  } catch {
    return false;
  }
}

/** List which keys are stored (requires password) */
export async function vaultKeys(password: string): Promise<string[]> {
  const data = await readVault(password);
  return Object.keys(data);
}

/** Clear the in-memory session cache */
export function vaultLock(): void {
  sessionCache = null;
}

/** Return the vault file path (for display purposes) */
export function vaultPath(): string {
  return VAULT_PATH;
}
