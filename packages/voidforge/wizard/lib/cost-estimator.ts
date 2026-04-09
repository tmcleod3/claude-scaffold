/**
 * AWS cost estimation before provisioning (ADR-022).
 * Rough monthly cost estimate based on instance type, database, and cache.
 * On-demand pricing — no reserved/spot. Informational only.
 */

import type { ProvisionEmitter } from './provisioners/types.js';

/** Monthly on-demand pricing (us-east-1, USD). Approximate as of 2025. */
const EC2_MONTHLY: Record<string, number> = {
  't3.micro': 8.50,
  't3.small': 17.00,
  't3.medium': 34.00,
  't3.large': 67.00,
};

const RDS_MONTHLY: Record<string, number> = {
  'db.t3.micro': 13.00,
  'db.t3.small': 26.00,
  'db.t3.medium': 52.00,
  'db.t3.large': 104.00,
};

const CACHE_MONTHLY: Record<string, number> = {
  'cache.t3.micro': 12.00,
  'cache.t3.small': 24.00,
  'cache.t3.medium': 48.00,
  'cache.t3.large': 96.00,
};

/** S3 static hosting — rough estimate for a small site. */
const S3_MONTHLY_BASE = 1.00;

export interface CostEstimate {
  total: number;
  breakdown: { item: string; monthly: number }[];
}

/**
 * Estimate monthly AWS cost for a provisioning request.
 * Returns null for non-AWS targets.
 */
export function estimateCost(
  deployTarget: string,
  instanceType: string,
  database: string,
  cache: string,
): CostEstimate | null {
  if (deployTarget === 'vps') {
    const breakdown: { item: string; monthly: number }[] = [];
    const ec2Cost = EC2_MONTHLY[instanceType] || EC2_MONTHLY['t3.micro'];
    breakdown.push({ item: `EC2 ${instanceType}`, monthly: ec2Cost });

    if (database === 'postgres' || database === 'mysql') {
      const rdsClass = `db.${instanceType}`;
      const rdsCost = RDS_MONTHLY[rdsClass] || RDS_MONTHLY['db.t3.micro'];
      breakdown.push({ item: `RDS ${rdsClass} (${database})`, monthly: rdsCost });
    }

    if (cache === 'redis') {
      const cacheType = `cache.${instanceType}`;
      const cacheCost = CACHE_MONTHLY[cacheType] || CACHE_MONTHLY['cache.t3.micro'];
      breakdown.push({ item: `ElastiCache ${cacheType}`, monthly: cacheCost });
    }

    const total = breakdown.reduce((sum, b) => sum + b.monthly, 0);
    return { total, breakdown };
  }

  if (deployTarget === 'static') {
    return {
      total: S3_MONTHLY_BASE,
      breakdown: [{ item: 'S3 static hosting + data transfer', monthly: S3_MONTHLY_BASE }],
    };
  }

  // Non-AWS targets — no cost estimate
  return null;
}

/**
 * Emit a cost estimation SSE event before provisioning.
 */
export function emitCostEstimate(
  deployTarget: string,
  instanceType: string,
  database: string,
  cache: string,
  emit: ProvisionEmitter,
): void {
  const estimate = estimateCost(deployTarget, instanceType, database, cache);

  if (!estimate) {
    if (['vercel', 'railway', 'cloudflare'].includes(deployTarget)) {
      emit({ step: 'cost-estimate', status: 'done', message: `${deployTarget} pricing is usage-based — check their pricing page for details` });
    }
    return;
  }

  const lines = estimate.breakdown.map(b => `${b.item}: ~$${b.monthly.toFixed(2)}/mo`);
  const message = `Estimated AWS cost: ~$${estimate.total.toFixed(2)}/month (${lines.join(', ')})`;

  emit({ step: 'cost-estimate', status: 'done', message });
}
