import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function createTempHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'voidforge-test-'));
}

export async function cleanupTempHome(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}
