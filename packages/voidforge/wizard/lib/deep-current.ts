/**
 * Deep Current — Situation Model + Cold Start Intake (v12.0).
 *
 * The Deep Current maintains a persistent situation model that represents
 * the system's understanding of the project at any point in time. The
 * cold start intake classifies new projects and bootstraps the model.
 *
 * PRD Reference: ROADMAP v12.0, docs/methods/DEEP_CURRENT.md
 */

import { readFile, mkdir, writeFile as writeFileAsync } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

import { scanSite, scoreScan } from './site-scanner.js';
import type { SiteScanResult } from './site-scanner.js';

// Lazy path resolution — project dir is passed by callers, not assumed from CWD.
// The wizard is standalone (v21.0) — CWD is NOT a project directory.
function deepCurrentDir(projectDir: string): string {
  return join(projectDir, 'logs', 'deep-current');
}
function situationPath(projectDir: string): string {
  return join(deepCurrentDir(projectDir), 'situation.json');
}
function proposalsDir(projectDir: string): string {
  return join(deepCurrentDir(projectDir), 'proposals');
}
function predictionsPath(projectDir: string): string {
  return join(deepCurrentDir(projectDir), 'predictions.jsonl');
}
function correlationsPath(projectDir: string): string {
  return join(deepCurrentDir(projectDir), 'correlations.jsonl');
}

// ── Project State Classification ──────────────────────

type ProjectState = 'GREENFIELD' | 'IDEA_PRD' | 'PARTIAL' | 'DEPLOYED' | 'OPERATING';

interface ProjectClassification {
  state: ProjectState;
  hasCodebase: boolean;
  hasPrd: boolean;
  isDeployed: boolean;
  hasAnalytics: boolean;
  hasRevenue: boolean;
  deployedUrl?: string;
}

/**
 * Classify the current project's state by checking for key files and config.
 */
export async function classifyProject(): Promise<ProjectClassification> {
  const cwd = process.cwd();

  // Check for codebase indicators
  const hasCodebase = existsSync(join(cwd, 'package.json')) ||
                      existsSync(join(cwd, 'pyproject.toml')) ||
                      existsSync(join(cwd, 'Gemfile')) ||
                      existsSync(join(cwd, 'src')) ||
                      existsSync(join(cwd, 'app'));

  // Check for PRD
  const hasPrd = existsSync(join(cwd, 'docs', 'PRD.md')) ||
                 existsSync(join(cwd, 'PRD.md')) ||
                 existsSync(join(cwd, 'PRD-VOIDFORGE.md'));

  // Check for deployment evidence
  const voidforgeDir = join(homedir(), '.voidforge');
  const hasDeployLog = existsSync(join(voidforgeDir, 'deploys'));
  const hasEnv = existsSync(join(cwd, '.env'));

  // Check for analytics/revenue connections
  const treasuryExists = existsSync(join(voidforgeDir, 'treasury', 'vault.enc'));
  const heartbeatExists = existsSync(join(voidforgeDir, 'heartbeat.json'));

  // Read deploy URL if available
  let deployedUrl: string | undefined;
  try {
    const deployLog = await readFile(join(voidforgeDir, 'deploys', 'latest.json'), 'utf-8');
    const data = JSON.parse(deployLog);
    deployedUrl = data.url;
  } catch { /* no deploy data */ }

  // Classify
  const isDeployed = hasDeployLog && !!deployedUrl;
  const hasAnalytics = treasuryExists || heartbeatExists;
  const hasRevenue = treasuryExists;

  let state: ProjectState;
  if (!hasCodebase && !hasPrd) state = 'GREENFIELD';
  else if (hasPrd && !hasCodebase) state = 'IDEA_PRD';
  else if (hasCodebase && !isDeployed) state = 'PARTIAL';
  else if (isDeployed && !hasRevenue) state = 'DEPLOYED';
  else state = 'OPERATING';

  return { state, hasCodebase, hasPrd, isDeployed, hasAnalytics, hasRevenue, deployedUrl };
}

// ── Situation Model ───────────────────────────────────

