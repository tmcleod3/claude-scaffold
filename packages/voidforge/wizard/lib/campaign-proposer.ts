/**
 * Tuvok's Campaign Proposer — generates data-driven campaign proposals (v12.1).
 *
 * Takes the situation model (with Seven's gap analysis) and generates a
 * complete campaign proposal: name, missions, predicted impact, risk, alternatives.
 *
 * PRD Reference: ROADMAP v12.1, DEEP_CURRENT.md PROPOSE step
 */

import { mkdir, writeFile as writeFileAsync } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import type { SituationModel } from './deep-current.js';
import { proposalsDir } from './deep-current.js';
import { findProjectRoot } from './marker.js';
import { findWeakestDimension } from './gap-analysis.js';

// ── Proposal Types ────────────────────────────────────

interface CampaignProposal {
  id: string;
  name: string;
  generatedAt: string;
  trigger: string;             // What signal caused this proposal
  dimension: string;           // Which dimension is being addressed
  dimensionScore: number;      // Current score
  theCase: string;             // Data-backed reasoning
  missions: ProposedMission[];
  expectedImpact: string;      // Quantified prediction
  riskAssessment: string;
  alternativesConsidered: string[];
  autonomyRecommendation: 1 | 2 | 3;
  estimatedSessions: number;
}

interface ProposedMission {
  number: number;
  name: string;
  objective: string;
  estimatedFiles: number;
}

// ── Proposal Templates Per Dimension ──────────────────

function proposeForFeatureCompleteness(model: SituationModel): CampaignProposal {
  const weakest = findWeakestDimension(model);
  return {
    id: randomUUID(),
    name: 'Feature Sprint',
    generatedAt: new Date().toISOString(),
    trigger: `Feature completeness score ${weakest.score}/100 is the lowest dimension`,
    dimension: 'featureCompleteness',
    dimensionScore: weakest.score,
    theCase: `The project has significant PRD requirements that are not yet implemented. ${weakest.gaps.join('. ')}. Building core features will increase the product's value proposition and move toward a shippable state.`,
    missions: [
      { number: 1, name: 'Core Feature Build', objective: 'Implement the highest-priority unbuilt PRD features', estimatedFiles: 15 },
      { number: 2, name: 'Supporting Features', objective: 'Build supporting features that depend on core', estimatedFiles: 10 },
      { number: 3, name: 'Integration Wiring', objective: 'Connect new features to existing infrastructure', estimatedFiles: 5 },
    ],
    expectedImpact: `Feature completeness +${Math.min(30, 100 - weakest.score)} points. PRD coverage from ${weakest.score}% to ~${Math.min(100, weakest.score + 30)}%.`,
    riskAssessment: 'New features may introduce bugs. Victory Gauntlet will catch them.',
    alternativesConsidered: ['Focus on quality first (gauntlet findings)', 'Focus on growth (marketing before features)'],
    autonomyRecommendation: 1, // Feature builds need human judgment
    estimatedSessions: 2,
  };
}

function proposeForQuality(model: SituationModel): CampaignProposal {
  const dim = model.dimensions.quality;
  return {
    id: randomUUID(),
    name: 'Quality Hardening',
    generatedAt: new Date().toISOString(),
    trigger: `Quality score ${dim.score}/100 is the lowest dimension`,
    dimension: 'quality',
    dimensionScore: dim.score,
    theCase: `The project has quality gaps that risk user trust and developer velocity. ${dim.gaps.join('. ')}. Investing in testing, fixing gauntlet findings, and establishing quality baselines will pay dividends in every future campaign.`,
    missions: [
      { number: 1, name: 'Test Coverage', objective: 'Write missing unit and integration tests', estimatedFiles: 20 },
      { number: 2, name: 'Finding Resolution', objective: 'Fix outstanding gauntlet and review findings', estimatedFiles: 10 },
      { number: 3, name: 'Quality Gates', objective: 'Establish CI/CD quality checks', estimatedFiles: 5 },
    ],
    expectedImpact: `Quality score +${Math.min(25, 100 - dim.score)} points. Test coverage increase. Gauntlet findings resolved.`,
    riskAssessment: 'Quality campaigns have low risk. Tests protect against regressions.',
    alternativesConsidered: ['Ship features first, quality later (technical debt risk)', 'Focus on performance instead'],
    autonomyRecommendation: 2, // Quality campaigns are safe to auto-execute
    estimatedSessions: 2,
  };
}

function proposeForPerformance(model: SituationModel): CampaignProposal {
  const dim = model.dimensions.performance;
  const scan = model.lastSiteScan;
  return {
    id: randomUUID(),
    name: 'Performance Optimization',
    generatedAt: new Date().toISOString(),
    trigger: `Performance score ${dim.score}/100 is the lowest dimension`,
    dimension: 'performance',
    dimensionScore: dim.score,
    theCase: `The deployed site has performance issues that affect user experience and SEO rankings. ${dim.gaps.join('. ')}. ${scan?.performance.ttfbMs ? `TTFB is ${scan.performance.ttfbMs}ms.` : ''} Improving Core Web Vitals will increase search rankings and reduce bounce rates.`,
    missions: [
      { number: 1, name: 'Core Web Vitals', objective: 'Fix LCP, CLS, and FID issues', estimatedFiles: 10 },
      { number: 2, name: 'Asset Optimization', objective: 'Compression, caching, image optimization', estimatedFiles: 5 },
    ],
    expectedImpact: `Performance score +${Math.min(30, 100 - dim.score)} points. Estimated +10-20% search visibility from CWV improvements.`,
    riskAssessment: 'Performance changes can break layouts. Visual regression testing recommended.',
    alternativesConsidered: ['Focus on growth instead (marketing over performance)', 'Focus on features'],
    autonomyRecommendation: 2, // Performance fixes are usually safe
    estimatedSessions: 1,
  };
}

