/**
 * Static S3 provisioner — creates real S3 bucket configured for static hosting + deploy script.
 * Reuses the same AWS credentials as the VPS provisioner.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Provisioner, ProvisionContext, ProvisionEmitter, ProvisionResult, CreatedResource } from './types.js';
import { recordResourcePending, recordResourceCreated } from '../provision-manifest.js';
import { slugify } from './http-client.js';
import { appendEnvSection } from '../env-writer.js';

export const staticS3Provisioner: Provisioner = {
  async validate(ctx: ProvisionContext): Promise<string[]> {
    const errors: string[] = [];
    if (!ctx.projectDir) errors.push('Project directory is required');
    if (!ctx.credentials['aws-access-key-id']) errors.push('AWS Access Key ID is required');
    if (!ctx.credentials['aws-secret-access-key']) errors.push('AWS Secret Access Key is required');
    return errors;
  },

  async provision(ctx: ProvisionContext, emit: ProvisionEmitter): Promise<ProvisionResult> {
    const files: string[] = [];
    const resources: CreatedResource[] = [];
    const outputs: Record<string, string> = {};
    const region = ctx.credentials['aws-region'] || 'us-east-1';
    const slug = slugify(ctx.projectName);
    const bucketName = `${slug}-site`;

    // Dynamic import of AWS SDK
    let S3Client: typeof import('@aws-sdk/client-s3').S3Client;
    let s3Commands: typeof import('@aws-sdk/client-s3');
    let STSClient: typeof import('@aws-sdk/client-sts').STSClient;
    let GetCallerIdentityCommand: typeof import('@aws-sdk/client-sts').GetCallerIdentityCommand;

    try {
      const s3Mod = await import('@aws-sdk/client-s3');
      const stsMod = await import('@aws-sdk/client-sts');
      S3Client = s3Mod.S3Client;
      s3Commands = s3Mod;
      STSClient = stsMod.STSClient;
      GetCallerIdentityCommand = stsMod.GetCallerIdentityCommand;
    } catch {
      return {
        success: false, resources, outputs, files,
        error: 'AWS SDK not installed. Run: npm install @aws-sdk/client-s3 @aws-sdk/client-sts',
      };
    }

    const awsConfig = {
      region,
      credentials: {
        accessKeyId: ctx.credentials['aws-access-key-id'],
        secretAccessKey: ctx.credentials['aws-secret-access-key'],
      },
    };

    const s3 = new S3Client(awsConfig);
    const sts = new STSClient(awsConfig);

    // Step 1: Validate credentials
    emit({ step: 'validate-creds', status: 'started', message: 'Validating AWS credentials' });
    try {
      const identity = await sts.send(new GetCallerIdentityCommand({}));
      emit({ step: 'validate-creds', status: 'done', message: `Authenticated as ${identity.Arn}` });
    } catch (err) {
      emit({ step: 'validate-creds', status: 'error', message: 'Invalid AWS credentials', detail: (err as Error).message });
      return { success: false, resources, outputs, files, error: 'AWS credential validation failed' };
    }

    // Step 2: Create S3 bucket
    emit({ step: 's3-bucket', status: 'started', message: `Creating S3 bucket "${bucketName}"` });
    try {
      await recordResourcePending(ctx.runId, 's3-bucket', bucketName, region);

      // us-east-1 doesn't accept LocationConstraint
      const createInput: ConstructorParameters<typeof s3Commands.CreateBucketCommand>[0] = { Bucket: bucketName };
      if (region !== 'us-east-1') {
        createInput.CreateBucketConfiguration = {
          LocationConstraint: region as 'us-east-2',  // Cast to enum — SDK accepts any valid region string at runtime
        };
      }

      await s3.send(new s3Commands.CreateBucketCommand(createInput));
      resources.push({ type: 's3-bucket', id: bucketName, region });
      await recordResourceCreated(ctx.runId, 's3-bucket', bucketName, region);
      emit({ step: 's3-bucket', status: 'done', message: `Bucket "${bucketName}" created` });
    } catch (err) {
      const msg = (err as Error).message || '';
      if (msg.includes('BucketAlreadyOwnedByYou')) {
        emit({ step: 's3-bucket', status: 'done', message: `Bucket "${bucketName}" already exists — using it` });
        resources.push({ type: 's3-bucket', id: bucketName, region });
        await recordResourceCreated(ctx.runId, 's3-bucket', bucketName, region);
      } else if (msg.includes('BucketAlreadyExists')) {
        emit({ step: 's3-bucket', status: 'error', message: `Bucket name "${bucketName}" is taken by another AWS account`, detail: 'Use a more unique project name to generate a different bucket name' });
        return { success: false, resources, outputs, files, error: `S3 bucket name "${bucketName}" is globally taken` };
      } else {
        emit({ step: 's3-bucket', status: 'error', message: 'Failed to create S3 bucket', detail: msg });
        return { success: false, resources, outputs, files, error: msg };
      }
    }

    // Step 3: Configure bucket for static website hosting
    emit({ step: 's3-website', status: 'started', message: 'Configuring static website hosting' });
    try {
      await s3.send(new s3Commands.PutBucketWebsiteCommand({
        Bucket: bucketName,
        WebsiteConfiguration: {
          IndexDocument: { Suffix: 'index.html' },
          ErrorDocument: { Key: 'index.html' },  // SPA fallback
        },
      }));

      // Set public access policy
      await s3.send(new s3Commands.DeletePublicAccessBlockCommand({ Bucket: bucketName }));
      await s3.send(new s3Commands.PutBucketPolicyCommand({
        Bucket: bucketName,
        Policy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [{
            Sid: 'PublicReadGetObject',
            Effect: 'Allow',
            Principal: '*',
            Action: 's3:GetObject',
            Resource: `arn:aws:s3:::${bucketName}/*`,
          }],
        }),
      }));

      const websiteUrl = region === 'us-east-1'
        ? `http://${bucketName}.s3-website-${region}.amazonaws.com`
        : `http://${bucketName}.s3-website.${region}.amazonaws.com`;

      outputs['S3_BUCKET'] = bucketName;
      outputs['S3_WEBSITE_URL'] = websiteUrl;
      emit({ step: 's3-website', status: 'done', message: `Static hosting enabled — ${websiteUrl}` });
    } catch (err) {
      emit({ step: 's3-website', status: 'error', message: 'Failed to configure website hosting', detail: (err as Error).message });
      // Non-fatal — bucket exists, user can configure manually
    }

    // Step 4: Generate deploy script
    emit({ step: 's3-script', status: 'started', message: 'Generating deploy script' });
    try {
      const infraDir = join(ctx.projectDir, 'infra');
      await mkdir(infraDir, { recursive: true });

      const deployScript = `#!/usr/bin/env bash
# deploy-s3.sh — Deploy static site to S3
# Generated by VoidForge
set -euo pipefail

BUCKET="\${S3_BUCKET:-${bucketName}}"
BUILD_DIR="\${BUILD_DIR:-dist}"

echo "=== Deploying to S3 bucket: $BUCKET ==="

# Sync build output to S3
aws s3 sync "$BUILD_DIR" "s3://$BUCKET" \\
  --delete \\
  --cache-control "public, max-age=31536000, immutable" \\
  --exclude "*.html" \\
  --exclude "sw.js" \\
  --exclude "manifest.json"

# HTML and service worker files with short cache
aws s3 sync "$BUILD_DIR" "s3://$BUCKET" \\
  --cache-control "public, max-age=0, must-revalidate" \\
  --exclude '*' \\
  --include "*.html" \\
  --include "sw.js" \\
  --include "manifest.json"

echo ""
echo "=== Deploy complete ==="
echo "Site: ${outputs['S3_WEBSITE_URL'] || `http://$BUCKET.s3-website.amazonaws.com`}"
`;

      await writeFile(join(infraDir, 'deploy-s3.sh'), deployScript, { mode: 0o755 });
      files.push('infra/deploy-s3.sh');
      emit({ step: 's3-script', status: 'done', message: 'Generated infra/deploy-s3.sh' });
    } catch (err) {
      emit({ step: 's3-script', status: 'error', message: 'Failed to generate deploy script', detail: (err as Error).message });
    }

    // Step 5: Write .env
    emit({ step: 's3-env', status: 'started', message: 'Writing S3 config to .env' });
    try {
      const envLines = [
        `# VoidForge Static S3 — generated ${new Date().toISOString()}`,
        `S3_BUCKET=${bucketName}`,
      ];
      if (outputs['S3_WEBSITE_URL']) envLines.push(`S3_WEBSITE_URL=${outputs['S3_WEBSITE_URL']}`);
      envLines.push('# Deploy with: ./infra/deploy-s3.sh (or auto-deploys via Haku wizard)');
      await appendEnvSection(ctx.projectDir, envLines);
      emit({ step: 's3-env', status: 'done', message: 'S3 config written to .env' });
    } catch (err) {
      emit({ step: 's3-env', status: 'error', message: 'Failed to write .env', detail: (err as Error).message });
    }

    return { success: true, resources, outputs, files };
  },

  async cleanup(resources: CreatedResource[], credentials: Record<string, string>): Promise<void> {
    if (resources.length === 0) return;

    const region = resources[0].region;
    const awsConfig = {
      region,
      credentials: {
        accessKeyId: credentials['aws-access-key-id'] ?? '',
        secretAccessKey: credentials['aws-secret-access-key'] ?? '',
      },
    };

    for (const resource of [...resources].reverse()) {
      if (resource.type === 's3-bucket') {
        try {
          const { S3Client, DeleteBucketCommand, ListObjectsV2Command, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
          const s3 = new S3Client(awsConfig);

          // Must empty bucket before deleting — paginate to handle >1000 objects
          let continuationToken: string | undefined;
          do {
            const listRes = await s3.send(new ListObjectsV2Command({
              Bucket: resource.id,
              ContinuationToken: continuationToken,
            }));
            if (listRes.Contents && listRes.Contents.length > 0) {
              await s3.send(new DeleteObjectsCommand({
                Bucket: resource.id,
                Delete: {
                  Objects: listRes.Contents.map((obj) => ({ Key: obj.Key! })),
                },
              }));
            }
            continuationToken = listRes.IsTruncated ? listRes.NextContinuationToken : undefined;
          } while (continuationToken);

          await s3.send(new DeleteBucketCommand({ Bucket: resource.id }));
        } catch (err) {
          console.error(`Failed to cleanup S3 bucket ${resource.id}:`, (err as Error).message);
        }
      }
    }
  },
};
