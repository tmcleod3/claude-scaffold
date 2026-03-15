/**
 * Project Registry — CRUD for ~/.voidforge/projects.json.
 * Zero-dep JSON file storage for multi-project Avengers Tower.
 * File permissions: 0600 (owner read/write only).
 *
 * Follows vault.ts patterns: serialized writes, atomic file ops, homedir().
 */

import { readFile, rename, mkdir, open, copyFile, chmod } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';

const VOIDFORGE_DIR = join(homedir(), '.voidforge');
const REGISTRY_PATH = join(VOIDFORGE_DIR, 'projects.json');

export type HealthStatus = 'healthy' | 'degraded' | 'down' | 'unchecked';

export interface ProjectAccessEntry {
  username: string;
  role: 'deployer' | 'viewer';
}

export interface Project {
  id: string;
  name: string;
  directory: string;
  deployTarget: string;
  deployUrl: string;
  sshHost: string;
  framework: string;
  database: string;
  createdAt: string;
  lastBuildPhase: number;
  lastDeployAt: string;
  healthCheckUrl: string;
  monthlyCost: number;
  healthStatus: HealthStatus;
  healthCheckedAt: string;
  owner: string;
  access: ProjectAccessEntry[];
  linkedProjects: string[];
}

export type ProjectInput = Omit<Project, 'id' | 'healthStatus' | 'healthCheckedAt'> & {
  owner?: string;
  access?: ProjectAccessEntry[];
  linkedProjects?: string[];
};

// ── Write serialization (from vault.ts) ────────────

let writeQueue: Promise<void> = Promise.resolve();

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(fn, () => fn());
  writeQueue = result.then(() => {}, () => {});
  return result;
}

// ── Validation ─────────────────────────────────────

const VALID_HEALTH_STATUSES = new Set<string>(['healthy', 'degraded', 'down', 'unchecked']);

function isValidProject(obj: unknown): obj is Project {
  if (typeof obj !== 'object' || obj === null) return false;
  const p = obj as Record<string, unknown>;
  const valid = (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.directory === 'string' &&
    typeof p.deployTarget === 'string' &&
    typeof p.deployUrl === 'string' &&
    typeof p.sshHost === 'string' &&
    typeof p.framework === 'string' &&
    typeof p.database === 'string' &&
    typeof p.createdAt === 'string' &&
    typeof p.lastBuildPhase === 'number' &&
    typeof p.lastDeployAt === 'string' &&
    typeof p.healthCheckUrl === 'string' &&
    typeof p.monthlyCost === 'number' &&
    typeof p.healthStatus === 'string' &&
    VALID_HEALTH_STATUSES.has(p.healthStatus) &&
    typeof p.healthCheckedAt === 'string'
  );
  if (!valid) return false;
  // Migrate legacy projects without owner/access/linkedProjects fields
  if (typeof p.owner !== 'string') p.owner = '';
  if (!Array.isArray(p.access)) p.access = [];
  if (!Array.isArray(p.linkedProjects)) p.linkedProjects = [];
  return true;
}

// ── Path normalization ─────────────────────────────

function normalizePath(dir: string): string {
  return resolve(dir);
}

// ── File I/O (atomic writes, following vault.ts) ───