interface DimensionScore {
  score: number;           // 0-100
  gaps: string[];          // Human-readable gap descriptions
  lastUpdated: string;     // ISO 8601
}

interface CampaignRecord {
  id: string;
  name: string;
  proposedDate: string;
  executedDate?: string;
  predictedImpact: string;
  actualImpact?: string;
  predictionAccuracy?: number;  // 0-1
}

interface SituationModel {
  projectState: ProjectState;
  projectName: string;
  deployedUrl?: string;
  lastScan: string;
  dimensions: {
    featureCompleteness: DimensionScore;
    quality: DimensionScore;
    performance: DimensionScore;
    growthReadiness: DimensionScore;
    revenuePotential: DimensionScore;
  };
  campaignHistory: CampaignRecord[];
  pendingProposals: string[];    // Paths to proposal files
  averagePredictionAccuracy: number;
  autonomyTier: 1 | 2 | 3;
  lastSiteScan?: SiteScanResult;
}

function createEmptyModel(projectName: string, state: ProjectState): SituationModel {
  const emptyDimension: DimensionScore = { score: 0, gaps: ['Not yet analyzed'], lastUpdated: new Date().toISOString() };
  return {
    projectState: state,
    projectName,
    lastScan: new Date().toISOString(),
    dimensions: {
      featureCompleteness: { ...emptyDimension },
      quality: { ...emptyDimension },
      performance: { ...emptyDimension },
      growthReadiness: { ...emptyDimension },
      revenuePotential: { ...emptyDimension },
    },
    campaignHistory: [],
    pendingProposals: [],
    averagePredictionAccuracy: 0,
    autonomyTier: 1,
  };
}

// ── Persistence ───────────────────────────────────────

export async function loadSituation(projectDir: string): Promise<SituationModel | null> {
  const path = situationPath(projectDir);
  if (!existsSync(path)) return null;
  try {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content) as SituationModel;
  } catch { return null; }
}

export async function saveSituation(projectDir: string, model: SituationModel): Promise<void> {
  await mkdir(deepCurrentDir(projectDir), { recursive: true });
  await writeFileAsync(situationPath(projectDir), JSON.stringify(model, null, 2));
}

// ── SENSE Step — Update situation model from scans ────

export async function sense(model: SituationModel): Promise<SituationModel> {
  const classification = await classifyProject();
  model.projectState = classification.state;
  model.deployedUrl = classification.deployedUrl;
  model.lastScan = new Date().toISOString();

  // Torres scans the site (if deployed)
  if (classification.deployedUrl) {
    try {
      const scanResult = await scanSite(classification.deployedUrl);
      const scores = scoreScan(scanResult);
      model.lastSiteScan = scanResult;

      // Update dimension scores from scan
      model.dimensions.performance = {
        score: scores.performance,
        gaps: buildPerformanceGaps(scanResult),
        lastUpdated: new Date().toISOString(),
      };
      model.dimensions.growthReadiness = {
        score: scores.growthReadiness,
        gaps: buildGrowthGaps(scanResult),
        lastUpdated: new Date().toISOString(),
      };
    } catch (err) {
      // Site scan failure — don't crash, just note it
      model.dimensions.performance.gaps.push(`Site scan failed: ${(err as Error).message}`);
    }
  }

  return model;
}

// ── Gap Builders ──────────────────────────────────────

function buildPerformanceGaps(scan: SiteScanResult): string[] {
  const gaps: string[] = [];
  if (scan.performance.ttfbMs && scan.performance.ttfbMs > 800) {
    gaps.push(`TTFB ${scan.performance.ttfbMs}ms exceeds 800ms target`);
  }
  if (!scan.performance.compressed) gaps.push('Response not compressed (no gzip/brotli)');
  if (!scan.performance.cacheControl) gaps.push('No Cache-Control header');
  if (!scan.security.https) gaps.push('Not served over HTTPS');
  return gaps;
}

