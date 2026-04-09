/**
 * Shared .env file writer — used by all provisioners.
 * Appends a labeled section to the project's .env file.
 * Extracted from 5 identical copy-pasted implementations.
 */

import { readFile, writeFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Append a section of environment variables to a project's .env file.
 * Creates the file if it doesn't exist. Adds a blank line separator.
 *
 * WARNING: Not safe for concurrent calls. All provisioner steps run sequentially
 * through the SSE stream, so this is safe in practice. Do not call in parallel.
 */
export async function appendEnvSection(
  projectDir: string,
  lines: string[],
): Promise<void> {
  const envPath = join(projectDir, '.env');
  let existing = '';
  try { existing = await readFile(envPath, 'utf-8'); } catch { /* new file */ }
  const separator = existing ? '\n\n' : '';
  await writeFile(envPath, existing + separator + lines.join('\n') + '\n', 'utf-8');
  // Restrict .env permissions — credentials should not be world-readable
  await chmod(envPath, 0o600);
}