/** Read the full registry. Returns empty array if file doesn't exist. */
export async function readRegistry(): Promise<Project[]> {
  try {
    const raw = await readFile(REGISTRY_PATH, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Validate each entry, filter out invalid ones
    return parsed.filter(isValidProject);
  } catch (err: unknown) {
    // File not found is expected — return empty registry
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    // JSON parse error or permission denied — throw so callers don't overwrite data
    throw new Error(`Registry corrupted or unreadable: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

/** Atomic write: backup → temp file → fsync → rename (from vault.ts). */
async function writeRegistry(projects: Project[]): Promise<void> {
  await mkdir(VOIDFORGE_DIR, { recursive: true });

  // Backup current file before overwriting (data loss prevention)
  try {
    await copyFile(REGISTRY_PATH, REGISTRY_PATH + '.bak');
    await chmod(REGISTRY_PATH + '.bak', 0o600);
  } catch (err: unknown) {
    // ENOENT = no file to back up (expected on first write)
    // Other errors (disk full, permissions) = log but don't block the write
    if (!(err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT')) {
      console.error('Registry backup failed:', err instanceof Error ? err.message : 'Unknown error');
    }
  }

  const data = JSON.stringify(projects, null, 2);
  const tmpPath = REGISTRY_PATH + '.tmp';
  const fh = await open(tmpPath, 'w', 0o600);
  try {
    await fh.writeFile(data);
    await fh.sync();
  } finally {
    await fh.close();
  }
  await rename(tmpPath, REGISTRY_PATH);
}

// ── Public API (all mutating ops are serialized) ───

/**
 * Add a new project to the registry.
 * @throws Error if a project with the same directory is already registered.
 */
export function addProject(input: ProjectInput): Promise<Project> {
  return serialized(async () => {
    const projects = await readRegistry();

    const normalized = normalizePath(input.directory);
    const exists = projects.some((p) => normalizePath(p.directory) === normalized);
    if (exists) {
      throw new Error(`Project already registered at ${input.directory}`);
    }

    const project: Project = {
      ...input,
      directory: normalized,
      id: randomUUID(),
      healthStatus: 'unchecked',
      healthCheckedAt: '',
      owner: input.owner ?? '',
      access: input.access ?? [],
      linkedProjects: input.linkedProjects ?? [],
    };

    projects.push(project);
    await writeRegistry(projects);
    return project;
  });
}

/** Get a project by ID. Returns null if not found. */
export async function getProject(id: string): Promise<Project | null> {
  const projects = await readRegistry();
  return projects.find((p) => p.id === id) ?? null;
}

/** Find a project by directory path. Returns null if not found. */
export async function findByDirectory(directory: string): Promise<Project | null> {
  const projects = await readRegistry();
  const normalized = normalizePath(directory);
  return projects.find((p) => normalizePath(p.directory) === normalized) ?? null;
}

/** Mutable fields — prevents callers from injecting arbitrary keys via spread. */
const MUTABLE_FIELDS = new Set<string>([
  'name', 'deployTarget', 'deployUrl', 'sshHost', 'framework', 'database',
  'lastBuildPhase', 'lastDeployAt', 'healthCheckUrl', 'monthlyCost',
  'healthStatus', 'healthCheckedAt',
]);

/** Update a project by ID. Merges only known mutable fields. Returns null if not found. */
export function updateProject(id: string, updates: Partial<Omit<Project, 'id' | 'createdAt' | 'directory'>>): Promise<Project | null> {
  return serialized(async () => {
    const projects = await readRegistry();
    const idx = projects.findIndex((p) => p.id === id);
    if (idx === -1) return null;

    // Pick only known mutable fields from updates, validate enum fields
    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (!MUTABLE_FIELDS.has(key)) continue;
      // Validate healthStatus against allowed values
      if (key === 'healthStatus' && !VALID_HEALTH_STATUSES.has(value as string)) continue;
      safe[key] = value;
    }

    projects[idx] = { ...projects[idx], ...safe } as Project;
    await writeRegistry(projects);
    return projects[idx];
  });
}

/** Remove a project by ID. Cleans up linked references in other projects. */
export function removeProject(id: string): Promise<boolean> {
  return serialized(async () => {
    const projects = await readRegistry();
    const idx = projects.findIndex((p) => p.id === id);
    if (idx === -1) return false;

    projects.splice(idx, 1);
    // Clean up linked references in remaining projects
    for (const project of projects) {
      project.linkedProjects = project.linkedProjects.filter((lid) => lid !== id);
    }
    await writeRegistry(projects);
    return true;
  });
}

/** Update health status for a project. */
export function updateHealthStatus(
  id: string,
  status: HealthStatus,
): Promise<void> {
  return serialized(async () => {
    const projects = await readRegistry();
    const idx = projects.findIndex((p) => p.id === id);
    if (idx === -1) return;

    projects[idx] = {
      ...projects[idx],
      healthStatus: status,
      healthCheckedAt: new Date().toISOString(),
    };
    await writeRegistry(projects);
  });
}

// ── Per-project access control ──────────────────────

/**
 * Get projects visible to a user.
 * Admins see all. Others see owned + explicitly shared.
 */
export async function getProjectsForUser(
  username: string,
  globalRole: string,
): Promise<Project[]> {
  const projects = await readRegistry();
  if (globalRole === 'admin') return projects;
  return projects.filter(
    (p) => p.owner === username || p.access.some((a) => a.username === username),
  );
}

/**
 * Check if a user can access a project at the given role level.
 * Returns the effective role or null if no access.
 */
export async function checkProjectAccess(
  projectId: string,
  username: string,
  globalRole: string,
): Promise<'admin' | 'deployer' | 'viewer' | null> {
  const project = await getProject(projectId);
  if (!project) return null;

  // Global admins have full access
  if (globalRole === 'admin') return 'admin';

  // Project owner has full access
  if (project.owner === username) return 'admin';

  // Check access list
  const entry = project.access.find((a) => a.username === username);
  return entry?.role ?? null;
}

/** Grant access to a project for a user. Overwrites existing entry for that user. */
export function grantAccess(
  projectId: string,
  username: string,
  role: 'deployer' | 'viewer',
): Promise<void> {
  return serialized(async () => {
    const projects = await readRegistry();
    const idx = projects.findIndex((p) => p.id === projectId);
    if (idx === -1) throw new Error('Project not found');

    const project = projects[idx];
    // Remove existing entry for this user (if any)
    project.access = project.access.filter((a) => a.username !== username);
    project.access.push({ username, role });

    await writeRegistry(projects);
  });
}

/** Revoke access from a project for a user. */
export function revokeAccess(
  projectId: string,
  username: string,
): Promise<void> {
  return serialized(async () => {
    const projects = await readRegistry();
    const idx = projects.findIndex((p) => p.id === projectId);
    if (idx === -1) throw new Error('Project not found');

    const project = projects[idx];
    const before = project.access.length;
    project.access = project.access.filter((a) => a.username !== username);
    if (project.access.length === before) throw new Error('User has no access to revoke');

    await writeRegistry(projects);
  });
}

/** Remove a user from all project access lists and clear ownership (cleanup on user deletion). */
export function removeUserFromAllProjects(username: string): Promise<number> {
  return serialized(async () => {
    const projects = await readRegistry();
    let changedCount = 0;
    for (const project of projects) {
      const before = project.access.length;
      project.access = project.access.filter((a) => a.username !== username);
      if (project.access.length < before) changedCount++;
      // Clear ownership to prevent privilege escalation via username reuse
      if (project.owner === username) {
        project.owner = '';
        changedCount++;
      }
    }
    if (changedCount > 0) await writeRegistry(projects);
    return changedCount;
  });
}

/** Get access list for a project. */
export async function getProjectAccess(
  projectId: string,
): Promise<{ owner: string; access: ProjectAccessEntry[] } | null> {
  const project = await getProject(projectId);
  if (!project) return null;
  return { owner: project.owner, access: project.access };
}

// ── Linked services ─────────────────────────────────

/** Link two projects bidirectionally. */
export function linkProjects(projectIdA: string, projectIdB: string): Promise<void> {
  return serialized(async () => {
    if (projectIdA === projectIdB) throw new Error('Cannot link a project to itself');
    const projects = await readRegistry();
    const a = projects.find((p) => p.id === projectIdA);
    const b = projects.find((p) => p.id === projectIdB);
    if (!a || !b) throw new Error('Project not found');

    if (!a.linkedProjects.includes(projectIdB)) a.linkedProjects.push(projectIdB);
    if (!b.linkedProjects.includes(projectIdA)) b.linkedProjects.push(projectIdA);

    await writeRegistry(projects);
  });
}

/** Unlink two projects bidirectionally. */
export function unlinkProjects(projectIdA: string, projectIdB: string): Promise<void> {
  return serialized(async () => {
    const projects = await readRegistry();
    const a = projects.find((p) => p.id === projectIdA);
    const b = projects.find((p) => p.id === projectIdB);
    if (!a || !b) throw new Error('Project not found');

    a.linkedProjects = a.linkedProjects.filter((id) => id !== projectIdB);
    b.linkedProjects = b.linkedProjects.filter((id) => id !== projectIdA);

    await writeRegistry(projects);
  });
}

/** Get all projects in the linked group (BFS traversal with cycle detection). */
export async function getLinkedGroup(projectId: string): Promise<Project[]> {
  const projects = await readRegistry();
  const start = projects.find((p) => p.id === projectId);
  if (!start) return [];

  // BFS to resolve transitive links: A→B→C means all three are in the group
  const visited = new Set<string>();
  const queue = [start];
  const group: Project[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.id)) continue;
    visited.add(current.id);
    group.push(current);

    for (const linkedId of current.linkedProjects) {
      if (!visited.has(linkedId)) {
        const linked = projects.find((p) => p.id === linkedId);
        if (linked) queue.push(linked);
      }
    }
  }

  return group;
}
