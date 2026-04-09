/**
 * Kongo Seed — Extract seed content from PRDs for landing page generation.
 *
 * Phase 3.5 of /grow: Before you distribute, you need somewhere to send them.
 *
 * Extracts headline, value props, CTA, brand colors, and social proof from
 * PRD YAML frontmatter and prose content. Maps to PrdSeedContent which
 * feeds into createPageFromPrd().
 *
 * PRD Reference: PRD-kongo-integration.md §4.5
 */

import type { PrdSeedContent } from './types.js';

// ── Seed Extraction ──────────────────────────────────────

export interface PrdContent {
  /** YAML frontmatter parsed as object */
  readonly frontmatter: Record<string, unknown>;
  /** Full PRD text content (after frontmatter) */
  readonly body: string;
}

/**
 * Extract PrdSeedContent from a PRD document.
 *
 * Strategy:
 * 1. Use frontmatter `name` for project name
 * 2. Extract first ## heading or overview section for headline
 * 3. Extract value props from feature descriptions or bullet lists
 * 4. Use brand colors from frontmatter `style` or defaults
 * 5. Extract CTA from conversion or signup references
 */
export function extractSeedFromPrd(prd: PrdContent): PrdSeedContent {
  const fm = prd.frontmatter;
  const body = prd.body;

  const projectName = extractProjectName(fm);
  const headline = extractHeadline(fm, body);
  const subheadline = extractSubheadline(fm, body);
  const valueProps = extractValueProps(body);
  const { ctaText, ctaUrl } = extractCta(fm, body);
  const brandColors = extractBrandColors(fm);
  const socialProof = extractSocialProof(body);

  return {
    projectName,
    headline,
    subheadline,
    valueProps,
    ctaText,
    ctaUrl,
    brandColors,
    socialProof: socialProof.length > 0 ? socialProof : undefined,
  };
}

/**
 * Extract seed content for a specific campaign.
 * Enriches the base PRD seed with campaign-specific metadata.
 *
 * Self-marketing mode: When the product domain matches the Kongo domain
 * (dogfooding), destination URLs use the /lp/ direct-render path instead
 * of subdomain URLs. This avoids the iframe sandbox constraint that breaks
 * GA4 cookie tracking and UTM relay. See GROWTH_STRATEGIST.md "Iframe
 * Sandbox Constraint" section.
 */
export function extractSeedForCampaign(
  prd: PrdContent,
  campaignId: string,
  platform: string,
  options?: { kongoDomain?: string; selfMarketing?: boolean; slug?: string },
): PrdSeedContent {
  const baseSeed = extractSeedFromPrd(prd);
  const kongoDomain = options?.kongoDomain ?? 'kongo.io';
  const slug = options?.slug ?? slugify(baseSeed.projectName, campaignId);
  const isSelfMarketing = options?.selfMarketing ?? false;

  // Self-marketing: use /lp/ direct-render path (no iframe sandbox)
  // Standard: use subdomain URL
  const destinationUrl = isSelfMarketing
    ? `https://${kongoDomain}/lp/${slug}`
    : `https://${slug}.${kongoDomain}`;

  return {
    ...baseSeed,
    campaignId,
    platform,
    ctaUrl: destinationUrl,
  };
}

/** Generate a URL-safe slug from project name and campaign ID */
function slugify(projectName: string, campaignId: string): string {
  return `${projectName}-${campaignId}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── Frontmatter Parsing ──────────────────────────────────

/**
 * Parse PRD text into frontmatter and body.
 * Handles ```yaml fenced frontmatter and --- delimited frontmatter.
 */
export function parsePrdContent(raw: string): PrdContent {
  const lines = raw.split('\n');
  let frontmatterStr = '';
  let bodyStart = 0;

  // Try ```yaml fenced block
  if (lines[0]?.trim() === '```yaml' || lines[0]?.trim() === '---') {
    const delimiter = lines[0].trim() === '```yaml' ? '```' : '---';
    let found = false;

    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === delimiter) {
        bodyStart = i + 1;
        found = true;
        break;
      }
      frontmatterStr += lines[i] + '\n';
    }

    // No closing delimiter — treat as no frontmatter
    if (!found) {
      frontmatterStr = '';
      bodyStart = 0;
    }
  }

  // Simple YAML key: value parsing (no dependency on yaml parser)
  const frontmatter: Record<string, unknown> = {};
  for (const line of frontmatterStr.split('\n')) {
    const match = line.match(/^(\w[\w-]*)\s*:\s*(.+)/);
    if (match) {
      const key = match[1];
      let value: unknown = match[2].trim();
      // Strip quotes
      if (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      frontmatter[key] = value;
    }
  }

  return {
    frontmatter,
    body: lines.slice(bodyStart).join('\n'),
  };
}

// ── Extraction Helpers ───────────────────────────────────

