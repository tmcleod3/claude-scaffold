/**
 * AWS provisioner — shared configuration, utilities, and SDK loading.
 */

import type { ProvisionContext, ProvisionEmitter, CreatedResource } from './types.js';
import { isValidInstanceType } from '../instance-sizing.js';

export const POLL_INTERVAL_MS = 5000;
export const MAX_POLL_MS = 300000; // 5 minutes

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function cancellableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Aborted')); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('Aborted')); }, { once: true });
  });
}

export interface AwsConfig {
  region: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
}

export function buildAwsConfig(ctx: ProvisionContext): AwsConfig {
  return {
    region: ctx.credentials['aws-region'] || 'us-east-1',
    credentials: {
      accessKeyId: ctx.credentials['aws-access-key-id'],
      secretAccessKey: ctx.credentials['aws-secret-access-key'],
    },
  };
}

export function validateAwsContext(ctx: ProvisionContext): string[] {
  const errors: string[] = [];
  if (!ctx.projectDir) errors.push('Project directory is required');
  if (!ctx.projectName) errors.push('Project name is required');
  if (!ctx.credentials['aws-access-key-id']) errors.push('AWS Access Key ID is required');
  if (!ctx.credentials['aws-secret-access-key']) errors.push('AWS Secret Access Key is required');
  if (ctx.instanceType && !isValidInstanceType(ctx.instanceType)) {
    errors.push(`Invalid instance type: "${ctx.instanceType}". Must be one of: t3.micro, t3.small, t3.medium, t3.large`);
  }
  return errors;
}

/** Dynamic import of AWS EC2 + STS SDK modules. Returns null with error message on failure. */
export async function loadAwsSdk(): Promise<{
  ec2Mod: typeof import('@aws-sdk/client-ec2');
  stsMod: typeof import('@aws-sdk/client-sts');
} | { error: string }> {
  try {
    const ec2Mod = await import('@aws-sdk/client-ec2');
    const stsMod = await import('@aws-sdk/client-sts');
    return { ec2Mod, stsMod };
  } catch {
    return {
      error: 'AWS SDK not installed. Run: npm install @aws-sdk/client-ec2 @aws-sdk/client-sts @aws-sdk/client-rds @aws-sdk/client-elasticache',
    };
  }
}

/** Result bag passed between provisioning phases. */
export interface AwsProvisionState {
  resources: CreatedResource[];
  outputs: Record<string, string>;
  files: string[];
  region: string;
  slug: string;
  sgId: string;
  instanceId: string;
  publicIp: string;
  awsConfig: AwsConfig;
}
