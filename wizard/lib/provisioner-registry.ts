/**
 * Provisioner Registry — single source of truth for provisioner map,
 * credential scoping, and GitHub-linked target constants.
 *
 * ARCH-R2-002: Extracted from provision.ts + headless-deploy.ts to prevent drift.
 */

import type { Provisioner } from './provisioners/types.js';
import { dockerProvisioner } from './provisioners/docker.js';
import { awsVpsProvisioner } from './provisioners/aws-vps.js';
import { vercelProvisioner } from './provisioners/vercel.js';
import { railwayProvisioner } from './provisioners/railway.js';
import { cloudflareProvisioner } from './provisioners/cloudflare.js';
import { staticS3Provisioner } from './provisioners/static-s3.js';

/** All available provisioners keyed by deploy target name. */
export const provisioners: Record<string, Provisioner> = {
  docker: dockerProvisioner,
  vps: awsVpsProvisioner,
  vercel: vercelProvisioner,
  railway: railwayProvisioner,
  cloudflare: cloudflareProvisioner,
  static: staticS3Provisioner,
};

/** Credential scoping — each provisioner only receives vault keys it needs (ADR-020). */
export const provisionKeys: Record<string, string[]> = {
  vps: ['aws-access-key-id', 'aws-secret-access-key', 'aws-region'],
  static: ['aws-access-key-id', 'aws-secret-access-key', 'aws-region'],
  vercel: ['vercel-token'],
  railway: ['railway-token'],
  cloudflare: ['cloudflare-api-token', 'cloudflare-account-id'],
  docker: [],
};

/** Deploy targets that benefit from GitHub repo linking (ADR-015). */
export const GITHUB_LINKED_TARGETS = ['vercel', 'cloudflare', 'railway'];

/** Deploy targets where GitHub push is optional (deploy via SSH/SDK instead). */
export const GITHUB_OPTIONAL_TARGETS = ['vps', 'static'];
