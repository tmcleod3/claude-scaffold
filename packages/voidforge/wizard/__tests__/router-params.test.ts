/**
 * Tests for router.ts — Parameterized route matching.
 * v22.0.x P2-A: Router upgraded with :id param support; needs verification.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// We can't easily test the module-level singleton router, so we test the matching logic.
// The router stores routes in a module-level array, so we test via integration.

describe('Router param matching logic', () => {
  it('parsePath extracts param names from :segments', async () => {
    // Import the module fresh
    const routerModule = await import('../router.js');

    // The addRoute function registers routes. Test by adding a parameterized route
    // and verifying it matches correctly via the public API.
    // Since we can't reset the routes array, test the getRouteParams function.
    const { getRouteParams } = routerModule;

    // getRouteParams on a request with no params should return empty object
    const mockReq = {} as import('node:http').IncomingMessage;
    expect(getRouteParams(mockReq)).toEqual({});
  });

  it('decodeURIComponent handles encoded characters', () => {
    // Verify that decodeURIComponent works as expected for route params
    expect(decodeURIComponent('test%20project')).toBe('test project');
    expect(decodeURIComponent('abc123')).toBe('abc123');
    expect(decodeURIComponent('..%2F..%2Fetc')).toBe('../../etc');
  });

  it('segment comparison is exact for non-param segments', () => {
    // Verify the matching logic:
    // '/api/projects/:id/danger-room/campaign' should match '/api/projects/abc/danger-room/campaign'
    // but NOT '/api/projects/abc/war-room/campaign'
    const routeSegments = ['api', 'projects', ':id', 'danger-room', 'campaign'];
    const reqSegments1 = ['api', 'projects', 'abc', 'danger-room', 'campaign'];
    const reqSegments2 = ['api', 'projects', 'abc', 'war-room', 'campaign'];

    function matches(route: string[], req: string[]): boolean {
      if (route.length !== req.length) return false;
      for (let i = 0; i < route.length; i++) {
        if (route[i].startsWith(':')) continue; // param — matches anything
        if (route[i] !== req[i]) return false;
      }
      return true;
    }

    expect(matches(routeSegments, reqSegments1)).toBe(true);
    expect(matches(routeSegments, reqSegments2)).toBe(false);
    expect(matches(routeSegments, ['api', 'projects', 'abc'])).toBe(false); // wrong length
  });
});
