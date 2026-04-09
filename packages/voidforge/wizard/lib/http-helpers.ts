/**
 * Shared HTTP helpers — used across all API modules.
 * Extracted to eliminate 13 duplicate sendJson() implementations.
 */

import type { ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';

/** Send a JSON response with the given status code. */
export function sendJson(res: ServerResponse, status: number, data: unknown, noCache = false): void {
  const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' };
  if (noCache) {
    headers['Cache-Control'] = 'no-store';
    headers['Pragma'] = 'no-cache';
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(data));
}

/** Read a file, returning null if it doesn't exist or fails. */
export async function readFileOrNull(path: string): Promise<string | null> {
  try { return await readFile(path, 'utf-8'); } catch { return null; }
}
