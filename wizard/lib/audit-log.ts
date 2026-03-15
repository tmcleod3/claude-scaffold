/**
 * Audit Log — Append-only JSON lines logger for Camelot Remote.
 *
 * Layer 5 of the 5-layer security architecture.
 * Every security-relevant action is recorded.
 * File permissions: 0600 (owner read/write only).
 * Rotation: at 10MB, rename to .1 and start fresh.
 */

import { appendFile, stat, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const VOIDFORGE_DIR = join(homedir(), '.voidforge');
const LOG_PATH = join(VOIDFORGE_DIR, 'audit.log');
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB rotation threshold

export type AuditEventType =
  | 'login_attempt'
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'session_create'
  | 'session_expire'
  | 'vault_unlock'
  | 'vault_lock'
  | 'terminal_start'
  | 'terminal_end'
  | 'ssh_connect'
  | 'deploy'
  | 'credential_access'
  | 'project_create'
  | 'project_delete'
  | 'health_failure';

export interface AuditEntry {
  timestamp: string;
  event: AuditEventType;
  ip: string;
  user: string;
  details: Record<string, string | number | boolean>;
}

let initialized = false;

/** Ensure the log directory exists. Called once on startup. */
export async function initAuditLog(): Promise<void> {
  if (initialized) return;
  await mkdir(VOIDFORGE_DIR, { recursive: true });
  initialized = true;
}

/** Check if log needs rotation and rotate if so. */
async function rotateIfNeeded(): Promise<void> {
  try {
    const stats = await stat(LOG_PATH);
    if (stats.size >= MAX_SIZE_BYTES) {
      // Rotate: current → .1 (overwrite previous rotation)
      await rename(LOG_PATH, LOG_PATH + '.1');
    }
  } catch {
    // File doesn't exist yet — that's fine
  }
}

/**
 * Append an audit entry. Never throws — logging must not crash the server.
 * If the write fails, the entry is lost (acceptable tradeoff vs. crashing).
 */
export async function audit(
  event: AuditEventType,
  ip: string,
  user: string,
  details: Record<string, string | number | boolean> = {},
): Promise<void> {
  try {
    if (!initialized) await initAuditLog();
    await rotateIfNeeded();

    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      event,
      ip,
      user,
      details,
    };

    // JSON lines format: one JSON object per line, newline-terminated
    const line = JSON.stringify(entry) + '\n';

    // Append with 0600 permissions (creates file if needed)
    await appendFile(LOG_PATH, line, { mode: 0o600 });
  } catch {
    // Audit logging must never crash the server.
    // If we can't write, the entry is lost — but the server stays up.
    console.error('Audit log write failed');
  }
}
