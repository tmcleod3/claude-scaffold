import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  readMarker,
  writeMarker,
  createMarker,
  findProjectRoot,
  MARKER_FILE,
} from '../lib/marker.js';
import type { VoidForgeMarker } from '../lib/marker.js';

describe('marker', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'voidforge-marker-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('createMarker', () => {
    it('creates a marker with UUID, version, and timestamp', () => {
      const marker = createMarker('21.0.0');
      expect(marker.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(marker.version).toBe('21.0.0');
      expect(marker.tier).toBe('full');
      expect(marker.extensions).toEqual([]);
      expect(new Date(marker.created).getTime()).toBeGreaterThan(0);
    });

    it('accepts tier and extensions', () => {
      const marker = createMarker('21.0.0', 'methodology', ['cultivation']);
      expect(marker.tier).toBe('methodology');
      expect(marker.extensions).toEqual(['cultivation']);
    });
  });

  describe('writeMarker / readMarker', () => {
    it('writes and reads a marker file', async () => {
      const marker = createMarker('21.0.0', 'full', ['danger-room']);
      await writeMarker(tempDir, marker);

      const read = await readMarker(tempDir);
      expect(read).not.toBeNull();
      expect(read!.id).toBe(marker.id);
      expect(read!.version).toBe('21.0.0');
      expect(read!.tier).toBe('full');
      expect(read!.extensions).toEqual(['danger-room']);
    });

    it('returns null for missing marker', async () => {
      const result = await readMarker(tempDir);
      expect(result).toBeNull();
    });

    it('returns null for invalid JSON', async () => {
      await writeFile(join(tempDir, MARKER_FILE), 'not json', 'utf-8');
      const result = await readMarker(tempDir);
      expect(result).toBeNull();
    });

    it('returns null for JSON missing required fields', async () => {
      await writeFile(join(tempDir, MARKER_FILE), '{"foo": "bar"}', 'utf-8');
      const result = await readMarker(tempDir);
      expect(result).toBeNull();
    });

    it('writes pretty-printed JSON with trailing newline', async () => {
      const marker = createMarker('21.0.0');
      await writeMarker(tempDir, marker);
      const raw = await readFile(join(tempDir, MARKER_FILE), 'utf-8');
      expect(raw).toContain('\n  ');
      expect(raw.endsWith('\n')).toBe(true);
    });
  });

  describe('findProjectRoot', () => {
    it('finds marker in the given directory', async () => {
      await writeMarker(tempDir, createMarker('21.0.0'));
      const root = findProjectRoot(tempDir);
      expect(root).toBe(tempDir);
    });

    it('finds marker in parent directory', async () => {
      const { mkdirSync } = await import('node:fs');
      const subDir = join(tempDir, 'src', 'lib');
      mkdirSync(subDir, { recursive: true });
      await writeMarker(tempDir, createMarker('21.0.0'));
      const root = findProjectRoot(subDir);
      expect(root).toBe(tempDir);
    });

    it('returns null when no marker exists', () => {
      const root = findProjectRoot(tempDir);
      expect(root).toBeNull();
    });
  });
});
