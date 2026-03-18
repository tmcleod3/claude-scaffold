/**
 * Torres's Site Scanner — HTTP-based technical reconnaissance.
 *
 * Scans a deployed site without browser dependencies:
 * - Response times and status codes on main routes
 * - Meta tags (title, description, OG, JSON-LD)
 * - Security headers (HTTPS, HSTS, CSP, CORS, X-Frame-Options)
 * - Cache headers, compression (gzip/brotli)
 * - Analytics detection (GA4, Plausible, PostHog snippets)
 * - Mobile viewport, favicon, sitemap.xml, robots.txt
 * - Growth infrastructure (email capture forms, cookie consent)
 *
 * Zero dependencies — uses node:https only.
 *
 * PRD Reference: ROADMAP v12.0 deliverables (Torres's site scanner)
 */

import { get as httpsGet, request as httpsRequest } from 'node:https';
import { get as httpGet } from 'node:http';
import { URL } from 'node:url';

// ── Scan Result Types ─────────────────────────────────

interface SiteScanResult {
  url: string;
  scannedAt: string;
  reachable: boolean;
  error?: string;
  performance: PerformanceScan;
  seo: SeoScan;
  security: SecurityScan;
  growth: GrowthScan;
  health: HealthScan;
}

interface PerformanceScan {
  ttfbMs: number | null;         // Time to first byte
  totalTimeMs: number | null;    // Full response time
  contentLength: number | null;  // Response size in bytes
  compressed: boolean;           // gzip or brotli detected
  cacheControl: string | null;   // Cache-Control header value
}

interface SeoScan {
  title: string | null;
  description: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  canonicalUrl: string | null;
  viewport: boolean;             // Has mobile viewport meta
  favicon: boolean;              // Has favicon link
  jsonLd: boolean;               // Has JSON-LD structured data
  sitemapExists: boolean;        // /sitemap.xml returns 200
  robotsExists: boolean;         // /robots.txt returns 200
  h1Count: number;               // Number of <h1> tags
}

interface SecurityScan {
  https: boolean;
  hsts: boolean;                 // Strict-Transport-Security
  csp: string | null;            // Content-Security-Policy
  xFrameOptions: string | null;
  xContentTypeOptions: boolean;  // X-Content-Type-Options: nosniff
  referrerPolicy: string | null;
  corsAllowOrigin: string | null;
}

interface GrowthScan {
  analyticsDetected: string[];   // ['ga4', 'plausible', 'posthog', etc.]
  cookieConsentDetected: boolean;
  emailCaptureDetected: boolean; // Form with email input
  socialMetaComplete: boolean;   // OG + Twitter Card present
}

interface HealthScan {
  statusCode: number | null;
  redirectChain: string[];       // Redirect URLs
  responseHeaders: Record<string, string>;
}

// ── HTTP Helper ───────────────────────────────────────

/** SSRF protection: reject private/internal IP ranges */
function isPrivateUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    // Block loopback, private ranges, link-local, metadata endpoints
    if (/^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.|::1|fd|fe80)/i.test(hostname)) return true;
    if (hostname === 'localhost' || hostname === '[::1]') return true;
    return false;
  } catch { return true; } // Malformed URL = reject
}

function fetchUrl(url: string, timeoutMs: number = 10000, maxRedirects: number = 5): Promise<{ statusCode: number; headers: Record<string, string>; body: string; ttfbMs: number; totalMs: number }> {
  return new Promise((resolve, reject) => {
    if (isPrivateUrl(url)) {
      reject(new Error(`SSRF blocked: ${new URL(url).hostname} is a private/internal address`));
      return;
    }

    const parsedUrl = new URL(url);
    const getter = parsedUrl.protocol === 'https:' ? httpsGet : httpGet;
    const start = Date.now();
    let ttfb = 0;

    const req = getter(url, { timeout: timeoutMs, headers: { 'User-Agent': 'VoidForge-Scanner/1.0' } }, (res) => {
      ttfb = Date.now() - start;
      let body = '';

      // Follow redirects with depth limit
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (maxRedirects <= 0) { reject(new Error('Too many redirects (max 5)')); return; }
        const redirectUrl = new URL(res.headers.location, url).toString();
        fetchUrl(redirectUrl, timeoutMs, maxRedirects - 1).then(resolve).catch(reject);
        return;
      }

      res.setEncoding('utf-8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers as Record<string, string>,
          body: body.slice(0, 500000), // Cap at 500KB to prevent memory issues
          ttfbMs: ttfb,
          totalMs: Date.now() - start,
        });
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
  });
}

