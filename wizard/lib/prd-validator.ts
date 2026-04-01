/**
 * PRD Structural Validator — Troi's compliance checks.
 *
 * Validates that a PRD document has the expected sections and
 * cross-references based on its frontmatter configuration.
 * Produces warnings (not errors) — the user can proceed with gaps.
 *
 * PRD Reference: RFC-blueprint-path.md
 */

import type { PrdFrontmatter } from './frontmatter.js';

// ── Types ───────────────────────────────────────────

export interface ValidationResult {
  errors: string[];
  warnings: string[];
  sections: string[];
  valid: boolean;
}

// ── Section Detection ───────────────────────────────

/**
 * Extract all markdown heading sections from PRD content.
 * Returns lowercase heading text for case-insensitive matching.
 */
export function extractSections(content: string): string[] {
  const headingPattern = /^#{1,3}\s+(.+)$/gm;
  const sections: string[] = [];
  let match;

  while ((match = headingPattern.exec(content)) !== null) {
    sections.push(match[1].trim().toLowerCase());
  }

  return sections;
}

/**
 * Check if any section heading contains a given keyword.
 */
function hasSection(sections: string[], keyword: string): boolean {
  const lower = keyword.toLowerCase();
  return sections.some(s => s.includes(lower));
}

// ── Structural Validation ───────────────────────────

/**
 * Validate PRD structure against frontmatter configuration.
 *
 * Rules (warnings, not blockers):
 * - PRD must have an OVERVIEW or SUMMARY section
 * - PRD must have at least one feature section
 * - If database is configured, should have DATA MODELS section
 * - If deploy target is set, should have DEPLOYMENT section
 * - If auth is enabled, should mention authentication
 * - If workers are enabled, should define background workers
 * - If payments are configured, should have a payments/billing section
 */
export function validatePrdStructure(
  content: string,
  frontmatter: PrdFrontmatter,
): ValidationResult {
  const sections = extractSections(content);
  const errors: string[] = [];
  const warnings: string[] = [];
  const contentLower = content.toLowerCase();

  // Required: Overview or Summary section
  if (!hasSection(sections, 'overview') && !hasSection(sections, 'summary') && !hasSection(sections, 'introduction')) {
    warnings.push('Missing OVERVIEW or SUMMARY section — add a high-level description of the product');
  }

  // Required: At least one feature section
  if (!hasSection(sections, 'feature') && !hasSection(sections, 'core') && !hasSection(sections, 'functionality')) {
    warnings.push('No feature sections found — add sections describing what the product does');
  }

  // Conditional: Database → Data Models
  if (frontmatter.database && frontmatter.database !== 'no' && frontmatter.database !== 'none') {
    if (!hasSection(sections, 'data model') && !hasSection(sections, 'schema') && !hasSection(sections, 'database')) {
      warnings.push(`Database "${frontmatter.database}" configured but no DATA MODELS or SCHEMA section found`);
    }
  }

  // Conditional: Deploy → Deployment section
  if (frontmatter.deploy && frontmatter.deploy !== 'no' && frontmatter.deploy !== 'none') {
    if (!hasSection(sections, 'deploy') && !hasSection(sections, 'infrastructure') && !hasSection(sections, 'hosting')) {
      warnings.push(`Deploy target "${frontmatter.deploy}" configured but no DEPLOYMENT section found`);
    }
  }

  // Conditional: Auth → Authentication mentioned
  if (frontmatter.auth && frontmatter.auth !== 'no' && frontmatter.auth !== 'none' && frontmatter.auth !== 'false') {
    if (!contentLower.includes('auth') && !contentLower.includes('login') && !contentLower.includes('sign in')) {
      warnings.push('Auth is enabled but PRD does not mention authentication, login, or sign-in');
    }
  }

  // Conditional: Workers → Background jobs defined
  if (frontmatter.workers && frontmatter.workers !== 'no' && frontmatter.workers !== 'none' && frontmatter.workers !== 'false') {
    if (!contentLower.includes('worker') && !contentLower.includes('background') && !contentLower.includes('queue') && !contentLower.includes('cron')) {
      warnings.push('Workers enabled but PRD does not mention workers, background jobs, queues, or cron');
    }
  }

  // Conditional: Payments → Billing section
  if (frontmatter.payments && frontmatter.payments !== 'no' && frontmatter.payments !== 'none' && frontmatter.payments !== 'false') {
    if (!contentLower.includes('payment') && !contentLower.includes('billing') && !contentLower.includes('subscription') && !contentLower.includes('pricing')) {
      warnings.push(`Payments "${frontmatter.payments}" configured but PRD does not mention payments, billing, or pricing`);
    }
  }

  // Conditional: Email → Email section or mentions
  if (frontmatter.email && frontmatter.email !== 'no' && frontmatter.email !== 'none' && frontmatter.email !== 'false') {
    if (!contentLower.includes('email') && !contentLower.includes('notification') && !contentLower.includes('mail')) {
      warnings.push(`Email "${frontmatter.email}" configured but PRD does not mention email or notifications`);
    }
  }

  return {
    errors,
    warnings,
    sections,
    valid: errors.length === 0,
  };
}

/**
 * Run conflict scan between frontmatter fields.
 * Checks for contradictions that cost hours if caught late.
 */
export function scanConflicts(frontmatter: PrdFrontmatter): string[] {
  const conflicts: string[] = [];

  // Auth + Database: auth usually needs a database
  if (frontmatter.auth && frontmatter.auth !== 'no' && frontmatter.auth !== 'none') {
    if (!frontmatter.database || frontmatter.database === 'none') {
      conflicts.push('Auth is enabled but no database configured — auth needs persistent storage for users/sessions');
    }
  }

  // Payments + Auth: payments need auth
  if (frontmatter.payments && frontmatter.payments !== 'no' && frontmatter.payments !== 'none') {
    if (!frontmatter.auth || frontmatter.auth === 'no' || frontmatter.auth === 'none') {
      conflicts.push('Payments configured but auth is disabled — payments require authenticated users');
    }
  }

  // Workers + Deploy: workers need persistent hosting
  if (frontmatter.workers && frontmatter.workers !== 'no' && frontmatter.workers !== 'false') {
    if (frontmatter.deploy === 'static' || frontmatter.deploy === 'cloudflare') {
      conflicts.push(`Workers enabled but deploy target "${frontmatter.deploy}" does not support background processes`);
    }
  }

  // Cache + Deploy: Redis needs a host
  if (frontmatter.cache && frontmatter.cache !== 'none' && frontmatter.cache !== 'no') {
    if (frontmatter.deploy === 'static' || frontmatter.deploy === 'cloudflare') {
      conflicts.push(`Cache "${frontmatter.cache}" configured but deploy target "${frontmatter.deploy}" does not support cache services`);
    }
  }

  // Admin + Auth: admin panel needs auth
  if (frontmatter.admin && frontmatter.admin !== 'no' && frontmatter.admin !== 'none' && frontmatter.admin !== 'false') {
    if (!frontmatter.auth || frontmatter.auth === 'no' || frontmatter.auth === 'none') {
      conflicts.push('Admin panel enabled but auth is disabled — admin requires authenticated access');
    }
  }

  return conflicts;
}
