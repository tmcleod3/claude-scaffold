/**
 * AWS VPS provisioner — orchestrator that coordinates EC2, RDS, ElastiCache,
 * script generation, env writing, and cleanup.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { chmodSync } from 'node:fs';
import { join } from 'node:path';
import type { Provisioner, ProvisionContext, ProvisionEmitter, ProvisionResult, CreatedResource } from './types.js';
import type { InstanceType } from '../instance-sizing.js';
import { buildAwsConfig, validateAwsContext, loadAwsSdk, sleep } from './aws-config.js';
import type { AwsProvisionState } from './aws-config.js';
import { validateCredentials, createKeyPair, createSecurityGroup, findAmi, launchAndWaitEc2, restrictSsh } from './aws-ec2.js';
import { provisionRds, provisionElastiCache } from './aws-rds.js';
import { generateProvisionScript } from './scripts/provision-vps.js';
import { generateDeployScript } from './scripts/deploy-vps.js';
import { generateRollbackScript } from './scripts/rollback-vps.js';
import { generateEcosystemConfig } from './scripts/ecosystem-config.js';
import { generateCaddyfile } from './scripts/caddyfile.js';
import { appendEnvSection } from '../env-writer.js';
import { slugify } from './http-client.js';

export const awsVpsProvisioner: Provisioner = {
  async validate(ctx: ProvisionContext): Promise<string[]> {
    return validateAwsContext(ctx);
  },

  async provision(ctx: ProvisionContext, emit: ProvisionEmitter): Promise<ProvisionResult> {
    const awsConfig = buildAwsConfig(ctx);
    const state: AwsProvisionState = {
      resources: [],
      outputs: {},
      files: [],
      region: awsConfig.region,
      slug: slugify(ctx.projectName),
      sgId: '',
      instanceId: '',
      publicIp: '',
      awsConfig,
    };

    // Load AWS SDK
    const sdk = await loadAwsSdk();
    if ('error' in sdk) {
      return { success: false, resources: state.resources, outputs: state.outputs, files: state.files, error: sdk.error };
    }
    const { ec2Mod, stsMod } = sdk;

    // Steps 1-6: EC2 provisioning pipeline
    if (!await validateCredentials(state, stsMod, emit)) {
      return { success: false, ...stateResult(state), error: 'AWS credential validation failed' };
    }
    if (!await createKeyPair(state, ctx, ec2Mod, emit)) {
      return { success: false, ...stateResult(state), error: 'Failed to create key pair' };
    }
    if (!await createSecurityGroup(state, ctx, ec2Mod, emit)) {
      return { success: false, ...stateResult(state), error: 'Failed to create security group' };
    }
    const amiId = await findAmi(state, ec2Mod, emit);
    if (!amiId) {
      return { success: false, ...stateResult(state), error: 'AMI lookup failed' };
    }
    const ec2InstanceType = (ctx.instanceType || 't3.micro') as InstanceType;
    if (!await launchAndWaitEc2(state, ctx, ec2Mod, amiId, ec2InstanceType, emit)) {
      return { success: false, ...stateResult(state), error: 'EC2 instance failed to start' };
    }

    // Steps 7-8: Optional RDS + ElastiCache (non-fatal)
    await provisionRds(state, ctx, ec2InstanceType, emit);
    await provisionElastiCache(state, ctx, ec2InstanceType, emit);

    // Step 9: Generate infrastructure scripts
    const scriptsOk = await generateScripts(state, ctx, ec2InstanceType, emit);
    if (!scriptsOk) {
      return { success: false, ...stateResult(state), error: 'Failed to generate infrastructure scripts' };
    }

    // Step 10: Write .env
    await writeEnvFile(state, ctx, emit);

    // DEVOPS-R2-001: Restrict SSH
    await restrictSsh(state, emit);

    return { success: true, ...stateResult(state) };
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

    // Clean up in reverse order
    for (const resource of [...resources].reverse()) {
      try {
        switch (resource.type) {
          case 'ec2-instance': {
            const { EC2Client, TerminateInstancesCommand } = await import('@aws-sdk/client-ec2');
            const ec2 = new EC2Client(awsConfig);
            await ec2.send(new TerminateInstancesCommand({ InstanceIds: [resource.id] }));
            break;
          }
          case 'security-group': {
            const { EC2Client, DeleteSecurityGroupCommand } = await import('@aws-sdk/client-ec2');
            const ec2 = new EC2Client(awsConfig);
            const maxWait = 120000;
            const start = Date.now();
            while (Date.now() - start < maxWait) {
              await sleep(10000);
              try {
                await ec2.send(new DeleteSecurityGroupCommand({ GroupId: resource.id }));
                break;
              } catch (sgErr) {
                const msg = (sgErr as Error).message || '';
                if (msg.includes('DependencyViolation')) continue;
                throw sgErr;
              }
            }
            break;
          }
          case 'key-pair': {
            const { EC2Client, DeleteKeyPairCommand } = await import('@aws-sdk/client-ec2');
            const ec2 = new EC2Client(awsConfig);
            await ec2.send(new DeleteKeyPairCommand({ KeyName: resource.id }));
            break;
          }
          case 'rds-instance': {
            const { RDSClient, DeleteDBInstanceCommand } = await import('@aws-sdk/client-rds');
            const rds = new RDSClient(awsConfig);
            try {
              await rds.send(new DeleteDBInstanceCommand({
                DBInstanceIdentifier: resource.id,
                SkipFinalSnapshot: true,
              }));
            } catch (rdsErr) {
              const code = (rdsErr as { name?: string }).name ?? '';
              if (code === 'InvalidDBInstanceState') {
                console.error(`RDS instance "${resource.id}" is still creating — check AWS Console in 10 minutes to delete manually.`);
              } else {
                throw rdsErr;
              }
            }
            break;
          }
          case 'elasticache-cluster': {
            const { ElastiCacheClient, DeleteCacheClusterCommand } = await import('@aws-sdk/client-elasticache');
            const ec = new ElastiCacheClient(awsConfig);
            try {
              await ec.send(new DeleteCacheClusterCommand({ CacheClusterId: resource.id }));
            } catch (cacheErr) {
              const code = (cacheErr as { name?: string }).name ?? '';
              if (code === 'InvalidCacheClusterState') {
                console.error(`ElastiCache cluster "${resource.id}" is still creating — check AWS Console in 10 minutes to delete manually.`);
              } else {
                throw cacheErr;
              }
            }
            break;
          }
        }
      } catch (err) {
        console.error(`Failed to cleanup ${resource.type} ${resource.id}:`, (err as Error).message);
      }
    }
  },
};

function stateResult(state: AwsProvisionState) {
  return { resources: state.resources, outputs: state.outputs, files: state.files };
}

async function generateScripts(
  state: AwsProvisionState,
  ctx: ProvisionContext,
  ec2InstanceType: InstanceType,
  emit: ProvisionEmitter,
): Promise<boolean> {
  emit({ step: 'generate-scripts', status: 'started', message: 'Generating deploy scripts' });
  try {
    const infraDir = join(ctx.projectDir, 'infra');
    await mkdir(infraDir, { recursive: true });

    const framework = ctx.framework || 'express';

    const provisionSh = generateProvisionScript({ framework, database: ctx.database, cache: ctx.cache, instanceType: ec2InstanceType });
    await writeFile(join(infraDir, 'provision.sh'), provisionSh, { mode: 0o755 });
    state.files.push('infra/provision.sh');

    const deploySh = generateDeployScript({ framework });
    await writeFile(join(infraDir, 'deploy.sh'), deploySh, { mode: 0o755 });
    state.files.push('infra/deploy.sh');

    const rollbackSh = generateRollbackScript({ framework });
    await writeFile(join(infraDir, 'rollback.sh'), rollbackSh, { mode: 0o755 });
    state.files.push('infra/rollback.sh');

    const caddyfile = generateCaddyfile({ framework, hostname: ctx.hostname || undefined });
    await writeFile(join(infraDir, 'Caddyfile'), caddyfile, 'utf-8');
    state.files.push('infra/Caddyfile');

    if (['next.js', 'express'].includes(framework) || !framework) {
      const ecosystem = generateEcosystemConfig({ projectName: ctx.projectName, framework });
      await writeFile(join(ctx.projectDir, 'ecosystem.config.js'), ecosystem, 'utf-8');
      state.files.push('ecosystem.config.js');
    }

    emit({ step: 'generate-scripts', status: 'done', message: `Generated ${state.files.length} infrastructure files` });
    return true;
  } catch (err) {
    console.error('Script generation error:', (err as Error).message);
    emit({ step: 'generate-scripts', status: 'error', message: 'Failed to generate scripts', detail: 'Check AWS Console for details' });
    return false;
  }
}

async function writeEnvFile(
  state: AwsProvisionState,
  ctx: ProvisionContext,
  emit: ProvisionEmitter,
): Promise<void> {
  emit({ step: 'write-env', status: 'started', message: 'Writing infrastructure config to .env' });
  try {
    const envLines = [
      `# VoidForge Infrastructure — generated ${new Date().toISOString()}`,
      `SSH_HOST=${state.publicIp}`,
      `SSH_USER=ec2-user`,
      `SSH_KEY_PATH=.ssh/deploy-key.pem`,
    ];
    if (state.outputs['DB_ENGINE']) {
      envLines.push(`DB_ENGINE=${state.outputs['DB_ENGINE']}`);
      envLines.push(`DB_HOST=${state.outputs['DB_HOST'] || `# pending — check https://${state.region}.console.aws.amazon.com/rds/home?region=${state.region}#databases:`}`);
      envLines.push(`DB_PORT=${state.outputs['DB_PORT']}`);
      envLines.push(`DB_INSTANCE_ID=${state.outputs['DB_INSTANCE_ID']}`);
      envLines.push(`DB_USERNAME=${state.outputs['DB_USERNAME']}`);
      envLines.push(`DB_PASSWORD=${state.outputs['DB_PASSWORD']}`);
    }
    if (state.outputs['REDIS_CLUSTER_ID']) {
      envLines.push(`REDIS_CLUSTER_ID=${state.outputs['REDIS_CLUSTER_ID']}`);
      envLines.push(`REDIS_HOST=${state.outputs['REDIS_HOST'] || `# pending — check https://${state.region}.console.aws.amazon.com/elasticache/home?region=${state.region}`}`);
      envLines.push(`REDIS_PORT=${state.outputs['REDIS_PORT'] || '6379'}`);
    }
    await appendEnvSection(ctx.projectDir, envLines);
    chmodSync(join(ctx.projectDir, '.env'), 0o600);
    emit({ step: 'write-env', status: 'done', message: 'Infrastructure config written to .env' });
  } catch (err) {
    console.error('Env file write error:', (err as Error).message);
    emit({ step: 'write-env', status: 'error', message: 'Failed to write .env', detail: (err as Error).message });
    // Non-fatal
  }
}