async function checkExists(url: string): Promise<boolean> {
  try {
    const res = await fetchUrl(url, 5000);
    return res.statusCode === 200;
  } catch { return false; }
}

// ── HTML Parsing (zero-dep, regex-based) ──────────────

function extractMeta(html: string, name: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i');
  const alt = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`, 'i');
  return (html.match(re)?.[1] || html.match(alt)?.[1]) ?? null;
}

function extractTitle(html: string): string | null {
  return html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null;
}

function countTag(html: string, tag: string): number {
  const re = new RegExp(`<${tag}[\\s>]`, 'gi');
  return (html.match(re) || []).length;
}

function hasTag(html: string, pattern: string): boolean {
  return new RegExp(pattern, 'i').test(html);
}

// ── Main Scanner ──────────────────────────────────────

export async function scanSite(siteUrl: string): Promise<SiteScanResult> {
  const result: SiteScanResult = {
    url: siteUrl,
    scannedAt: new Date().toISOString(),
    reachable: false,
    performance: { ttfbMs: null, totalTimeMs: null, contentLength: null, compressed: false, cacheControl: null },
    seo: { title: null, description: null, ogTitle: null, ogDescription: null, ogImage: null, canonicalUrl: null, viewport: false, favicon: false, jsonLd: false, sitemapExists: false, robotsExists: false, h1Count: 0 },
    security: { https: false, hsts: false, csp: null, xFrameOptions: null, xContentTypeOptions: false, referrerPolicy: null, corsAllowOrigin: null },
    growth: { analyticsDetected: [], cookieConsentDetected: false, emailCaptureDetected: false, socialMetaComplete: false },
    health: { statusCode: null, redirectChain: [], responseHeaders: {} },
  };

  try {
    const res = await fetchUrl(siteUrl);
    result.reachable = true;
    const html = res.body;
    const headers = res.headers;

    // ── Performance ────────────────
    result.performance.ttfbMs = res.ttfbMs;
    result.performance.totalTimeMs = res.totalMs;
    result.performance.contentLength = parseInt(headers['content-length'] || '0') || html.length;
    result.performance.compressed = !!(headers['content-encoding']?.match(/gzip|br|deflate/));
    result.performance.cacheControl = headers['cache-control'] ?? null;

    // ── SEO ────────────────────────
    result.seo.title = extractTitle(html);
    result.seo.description = extractMeta(html, 'description');
    result.seo.ogTitle = extractMeta(html, 'og:title');
    result.seo.ogDescription = extractMeta(html, 'og:description');
    result.seo.ogImage = extractMeta(html, 'og:image');
    result.seo.canonicalUrl = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ?? null;
    result.seo.viewport = hasTag(html, '<meta[^>]+name=["\'"]viewport');
    result.seo.favicon = hasTag(html, '<link[^>]+rel=["\'"](?:icon|shortcut icon)');
    result.seo.jsonLd = hasTag(html, '<script[^>]+type=["\'"]application/ld\\+json');
    result.seo.h1Count = countTag(html, 'h1');

    // Check sitemap and robots
    const baseUrl = new URL(siteUrl).origin;
    const [sitemapOk, robotsOk] = await Promise.all([
      checkExists(baseUrl + '/sitemap.xml'),
      checkExists(baseUrl + '/robots.txt'),
    ]);
    result.seo.sitemapExists = sitemapOk;
    result.seo.robotsExists = robotsOk;

    // ── Security ───────────────────
    result.security.https = siteUrl.startsWith('https://');
    result.security.hsts = !!headers['strict-transport-security'];
    result.security.csp = headers['content-security-policy'] ?? null;
    result.security.xFrameOptions = headers['x-frame-options'] ?? null;
    result.security.xContentTypeOptions = headers['x-content-type-options'] === 'nosniff';
    result.security.referrerPolicy = headers['referrer-policy'] ?? null;
    result.security.corsAllowOrigin = headers['access-control-allow-origin'] ?? null;

    // ── Growth ─────────────────────
    if (hasTag(html, 'gtag|GA4|googletagmanager|G-[A-Z0-9]+')) result.growth.analyticsDetected.push('ga4');
    if (hasTag(html, 'plausible')) result.growth.analyticsDetected.push('plausible');
    if (hasTag(html, 'posthog')) result.growth.analyticsDetected.push('posthog');
    if (hasTag(html, 'hotjar')) result.growth.analyticsDetected.push('hotjar');
    if (hasTag(html, 'mixpanel')) result.growth.analyticsDetected.push('mixpanel');
    result.growth.cookieConsentDetected = hasTag(html, 'cookie.?consent|cookie.?banner|cookiebot|onetrust');
    result.growth.emailCaptureDetected = hasTag(html, '<input[^>]+type=["\'"]email');
    result.growth.socialMetaComplete = !!(result.seo.ogTitle && result.seo.ogDescription && result.seo.ogImage && extractMeta(html, 'twitter:card'));

    // ── Health ─────────────────────
    result.health.statusCode = res.statusCode;
    result.health.responseHeaders = headers;

  } catch (err) {
    result.error = (err as Error).message;
  }

  return result;
}

/**
 * Score the scan result across the 5 Deep Current dimensions.
 * Returns partial scores for performance, SEO (part of growth), and security.
 */
export function scoreScan(scan: SiteScanResult): {
  performance: number;  // 0-100
  seoScore: number;     // 0-100
  securityScore: number; // 0-100
  growthReadiness: number; // 0-100
} {
  if (!scan.reachable) return { performance: 0, seoScore: 0, securityScore: 0, growthReadiness: 0 };

  // Performance (0-100)
  let perf = 50; // base
  if (scan.performance.ttfbMs !== null) {
    if (scan.performance.ttfbMs < 200) perf += 20;
    else if (scan.performance.ttfbMs < 800) perf += 10;
    else perf -= 10;
  }
  if (scan.performance.compressed) perf += 15;
  if (scan.performance.cacheControl) perf += 15;
  perf = Math.max(0, Math.min(100, perf));

  // SEO (0-100)
  let seo = 0;
  if (scan.seo.title) seo += 15;
  if (scan.seo.description) seo += 15;
  if (scan.seo.viewport) seo += 10;
  if (scan.seo.favicon) seo += 5;
  if (scan.seo.sitemapExists) seo += 15;
  if (scan.seo.robotsExists) seo += 10;
  if (scan.seo.jsonLd) seo += 10;
  if (scan.seo.canonicalUrl) seo += 10;
  if (scan.seo.h1Count === 1) seo += 10; // Exactly one h1 is best practice

  // Security (0-100)
  let sec = 0;
  if (scan.security.https) sec += 25;
  if (scan.security.hsts) sec += 15;
  if (scan.security.csp) sec += 20;
  if (scan.security.xFrameOptions) sec += 10;
  if (scan.security.xContentTypeOptions) sec += 10;
  if (scan.security.referrerPolicy) sec += 10;
  sec += 10; // base for being reachable

  // Growth Readiness (0-100)
  let growth = 0;
  if (scan.growth.analyticsDetected.length > 0) growth += 25;
  if (scan.growth.socialMetaComplete) growth += 20;
  if (scan.growth.emailCaptureDetected) growth += 20;
  if (scan.growth.cookieConsentDetected) growth += 10;
  if (scan.seo.sitemapExists) growth += 10;
  if (scan.seo.jsonLd) growth += 10;
  growth += 5; // base

  return {
    performance: Math.min(100, perf),
    seoScore: Math.min(100, seo),
    securityScore: Math.min(100, sec),
    growthReadiness: Math.min(100, growth),
  };
}

export type { SiteScanResult, PerformanceScan, SeoScan, SecurityScan, GrowthScan, HealthScan };
