/**
 * TOTP 2FA for financial operations.
 *
 * - Secret stored in system keychain (macOS Keychain / Linux Secret Service) per ADR-4
 * - Fallback: separate encrypted file (totp.enc) with different password from vault
 * - TOTP verification valid for 5 minutes, per-operation
 * - Stored in process memory only (never on disk)
 * - Replay protection: reject reuse of the same code within 30-second window
 *
 * PRD Reference: §9.11 (TOTP setup), ADR-4 (§9.16), §9.18 (session management)
 *
 * Zero dependencies — uses Node.js built-in crypto for HMAC-SHA1 (RFC 6238).
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, open, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { execSync } from 'node:child_process';

const TREASURY_DIR = join(homedir(), '.voidforge', 'treasury');
const TOTP_FALLBACK_PATH = join(TREASURY_DIR, 'totp.enc');
const KEYCHAIN_SERVICE = 'com.voidforge.totp';
const KEYCHAIN_ACCOUNT = 'totp-secret';

// TOTP parameters (RFC 6238)
const TOTP_PERIOD = 30;       // seconds
const TOTP_DIGITS = 6;
const TOTP_ALGORITHM = 'sha1'; // per RFC 6238

// Session management (§9.18)
const TOTP_SESSION_TTL_MS = 5 * 60 * 1000;   // 5 minutes
const TOTP_IDLE_TTL_MS = 2 * 60 * 1000;      // 2 minutes idle → invalidate
const TOTP_WINDOW = 1;        // accept ±1 time step (30s tolerance)

// ── In-memory session state ───────────────────────────

interface TotpSession {
  verifiedAt: number;
  lastUsedAt: number;
  usedCodes: Set<string>; // VG-003: Track all used (code+step) pairs within window
}

let session: TotpSession | null = null;

// ── TOTP Generation (RFC 6238) ────────────────────────

function generateTotpCode(secret: Buffer, timeStep: number): string {
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigInt64BE(BigInt(timeStep));

  const hmac = createHmac(TOTP_ALGORITHM, secret);
  hmac.update(timeBuffer);
  const hash = hmac.digest();

  // Dynamic truncation (RFC 4226 §5.4)
  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  const otp = binary % Math.pow(10, TOTP_DIGITS);
  return otp.toString().padStart(TOTP_DIGITS, '0');
}

function getCurrentStep(): number {
  return Math.floor(Date.now() / 1000 / TOTP_PERIOD);
}

// ── Secret Management ─────────────────────────────────

/** Generate a new TOTP secret (160 bits per RFC 4226) */
export function generateSecret(): Buffer {
  return randomBytes(20); // 160 bits
}

/** Encode secret as base32 for authenticator apps */
export function encodeBase32(buffer: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, '0');
  }
  let result = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.substring(i, i + 5).padEnd(5, '0');
    result += alphabet[parseInt(chunk, 2)];
  }
  return result;
}

/** Generate the otpauth:// URI for QR code / manual entry */
export function generateOtpauthUri(secret: Buffer, issuer: string = 'VoidForge', account: string = 'treasury'): string {
  const b32 = encodeBase32(secret);
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${b32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
}

// ── Keychain Storage (ADR-4) ──────────────────────────

/** Store TOTP secret in system keychain (macOS) */
async function storeInKeychain(secret: Buffer): Promise<boolean> {
  if (platform() !== 'darwin') return false;
  try {
    // Delete existing entry if present
    try {
      execSync(`security delete-generic-password -s "${KEYCHAIN_SERVICE}" -a "${KEYCHAIN_ACCOUNT}" 2>/dev/null`);
    } catch { /* not found — fine */ }

    const hex = secret.toString('hex');
    execSync(`security add-generic-password -s "${KEYCHAIN_SERVICE}" -a "${KEYCHAIN_ACCOUNT}" -w "${hex}" -T ""`);
    return true;
  } catch {
    return false;
  }
}

/** Read TOTP secret from system keychain (macOS) */
async function readFromKeychain(): Promise<Buffer | null> {
  if (platform() !== 'darwin') return null;
  try {
    const hex = execSync(
      `security find-generic-password -s "${KEYCHAIN_SERVICE}" -a "${KEYCHAIN_ACCOUNT}" -w 2>/dev/null`,
      { encoding: 'utf-8' }
    ).trim();
    return Buffer.from(hex, 'hex');
  } catch {
    return null;
  }
}

/** Delete TOTP secret from system keychain */
async function deleteFromKeychain(): Promise<void> {
  if (platform() !== 'darwin') return;
  try {
    execSync(`security delete-generic-password -s "${KEYCHAIN_SERVICE}" -a "${KEYCHAIN_ACCOUNT}" 2>/dev/null`);
  } catch { /* not found — fine */ }
}

// ── Fallback: Encrypted File ──────────────────────────
// Used when system keychain is unavailable (Linux without Secret Service, etc.)
// Encrypted with a DIFFERENT password from the financial vault (§9.11)

async function storeInFile(secret: Buffer, totpPassword: string): Promise<void> {
  // Re-use the financial vault's encrypt pattern but with a separate password
  const { createCipheriv, scrypt: scryptCb } = await import('node:crypto');
  const salt = randomBytes(32);
  const iv = randomBytes(16);

  const key = await new Promise<Buffer>((resolve, reject) => {
    scryptCb(totpPassword.slice(0, 256), salt, 32, { N: 131072, r: 8, p: 1 }, (err, k) => {
      if (err) reject(err); else resolve(k);
    });
  });

  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(secret), cipher.final()]);
  const tag = cipher.getAuthTag();

  await mkdir(TREASURY_DIR, { recursive: true });
  const tmpPath = TOTP_FALLBACK_PATH + '.tmp.' + process.pid;
  const fh = await open(tmpPath, 'w', 0o600);
  try {
    await fh.writeFile(Buffer.concat([salt, iv, tag, encrypted]));
    await fh.sync();
  } finally {
    await fh.close();
  }
  await rename(tmpPath, TOTP_FALLBACK_PATH);
}

