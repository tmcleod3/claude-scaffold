/**
 * Project registry tests — validation, access control, linked projects.
 * Tier 1: isValidProject logic. Tier 2: CRUD with mocked filesystem.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock filesystem
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(() => Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))),
  mkdir: vi.fn(() => Promise.resolve()),
  rename: vi.fn(() => Promise.resolve()),
  open: vi.fn(() => Promise.resolve({
    writeFile: vi.fn(() => Promise.resolve()),
    sync: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  })),
  copyFile: vi.fn(() => Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))),
  chmod: vi.fn(() => Promise.resolve()),
}));

import {
  readRegistry,
  addProject,
  getProject,
  findByDirectory,
  updateProject,
  removeProject,
  getProjectsForUser,
  checkProjectAccess,
  getLinkedGroup,
} from '../lib/project-registry.js';
import type { ProjectInput, Project } from '../lib/project-registry.js';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeProjectInput(overrides: Partial<ProjectInput> = {}): ProjectInput {
  return {
    name: 'My Project',
    directory: '/tmp/my-project-' + Math.random().toString(36).slice(2),
    deployTarget: 'vercel',
    deployUrl: 'https://my-project.vercel.app',
    sshHost: '',
    framework: 'next.js',
    database: 'postgres',
    createdAt: new Date().toISOString(),
    lastBuildPhase: 12,
    lastDeployAt: new Date().toISOString(),
    healthCheckUrl: 'https://my-project.vercel.app/api/health',
    monthlyCost: 0,
    owner: 'testuser',
    ...overrides,
  };
}

describe('readRegistry', () => {
  it('returns empty array when file does not exist', async () => {
    const projects = await readRegistry();
    expect(projects).toEqual([]);
  });
});

describe('addProject', () => {
  it('creates a project with UUID and unchecked health', async () => {
    const project = await addProject(makeProjectInput());
    expect(project.id).toBeTruthy();
    expect(project.healthStatus).toBe('unchecked');
    expect(project.healthCheckedAt).toBe('');
  });

  it('defaults owner to empty string when not provided', async () => {
    const project = await addProject(makeProjectInput({ owner: undefined }));
    expect(project.owner).toBe('');
  });
});

describe('getProject', () => {
  it('returns null when project does not exist', async () => {
    const project = await getProject('nonexistent-id');
    expect(project).toBeNull();
  });
});

describe('findByDirectory', () => {
  it('returns null when directory not found', async () => {
    const project = await findByDirectory('/nonexistent/path');
    expect(project).toBeNull();
  });
});

describe('getProjectsForUser', () => {
  it('returns empty array when registry is empty', async () => {
    const projects = await getProjectsForUser('testuser', 'viewer');
    expect(projects).toEqual([]);
  });
});

describe('checkProjectAccess', () => {
  it('returns null when project does not exist', async () => {
    const access = await checkProjectAccess('nonexistent', 'user', 'viewer');
    expect(access).toBeNull();
  });
});

describe('getLinkedGroup', () => {
  it('returns empty array when project does not exist', async () => {
    const group = await getLinkedGroup('nonexistent');
    expect(group).toEqual([]);
  });
});
