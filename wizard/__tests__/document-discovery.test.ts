/**
 * Document discovery tests — Wong's supporting document scanner.
 * Validates file discovery conventions for the Blueprint Path.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { discoverDocuments, summarizeDiscovery } from '../lib/document-discovery.js';

// ── Test Fixtures ───────────────────────────────────

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `voidforge-test-${randomUUID().slice(0, 8)}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

function createFile(relativePath: string, content: string = '# Test'): void {
  const fullPath = join(testDir, relativePath);
  const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, content, 'utf-8');
}

// ── Tests ───────────────────────────────────────────

describe('discoverDocuments', () => {
  it('should return empty result for empty directory', async () => {
    const result = await discoverDocuments(testDir);
    expect(result.prd).toBeNull();
    expect(result.projectDirectives).toBeNull();
    expect(result.operations).toBeNull();
    expect(result.adrs).toHaveLength(0);
    expect(result.references).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('should discover PRD at docs/PRD.md', async () => {
    createFile('docs/PRD.md', '# My Product\n\nFeatures...');
    const result = await discoverDocuments(testDir);
    expect(result.prd).toBe('docs/PRD.md');
    expect(result.total).toBe(1);
  });

  it('should discover project directives at docs/PROJECT-DIRECTIVES.md', async () => {
    createFile('docs/PROJECT-DIRECTIVES.md', '# Rules\n\nUse TypeScript.');
    const result = await discoverDocuments(testDir);
    expect(result.projectDirectives).toBe('docs/PROJECT-DIRECTIVES.md');
  });

  it('should discover project directives at docs/PROJECT-CLAUDE.md (fallback)', async () => {
    createFile('docs/PROJECT-CLAUDE.md', '# Rules');
    const result = await discoverDocuments(testDir);
    expect(result.projectDirectives).toBe('docs/PROJECT-CLAUDE.md');
  });

  it('should prefer PROJECT-DIRECTIVES.md over PROJECT-CLAUDE.md', async () => {
    createFile('docs/PROJECT-DIRECTIVES.md', '# Primary');
    createFile('docs/PROJECT-CLAUDE.md', '# Secondary');
    const result = await discoverDocuments(testDir);
    expect(result.projectDirectives).toBe('docs/PROJECT-DIRECTIVES.md');
  });

  it('should discover operations playbook', async () => {
    createFile('docs/OPERATIONS.md', '# Operations');
    const result = await discoverDocuments(testDir);
    expect(result.operations).toBe('docs/OPERATIONS.md');
  });

  it('should discover ADRs in docs/ADR/', async () => {
    createFile('docs/ADR/001-why-nextjs.md', '# ADR-001');
    createFile('docs/ADR/002-why-postgres.md', '# ADR-002');
    createFile('docs/ADR/README.md', '# ADRs');
    const result = await discoverDocuments(testDir);
    expect(result.adrs).toHaveLength(3);
    expect(result.adrs[0]).toContain('001-why-nextjs.md');
  });

  it('should discover ADRs in docs/adrs/ (lowercase)', async () => {
    createFile('docs/adrs/001-auth.md', '# ADR-001');
    const result = await discoverDocuments(testDir);
    expect(result.adrs).toHaveLength(1);
    expect(result.adrs[0]).toContain('docs/adrs/001-auth.md');
  });

  it('should discover reference materials recursively', async () => {
    createFile('docs/reference/api-spec.yaml', 'openapi: 3.0.0');
    createFile('docs/reference/mockups/home.png', 'fake-png');
    createFile('docs/reference/research/competitors.md', '# Competitors');
    const result = await discoverDocuments(testDir);
    expect(result.references).toHaveLength(3);
  });

  it('should count total documents correctly', async () => {
    createFile('docs/PRD.md');
    createFile('docs/PROJECT-DIRECTIVES.md');
    createFile('docs/OPERATIONS.md');
    createFile('docs/ADR/001.md');
    createFile('docs/ADR/002.md');
    createFile('docs/reference/spec.yaml');
    const result = await discoverDocuments(testDir);
    expect(result.total).toBe(6); // PRD + directives + ops + 2 ADRs + 1 ref
  });

  it('should ignore non-.md files in ADR directory', async () => {
    createFile('docs/ADR/001-auth.md', '# ADR');
    createFile('docs/ADR/.DS_Store', '');
    createFile('docs/ADR/notes.txt', 'notes');
    const result = await discoverDocuments(testDir);
    expect(result.adrs).toHaveLength(1);
  });
});

describe('summarizeDiscovery', () => {
  it('should produce readable summary', async () => {
    createFile('docs/PRD.md');
    createFile('docs/PROJECT-DIRECTIVES.md');
    createFile('docs/ADR/001.md');
    const result = await discoverDocuments(testDir);
    const summary = summarizeDiscovery(result);
    expect(summary).toContain('PRD');
    expect(summary).toContain('Project directives');
    expect(summary).toContain('1 architecture decision');
    expect(summary).toContain('Total: 3');
  });
});
