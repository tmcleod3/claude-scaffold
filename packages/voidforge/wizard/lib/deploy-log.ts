/**
 * Structured deploy logging (ADR-021).
 * Persists deploy results to ~/.voidforge/deploys/ for history.
 * No dependencies — pure Node.js stdlib.
 */

import { writeFile, readdir, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DEPLOYS_DIR = join(homedir(), '.voidforge', 'deploys');

export interface DeployLogEntry {
  runId: string;
  timestamp: string;
  target: string;
  projectName: string;
  framework: string;
  deployUrl: string;
  hostname: string;
  region: string;
  resources: { type: string; id: string }[];
  outputs: Record<string, string>;
}

/**
 * Persist a deploy result to the structured log.
 */
export async function logDeploy(entry: DeployLogEntry): Promise<string> {
  await mkdir(DEPLOYS_DIR, { recursive: true });

  const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `${date}-${entry.target}-${entry.runId.slice(0, 8)}.json`;
  const filepath = join(DEPLOYS_DIR, filename);

  await writeFile(filepath, JSON.stringify(entry, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 });
  return filepath;
}

/**
 * List recent deploy logs, newest first.
 */
export async function listDeploys(limit = 20): Promise<DeployLogEntry[]> {
  let files: string[];
  try {
    files = await readdir(DEPLOYS_DIR);
  } catch {
    return []; // Directory doesn't exist yet
  }

  const jsonFiles = files
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, limit);

  const entries: DeployLogEntry[] = [];
  for (const file of jsonFiles) {
    try {
      const content = await readFile(join(DEPLOYS_DIR, file), 'utf-8');
      const parsed = JSON.parse(content) as Record<string, unknown>;
      // Basic validation — ensure required fields exist
      if (parsed.runId && parsed.target && parsed.timestamp) {
        entries.push(parsed as unknown as DeployLogEntry);
      }
    } catch {
      // Skip corrupt log files
    }
  }
  return entries;
}
