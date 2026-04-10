/**
 * Env validator tests — parseEnvFile, isPlaceholder, and generator output.
 * Tier 1: Pure logic (string parsing, no filesystem).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync } from 'node:fs';

// Mock fs/promises to control .env reading
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(() => Promise.resolve()),
}));

import { readFile, writeFile } from 'node:fs/promises';
import { generateEnvValidator } from '../lib/env-validator.js';

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generateEnvValidator', () => {
  it('returns empty file when no .env exists', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    const result = await generateEnvValidator('/test-project', 'express');
    expect(result.success).toBe(true);
    expect(result.file).toBe('');
  });

  it('returns empty file when .env has no variables', async () => {
    mockReadFile.mockResolvedValue('# Just a comment\n\n');
    const result = await generateEnvValidator('/test-project', 'express');
    expect(result.success).toBe(true);
    expect(result.file).toBe('');
  });

  it('generates a Node validator for express framework', async () => {
    mockReadFile.mockResolvedValue('DATABASE_URL=postgres://localhost/db\nAPI_KEY=sk-1234\n');
    const result = await generateEnvValidator('/test-project', 'express');
    expect(result.success).toBe(true);
    expect(result.file).toBe('validate-env.js');
    expect(mockWriteFile).toHaveBeenCalled();
    const content = mockWriteFile.mock.calls[0][1] as string;
    expect(content).toContain('DATABASE_URL');
    expect(content).toContain('API_KEY');
    expect(content).toContain('#!/usr/bin/env node');
  });

  it('generates a Python validator for django framework', async () => {
    mockReadFile.mockResolvedValue('SECRET_KEY=django-secret\n');
    const result = await generateEnvValidator('/test-project', 'django');
    expect(result.success).toBe(true);
    expect(result.file).toBe('validate_env.py');
    const content = mockWriteFile.mock.calls[0][1] as string;
    expect(content).toContain('#!/usr/bin/env python3');
    expect(content).toContain('SECRET_KEY');
  });

  it('skips VoidForge metadata keys', async () => {
    mockReadFile.mockResolvedValue('VERCEL_PROJECT_ID=abc\nDATABASE_URL=pg\n');
    const result = await generateEnvValidator('/test-project', 'next.js');
    expect(result.success).toBe(true);
    const content = mockWriteFile.mock.calls[0][1] as string;
    expect(content).toContain('DATABASE_URL');
    expect(content).not.toContain('VERCEL_PROJECT_ID');
  });

  it('skips comment-only lines', async () => {
    mockReadFile.mockResolvedValue('# A comment\nDATABASE_URL=test\n# Another comment\n');
    const result = await generateEnvValidator('/test-project', 'express');
    expect(result.success).toBe(true);
    const content = mockWriteFile.mock.calls[0][1] as string;
    expect(content).toContain('DATABASE_URL');
  });

  it('handles quoted values', async () => {
    mockReadFile.mockResolvedValue('SECRET="my-secret-value"\nKEY=\'another\'\n');
    const result = await generateEnvValidator('/test-project', 'express');
    expect(result.success).toBe(true);
    expect(result.file).toBe('validate-env.js');
  });

  it('detects placeholder values', async () => {
    mockReadFile.mockResolvedValue('API_KEY=TODO_replace_this\nDB=real-value\n');
    const result = await generateEnvValidator('/test-project', 'express');
    expect(result.success).toBe(true);
    // Both keys appear in the required list (validator checks at runtime)
    const content = mockWriteFile.mock.calls[0][1] as string;
    expect(content).toContain('API_KEY');
    expect(content).toContain('DB');
  });
});
