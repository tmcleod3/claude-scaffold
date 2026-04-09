import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createProject } from '../lib/project-init.js';
import { readMarker } from '../lib/marker.js';

describe('project-init', () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'voidforge-init-'));
    projectDir = join(tempDir, 'test-project');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates a project directory with methodology files', async () => {
    const result = await createProject({
      name: 'Test Project',
      directory: projectDir,
      skipGit: true,
    });

    expect(existsSync(projectDir)).toBe(true);
    expect(result.projectDir).toBe(projectDir);
    expect(result.filesCreated).toBeGreaterThan(10);
    expect(result.markerId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('copies CLAUDE.md with injected identity', async () => {
    await createProject({
      name: 'My App',
      directory: projectDir,
      oneliner: 'A cool application',
      domain: 'web',
      repoUrl: 'https://github.com/user/my-app',
      skipGit: true,
    });

    const claude = await readFile(join(projectDir, 'CLAUDE.md'), 'utf-8');
    expect(claude).toContain('**Name:** My App');
    expect(claude).toContain('**One-liner:** A cool application');
    expect(claude).toContain('**Domain:** web');
    expect(claude).toContain('**Repo:** https://github.com/user/my-app');
    expect(claude).not.toContain('[PROJECT_NAME]');
  });

  it('copies command files', async () => {
    await createProject({
      name: 'Test',
      directory: projectDir,
      skipGit: true,
    });

    expect(existsSync(join(projectDir, '.claude', 'commands', 'build.md'))).toBe(true);
    expect(existsSync(join(projectDir, '.claude', 'commands', 'qa.md'))).toBe(true);
    expect(existsSync(join(projectDir, '.claude', 'commands', 'review.md'))).toBe(true);
  });

  it('copies method docs', async () => {
    await createProject({
      name: 'Test',
      directory: projectDir,
      skipGit: true,
    });

    expect(existsSync(join(projectDir, 'docs', 'methods', 'BUILD_PROTOCOL.md'))).toBe(true);
    expect(existsSync(join(projectDir, 'docs', 'methods', 'CAMPAIGN.md'))).toBe(true);
  });

  it('writes .voidforge marker file', async () => {
    const result = await createProject({
      name: 'Test',
      directory: projectDir,
      skipGit: true,
    });

    const marker = await readMarker(projectDir);
    expect(marker).not.toBeNull();
    expect(marker!.id).toBe(result.markerId);
    expect(marker!.version).toBe('21.0.0');
    expect(marker!.tier).toBe('full');
    expect(marker!.extensions).toEqual([]);
  });

  it('creates core tier with minimal files', async () => {
    await createProject({
      name: 'Minimal',
      directory: projectDir,
      core: true,
      skipGit: true,
    });

    // Core has CLAUDE.md but not HOLOCRON.md
    expect(existsSync(join(projectDir, 'CLAUDE.md'))).toBe(true);
    expect(existsSync(join(projectDir, 'HOLOCRON.md'))).toBe(false);

    // Core has methods but not patterns
    expect(existsSync(join(projectDir, 'docs', 'methods'))).toBe(true);
    expect(existsSync(join(projectDir, 'docs', 'patterns'))).toBe(false);

    const marker = await readMarker(projectDir);
    expect(marker!.tier).toBe('methodology');
  });

  it('registers project in global projects.json', async () => {
    const { readRegistry } = await import('../lib/project-registry.js');

    await createProject({
      name: 'Registered Project',
      directory: projectDir,
      skipGit: true,
    });

    const projects = await readRegistry();
    const found = projects.find(p => p.directory === projectDir);
    expect(found).toBeDefined();
    expect(found!.name).toBe('Registered Project');
  });

  it('handles extensions in marker', async () => {
    await createProject({
      name: 'Extended',
      directory: projectDir,
      extensions: ['cultivation', 'danger-room'],
      skipGit: true,
    });

    const marker = await readMarker(projectDir);
    expect(marker!.extensions).toEqual(['cultivation', 'danger-room']);
  });

  it('creates into existing empty directory', async () => {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(projectDir);

    const result = await createProject({
      name: 'Existing Dir',
      directory: projectDir,
      skipGit: true,
    });

    expect(result.filesCreated).toBeGreaterThan(10);
    expect(existsSync(join(projectDir, 'CLAUDE.md'))).toBe(true);
  });
});
