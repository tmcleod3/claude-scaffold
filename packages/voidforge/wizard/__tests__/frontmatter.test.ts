/**
 * Frontmatter parser tests — PRD YAML extraction and validation.
 * Tier 2: Pure function, easy win.
 */

import { describe, it, expect } from 'vitest';
import { parseFrontmatter, validateFrontmatter } from '../lib/frontmatter.js';

describe('parseFrontmatter', () => {
  it('should parse valid YAML frontmatter', () => {
    const content = '# My PRD\n\n```yaml\nname: "Test App"\ntype: "full-stack"\nframework: "next.js"\ndatabase: "postgres"\n```\n\nRest of document';
    const { frontmatter } = parseFrontmatter(content);
    expect(frontmatter.name).toBe('Test App');
    expect(frontmatter.type).toBe('full-stack');
    expect(frontmatter.framework).toBe('next.js');
    expect(frontmatter.database).toBe('postgres');
  });

  it('should handle quoted and unquoted values', () => {
    const content = '```yaml\nname: "Quoted"\nauth: yes\npayments: none\n```';
    const { frontmatter } = parseFrontmatter(content);
    expect(frontmatter.name).toBe('Quoted');
    expect(frontmatter.auth).toBe('yes');
    expect(frontmatter.payments).toBe('none');
  });

  it('should strip inline comments on unquoted values', () => {
    const content = '```yaml\nname: "App"\ntype: api-only # backend only\n```';
    const { frontmatter } = parseFrontmatter(content);
    expect(frontmatter.name).toBe('App');
    expect(frontmatter.type).toBe('api-only');
  });

  it('should preserve # inside quoted values', () => {
    const content = '```yaml\nname: "App #1"\n```';
    const { frontmatter } = parseFrontmatter(content);
    expect(frontmatter.name).toBe('App #1');
  });

  it('should return empty frontmatter for missing yaml block', () => {
    const content = 'No frontmatter here, just regular text.';
    const { frontmatter } = parseFrontmatter(content);
    expect(Object.keys(frontmatter)).toHaveLength(0);
  });

  it('should return body content', () => {
    const content = '```yaml\nname: "App"\n```\n\nBody content here.';
    const { body } = parseFrontmatter(content);
    expect(body).toBe(content);
  });
});

describe('validateFrontmatter', () => {
  it('should accept valid frontmatter', () => {
    const errors = validateFrontmatter({ name: 'App', type: 'full-stack', deploy: 'vps' });
    expect(errors).toHaveLength(0);
  });

  it('should require name field', () => {
    const errors = validateFrontmatter({ type: 'full-stack' });
    expect(errors.some(e => e.includes('name'))).toBe(true);
  });

  it('should reject invalid type with name present', () => {
    const errors = validateFrontmatter({ name: 'App', type: 'invalid-type' });
    expect(errors.some(e => e.includes('type'))).toBe(true);
  });

  it('should reject invalid deploy target with name present', () => {
    const errors = validateFrontmatter({ name: 'App', deploy: 'heroku' });
    expect(errors.some(e => e.includes('deploy'))).toBe(true);
  });
});
