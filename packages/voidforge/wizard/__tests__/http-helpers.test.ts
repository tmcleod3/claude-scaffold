/**
 * HTTP helpers tests — shared response utilities.
 * Tier 3: Regression prevention for the consolidated sendJson.
 */

import { describe, it, expect } from 'vitest';
import { Writable } from 'node:stream';
import type { ServerResponse } from 'node:http';
import { sendJson, readFileOrNull } from '../lib/http-helpers.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';

interface MockRes { _status: number; _headers: Record<string, string>; _body: string }

function mockResponse(): ServerResponse & MockRes {
  const state: MockRes = { _status: 0, _headers: {}, _body: '' };
  const res = {
    ...state,
    writeHead(status: number, headers?: Record<string, string>) {
      state._status = status;
      if (headers) Object.assign(state._headers, headers);
      return res;
    },
    end(data?: string) {
      if (data) state._body += data;
    },
    get _status() { return state._status; },
    get _headers() { return state._headers; },
    get _body() { return state._body; },
  };
  return res as unknown as ServerResponse & MockRes;
}

describe('sendJson', () => {
  it('should set Content-Type and status', () => {
    const res = mockResponse();
    sendJson(res, 200, { ok: true });
    expect(res._status).toBe(200);
    expect(res._headers['Content-Type']).toBe('application/json; charset=utf-8');
    expect(JSON.parse(res._body)).toEqual({ ok: true });
  });

  it('should set no-cache headers when noCache=true', () => {
    const res = mockResponse();
    sendJson(res, 200, { secret: true }, true);
    expect(res._headers['Cache-Control']).toBe('no-store');
    expect(res._headers['Pragma']).toBe('no-cache');
  });

  it('should NOT set cache headers when noCache=false', () => {
    const res = mockResponse();
    sendJson(res, 200, { data: true });
    expect(res._headers['Cache-Control']).toBeUndefined();
  });

  it('should handle error responses', () => {
    const res = mockResponse();
    sendJson(res, 404, { error: 'Not found' });
    expect(res._status).toBe(404);
    expect(JSON.parse(res._body)).toEqual({ error: 'Not found' });
  });
});

describe('readFileOrNull', () => {
  let tempDir: string;

  it('should return file contents for existing files', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'helpers-test-'));
    const testFile = join(tempDir, 'test.txt');
    await writeFile(testFile, 'hello world');
    const result = await readFileOrNull(testFile);
    expect(result).toBe('hello world');
    await rm(tempDir, { recursive: true });
  });

  it('should return null for non-existent files', async () => {
    const result = await readFileOrNull('/nonexistent/path/to/file.txt');
    expect(result).toBeNull();
  });
});
