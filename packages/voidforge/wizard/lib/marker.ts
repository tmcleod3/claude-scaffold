/**
 * .voidforge marker file — project identity and CLI detection.
 *
 * Every VoidForge project has a `.voidforge` JSON file at root.
 * The CLI walks up from cwd to find it, determining the project root.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';

// ── Types ────────────────────────────────────────────────

export interface VoidForgeMarker {
  id: string;
  version: string;
  created: string;
  tier: 'full' | 'methodology';
  extensions: string[];
}

// ── Constants ────────────────────────────────────────────

export const MARKER_FILE = '.voidforge';

// ── Read / Write ─────────────────────────────────────────

export async function readMarker(dir: string): Promise<VoidForgeMarker | null> {
  const markerPath = join(dir, MARKER_FILE);
  if (!existsSync(markerPath)) return null;
  try {
    const raw = await readFile(markerPath, 'utf-8');
    const data = JSON.parse(raw) as VoidForgeMarker;
    if (!data.id || !data.version || !Array.isArray(data.extensions)) return null;
    return data;
  } catch {
    return null;
  }
}

export async function writeMarker(dir: string, marker: VoidForgeMarker): Promise<void> {
  const markerPath = join(dir, MARKER_FILE);
  await writeFile(markerPath, JSON.stringify(marker, null, 2) + '\n', 'utf-8');
}

export function createMarker(
  version: string,
  tier: VoidForgeMarker['tier'] = 'full',
  extensions: string[] = [],
): VoidForgeMarker {
  return {
    id: randomUUID(),
    version,
    created: new Date().toISOString(),
    tier,
    extensions,
  };
}

// ── Project Detection ────────────────────────────────────

/**
 * Walk up from `startDir` to find the nearest `.voidforge` marker.
 * Returns the directory containing the marker, or null if none found.
 */
export function findProjectRoot(startDir: string = process.cwd()): string | null {
  let current = startDir;
  while (true) {
    if (existsSync(join(current, MARKER_FILE))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break; // filesystem root
    current = parent;
  }
  return null;
}

/**
 * Like findProjectRoot but throws with a user-friendly message.
 */
export function requireProjectRoot(startDir: string = process.cwd()): string {
  const root = findProjectRoot(startDir);
  if (!root) {
    console.error('Not a VoidForge project — run `npx voidforge init` to create one.');
    process.exit(1);
  }
  return root;
}

// ── Global Config ────────────────────────────────────────

export function getGlobalDir(): string {
  const home = process.env['HOME'] ?? process.env['USERPROFILE'] ?? homedir();
  return join(home, '.voidforge');
}

export function getProjectsRegistryPath(): string {
  return join(getGlobalDir(), 'projects.json');
}

export function getVaultPath(): string {
  return join(getGlobalDir(), 'vault.enc');
}

// ── Project Registry ─────────────────────────────────────

interface ProjectEntry {
  id: string;
  name: string;
  path: string;
  created: string;
}

export async function readProjectsRegistry(): Promise<ProjectEntry[]> {
  const registryPath = getProjectsRegistryPath();
  if (!existsSync(registryPath)) return [];
  try {
    const raw = await readFile(registryPath, 'utf-8');
    return JSON.parse(raw) as ProjectEntry[];
  } catch {
    return [];
  }
}

export async function registerProject(entry: ProjectEntry): Promise<void> {
  const registry = await readProjectsRegistry();
  const existing = registry.findIndex(p => p.id === entry.id);
  if (existing >= 0) {
    registry[existing] = entry;
  } else {
    registry.push(entry);
  }
  await writeFile(getProjectsRegistryPath(), JSON.stringify(registry, null, 2) + '\n', 'utf-8');
}
