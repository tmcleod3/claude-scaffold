/**
 * Kongo Seed tests — PRD parsing, seed extraction, campaign-specific seeds.
 */

import { describe, it, expect } from 'vitest';

import { extractSeedFromPrd, extractSeedForCampaign, parsePrdContent } from '../../lib/kongo/seed.js';
import type { PrdContent } from '../../lib/kongo/seed.js';

// ── Test Data ────────────────────────────────────────────

const samplePrdRaw = `---
name: "Acme AI"
description: "Enterprise-grade AI infrastructure for modern teams"
tagline: "Build Faster with AI"
ctaText: "Start Free Trial"
ctaUrl: "https://acme.ai/signup"
---

## Overview

Acme AI provides enterprise-grade infrastructure for building AI applications.
Our platform handles the complexity so your team can focus on innovation.

## Features

- 10x faster model deployment with one-click setup
- SOC 2 Type II compliant with automatic audit trails
- Scales to millions of requests with auto-provisioning
- Built-in A/B testing for model performance
- Real-time monitoring and alerting dashboard

## Testimonials

> "Acme AI cut our deployment time from weeks to hours." — CTO, TechCorp
> "The best AI infrastructure we've used." — VP Eng, DataFlow

## Traction

We serve 500+ teams and process 2M+ requests daily.
`;

const samplePrdYamlFenced = `\`\`\`yaml
name: "Kongo Engine"
description: "Turn your pitch deck into a production-grade website"
\`\`\`

## Overview

Kongo Engine generates investor-grade websites from pitch decks.

## Features

- Upload any pitch deck format
- AI-powered content extraction
- Custom branding and templates

## Call to Action

Request a demo to see Kongo in action.
`;

// ── Tests ────────────────────────────────────────────────

describe('parsePrdContent', () => {
  it('parses --- delimited frontmatter', () => {
    const prd = parsePrdContent(samplePrdRaw);
    expect(prd.frontmatter.name).toBe('Acme AI');
    expect(prd.frontmatter.tagline).toBe('Build Faster with AI');
    expect(prd.body).toContain('## Overview');
  });

  it('parses ```yaml fenced frontmatter', () => {
    const prd = parsePrdContent(samplePrdYamlFenced);
    expect(prd.frontmatter.name).toBe('Kongo Engine');
    expect(prd.body).toContain('## Overview');
  });

  it('handles document with no frontmatter', () => {
    const prd = parsePrdContent('# Just a document\n\nWith some content.');
    expect(Object.keys(prd.frontmatter)).toHaveLength(0);
    expect(prd.body).toContain('Just a document');
  });
});

describe('extractSeedFromPrd', () => {
  it('extracts complete seed from well-structured PRD', () => {
    const prd = parsePrdContent(samplePrdRaw);
    const seed = extractSeedFromPrd(prd);

    expect(seed.projectName).toBe('Acme AI');
    expect(seed.headline).toBe('Build Faster with AI');
    expect(seed.subheadline).toBe('Enterprise-grade AI infrastructure for modern teams');
    expect(seed.ctaText).toBe('Start Free Trial');
    expect(seed.ctaUrl).toBe('https://acme.ai/signup');
  });

  it('extracts value props from Features section', () => {
    const prd = parsePrdContent(samplePrdRaw);
    const seed = extractSeedFromPrd(prd);

    expect(seed.valueProps.length).toBeGreaterThanOrEqual(3);
    expect(seed.valueProps.length).toBeLessThanOrEqual(5);
    expect(seed.valueProps[0]).toContain('10x faster');
  });

  it('extracts social proof from testimonials', () => {
    const prd = parsePrdContent(samplePrdRaw);
    const seed = extractSeedFromPrd(prd);

    expect(seed.socialProof).toBeDefined();
    expect(seed.socialProof!.length).toBeGreaterThan(0);
    expect(seed.socialProof!.some(s => s.includes('Acme AI') || s.includes('500+'))).toBe(true);
  });

  it('uses default brand colors when not specified', () => {
    const prd = parsePrdContent(samplePrdRaw);
    const seed = extractSeedFromPrd(prd);

    expect(seed.brandColors.primary).toBe('#1a1a2e');
    expect(seed.brandColors.secondary).toBe('#16213e');
    expect(seed.brandColors.accent).toBe('#0f3460');
  });

  it('detects CTA from body when not in frontmatter', () => {
    const prd = parsePrdContent(samplePrdYamlFenced);
    const seed = extractSeedFromPrd(prd);

    expect(seed.ctaText).toBe('Request a Demo');
  });

  it('generates minimum 3 value props even from sparse PRD', () => {
    const sparsePrd: PrdContent = {
      frontmatter: { name: 'Sparse App' },
      body: '## Overview\n\nA simple application.\n',
    };
    const seed = extractSeedFromPrd(sparsePrd);

    expect(seed.valueProps.length).toBeGreaterThanOrEqual(3);
  });

  it('handles PRD with no recognizable sections', () => {
    const minimalPrd: PrdContent = {
      frontmatter: {},
      body: 'Just some text without any structure.',
    };
    const seed = extractSeedFromPrd(minimalPrd);

    expect(seed.projectName).toBe('Untitled Project');
    expect(seed.headline).toBeTruthy();
    expect(seed.ctaText).toBeTruthy();
  });
});

describe('extractSeedForCampaign', () => {
  it('enriches base seed with campaign metadata', () => {
    const prd = parsePrdContent(samplePrdRaw);
    const seed = extractSeedForCampaign(prd, 'camp_abc', 'google');

    expect(seed.campaignId).toBe('camp_abc');
    expect(seed.platform).toBe('google');
    expect(seed.projectName).toBe('Acme AI');
  });

  it('preserves all base seed fields', () => {
    const prd = parsePrdContent(samplePrdRaw);
    const baseSeed = extractSeedFromPrd(prd);
    const campaignSeed = extractSeedForCampaign(prd, 'camp_xyz', 'meta');

    expect(campaignSeed.headline).toBe(baseSeed.headline);
    expect(campaignSeed.valueProps).toEqual(baseSeed.valueProps);
    expect(campaignSeed.brandColors).toEqual(baseSeed.brandColors);
  });
});
