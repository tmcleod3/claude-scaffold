/**
 * Body parser tests — boundary validation for all POST endpoints.
 * Tier 1: Every API endpoint depends on this module.
 */

import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { parseJsonBody } from '../lib/body-parser.js';

function mockRequest(body: string, headers: Record<string, string> = {}): IncomingMessage {
  const stream = new Readable({ read() {} }) as unknown as IncomingMessage;
  stream.headers = headers;
  // Push body and end
  setTimeout(() => {
    if (body) stream.push(Buffer.from(body));
    stream.push(null);
  }, 0);
  return stream;
}

describe('parseJsonBody', () => {
  it('should parse a valid JSON object', async () => {
    const req = mockRequest('{"key":"value"}');
    const result = await parseJsonBody(req);
    expect(result).toEqual({ key: 'value' });
  });

  it('should return {} for empty body', async () => {
    const req = mockRequest('');
    const result = await parseJsonBody(req);
    expect(result).toEqual({});
  });

  it('should reject null body', async () => {
    const req = mockRequest('null');
    await expect(parseJsonBody(req)).rejects.toThrow('Request body must be a JSON object');
  });

  it('should reject array body', async () => {
    const req = mockRequest('[1,2,3]');
    await expect(parseJsonBody(req)).rejects.toThrow('Request body must be a JSON object');
  });

  it('should reject string body', async () => {
    const req = mockRequest('"hello"');
    await expect(parseJsonBody(req)).rejects.toThrow('Request body must be a JSON object');
  });

  it('should reject number body', async () => {
    const req = mockRequest('42');
    await expect(parseJsonBody(req)).rejects.toThrow('Request body must be a JSON object');
  });

  it('should reject boolean body', async () => {
    const req = mockRequest('true');
    await expect(parseJsonBody(req)).rejects.toThrow('Request body must be a JSON object');
  });

  it('should reject invalid JSON', async () => {
    const req = mockRequest('{invalid}');
    await expect(parseJsonBody(req)).rejects.toThrow('Invalid JSON');
  });

  it('should reject oversized body (>1MB)', async () => {
    const largeBody = 'x'.repeat(1024 * 1024 + 1);
    const stream = new Readable({ read() {} }) as unknown as IncomingMessage;
    stream.headers = {};
    stream.destroy = () => stream as IncomingMessage;
    setTimeout(() => {
      stream.push(Buffer.from(largeBody));
      stream.push(null);
    }, 0);
    await expect(parseJsonBody(stream)).rejects.toThrow('Request body too large');
  });

  it('should handle nested objects', async () => {
    const req = mockRequest('{"user":{"name":"test","roles":["admin"]}}');
    const result = await parseJsonBody(req);
    expect(result).toEqual({ user: { name: 'test', roles: ['admin'] } });
  });
});
