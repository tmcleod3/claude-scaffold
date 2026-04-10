/**
 * Site scanner tests — scoreScan pure logic and HTML extraction.
 * Tier 1: Pure scoring functions (no network required).
 */

import { describe, it, expect } from 'vitest';
import { scoreScan } from '../lib/site-scanner.js';
import type { SiteScanResult } from '../lib/site-scanner.js';

function makeScan(overrides: Partial<SiteScanResult> = {}): SiteScanResult {
  return {
    url: 'https://example.com',
    scannedAt: new Date().toISOString(),
    reachable: true,
    performance: { ttfbMs: 150, totalTimeMs: 300, contentLength: 5000, compressed: true, cacheControl: 'max-age=3600' },
    seo: { title: 'Test', description: 'Test desc', ogTitle: 'OG Title', ogDescription: 'OG Desc', ogImage: 'https://img.png', canonicalUrl: 'https://example.com', viewport: true, favicon: true, jsonLd: true, sitemapExists: true, robotsExists: true, h1Count: 1 },
    security: { https: true, hsts: true, csp: 'default-src self', xFrameOptions: 'DENY', xContentTypeOptions: true, referrerPolicy: 'no-referrer', corsAllowOrigin: null },
    growth: { analyticsDetected: ['ga4'], cookieConsentDetected: true, emailCaptureDetected: true, socialMetaComplete: true },
    health: { statusCode: 200, redirectChain: [], responseHeaders: {} },
    ...overrides,
  };
}

describe('scoreScan', () => {
  it('returns all zeros for unreachable site', () => {
    const result = scoreScan(makeScan({ reachable: false }));
    expect(result.performance).toBe(0);
    expect(result.seoScore).toBe(0);
    expect(result.securityScore).toBe(0);
    expect(result.growthReadiness).toBe(0);
  });

  it('scores high for a well-configured site', () => {
    const result = scoreScan(makeScan());
    expect(result.performance).toBeGreaterThanOrEqual(80);
    expect(result.seoScore).toBeGreaterThanOrEqual(90);
    expect(result.securityScore).toBeGreaterThanOrEqual(80);
    expect(result.growthReadiness).toBeGreaterThanOrEqual(80);
  });

  it('gives performance bonus for sub-200ms TTFB', () => {
    const fast = scoreScan(makeScan({ performance: { ttfbMs: 100, totalTimeMs: 200, contentLength: 5000, compressed: true, cacheControl: 'max-age=3600' } }));
    const slow = scoreScan(makeScan({ performance: { ttfbMs: 900, totalTimeMs: 1200, contentLength: 5000, compressed: true, cacheControl: 'max-age=3600' } }));
    expect(fast.performance).toBeGreaterThan(slow.performance);
  });

  it('adds compression bonus', () => {
    const compressed = scoreScan(makeScan({ performance: { ttfbMs: 500, totalTimeMs: 800, contentLength: 5000, compressed: true, cacheControl: null } }));
    const uncompressed = scoreScan(makeScan({ performance: { ttfbMs: 500, totalTimeMs: 800, contentLength: 5000, compressed: false, cacheControl: null } }));
    expect(compressed.performance).toBeGreaterThan(uncompressed.performance);
  });

  it('scores SEO based on meta tags presence', () => {
    const noSeo = scoreScan(makeScan({
      seo: { title: null, description: null, ogTitle: null, ogDescription: null, ogImage: null, canonicalUrl: null, viewport: false, favicon: false, jsonLd: false, sitemapExists: false, robotsExists: false, h1Count: 0 },
    }));
    expect(noSeo.seoScore).toBe(0);
  });

  it('scores security based on headers', () => {
    const noSecurity = scoreScan(makeScan({
      security: { https: false, hsts: false, csp: null, xFrameOptions: null, xContentTypeOptions: false, referrerPolicy: null, corsAllowOrigin: null },
    }));
    // Still gets base points for being reachable
    expect(noSecurity.securityScore).toBe(10);
  });

  it('scores growth readiness based on analytics and social', () => {
    const noGrowth = scoreScan(makeScan({
      growth: { analyticsDetected: [], cookieConsentDetected: false, emailCaptureDetected: false, socialMetaComplete: false },
      seo: { title: 'Test', description: null, ogTitle: null, ogDescription: null, ogImage: null, canonicalUrl: null, viewport: false, favicon: false, jsonLd: false, sitemapExists: false, robotsExists: false, h1Count: 0 },
    }));
    // Only gets the base 5 points
    expect(noGrowth.growthReadiness).toBe(5);
  });

  it('caps all scores at 100', () => {
    const result = scoreScan(makeScan());
    expect(result.performance).toBeLessThanOrEqual(100);
    expect(result.seoScore).toBeLessThanOrEqual(100);
    expect(result.securityScore).toBeLessThanOrEqual(100);
    expect(result.growthReadiness).toBeLessThanOrEqual(100);
  });

  it('gives SEO bonus for exactly one h1 tag', () => {
    const oneH1 = scoreScan(makeScan({ seo: { ...makeScan().seo, h1Count: 1 } }));
    const manyH1 = scoreScan(makeScan({ seo: { ...makeScan().seo, h1Count: 3 } }));
    expect(oneH1.seoScore).toBeGreaterThan(manyH1.seoScore);
  });
});