function extractProjectName(fm: Record<string, unknown>): string {
  return String(fm.name ?? fm.projectName ?? fm.title ?? 'Untitled Project');
}

function extractHeadline(fm: Record<string, unknown>, body: string): string {
  // Check frontmatter tagline
  if (fm.tagline) return String(fm.tagline);

  // First ## Overview section, or first sentence of body
  const overviewMatch = body.match(/##\s+(?:Overview|Introduction|About)\s*\n+(.+)/i);
  if (overviewMatch) {
    return truncate(overviewMatch[1].trim(), 100);
  }

  // First meaningful paragraph
  const firstParagraph = body.split('\n\n').find(p => p.trim().length > 20 && !p.startsWith('#'));
  if (firstParagraph) {
    return truncate(firstParagraph.split('.')[0].trim(), 100);
  }

  return String(fm.name ?? 'Your Next Big Thing');
}

function extractSubheadline(fm: Record<string, unknown>, body: string): string {
  if (fm.description) return truncate(String(fm.description), 200);

  // Second sentence of overview
  const overviewMatch = body.match(/##\s+(?:Overview|Introduction|About)\s*\n+([\s\S]*?)(?=\n##|\n---)/i);
  if (overviewMatch) {
    const sentences = overviewMatch[1].trim().split(/\.\s+/);
    if (sentences.length > 1) return truncate(sentences[1].trim(), 200);
  }

  return `Built with ${String(fm.name ?? 'innovation')}`;
}

function extractValueProps(body: string): string[] {
  const props: string[] = [];

  // Look for bullet lists in Features section
  const featuresMatch = body.match(/##\s+(?:Features|Core Features|Key Features|Capabilities)\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (featuresMatch) {
    const bullets = featuresMatch[1].match(/^[-*]\s+(.+)/gm);
    if (bullets) {
      for (const bullet of bullets.slice(0, 5)) {
        props.push(bullet.replace(/^[-*]\s+/, '').trim());
      }
    }
  }

  // Fallback: any bullet lists in the first half of the document
  if (props.length === 0) {
    const halfBody = body.slice(0, body.length / 2);
    const bullets = halfBody.match(/^[-*]\s+(.+)/gm);
    if (bullets) {
      for (const bullet of bullets.slice(0, 5)) {
        props.push(bullet.replace(/^[-*]\s+/, '').trim());
      }
    }
  }

  // Ensure at least 3 value props
  while (props.length < 3) {
    props.push(props.length === 0 ? 'Built for speed' : props.length === 1 ? 'Easy to use' : 'Trusted by teams');
  }

  return props.slice(0, 5);
}

function extractCta(fm: Record<string, unknown>, body: string): { ctaText: string; ctaUrl: string } {
  // Check frontmatter for CTA
  if (fm.ctaText && fm.ctaUrl) {
    return { ctaText: String(fm.ctaText), ctaUrl: String(fm.ctaUrl) };
  }

  // Look for signup/demo/trial references
  const ctaPatterns = [
    { pattern: /sign\s*up|get\s*started|start\s*(free\s*)?trial/i, text: 'Get Started Free' },
    { pattern: /request\s*(a\s*)?demo/i, text: 'Request a Demo' },
    { pattern: /join\s*waitlist/i, text: 'Join the Waitlist' },
    { pattern: /download/i, text: 'Download Now' },
    { pattern: /subscribe/i, text: 'Subscribe' },
  ];

  for (const { pattern, text } of ctaPatterns) {
    if (pattern.test(body)) return { ctaText: text, ctaUrl: '#signup' };
  }

  return { ctaText: 'Get Started', ctaUrl: '#signup' };
}

function extractBrandColors(fm: Record<string, unknown>): { primary: string; secondary: string; accent: string } {
  const style = fm.style as Record<string, unknown> | undefined;
  const colors = style?.colors as Record<string, string> | undefined;

  return {
    primary: colors?.primary ?? '#1a1a2e',
    secondary: colors?.secondary ?? '#16213e',
    accent: colors?.accent ?? '#0f3460',
  };
}

function extractSocialProof(body: string): string[] {
  const proof: string[] = [];

  // Look for testimonials section
  const testimonialsMatch = body.match(/##\s+(?:Testimonials|Social Proof|What .+ Say)\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (testimonialsMatch) {
    const quotes = testimonialsMatch[1].match(/>\s*(.+)/gm);
    if (quotes) {
      for (const quote of quotes.slice(0, 3)) {
        proof.push(quote.replace(/^>\s*/, '').trim());
      }
    }
  }

  // Look for stats
  const statsMatch = body.match(/(\d+[+kKmM]?\s+(?:users|teams|companies|customers|downloads|stars))/gi);
  if (statsMatch) {
    for (const stat of statsMatch.slice(0, 2)) {
      proof.push(stat.trim());
    }
  }

  return proof;
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
