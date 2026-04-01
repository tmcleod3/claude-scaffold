/**
 * PRD validator tests — Troi's structural compliance checks.
 * Validates section detection, conditional rules, and conflict scanning.
 */

import { describe, it, expect } from 'vitest';
import { extractSections, validatePrdStructure, scanConflicts } from '../lib/prd-validator.js';
import type { PrdFrontmatter } from '../lib/frontmatter.js';

// ── Section Extraction ──────────────────────────────

describe('extractSections', () => {
  it('should extract h1, h2, h3 headings', () => {
    const content = '# Title\n\n## Overview\n\n### Sub Section\n\nBody text.';
    const sections = extractSections(content);
    expect(sections).toContain('title');
    expect(sections).toContain('overview');
    expect(sections).toContain('sub section');
  });

  it('should return empty for no headings', () => {
    expect(extractSections('Just body text.')).toHaveLength(0);
  });

  it('should handle complex PRD structure', () => {
    const content = `
# Silph Scope PRD

## Overview
Product description.

## Core Features
### Feature 1
### Feature 2

## Data Models
Schema here.

## Deployment
AWS VPS.
`;
    const sections = extractSections(content);
    expect(sections).toContain('silph scope prd');
    expect(sections).toContain('overview');
    expect(sections).toContain('core features');
    expect(sections).toContain('data models');
    expect(sections).toContain('deployment');
  });
});

// ── Structural Validation ───────────────────────────

describe('validatePrdStructure', () => {
  const baseFm: PrdFrontmatter = { name: 'test-project' };

  it('should pass for well-structured PRD', () => {
    const content = '## Overview\n\n## Core Features\n\n### Login\n';
    const result = validatePrdStructure(content, baseFm);
    expect(result.warnings).toHaveLength(0);
    expect(result.valid).toBe(true);
  });

  it('should warn on missing overview', () => {
    const content = '## Features\n\n### Login\n';
    const result = validatePrdStructure(content, baseFm);
    expect(result.warnings.some(w => w.includes('OVERVIEW'))).toBe(true);
  });

  it('should warn on missing features', () => {
    const content = '## Overview\n\nProduct description.\n';
    const result = validatePrdStructure(content, baseFm);
    expect(result.warnings.some(w => w.includes('feature'))).toBe(true);
  });

  it('should warn when database set but no data models section', () => {
    const content = '## Overview\n\n## Features\n';
    const fm: PrdFrontmatter = { ...baseFm, database: 'postgresql' };
    const result = validatePrdStructure(content, fm);
    expect(result.warnings.some(w => w.includes('DATA MODELS'))).toBe(true);
  });

  it('should not warn about database if database is none', () => {
    const content = '## Overview\n\n## Features\n';
    const fm: PrdFrontmatter = { ...baseFm, database: 'none' };
    const result = validatePrdStructure(content, fm);
    expect(result.warnings.some(w => w.includes('DATA MODELS'))).toBe(false);
  });

  it('should warn when deploy set but no deployment section', () => {
    const content = '## Overview\n\n## Features\n';
    const fm: PrdFrontmatter = { ...baseFm, deploy: 'vps' };
    const result = validatePrdStructure(content, fm);
    expect(result.warnings.some(w => w.includes('DEPLOYMENT'))).toBe(true);
  });

  it('should warn when auth enabled but not mentioned in PRD', () => {
    const content = '## Overview\n\n## Features\n\nA tool for data analysis.\n';
    const fm: PrdFrontmatter = { ...baseFm, auth: 'yes' };
    const result = validatePrdStructure(content, fm);
    expect(result.warnings.some(w => w.includes('auth'))).toBe(true);
  });

  it('should not warn about auth if PRD mentions login', () => {
    const content = '## Overview\n\n## Features\n\nUsers login to access.\n';
    const fm: PrdFrontmatter = { ...baseFm, auth: 'yes' };
    const result = validatePrdStructure(content, fm);
    expect(result.warnings.some(w => w.includes('auth'))).toBe(false);
  });

  it('should warn when workers enabled but not mentioned', () => {
    const content = '## Overview\n\n## Features\n';
    const fm: PrdFrontmatter = { ...baseFm, workers: 'yes' };
    const result = validatePrdStructure(content, fm);
    expect(result.warnings.some(w => w.includes('worker'))).toBe(true);
  });

  it('should warn when payments configured but not mentioned', () => {
    const content = '## Overview\n\n## Features\n';
    const fm: PrdFrontmatter = { ...baseFm, payments: 'stripe' };
    const result = validatePrdStructure(content, fm);
    expect(result.warnings.some(w => w.includes('payment'))).toBe(true);
  });

  it('should warn when email configured but not mentioned', () => {
    const content = '## Overview\n\n## Features\n';
    const fm: PrdFrontmatter = { ...baseFm, email: 'resend' };
    const result = validatePrdStructure(content, fm);
    expect(result.warnings.some(w => w.includes('email'))).toBe(true);
  });
});

// ── Conflict Scanning ───────────────────────────────

describe('scanConflicts', () => {
  it('should detect auth without database', () => {
    const conflicts = scanConflicts({ auth: 'yes' });
    expect(conflicts.some(c => c.includes('database'))).toBe(true);
  });

  it('should not flag auth with database', () => {
    const conflicts = scanConflicts({ auth: 'yes', database: 'postgresql' });
    expect(conflicts.some(c => c.includes('Auth is enabled but no database'))).toBe(false);
  });

  it('should detect payments without auth', () => {
    const conflicts = scanConflicts({ payments: 'stripe', database: 'postgresql' });
    expect(conflicts.some(c => c.includes('Payments configured but auth'))).toBe(true);
  });

  it('should detect workers on static deploy', () => {
    const conflicts = scanConflicts({ workers: 'yes', deploy: 'static' });
    expect(conflicts.some(c => c.includes('background processes'))).toBe(true);
  });

  it('should detect cache on cloudflare deploy', () => {
    const conflicts = scanConflicts({ cache: 'redis', deploy: 'cloudflare' });
    expect(conflicts.some(c => c.includes('cache services'))).toBe(true);
  });

  it('should detect admin without auth', () => {
    const conflicts = scanConflicts({ admin: 'yes', database: 'postgresql' });
    expect(conflicts.some(c => c.includes('Admin panel'))).toBe(true);
  });

  it('should return empty for valid configuration', () => {
    const conflicts = scanConflicts({
      name: 'test',
      auth: 'yes',
      database: 'postgresql',
      payments: 'stripe',
      deploy: 'vps',
      workers: 'yes',
      cache: 'redis',
      admin: 'yes',
    });
    expect(conflicts).toHaveLength(0);
  });

  it('should return empty for minimal configuration', () => {
    const conflicts = scanConflicts({ name: 'test' });
    expect(conflicts).toHaveLength(0);
  });
});