async function readFromFile(totpPassword: string): Promise<Buffer | null> {
  if (!existsSync(TOTP_FALLBACK_PATH)) return null;
  try {
    const raw = await readFile(TOTP_FALLBACK_PATH);
    const salt = raw.subarray(0, 32);
    const iv = raw.subarray(32, 48);
    const tag = raw.subarray(48, 64);
    const ciphertext = raw.subarray(64);

    const { createDecipheriv, scrypt: scryptCb } = await import('node:crypto');
    const key = await new Promise<Buffer>((resolve, reject) => {
      scryptCb(totpPassword.slice(0, 256), salt, 32, { N: 131072, r: 8, p: 1 }, (err, k) => {
        if (err) reject(err); else resolve(k);
      });
    });

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────

/** Set up TOTP — generates secret, stores in keychain, returns URI for QR display */
export async function totpSetup(fallbackPassword?: string): Promise<{ uri: string; secret: string; stored: 'keychain' | 'file' }> {
  const secret = generateSecret();
  const uri = generateOtpauthUri(secret);
  const b32 = encodeBase32(secret);

  // Try keychain first (ADR-4)
  const keychainOk = await storeInKeychain(secret);
  if (keychainOk) {
    return { uri, secret: b32, stored: 'keychain' };
  }

  // Fallback to encrypted file
  if (!fallbackPassword) {
    throw new Error('System keychain unavailable. Provide a TOTP encryption password (must differ from vault password).');
  }
  await storeInFile(secret, fallbackPassword);
  return { uri, secret: b32, stored: 'file' };
}

/** Verify a TOTP code. Returns true if valid, false if invalid or replay. */
export async function totpVerify(code: string, fallbackPassword?: string): Promise<boolean> {
  // Read secret from keychain or file
  let secret = await readFromKeychain();
  if (!secret && fallbackPassword) {
    secret = await readFromFile(fallbackPassword);
  }
  if (!secret) {
    throw new Error('TOTP not configured. Run /cultivation install or voidforge treasury --setup-2fa.');
  }

  const currentStep = getCurrentStep();

  // Check current step ± window
  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset++) {
    const step = currentStep + offset;
    const expected = generateTotpCode(secret, step);
    // SEC-003: Use constant-time comparison for TOTP codes
    const codeMatch = code.length === expected.length &&
      timingSafeEqual(Buffer.from(code), Buffer.from(expected));
    if (codeMatch) {
      // VG-003: Replay protection — reject reuse of ANY code within the window period
      const codeKey = code + ':' + step;
      if (session && session.usedCodes.has(codeKey)) {
        return false; // Replay detected
      }

      // Set or update session, tracking all used codes
      if (!session) {
        session = { verifiedAt: Date.now(), lastUsedAt: Date.now(), usedCodes: new Set() };
      } else {
        session.lastUsedAt = Date.now();
      }
      session.usedCodes.add(codeKey);
      // Prune codes older than 3 TOTP periods (90 seconds)
      // LOKI-005: If clock jumped (step difference > 10), clear all used codes to prevent lockout
      const toDelete: string[] = [];
      for (const key of session.usedCodes) {
        const keyStep = parseInt(key.split(':')[1]);
        const drift = currentStep - keyStep;
        if (drift > 3 || drift < -3) toDelete.push(key);
      }
      for (const key of toDelete) session.usedCodes.delete(key);
      return true;
    }
  }
  return false;
}

/** Check if a TOTP session is still valid (5 min TTL, 2 min idle) */
export function totpSessionValid(): boolean {
  if (!session) return false;
  const now = Date.now();
  if (now - session.verifiedAt > TOTP_SESSION_TTL_MS) {
    session = null;
    return false;
  }
  if (now - session.lastUsedAt > TOTP_IDLE_TTL_MS) {
    session = null;
    return false;
  }
  session.lastUsedAt = now; // Touch
  return true;
}

/** Invalidate the TOTP session */
export function totpSessionInvalidate(): void {
  session = null;
}

/** Check if TOTP is configured (keychain or file) */
export async function totpIsConfigured(fallbackPassword?: string): Promise<boolean> {
  const secret = await readFromKeychain();
  if (secret) return true;
  if (fallbackPassword) {
    const fileSecret = await readFromFile(fallbackPassword);
    if (fileSecret) return true;
  }
  return existsSync(TOTP_FALLBACK_PATH);
}

/** Remove TOTP configuration */
export async function totpRemove(): Promise<void> {
  await deleteFromKeychain();
  // Don't delete the file — user may want to keep the backup
  totpSessionInvalidate();
}
