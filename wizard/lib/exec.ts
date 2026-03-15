/**
 * Shared child process utility — timeout, abort signal, streaming.
 * Used by github.ts (git commands) and ssh-deploy.ts (ssh/rsync).
 * Uses execFile (not exec) to prevent shell injection. (ADR-013)
 */

import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFileCb);

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes

interface ExecResult {
  stdout: string;
  stderr: string;
}

interface ExecOptions {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string | undefined>;
  abortSignal?: AbortSignal;
}

/**
 * Execute a command with timeout and abort support.
 * Uses execFile (not exec) — no shell, no injection risk.
 */
export async function execCommand(
  command: string,
  args: string[],
  options?: ExecOptions,
): Promise<ExecResult> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;

  const result = await execFileAsync(command, args, {
    cwd: options?.cwd,
    timeout,
    env: options?.env ? { ...process.env, ...options.env } : undefined,
    signal: options?.abortSignal,
    maxBuffer: 10 * 1024 * 1024, // 10MB
  });

  return {
    stdout: result.stdout?.toString() ?? '',
    stderr: result.stderr?.toString() ?? '',
  };
}

/**
 * Check if a binary is available on the system.
 * Returns the path if found, null if not.
 */
export async function whichBinary(name: string): Promise<string | null> {
  try {
    const { stdout } = await execCommand('which', [name], { timeout: 5000 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Validate that required binaries exist. Returns missing binary names.
 */
export async function validateBinaries(names: string[]): Promise<string[]> {
  const missing: string[] = [];
  for (const name of names) {
    const found = await whichBinary(name);
    if (!found) missing.push(name);
  }
  return missing;
}
