/**
 * Shared HTTP helpers — used across all API modules.
 * Extracted to eliminate 13 duplicate sendJson() implementations.
 */

import type { ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';

/** Send a JSON response with the given status code. */
export function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

/** Read a file, returning null if it doesn't exist or fails. */
export async function readFileOrNull(path: string): Promise<string | null> {
  try { return await readFile(path, 'utf-8'); } catch { return null; }
}
