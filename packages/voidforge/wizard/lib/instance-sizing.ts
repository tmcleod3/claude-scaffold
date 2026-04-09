/**
 * EC2 instance type recommendation based on PRD scope signals.
 * Pure function — no side effects, no AWS calls.
 */

export const VALID_INSTANCE_TYPES = ['t3.micro', 't3.small', 't3.medium', 't3.large'] as const;
export type InstanceType = typeof VALID_INSTANCE_TYPES[number];

export interface SizingInput {
  type?: string;       // full-stack | api-only | static-site | prototype
  framework?: string;  // next.js | django | rails | express
  database?: string;   // postgres | mysql | sqlite | mongodb | none
  cache?: string;      // redis | none
  workers?: string;    // yes | no
  payments?: string;   // stripe | lemonsqueezy | none
}

/**
 * Recommend an EC2 instance type based on PRD signals.
 * Never auto-recommends above t3.medium (cost protection).
 */
export function recommendInstanceType(input: SizingInput): InstanceType {
  // Static sites and prototypes always get micro
  if (input.type === 'static-site' || input.type === 'prototype') {
    return 't3.micro';
  }

  let score = 0;

  if (input.database === 'postgres' || input.database === 'mysql') score++;
  if (input.cache === 'redis') score++;
  if (input.workers === 'yes') score++;
  if (input.payments === 'stripe' || input.payments === 'lemonsqueezy') score++;
  if (input.framework === 'next.js') score++; // SSR is memory-hungry

  if (score >= 4) return 't3.medium';
  if (score >= 2) return 't3.small';
  return 't3.micro';
}

/** Map EC2 instance type to matching RDS instance class. */
export function rdsInstanceClass(instanceType: InstanceType): string {
  return `db.${instanceType}`;
}

/** Map EC2 instance type to matching ElastiCache node type. */
export function cacheNodeType(instanceType: InstanceType): string {
  return `cache.${instanceType}`;
}

/** Recommended swap size in GB based on instance memory. */
export function swapSizeGb(instanceType: InstanceType): number {
  switch (instanceType) {
    case 't3.micro': return 2;
    case 't3.small': return 2;
    case 't3.medium': return 1;
    case 't3.large': return 0;
  }
}

export function isValidInstanceType(value: string): value is InstanceType {
  return (VALID_INSTANCE_TYPES as readonly string[]).includes(value);
}