function buildGrowthGaps(scan: SiteScanResult): string[] {
  const gaps: string[] = [];
  if (scan.growth.analyticsDetected.length === 0) gaps.push('No analytics detected');
  if (!scan.growth.socialMetaComplete) gaps.push('Incomplete social meta (OG/Twitter Card)');
  if (!scan.growth.emailCaptureDetected) gaps.push('No email capture form detected');
  if (!scan.seo.sitemapExists) gaps.push('No sitemap.xml');
  if (!scan.seo.jsonLd) gaps.push('No JSON-LD structured data');
  if (!scan.seo.description) gaps.push('Missing meta description');
  if (!scan.growth.cookieConsentDetected && scan.growth.analyticsDetected.length > 0) {
    gaps.push('Analytics present but no cookie consent banner');
  }
  return gaps;
}

// ── Cold Start Intake ─────────────────────────────────

interface IntakeResult {
  classification: ProjectClassification;
  situation: SituationModel;
  siteScan?: SiteScanResult;
  recommendedFirstAction: string;
}

/**
 * Cold start intake: classify the project, scan if deployed, create situation model.
 * Returns the initial situation and a recommended first action.
 */
export async function intake(projectName: string, projectDir: string = process.cwd()): Promise<IntakeResult> {
  const classification = await classifyProject();
  const model = createEmptyModel(projectName, classification.state);

  let siteScan: SiteScanResult | undefined;

  // Scan deployed site if available
  if (classification.deployedUrl) {
    try {
      siteScan = await scanSite(classification.deployedUrl);
      const scores = scoreScan(siteScan);
      model.lastSiteScan = siteScan;
      model.dimensions.performance.score = scores.performance;
      model.dimensions.performance.gaps = buildPerformanceGaps(siteScan);
      model.dimensions.growthReadiness.score = scores.growthReadiness;
      model.dimensions.growthReadiness.gaps = buildGrowthGaps(siteScan);
      model.dimensions.performance.lastUpdated = new Date().toISOString();
      model.dimensions.growthReadiness.lastUpdated = new Date().toISOString();
    } catch { /* scan failed — continue with empty scores */ }
  }

  model.deployedUrl = classification.deployedUrl;

  // Determine recommended first action based on state
  let recommendedFirstAction: string;
  switch (classification.state) {
    case 'GREENFIELD':
      recommendedFirstAction = 'Run /prd to create a PRD from your product description, then /campaign to build it.';
      break;
    case 'IDEA_PRD':
      recommendedFirstAction = 'PRD exists. Run /campaign to start building.';
      break;
    case 'PARTIAL':
      recommendedFirstAction = 'Code exists but not deployed. Run /campaign --resume to continue building, then deploy.';
      break;
    case 'DEPLOYED':
      recommendedFirstAction = siteScan
        ? `Site is live. Lowest dimension: ${findLowestDimension(model)}. Run /grow to start growth, or /current to get a full campaign proposal.`
        : 'Site is live. Run /current --scan for a full analysis.';
      break;
    case 'OPERATING':
      recommendedFirstAction = 'Revenue connected. Run /current for a data-driven campaign proposal.';
      break;
  }

  // Save the model
  await saveSituation(projectDir, model);

  return { classification, situation: model, siteScan, recommendedFirstAction };
}

function findLowestDimension(model: SituationModel): string {
  const dims = model.dimensions;
  let lowest = 'featureCompleteness';
  let lowestScore = dims.featureCompleteness.score;

  for (const [key, val] of Object.entries(dims)) {
    if (val.score < lowestScore) {
      lowestScore = val.score;
      lowest = key;
    }
  }

  const labels: Record<string, string> = {
    featureCompleteness: 'Feature Completeness',
    quality: 'Quality',
    performance: 'Performance',
    growthReadiness: 'Growth Readiness',
    revenuePotential: 'Revenue Potential',
  };

  return `${labels[lowest]} (${lowestScore}/100)`;
}

export type { ProjectState, ProjectClassification, SituationModel, DimensionScore, CampaignRecord, IntakeResult };
export { deepCurrentDir, situationPath, proposalsDir, predictionsPath, correlationsPath };
