/**
 * Treasury Backup — Encrypted daily snapshots (§9.17, §9.19.13).
 *
 * Daily snapshot of ~/.voidforge/treasury/ + growth state.
 * Encrypted with vault password (AES-256-GCM).
 * Retain 30 days. Runs as a heartbeat daemon scheduled job.
 *
 * PRD Reference: §9.17 (Backup Strategy), §9.19.13 (scope extension)
 */

import { readdir, readFile, mkdir, unlink } from 'node:fs/promises';
import { createCipheriv, randomBytes, scrypt } from 'node:crypto';
import { join } from 'node:path';
import { existsSync, createWriteStream, createReadStream } from 'node:fs';
import { homedir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

const TREASURY_DIR = join(homedir(), '.voidforge', 'treasury');
const BACKUP_DIR = join(homedir(), '.voidforge', 'backups');
const RETENTION_DAYS = 30;

/**
 * Create an encrypted daily backup of the treasury directory.
 * The backup is a gzipped tar-like concatenation of files, encrypted with AES-256-GCM.
 * The vault password is the encryption key (via scrypt).
 */
export async function createDailyBackup(vaultPassword: string): Promise<{ path: string; files: number }> {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const backupPath = join(BACKUP_DIR, `treasury-${date}.backup.enc`);

  await mkdir(BACKUP_DIR, { recursive: true });

  // Skip if today's backup already exists
  if (existsSync(backupPath)) {
    return { path: backupPath, files: 0 };
  }

  // Collect all files from treasury directory
  const files: Array<{ relativePath: string; content: Buffer }> = [];

  if (existsSync(TREASURY_DIR)) {
    await collectFiles(TREASURY_DIR, TREASURY_DIR, files);
  }

  if (files.length === 0) {
    return { path: '', files: 0 };
  }

  // Serialize file manifest
  const manifest = files.map(f => ({
    path: f.relativePath,
    size: f.content.length,
  }));

  // Create a simple archive format: manifest JSON + file contents
  const archiveData = Buffer.concat([
    Buffer.from(JSON.stringify(manifest) + '\n---MANIFEST_END---\n'),
    ...files.map(f => Buffer.concat([
      Buffer.from(`---FILE:${f.relativePath}:${f.content.length}---\n`),
      f.content,
      Buffer.from('\n'),
    ])),
  ]);

  // Encrypt the archive (§9.19.13: encrypted with vault password)
  const salt = randomBytes(32);
  const iv = randomBytes(16);
  const key = await deriveKey(vaultPassword, salt);

  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(archiveData), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: salt (32) + iv (16) + authTag (16) + ciphertext
  const output = Buffer.concat([salt, iv, authTag, encrypted]);

  // Write atomically
  const tmpPath = backupPath + '.tmp';
  const { writeFile: writeFileAsync, rename: renameAsync } = await import('node:fs/promises');
  await writeFileAsync(tmpPath, output, { mode: 0o600 });
  await renameAsync(tmpPath, backupPath);

  // Prune old backups
  await pruneOldBackups();

  return { path: backupPath, files: files.length };
}

async function collectFiles(dir: string, baseDir: string, result: Array<{ relativePath: string; content: Buffer }>): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(fullPath, baseDir, result);
    } else if (entry.isFile()) {
      // v17.0: Size limit to prevent unbounded memory allocation
      const fileStat = await import('node:fs/promises').then(m => m.stat(fullPath));
      if (fileStat.size > 100 * 1024 * 1024) {
        console.warn(`Treasury backup: skipping ${entry.name} (${fileStat.size} bytes > 100MB limit)`);
        continue;
      }
      const relativePath = fullPath.replace(baseDir + '/', '');
      const content = await readFile(fullPath);
      result.push({ relativePath, content });
    }
  }
}

async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password.slice(0, 256), salt, 32, { N: 131072, r: 8, p: 1 }, (err, key) => {
      if (err) reject(err); else resolve(key);
    });
  });
}

async function pruneOldBackups(): Promise<void> {
  if (!existsSync(BACKUP_DIR)) return;
  const entries = await readdir(BACKUP_DIR);
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;

  for (const entry of entries) {
    if (!entry.startsWith('treasury-') || !entry.endsWith('.backup.enc')) continue;
    const dateStr = entry.replace('treasury-', '').replace('.backup.enc', '');
    const fileDate = new Date(dateStr).getTime();
    if (fileDate < cutoff) {
      await unlink(join(BACKUP_DIR, entry));
    }
  }
}

/**
 * Export all financial data (encrypted with vault password).
 * Used by /treasury --export and uninstall safety.
 */
export async function exportTreasuryData(vaultPassword: string, outputPath: string): Promise<void> {
  const result = await createDailyBackup(vaultPassword);
  if (result.path) {
    const { copyFile } = await import('node:fs/promises');
    await copyFile(result.path, outputPath);
  }
}
