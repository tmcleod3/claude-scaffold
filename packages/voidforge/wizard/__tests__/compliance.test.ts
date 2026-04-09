/**
 * Compliance tests — GDPR, CAN-SPAM, platform ToS checks.
 * Tier 1: Campaign compliance gate — blocks launch on critical findings.
 */

import { describe, it, expect } from 'vitest';

// No file I/O — pure functions, direct import
const compliance = await import('../lib/compliance.js');

describe('runComplianceAudit — privacy checks', () => {
  it('should flag GDPR cookie consent for EU-targeted tracking', () => {
    const report = compliance.runComplianceAudit('proj-1', {
      hasTracking: true,
      targetsEU: true,
      hasOutreach: false,
      hasUnsubscribe: false,
      hasPhysicalAddress: false,
      campaigns: [],
    });
    expect(report.passed).toBe(false);
    expect(report.summary.critical).toBeGreaterThanOrEqual(1);
    const gdprFinding = report.findings.find(f => f.id === 'PRIV-001');
    expect(gdprFinding).toBeDefined();
    expect(gdprFinding!.severity).toBe('critical');
    expect(gdprFinding!.blocking).toBe(true);
    expect(gdprFinding!.category).toBe('privacy');
  });

  it('should pass privacy when not targeting EU', () => {
    const report = compliance.runComplianceAudit('proj-2', {
      hasTracking: true,
      targetsEU: false,
      hasOutreach: false,
      hasUnsubscribe: false,
      hasPhysicalAddress: false,
      campaigns: [],
    });
    const gdprFinding = report.findings.find(f => f.id === 'PRIV-001');
    expect(gdprFinding).toBeUndefined();
  });

  it('should pass privacy when no tracking', () => {
    const report = compliance.runComplianceAudit('proj-3', {
      hasTracking: false,
      targetsEU: true,
      hasOutreach: false,
      hasUnsubscribe: false,
      hasPhysicalAddress: false,
      campaigns: [],
    });
    const gdprFinding = report.findings.find(f => f.id === 'PRIV-001');
    expect(gdprFinding).toBeUndefined();
  });
});

describe('runComplianceAudit — email checks', () => {
  it('should flag missing unsubscribe for email outreach', () => {
    const report = compliance.runComplianceAudit('proj-email-1', {
      hasTracking: false,
      targetsEU: false,
      hasOutreach: true,
      hasUnsubscribe: false,
      hasPhysicalAddress: true,
      campaigns: [],
    });
    expect(report.passed).toBe(false);
    const finding = report.findings.find(f => f.id === 'EMAIL-001');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('critical');
    expect(finding!.blocking).toBe(true);
  });

  it('should pass email when unsubscribe is present', () => {
    const report = compliance.runComplianceAudit('proj-email-2', {
      hasTracking: false,
      targetsEU: false,
      hasOutreach: true,
      hasUnsubscribe: true,
      hasPhysicalAddress: true,
      campaigns: [],
    });
    const finding = report.findings.find(f => f.id === 'EMAIL-001');
    expect(finding).toBeUndefined();
  });

  it('should flag missing physical address (high, not critical)', () => {
    const report = compliance.runComplianceAudit('proj-email-3', {
      hasTracking: false,
      targetsEU: false,
      hasOutreach: true,
      hasUnsubscribe: true,
      hasPhysicalAddress: false,
      campaigns: [],
    });
    const finding = report.findings.find(f => f.id === 'EMAIL-002');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('high');
    expect(finding!.blocking).toBe(false);
    // Should still pass (high is not blocking)
    expect(report.passed).toBe(true);
  });

  it('should not flag email when no outreach', () => {
    const report = compliance.runComplianceAudit('proj-email-4', {
      hasTracking: false,
      targetsEU: false,
      hasOutreach: false,
      hasUnsubscribe: false,
      hasPhysicalAddress: false,
      campaigns: [],
    });
    expect(report.findings.filter(f => f.category === 'email')).toHaveLength(0);
  });
});

describe('runComplianceAudit — platform ToS checks', () => {
  it('should flag Meta personal attributes in ad copy', () => {
    const report = compliance.runComplianceAudit('proj-meta-1', {
      hasTracking: false,
      targetsEU: false,
      hasOutreach: false,
      hasUnsubscribe: false,
      hasPhysicalAddress: false,
      campaigns: [
        {
          platform: 'meta',
          creative: {
            headlines: ['You are struggling with debt'],
            descriptions: ['We can help'],
            landingUrl: 'https://example.com',
          },
        },
      ],
    });
    const finding = report.findings.find(f => f.id === 'TOS-META-001');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('high');
    expect(finding!.platform).toBe('meta');
  });

  it('should pass Meta when no personal attributes', () => {
    const report = compliance.runComplianceAudit('proj-meta-2', {
      hasTracking: false,
      targetsEU: false,
      hasOutreach: false,
      hasUnsubscribe: false,
      hasPhysicalAddress: false,
      campaigns: [
        {
          platform: 'meta',
          creative: {
            headlines: ['Save money on your next purchase'],
            descriptions: ['Great deals available'],
            landingUrl: 'https://example.com',
          },
        },
      ],
    });
    const finding = report.findings.find(f => f.id === 'TOS-META-001');
    expect(finding).toBeUndefined();
  });

  it('should flag TikTok age verification reminder', () => {
    const report = compliance.runComplianceAudit('proj-tiktok-1', {
      hasTracking: false,
      targetsEU: false,
      hasOutreach: false,
      hasUnsubscribe: false,
      hasPhysicalAddress: false,
      campaigns: [
        {
          platform: 'tiktok',
          creative: {
            headlines: ['Try our new app'],
            descriptions: ['Download now'],
            landingUrl: 'https://example.com',
          },
        },
      ],
    });
    const finding = report.findings.find(f => f.id === 'TOS-TIKTOK-001');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('low');
    expect(finding!.platform).toBe('tiktok');
  });
});

describe('runComplianceAudit — report structure', () => {
  it('should produce a well-formed report with summary', () => {
    const report = compliance.runComplianceAudit('proj-report', {
      hasTracking: true,
      targetsEU: true,
      hasOutreach: true,
      hasUnsubscribe: false,
      hasPhysicalAddress: false,
      campaigns: [
        {
          platform: 'meta',
          creative: {
            headlines: ['You have been chosen'],
            descriptions: ['Special offer'],
            landingUrl: 'https://example.com',
          },
        },
      ],
    });
    expect(report.projectId).toBe('proj-report');
    expect(report.timestamp).toBeDefined();
    expect(report.passed).toBe(false);
    expect(report.summary.critical).toBeGreaterThanOrEqual(2); // PRIV-001 + EMAIL-001
    expect(report.summary.high).toBeGreaterThanOrEqual(1);     // EMAIL-002 or TOS-META-001
    expect(report.findings.length).toBeGreaterThanOrEqual(3);
  });

  it('should pass when everything is compliant', () => {
    const report = compliance.runComplianceAudit('proj-clean', {
      hasTracking: false,
      targetsEU: false,
      hasOutreach: false,
      hasUnsubscribe: false,
      hasPhysicalAddress: false,
      campaigns: [],
    });
    expect(report.passed).toBe(true);
    expect(report.summary.critical).toBe(0);
    expect(report.findings).toHaveLength(0);
  });
});