function proposeForGrowthReadiness(model: SituationModel): CampaignProposal {
  const dim = model.dimensions.growthReadiness;
  return {
    id: randomUUID(),
    name: 'Growth Foundation',
    generatedAt: new Date().toISOString(),
    trigger: `Growth readiness score ${dim.score}/100 is the lowest dimension`,
    dimension: 'growthReadiness',
    dimensionScore: dim.score,
    theCase: `The project lacks growth infrastructure. ${dim.gaps.join('. ')}. Without analytics, SEO, and conversion paths, no amount of traffic will translate to results. This is the foundation that all growth campaigns build on.`,
    missions: [
      { number: 1, name: 'Analytics + SEO Foundation', objective: 'Install analytics, meta tags, sitemap, JSON-LD', estimatedFiles: 8 },
      { number: 2, name: 'Conversion Paths', objective: 'Email capture, CTAs, social proof', estimatedFiles: 6 },
      { number: 3, name: 'Content Foundation', objective: 'Blog setup, landing page optimization', estimatedFiles: 10 },
    ],
    expectedImpact: `Growth readiness +${Math.min(35, 100 - dim.score)} points. Analytics baseline established. Organic traffic pipeline started.`,
    riskAssessment: 'Low risk. Growth foundation is additive — no existing features are modified.',
    alternativesConsidered: ['Run /grow directly (requires deployed site)', 'Focus on revenue first'],
    autonomyRecommendation: 1, // Growth strategy needs human input
    estimatedSessions: 2,
  };
}

function proposeForRevenuePotential(model: SituationModel): CampaignProposal {
  const dim = model.dimensions.revenuePotential;
  return {
    id: randomUUID(),
    name: 'Revenue Infrastructure',
    generatedAt: new Date().toISOString(),
    trigger: `Revenue potential score ${dim.score}/100 is the lowest dimension`,
    dimension: 'revenuePotential',
    dimensionScore: dim.score,
    theCase: `The project has limited revenue infrastructure. ${dim.gaps.join('. ')}. Connecting payment processing, setting up pricing pages, and establishing revenue tracking will enable monetization.`,
    missions: [
      { number: 1, name: 'Payment Integration', objective: 'Stripe/Paddle setup, checkout flow', estimatedFiles: 12 },
      { number: 2, name: 'Pricing + Plans', objective: 'Pricing page, plan tiers, billing management', estimatedFiles: 8 },
      { number: 3, name: 'Treasury Setup', objective: 'Revenue tracking, reconciliation, /treasury connection', estimatedFiles: 5 },
    ],
    expectedImpact: `Revenue potential +${Math.min(30, 100 - dim.score)} points. Payment pipeline established. Revenue tracking active.`,
    riskAssessment: 'Payment integration involves real money. Requires thorough testing and security review.',
    alternativesConsidered: ['Focus on growth first (users before revenue)', 'Focus on features'],
    autonomyRecommendation: 1, // Revenue/payment changes need human oversight
    estimatedSessions: 2,
  };
}

// ── Main Proposal Generator ───────────────────────────

const DIMENSION_PROPOSERS: Record<string, (model: SituationModel) => CampaignProposal> = {
  'Feature Completeness': proposeForFeatureCompleteness,
  'Quality': proposeForQuality,
  'Performance': proposeForPerformance,
  'Growth Readiness': proposeForGrowthReadiness,
  'Revenue Potential': proposeForRevenuePotential,
};

/**
 * Generate a campaign proposal targeting the weakest dimension.
 */
export function generateProposal(model: SituationModel): CampaignProposal {
  const weakest = findWeakestDimension(model);
  const proposer = DIMENSION_PROPOSERS[weakest.name];
  if (!proposer) return proposeForFeatureCompleteness(model); // fallback
  return proposer(model);
}

/**
 * Save a proposal to disk as markdown.
 */
export async function saveProposal(proposal: CampaignProposal): Promise<string> {
  await mkdir(proposalsDir(findProjectRoot() ?? process.cwd()), { recursive: true });
  const date = new Date().toISOString().split('T')[0];
  const slug = proposal.name.toLowerCase().replace(/\s+/g, '-');
  const filename = `${date}-${slug}.md`;
  const filepath = join(proposalsDir(findProjectRoot() ?? process.cwd()), filename);

  const content = `# Campaign Proposal — ${proposal.name}
## Generated by: The Deep Current (Tuvok)
## Date: ${proposal.generatedAt}
## Trigger: ${proposal.trigger}

### The Case
${proposal.theCase}

### Missions
${proposal.missions.map(m => `${m.number}. **${m.name}** — ${m.objective} (~${m.estimatedFiles} files)`).join('\n')}

### Expected Impact
${proposal.expectedImpact}

### Risk Assessment
${proposal.riskAssessment}

### Alternatives Considered
${proposal.alternativesConsidered.map(a => `- ${a}`).join('\n')}

### Autonomy Recommendation
Tier ${proposal.autonomyRecommendation} — ${proposal.autonomyRecommendation === 1 ? 'Human approval required' : proposal.autonomyRecommendation === 2 ? 'Supervised autonomy (24h delay)' : 'Full autonomy'}

### Estimated Effort
${proposal.estimatedSessions} session(s)
`;

  await writeFileAsync(filepath, content);
  return filepath;
}

export type { CampaignProposal, ProposedMission };
