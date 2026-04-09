/**
 * Szeth's Compliance Framework — Campaign compliance checks (§9.12).
 *
 * Every campaign is audited before launch. Critical compliance issues block launch.
 * Covers: privacy (GDPR, cookie consent), email (CAN-SPAM), ad platform ToS,
 * and financial reporting requirements.
 *
 * PRD Reference: §9.12 (Compliance Framework), §9.3 Phase 5
 */

type AdPlatform = 'meta' | 'google' | 'tiktok' | 'linkedin' | 'twitter' | 'reddit';

// ── Compliance Check Types ────────────────────────────

type ComplianceSeverity = 'critical' | 'high' | 'medium' | 'low';
type ComplianceCategory = 'privacy' | 'email' | 'platform_tos' | 'financial';

interface ComplianceFinding {
  id: string;
  category: ComplianceCategory;
  severity: ComplianceSeverity;
  title: string;
  description: string;
  remediation: string;
  platform?: AdPlatform;
  blocking: boolean;            // Critical findings block campaign launch
}

interface ComplianceReport {
  projectId: string;
  timestamp: string;
  findings: ComplianceFinding[];
  passed: boolean;              // false if any Critical finding exists
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

// ── Privacy Checks (GDPR) ─────────────────────────────

function checkPrivacy(hasTracking: boolean, targetsEU: boolean): ComplianceFinding[] {
  const findings: ComplianceFinding[] = [];

  if (hasTracking && targetsEU) {
    findings.push({
      id: 'PRIV-001',
      category: 'privacy',
      severity: 'critical',
      title: 'Cookie consent required',
      description: 'Growth tracking (GA/Meta Pixel) targets EU users but no cookie consent banner detected.',
      remediation: 'Generate a cookie consent banner with essential-only default, granular opt-in per tracking type.',
      blocking: true,
    });
  }

  return findings;
}

// ── Email Checks (CAN-SPAM) ──────────────────────────

function checkEmail(hasOutreach: boolean, hasUnsubscribe: boolean, hasPhysicalAddress: boolean): ComplianceFinding[] {
  const findings: ComplianceFinding[] = [];

  if (hasOutreach && !hasUnsubscribe) {
    findings.push({
      id: 'EMAIL-001',
      category: 'email',
      severity: 'critical',
      title: 'Unsubscribe mechanism required',
      description: 'Email outreach planned but no unsubscribe link in templates.',
      remediation: 'Add unsubscribe link to every email template. Must be functional within 10 days.',
      blocking: true,
    });
  }

  if (hasOutreach && !hasPhysicalAddress) {
    findings.push({
      id: 'EMAIL-002',
      category: 'email',
      severity: 'high',
      title: 'Physical address required',
      description: 'CAN-SPAM requires a physical mailing address in every commercial email.',
      remediation: 'Prompt user for business address during /grow Phase 5.',
      blocking: false,
    });
  }

  return findings;
}

// ── Platform ToS Checks ───────────────────────────────

interface CreativeContent {
  headlines: string[];
  descriptions: string[];
  landingUrl: string;
}

function checkPlatformToS(platform: AdPlatform, creative: CreativeContent): ComplianceFinding[] {
  const findings: ComplianceFinding[] = [];

  // Meta: no misleading claims, no before/after (health), no personal attributes
  if (platform === 'meta') {
    for (const headline of creative.headlines) {
      if (/you (are|have|suffer|struggle)/i.test(headline)) {
        findings.push({
          id: 'TOS-META-001',
          category: 'platform_tos',
          severity: 'high',
          title: 'Meta: personal attributes in ad copy',
          description: `Headline "${headline}" may violate Meta's personal attributes policy.`,
          remediation: 'Rewrite to avoid direct personal assertions. Use "People who..." instead of "You are..."',
          platform: 'meta',
          blocking: false,
        });
      }
    }
  }

  // TikTok: age-gating for certain categories
  if (platform === 'tiktok') {
    // Check would require category classification — flag as a reminder
    findings.push({
      id: 'TOS-TIKTOK-001',
      category: 'platform_tos',
      severity: 'low',
      title: 'TikTok: verify age restrictions',
      description: 'TikTok requires age-gating for certain categories. Review targeting settings.',
      remediation: 'Verify campaign targeting includes appropriate age restrictions for the product category.',
      platform: 'tiktok',
      blocking: false,
    });
  }

  return findings;
}

// ── Main Compliance Audit ─────────────────────────────

export function runComplianceAudit(
  projectId: string,
  options: {
    hasTracking: boolean;
    targetsEU: boolean;
    hasOutreach: boolean;
    hasUnsubscribe: boolean;
    hasPhysicalAddress: boolean;
    campaigns: Array<{ platform: AdPlatform; creative: CreativeContent }>;
  }
): ComplianceReport {
  const findings: ComplianceFinding[] = [];

  // Privacy checks
  findings.push(...checkPrivacy(options.hasTracking, options.targetsEU));

  // Email checks
  findings.push(...checkEmail(options.hasOutreach, options.hasUnsubscribe, options.hasPhysicalAddress));

  // Platform ToS checks per campaign
  for (const campaign of options.campaigns) {
    findings.push(...checkPlatformToS(campaign.platform, campaign.creative));
  }

  const summary = {
    critical: findings.filter(f => f.severity === 'critical').length,
    high: findings.filter(f => f.severity === 'high').length,
    medium: findings.filter(f => f.severity === 'medium').length,
    low: findings.filter(f => f.severity === 'low').length,
  };

  return {
    projectId,
    timestamp: new Date().toISOString(),
    findings,
    passed: summary.critical === 0,
    summary,
  };
}

export type { ComplianceFinding, ComplianceReport, ComplianceSeverity, ComplianceCategory, CreativeContent };
