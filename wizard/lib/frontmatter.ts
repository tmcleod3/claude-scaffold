/**
 * Minimal YAML frontmatter parser for PRD documents.
 * Handles the simple key: value format used in PRD frontmatter blocks.
 */

export interface PrdFrontmatter {
  name?: string;
  type?: string;
  framework?: string;
  database?: string;
  cache?: string;
  styling?: string;
  auth?: string;
  payments?: string;
  workers?: string;
  admin?: string;
  marketing?: string;
  email?: string;
  deploy?: string;
  [key: string]: string | undefined;
}

export function parseFrontmatter(content: string): { frontmatter: PrdFrontmatter; body: string } {
  // Look for ```yaml ... ``` block in the frontmatter section
  const yamlBlockMatch = content.match(/```yaml\s*\n([\s\S]*?)```/);

  if (!yamlBlockMatch) {
    return { frontmatter: {}, body: content };
  }

  const yamlStr = yamlBlockMatch[1];
  const frontmatter: PrdFrontmatter = {};

  for (const line of yamlStr.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^(\w+):\s*(.+)$/);
    if (match) {
      const key = match[1];
      let value = match[2].trim();
      // Strip quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      // Strip inline comments
      const commentIdx = value.indexOf('#');
      if (commentIdx > 0) {
        value = value.slice(0, commentIdx).trim();
      }
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body: content };
}

export function generateFrontmatterBlock(fm: PrdFrontmatter): string {
  const lines: string[] = ['```yaml'];

  if (fm.name) lines.push(`name: "${fm.name}"`);
  if (fm.type) lines.push(`type: "${fm.type}"`);
  lines.push('');
  if (fm.framework) lines.push(`framework: "${fm.framework}"`);
  if (fm.database) lines.push(`database: "${fm.database}"`);
  if (fm.cache) lines.push(`cache: "${fm.cache}"`);
  if (fm.styling) lines.push(`styling: "${fm.styling}"`);
  lines.push('');
  if (fm.auth) lines.push(`auth: ${fm.auth}`);
  if (fm.payments) lines.push(`payments: ${fm.payments}`);
  if (fm.workers) lines.push(`workers: ${fm.workers}`);
  if (fm.admin) lines.push(`admin: ${fm.admin}`);
  if (fm.marketing) lines.push(`marketing: ${fm.marketing}`);
  if (fm.email) lines.push(`email: ${fm.email}`);
  lines.push('');
  if (fm.deploy) lines.push(`deploy: "${fm.deploy}"`);

  lines.push('```');
  return lines.join('\n');
}

const VALID_TYPES = ['full-stack', 'api-only', 'static-site', 'prototype'];
const VALID_DEPLOY = ['vps', 'vercel', 'railway', 'cloudflare', 'static', 'docker'];

export function validateFrontmatter(fm: PrdFrontmatter): string[] {
  const errors: string[] = [];

  if (!fm.name) errors.push('Missing required field: name');
  if (fm.type && !VALID_TYPES.includes(fm.type)) {
    errors.push(`Invalid type: "${fm.type}". Must be one of: ${VALID_TYPES.join(', ')}`);
  }
  if (fm.deploy && !VALID_DEPLOY.includes(fm.deploy)) {
    errors.push(`Invalid deploy: "${fm.deploy}". Must be one of: ${VALID_DEPLOY.join(', ')}`);
  }

  return errors;
}
