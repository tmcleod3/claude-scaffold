/**
 * Seven's Gap Analysis Engine — 5-dimension project scoring (v12.1).
 *
 * Analyzes a project across: feature completeness, quality, performance,
 * growth readiness, and revenue potential. Produces a scored situation model
 * that drives Tuvok's campaign proposals.
 *
 * PRD Reference: ROADMAP v12.1 deliverables, DEEP_CURRENT.md ANALYZE step
 */

import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

import type { SituationModel, DimensionScore } from './deep-current.js';

// ── Feature Completeness Dimension ────────────────────

/**
 * Score feature completeness by diffing PRD requirements against codebase.
 * Uses a simplified heuristic: count PRD sections vs implemented routes/components.
 */
export async function scoreFeatureCompleteness(projectDir: string): Promise<DimensionScore> {
  const gaps: string[] = [];
  let score = 50; // base — assumes halfway done if we can't fully analyze

  // Read PRD if exists
  const prdPaths = [join(projectDir, 'docs', 'PRD.md'), join(projectDir, 'PRD.md')];
  let prdContent = '';
  for (const p of prdPaths) {
    if (existsSync(p)) {
      prdContent = await readFile(p, 'utf-8');
      break;
    }
  }

  if (!prdContent) {
    return { score: 0, gaps: ['No PRD found — cannot assess feature completeness'], lastUpdated: new Date().toISOString() };
  }

  // Count PRD feature sections (## headers that look like features)
  const featureSections = (prdContent.match(/^#{2,3}\s+(?!Frontmatter|Version|Status)/gm) || []).length;

  // Count source files as a proxy for implementation
  let sourceFileCount = 0;
  try {
    const srcDirs = ['src', 'app', 'pages', 'components', 'lib', 'services', 'wizard/lib', 'wizard/ui'];
    for (const dir of srcDirs) {
      const fullDir = join(projectDir, dir);
      if (existsSync(fullDir)) {
        const files = await readdir(fullDir, { recursive: true });
        sourceFileCount += files.filter(f => /\.(ts|tsx|js|jsx|py|rb)$/.test(String(f))).length;
      }
    }
  } catch { /* can't read dirs */ }

  // Heuristic scoring
  if (featureSections > 0 && sourceFileCount > 0) {
    const ratio = Math.min(sourceFileCount / featureSections, 3); // cap at 3 files/section
    score = Math.min(100, Math.round(ratio / 3 * 100));
  }

  if (score < 30) gaps.push(`Only ${sourceFileCount} source files for ${featureSections} PRD sections`);
  if (score < 60) gaps.push('Feature implementation appears incomplete');

  // Check for campaign state — completed campaigns boost the score
  const campaignStatePath = join(projectDir, 'logs', 'campaign-state.md');
  if (existsSync(campaignStatePath)) {
    const campaignContent = await readFile(campaignStatePath, 'utf-8');
    const completedMissions = (campaignContent.match(/COMPLETE/g) || []).length;
    score = Math.min(100, score + completedMissions * 3);
  }

  return { score: Math.min(100, score), gaps, lastUpdated: new Date().toISOString() };
}

// ── Quality Dimension ─────────────────────────────────

/**
 * Score quality from gauntlet findings, field reports, and test presence.
 */
export async function scoreQuality(projectDir: string): Promise<DimensionScore> {
  const gaps: string[] = [];
  let score = 50;

  // Check for test files
  let testFileCount = 0;
  const testDirs = ['__tests__', 'tests', 'test', 'spec'];
  for (const dir of testDirs) {
    const fullDir = join(projectDir, dir);
    if (existsSync(fullDir)) {
      const files = await readdir(fullDir, { recursive: true });
      testFileCount += files.filter(f => /\.(test|spec)\.(ts|tsx|js|jsx|py)$/.test(String(f))).length;
    }
  }
  // Also check for test files alongside source
  try {
    const srcDir = join(projectDir, 'src');
    if (existsSync(srcDir)) {
      const files = await readdir(srcDir, { recursive: true });
      testFileCount += files.filter(f => /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(String(f))).length;
    }
  } catch { /* can't read */ }

  if (testFileCount === 0) { gaps.push('No test files found'); score -= 20; }
  else if (testFileCount < 5) { gaps.push(`Only ${testFileCount} test files — coverage likely low`); score -= 10; }
  else { score += 15; }

  // Check gauntlet state for unfixed findings
  const gauntletPath = join(projectDir, 'logs', 'gauntlet-state.md');
  if (existsSync(gauntletPath)) {
    const content = await readFile(gauntletPath, 'utf-8');
    if (content.includes('COMPLETE') && content.includes('SIGN OFF')) {
      score += 20;
    }
    const criticalCount = (content.match(/Critical/gi) || []).length;
    if (criticalCount > 5) { gaps.push(`${criticalCount} Critical mentions in gauntlet state`); score -= 10; }
  } else {
    gaps.push('No gauntlet history — project has not been reviewed');
    score -= 15;
  }

  // Check for LESSONS.md (learning from mistakes = quality signal)
  if (existsSync(join(projectDir, 'docs', 'LESSONS.md'))) score += 5;

  return { score: Math.max(0, Math.min(100, score)), gaps, lastUpdated: new Date().toISOString() };
}

// ── Revenue Potential Dimension ───────────────────────

/**
 * Score revenue potential from treasury setup, payment integrations, and pricing presence.
 */
export async function scoreRevenuePotential(projectDir: string): Promise<DimensionScore> {
  const gaps: string[] = [];
  let score = 20; // base — most projects start without revenue infrastructure

  // Check for treasury vault (Cultivation installed)
  const treasuryVault = join(homedir(), '.voidforge', 'treasury', 'vault.enc');
  if (existsSync(treasuryVault)) {
    score += 25;
  } else {
    gaps.push('No treasury set up — no revenue tracking');
  }

  // Check for payment integration in code
  const paymentIndicators = ['stripe', 'paddle', 'lemon', 'paypal', 'checkout'];
  let paymentFound = false;
  try {
    const envPath = join(projectDir, '.env');
    if (existsSync(envPath)) {
      const envContent = await readFile(envPath, 'utf-8');
      for (const indicator of paymentIndicators) {
        if (envContent.toLowerCase().includes(indicator)) { paymentFound = true; break; }
      }
    }
  } catch { /* can't read .env */ }

  if (paymentFound) { score += 20; }
  else { gaps.push('No payment integration detected'); }

  // Check for pricing page indicators in source
  try {
    const srcDir = join(projectDir, 'src');
    if (existsSync(srcDir)) {
      const files = await readdir(srcDir, { recursive: true });
      const pricingFiles = files.filter(f => /pric/i.test(String(f)));
      if (pricingFiles.length > 0) { score += 15; }
      else { gaps.push('No pricing page or component found'); }
    }
  } catch { /* can't read */ }

  // Check for heartbeat daemon (revenue monitoring)
  if (existsSync(join(homedir(), '.voidforge', 'heartbeat.json'))) {
    score += 15;
  } else {
    gaps.push('Heartbeat daemon not running — no revenue monitoring');
  }

  return { score: Math.max(0, Math.min(100, score)), gaps, lastUpdated: new Date().toISOString() };
}

// ── Full Analysis ─────────────────────────────────────

/**
 * Run Seven's full gap analysis across all 5 dimensions.
 * Performance and growthReadiness come from Torres's site scan (already in the model).
 * Feature completeness, quality, and revenue potential are analyzed here.
 */
export async function analyzeGaps(
  model: SituationModel,
  projectDir: string
): Promise<SituationModel> {
  // Feature completeness
  model.dimensions.featureCompleteness = await scoreFeatureCompleteness(projectDir);

  // Quality
  model.dimensions.quality = await scoreQuality(projectDir);

  // Revenue potential
  model.dimensions.revenuePotential = await scoreRevenuePotential(projectDir);

  // Performance and growthReadiness are updated by Torres's SENSE step (site scanner)
  // If they haven't been scanned yet, keep their current values

  return model;
}

/**
 * Find the weakest dimension — this drives the next campaign proposal.
 */
export function findWeakestDimension(model: SituationModel): { name: string; score: number; gaps: string[] } {
  const dims = model.dimensions;
  const entries = [
    { name: 'Feature Completeness', ...dims.featureCompleteness },
    { name: 'Quality', ...dims.quality },
    { name: 'Performance', ...dims.performance },
    { name: 'Growth Readiness', ...dims.growthReadiness },
    { name: 'Revenue Potential', ...dims.revenuePotential },
  ];

  entries.sort((a, b) => a.score - b.score);
  return entries[0];
}
