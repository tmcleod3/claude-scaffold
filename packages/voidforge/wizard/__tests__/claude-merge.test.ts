/**
 * CLAUDE.md merge tests — safe append of project directives.
 * Validates idempotent merge, never-replace behavior, and unmerge.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { mergeProjectDirectives, isAlreadyMerged, unmergeProjectDirectives } from '../lib/claude-merge.js';

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `voidforge-merge-${randomUUID().slice(0, 8)}`);
  mkdirSync(join(testDir, 'docs'), { recursive: true });
});

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

describe('mergeProjectDirectives', () => {
  it('should append directives to CLAUDE.md', async () => {
    writeFileSync(join(testDir, 'CLAUDE.md'), '# VoidForge Methodology\n\nOriginal content.\n', 'utf-8');
    writeFileSync(join(testDir, 'docs/PROJECT-DIRECTIVES.md'), '# My Rules\n\nUse snake_case.\n', 'utf-8');

    const result = await mergeProjectDirectives(testDir, 'docs/PROJECT-DIRECTIVES.md');
    expect(result.merged).toBe(true);

    const content = readFileSync(join(testDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('# VoidForge Methodology');
    expect(content).toContain('Original content.');
    expect(content).toContain('# PROJECT-SPECIFIC DIRECTIVES');
    expect(content).toContain('# My Rules');
    expect(content).toContain('Use snake_case.');
  });

  it('should be idempotent — skip if already merged', async () => {
    writeFileSync(join(testDir, 'CLAUDE.md'), '# Methodology\n\n---\n\n# PROJECT-SPECIFIC DIRECTIVES\n\nAlready here.\n', 'utf-8');
    writeFileSync(join(testDir, 'docs/PROJECT-DIRECTIVES.md'), '# New stuff\n', 'utf-8');

    const result = await mergeProjectDirectives(testDir, 'docs/PROJECT-DIRECTIVES.md');
    expect(result.merged).toBe(false);
    expect(result.reason).toContain('already merged');
  });

  it('should fail gracefully if CLAUDE.md missing', async () => {
    writeFileSync(join(testDir, 'docs/PROJECT-DIRECTIVES.md'), '# Rules\n', 'utf-8');

    const result = await mergeProjectDirectives(testDir, 'docs/PROJECT-DIRECTIVES.md');
    expect(result.merged).toBe(false);
    expect(result.reason).toContain('CLAUDE.md not found');
  });

  it('should fail gracefully if directives file missing', async () => {
    writeFileSync(join(testDir, 'CLAUDE.md'), '# Methodology\n', 'utf-8');

    const result = await mergeProjectDirectives(testDir, 'docs/NONEXISTENT.md');
    expect(result.merged).toBe(false);
    expect(result.reason).toContain('not found');
  });

  it('should skip empty directives file', async () => {
    writeFileSync(join(testDir, 'CLAUDE.md'), '# Methodology\n', 'utf-8');
    writeFileSync(join(testDir, 'docs/PROJECT-DIRECTIVES.md'), '   \n  \n', 'utf-8');

    const result = await mergeProjectDirectives(testDir, 'docs/PROJECT-DIRECTIVES.md');
    expect(result.merged).toBe(false);
    expect(result.reason).toContain('empty');
  });

  it('should record the source file path in the merged section', async () => {
    writeFileSync(join(testDir, 'CLAUDE.md'), '# Methodology\n', 'utf-8');
    writeFileSync(join(testDir, 'docs/PROJECT-DIRECTIVES.md'), '# Rules\n', 'utf-8');

    await mergeProjectDirectives(testDir, 'docs/PROJECT-DIRECTIVES.md');

    const content = readFileSync(join(testDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('docs/PROJECT-DIRECTIVES.md');
    expect(content).toContain('/blueprint');
  });
});

describe('isAlreadyMerged', () => {
  it('should return true if marker exists', async () => {
    writeFileSync(join(testDir, 'CLAUDE.md'), '# Methodology\n\n# PROJECT-SPECIFIC DIRECTIVES\n', 'utf-8');
    expect(await isAlreadyMerged(testDir)).toBe(true);
  });

  it('should return false if marker absent', async () => {
    writeFileSync(join(testDir, 'CLAUDE.md'), '# Methodology\n', 'utf-8');
    expect(await isAlreadyMerged(testDir)).toBe(false);
  });

  it('should return false if no CLAUDE.md', async () => {
    expect(await isAlreadyMerged(testDir)).toBe(false);
  });
});

describe('unmergeProjectDirectives', () => {
  it('should remove merged section and restore original', async () => {
    writeFileSync(join(testDir, 'CLAUDE.md'), '# Methodology\n\nOriginal.\n\n---\n\n# PROJECT-SPECIFIC DIRECTIVES\n\nAppended stuff.\n', 'utf-8');

    const result = await unmergeProjectDirectives(testDir);
    expect(result).toBe(true);

    const content = readFileSync(join(testDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('# Methodology');
    expect(content).toContain('Original.');
    expect(content).not.toContain('PROJECT-SPECIFIC DIRECTIVES');
    expect(content).not.toContain('Appended stuff.');
  });

  it('should return false if nothing to unmerge', async () => {
    writeFileSync(join(testDir, 'CLAUDE.md'), '# Methodology\n', 'utf-8');
    expect(await unmergeProjectDirectives(testDir)).toBe(false);
  });
});
