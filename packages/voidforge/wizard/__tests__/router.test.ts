/**
 * Tests for router.ts — route registration, matching, params, and method dispatch.
 * Campaign 34 (v23.2 "The Coverage"), Mission 3.
 *
 * The router uses a module-level routes array. Because vitest with pool: 'forks'
 * gives each test file its own process, we get a clean router per file.
 * Tests within this file share the routes array and are ordered accordingly.
 */

import { describe, it, expect } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { addRoute, route, getRouteParams } from '../router.js';

// ── Helpers ──────────────────────────────────────────

function mockReq(method: string, url: string): IncomingMessage {
  return {
    method,
    url,
    headers: { host: 'localhost' },
  } as unknown as IncomingMessage;
}

function mockRes(): ServerResponse {
  return {} as unknown as ServerResponse;
}

// Sentinel handlers so we can identify which route matched
const handlers = {
  getUsers: async () => {},
  getUser: async () => {},
  postUser: async () => {},
  deleteUser: async () => {},
  getStatus: async () => {},
  wildcard: async () => {},
  nested: async () => {},
  projectCampaign: async () => {},
  rootApi: async () => {},
  patchUser: async () => {},
};

// ── Register routes (executed once, before all tests) ──

addRoute('GET', '/api/users', handlers.getUsers);
addRoute('GET', '/api/users/:id', handlers.getUser);
addRoute('POST', '/api/users', handlers.postUser);
addRoute('DELETE', '/api/users/:id', handlers.deleteUser);
addRoute('GET', '/api/status', handlers.getStatus);
addRoute('GET', '/api/projects/:projectId/campaigns/:campaignId', handlers.projectCampaign);
addRoute('GET', '/api', handlers.rootApi);
addRoute('PATCH', '/api/users/:id', handlers.patchUser);

// ── Tests ────────────────────────────────────────────

describe('Router', () => {
  describe('exact path matching', () => {
    it('matches an exact GET route', () => {
      const req = mockReq('GET', '/api/users');
      const handler = route(req, mockRes());
      expect(handler).toBe(handlers.getUsers);
    });

    it('matches exact path /api/status', () => {
      const req = mockReq('GET', '/api/status');
      const handler = route(req, mockRes());
      expect(handler).toBe(handlers.getStatus);
    });

    it('matches a short exact path /api', () => {
      const req = mockReq('GET', '/api');
      const handler = route(req, mockRes());
      expect(handler).toBe(handlers.rootApi);
    });
  });

  describe('HTTP method matching', () => {
    it('distinguishes GET and POST on the same path', () => {
      const getReq = mockReq('GET', '/api/users');
      const postReq = mockReq('POST', '/api/users');
      expect(route(getReq, mockRes())).toBe(handlers.getUsers);
      expect(route(postReq, mockRes())).toBe(handlers.postUser);
    });

    it('method matching is case-insensitive', () => {
      const req = mockReq('get', '/api/users');
      const handler = route(req, mockRes());
      expect(handler).toBe(handlers.getUsers);
    });

    it('returns null when method does not match any registered route', () => {
      const req = mockReq('PUT', '/api/users');
      const handler = route(req, mockRes());
      expect(handler).toBeNull();
    });
  });

  describe('parameterized routes', () => {
    it('matches a single :id param and extracts it', () => {
      const req = mockReq('GET', '/api/users/42');
      const handler = route(req, mockRes());
      expect(handler).toBe(handlers.getUser);
      expect(getRouteParams(req)).toEqual({ id: '42' });
    });

    it('matches multiple params in a single route', () => {
      const req = mockReq('GET', '/api/projects/proj-1/campaigns/camp-2');
      const handler = route(req, mockRes());
      expect(handler).toBe(handlers.projectCampaign);
      expect(getRouteParams(req)).toEqual({
        projectId: 'proj-1',
        campaignId: 'camp-2',
      });
    });

    it('decodes URI-encoded param values', () => {
      const req = mockReq('GET', '/api/users/hello%20world');
      const handler = route(req, mockRes());
      expect(handler).toBe(handlers.getUser);
      expect(getRouteParams(req)).toEqual({ id: 'hello world' });
    });

    it('DELETE with param matches the correct handler', () => {
      const req = mockReq('DELETE', '/api/users/99');
      const handler = route(req, mockRes());
      expect(handler).toBe(handlers.deleteUser);
      expect(getRouteParams(req)).toEqual({ id: '99' });
    });

    it('PATCH with param matches the correct handler', () => {
      const req = mockReq('PATCH', '/api/users/abc');
      const handler = route(req, mockRes());
      expect(handler).toBe(handlers.patchUser);
      expect(getRouteParams(req)).toEqual({ id: 'abc' });
    });
  });

  describe('404 for unregistered routes', () => {
    it('returns null for a completely unknown path', () => {
      const req = mockReq('GET', '/api/nonexistent');
      const handler = route(req, mockRes());
      expect(handler).toBeNull();
    });

    it('returns null when segment count mismatches a param route', () => {
      // /api/users/:id expects 3 segments, but /api/users/1/extra has 4
      const req = mockReq('GET', '/api/users/1/extra');
      const handler = route(req, mockRes());
      expect(handler).toBeNull();
    });

    it('returns null for a path with wrong non-param segment', () => {
      // /api/projects/:projectId/campaigns/:campaignId has 'campaigns' as literal
      // /api/projects/x/missions/y should not match
      const req = mockReq('GET', '/api/projects/x/missions/y');
      const handler = route(req, mockRes());
      expect(handler).toBeNull();
    });
  });

  describe('getRouteParams', () => {
    it('returns empty object for requests with no matched params', () => {
      const req = {} as IncomingMessage;
      expect(getRouteParams(req)).toEqual({});
    });

    it('returns empty object for exact-match routes (no params)', () => {
      const req = mockReq('GET', '/api/status');
      route(req, mockRes()); // triggers matching
      // Exact match path does not set params
      expect(getRouteParams(req)).toEqual({});
    });
  });

  describe('addRoute method normalization', () => {
    it('normalizes method to uppercase when registering', () => {
      const handler = async () => {};
      addRoute('post', '/api/lower-test', handler);

      const req = mockReq('POST', '/api/lower-test');
      const matched = route(req, mockRes());
      expect(matched).toBe(handler);
    });
  });

  describe('edge cases', () => {
    it('handles missing req.url by defaulting to /', () => {
      const req = {
        method: 'GET',
        url: undefined,
        headers: { host: 'localhost' },
      } as unknown as IncomingMessage;
      // '/' doesn't match any registered route
      const handler = route(req, mockRes());
      expect(handler).toBeNull();
    });

    it('handles missing req.method by defaulting to GET', () => {
      const req = {
        method: undefined,
        url: '/api/users',
        headers: { host: 'localhost' },
      } as unknown as IncomingMessage;
      const handler = route(req, mockRes());
      expect(handler).toBe(handlers.getUsers);
    });
  });
});
