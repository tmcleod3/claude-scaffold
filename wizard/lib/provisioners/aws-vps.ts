/**
 * AWS VPS provisioner — EC2 + SG + optional RDS/ElastiCache.
 * Uses @aws-sdk for all AWS API calls.
 */

import { writeFile, mkdir, chmod } from 'node:fs/promises';
import { chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import type { Provisioner, ProvisionContext, ProvisionEmitter, ProvisionResult, CreatedResource } from './types.js';
import type { IpPermission } from '@aws-sdk/client-ec2';
import { recordResourcePending, recordResourceCreated } from '../provision-manifest.js';
import { rdsInstanceClass, cacheNodeType, isValidInstanceType, type InstanceType } from '../instance-sizing.js';
import { generateProvisionScript } from './scripts/provision-vps.js';
import { generateDeployScript } from './scripts/deploy-vps.js';
import { generateRollbackScript } from './scripts/rollback-vps.js';
import { generateEcosystemConfig } from './scripts/ecosystem-config.js';
import { generateCaddyfile } from './scripts/caddyfile.js';
import { appendEnvSection } from '../env-writer.js';
import { slugify } from './http-client.js';

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_MS = 300000; // 5 minutes

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function cancellableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Aborted')); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('Aborted')); }, { once: true });
  });
}

export const awsVpsProvisioner: Provisioner = {
  async validate(ctx: ProvisionContext): Promise<string[]> {
    const errors: string[] = [];
    if (!ctx.projectDir) errors.push('Project directory is required');
    if (!ctx.projectName) errors.push('Project name is required');
    if (!ctx.credentials['aws-access-key-id']) errors.push('AWS Access Key ID is required');
    if (!ctx.credentials['aws-secret-access-key']) errors.push('AWS Secret Access Key is required');
    if (ctx.instanceType && !isValidInstanceType(ctx.instanceType)) {
      errors.push(`Invalid instance type: "${ctx.instanceType}". Must be one of: t3.micro, t3.small, t3.medium, t3.large`);
    }
    return errors;
  },

  async provision(ctx: ProvisionContext, emit: ProvisionEmitter): Promise<ProvisionResult> {
    const resources: CreatedResource[] = [];
    const outputs: Record<string, string> = {};
    const files: string[] = [];
    const region = ctx.credentials['aws-region'] || 'us-east-1';
    const slug = slugify(ctx.projectName);

    // Dynamic import of AWS SDK
    let EC2Client: typeof import('@aws-sdk/client-ec2').EC2Client;
    let STSClient: typeof import('@aws-sdk/client-sts').STSClient;
    let GetCallerIdentityCommand: typeof import('@aws-sdk/client-sts').GetCallerIdentityCommand;
    let ec2Commands: typeof import('@aws-sdk/client-ec2');

    try {
      const ec2Mod = await import('@aws-sdk/client-ec2');
      const stsMod = await import('@aws-sdk/client-sts');
      EC2Client = ec2Mod.EC2Client;
      STSClient = stsMod.STSClient;
      GetCallerIdentityCommand = stsMod.GetCallerIdentityCommand;
      ec2Commands = ec2Mod;
    } catch {
      return {
        success: false, resources, outputs, files,
        error: 'AWS SDK not installed. Run: npm install @aws-sdk/client-ec2 @aws-sdk/client-sts @aws-sdk/client-rds @aws-sdk/client-elasticache',
      };
    }

    const awsConfig = {
      region,
      credentials: {
        accessKeyId: ctx.credentials['aws-access-key-id'],
        secretAccessKey: ctx.credentials['aws-secret-access-key'],
      },
    };

    const ec2 = new EC2Client(awsConfig);
    const sts = new STSClient(awsConfig);

    // Step 1: Validate credentials via STS
    emit({ step: 'validate-creds', status: 'started', message: 'Validating AWS credentials' });
    try {
      const identity = await sts.send(new GetCallerIdentityCommand({}));
      const entityName = (identity.Arn ?? 'unknown').split(/[/:]/).pop() ?? 'unknown';
      emit({ step: 'validate-creds', status: 'done', message: `Authenticated as ${entityName}` });
    } catch (err) {
      console.error('AWS credential validation error:', (err as Error).message);
      emit({ step: 'validate-creds', status: 'error', message: 'Invalid AWS credentials', detail: 'Check AWS Console for details' });
      return { success: false, resources, outputs, files, error: 'AWS credential validation failed' };
    }

    // Step 2: Create key pair
    emit({ step: 'key-pair', status: 'started', message: 'Creating SSH key pair' });
    const keyName = `${slug}-deploy`;
    try {
      await recordResourcePending(ctx.runId, 'key-pair', keyName, region);
      const keyResult = await ec2.send(new ec2Commands.CreateKeyPairCommand({
        KeyName: keyName,
        KeyType: 'ed25519',
      }));

      if (!keyResult.KeyMaterial) {
        throw new Error('AWS returned no key material — key pair may already exist');
      }

      const sshDir = join(ctx.projectDir, '.ssh');
      await mkdir(sshDir, { recursive: true });
      const keyPath = join(sshDir, 'deploy-key.pem');
      await writeFile(keyPath, keyResult.KeyMaterial, 'utf-8');
      await chmod(keyPath, 0o600);
      files.push('.ssh/deploy-key.pem');
      resources.push({ type: 'key-pair', id: keyName, region });
      await recordResourceCreated(ctx.runId, 'key-pair', keyName, region);
      outputs['SSH_KEY_PATH'] = '.ssh/deploy-key.pem';
      emit({ step: 'key-pair', status: 'done', message: `Key pair "${keyName}" created` });
    } catch (err) {
      console.error('Key pair creation error:', (err as Error).message);
      emit({ step: 'key-pair', status: 'error', message: 'Failed to create key pair', detail: 'Check AWS Console for details' });
      return { success: false, resources, outputs, files, error: 'Failed to create key pair' };
    }

    // Step 3: Create security group
    emit({ step: 'security-group', status: 'started', message: 'Creating security group' });
    let sgId: string;
    try {
      await recordResourcePending(ctx.runId, 'security-group', `${slug}-sg`, region);
      const sgResult = await ec2.send(new ec2Commands.CreateSecurityGroupCommand({
        GroupName: `${slug}-sg`,
        Description: `VoidForge security group for ${ctx.projectName}`,
      }));
      sgId = sgResult.GroupId ?? '';
      resources.push({ type: 'security-group', id: sgId, region });
      await recordResourceCreated(ctx.runId, 'security-group', sgId, region);

      // Authorize inbound: SSH (22), HTTP (80), HTTPS (443)
      // TODO: Restrict SSH to user's IP post-provisioning. 0.0.0.0/0 is for initial setup only.
      const ingressRules: IpPermission[] = [
        { IpProtocol: 'tcp', FromPort: 22, ToPort: 22, IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'SSH' }] },
        { IpProtocol: 'tcp', FromPort: 80, ToPort: 80, IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'HTTP' }] },
        { IpProtocol: 'tcp', FromPort: 443, ToPort: 443, IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'HTTPS' }] },
      ];

      // Allow DB port within the SG (self-referencing) so EC2 can reach RDS
      // Uses UserIdGroupPairs to restrict access to instances in the same SG only
      if (ctx.database === 'postgres') {
        ingressRules.push({ IpProtocol: 'tcp', FromPort: 5432, ToPort: 5432, UserIdGroupPairs: [{ GroupId: sgId, Description: 'PostgreSQL (SG-only)' }] });
      } else if (ctx.database === 'mysql') {
        ingressRules.push({ IpProtocol: 'tcp', FromPort: 3306, ToPort: 3306, UserIdGroupPairs: [{ GroupId: sgId, Description: 'MySQL (SG-only)' }] });
      }
      // Allow Redis port if cache requested
      if (ctx.cache === 'redis') {
        ingressRules.push({ IpProtocol: 'tcp', FromPort: 6379, ToPort: 6379, UserIdGroupPairs: [{ GroupId: sgId, Description: 'Redis (SG-only)' }] });
      }

      await ec2.send(new ec2Commands.AuthorizeSecurityGroupIngressCommand({
        GroupId: sgId,
        IpPermissions: ingressRules,
      }));

      const portList = ingressRules.map((r) => r.FromPort).join(', ');
      emit({ step: 'security-group', status: 'done', message: `Security group "${slug}-sg" created (ports ${portList})` });
    } catch (err) {
      console.error('Security group creation error:', (err as Error).message);
      emit({ step: 'security-group', status: 'error', message: 'Failed to create security group', detail: 'Check AWS Console for details' });
      return { success: false, resources, outputs, files, error: 'Failed to create security group' };
    }

    // Step 4: Find latest Amazon Linux 2023 AMI
    emit({ step: 'ami-lookup', status: 'started', message: 'Finding latest Amazon Linux 2023 AMI' });
    let amiId: string;
    try {
      const amiResult = await ec2.send(new ec2Commands.DescribeImagesCommand({
        Owners: ['amazon'],
        Filters: [
          { Name: 'name', Values: ['al2023-ami-*-x86_64'] },
          { Name: 'state', Values: ['available'] },
          { Name: 'architecture', Values: ['x86_64'] },
        ],
      }));

      const images = (amiResult.Images ?? [])
        .filter((img: { ImageId?: string; CreationDate?: string }) => img.ImageId && img.CreationDate)
        .sort((a: { CreationDate?: string }, b: { CreationDate?: string }) => (b.CreationDate ?? '').localeCompare(a.CreationDate ?? ''));

      if (images.length === 0) {
        throw new Error('No Amazon Linux 2023 AMI found in this region');
      }
      amiId = images[0].ImageId!;
      emit({ step: 'ami-lookup', status: 'done', message: `AMI: ${amiId}` });
    } catch (err) {
      console.error('AMI lookup error:', (err as Error).message);
      emit({ step: 'ami-lookup', status: 'error', message: 'AMI lookup failed', detail: 'Check AWS Console for details' });
      return { success: false, resources, outputs, files, error: 'AMI lookup failed' };
    }

    // Step 5: Launch EC2 instance
    const ec2InstanceType = (ctx.instanceType || 't3.micro') as InstanceType;
    emit({ step: 'launch-ec2', status: 'started', message: `Launching EC2 instance (${ec2InstanceType})` });
    let instanceId: string;
    try {
      const userDataScript = `#!/bin/bash
dnf update -y
dnf install -y git curl`;

      await recordResourcePending(ctx.runId, 'ec2-instance', 'pending', region);
      const runResult = await ec2.send(new ec2Commands.RunInstancesCommand({
        ImageId: amiId,
        InstanceType: ec2InstanceType,
        MinCount: 1,
        MaxCount: 1,
        KeyName: keyName,
        SecurityGroupIds: [sgId],
        UserData: Buffer.from(userDataScript).toString('base64'),
        TagSpecifications: [{
          ResourceType: 'instance',
          Tags: [
            { Key: 'Name', Value: ctx.projectName },
            { Key: 'ManagedBy', Value: 'VoidForge' },
          ],
        }],
      }));

      instanceId = runResult.Instances?.[0]?.InstanceId ?? '';
      if (!instanceId) throw new Error('No instance ID returned');
      resources.push({ type: 'ec2-instance', id: instanceId, region });
      await recordResourceCreated(ctx.runId, 'ec2-instance', instanceId, region);
      emit({ step: 'launch-ec2', status: 'done', message: `Instance ${instanceId} launched` });
    } catch (err) {
      console.error('EC2 launch error:', (err as Error).message);
      emit({ step: 'launch-ec2', status: 'error', message: 'Failed to launch EC2', detail: 'Check AWS Console for details' });
      return { success: false, resources, outputs, files, error: 'Failed to launch EC2 instance' };
    }

    // Step 6: Wait for instance to be running
    emit({ step: 'wait-running', status: 'started', message: 'Waiting for instance to start...' });
    let publicIp = '';
    try {
      const start = Date.now();
      while (Date.now() - start < MAX_POLL_MS) {
        await cancellableSleep(POLL_INTERVAL_MS + Math.random() * 1000, ctx.abortSignal);
        const desc = await ec2.send(new ec2Commands.DescribeInstancesCommand({
          InstanceIds: [instanceId],
        }));
        const instance = desc.Reservations?.[0]?.Instances?.[0];
        const state = instance?.State?.Name;

        if (state === 'running') {
          publicIp = instance?.PublicIpAddress ?? '';
          if (publicIp) break;
        }
        if (state === 'terminated' || state === 'shutting-down') {
          throw new Error(`Instance entered state: ${state}`);
        }
      }
      if (!publicIp) throw new Error('Instance did not get a public IP within timeout');
      outputs['SSH_HOST'] = publicIp;
      outputs['SSH_USER'] = 'ec2-user';
      emit({ step: 'wait-running', status: 'done', message: `Instance running at ${publicIp}` });
    } catch (err) {
      if ((err as Error).message === 'Aborted') {
        emit({ step: 'wait-running', status: 'skipped', message: 'EC2 polling cancelled' });
      } else {
        console.error('EC2 wait error:', (err as Error).message);
        emit({ step: 'wait-running', status: 'error', message: 'Instance failed to start', detail: 'Check AWS Console for details' });
        return { success: false, resources, outputs, files, error: 'EC2 instance failed to start' };
      }
    }

    // Step 7: Optional RDS
    if (ctx.database === 'postgres' || ctx.database === 'mysql') {
      emit({ step: 'rds', status: 'started', message: `Creating RDS instance (${ctx.database})` });
      try {
        const { RDSClient, CreateDBInstanceCommand, DescribeDBInstancesCommand } = await import('@aws-sdk/client-rds');
        const rds = new RDSClient(awsConfig);

        const engine = ctx.database === 'postgres' ? 'postgres' : 'mysql';
        const port = ctx.database === 'postgres' ? 5432 : 3306;
        const dbInstanceId = `${slug}-db`;
        const specials = '!@#$%^&*';
        const suffix = String.fromCharCode(65 + Math.floor(Math.random() * 26)) + Math.floor(Math.random() * 10) + specials[Math.floor(Math.random() * specials.length)];
        const dbPassword = randomBytes(16).toString('hex') + suffix;

        await recordResourcePending(ctx.runId, 'rds-instance', dbInstanceId, region);
        await rds.send(new CreateDBInstanceCommand({
          DBInstanceIdentifier: dbInstanceId,
          DBInstanceClass: rdsInstanceClass(ec2InstanceType),
          Engine: engine,
          MasterUsername: 'admin',
          MasterUserPassword: dbPassword,
          AllocatedStorage: 20,
          PubliclyAccessible: false,
          VpcSecurityGroupIds: [sgId],
          Tags: [
            { Key: 'Name', Value: `${ctx.projectName}-db` },
            { Key: 'ManagedBy', Value: 'VoidForge' },
          ],
        }));

        resources.push({ type: 'rds-instance', id: dbInstanceId, region });
        await recordResourceCreated(ctx.runId, 'rds-instance', dbInstanceId, region);
        outputs['DB_ENGINE'] = engine;
        outputs['DB_PORT'] = String(port);
        outputs['DB_INSTANCE_ID'] = dbInstanceId;
        outputs['DB_USERNAME'] = 'admin';
        outputs['DB_PASSWORD'] = dbPassword;
        emit({ step: 'rds', status: 'done', message: `RDS instance "${dbInstanceId}" created — waiting for endpoint` });

        // Step 7b: Poll RDS until available (non-fatal on timeout)
        const RDS_POLL_MS = 10000;
        const RDS_TIMEOUT_MS = 900000; // 15 minutes
        const RDS_PROGRESS_MS = 30000;
        emit({ step: 'rds-wait', status: 'started', message: 'Waiting for RDS to become available (5-10 minutes)...' });
        try {
          const rdsStart = Date.now();
          let lastProgress = rdsStart;
          let dbHost = '';
          while (Date.now() - rdsStart < RDS_TIMEOUT_MS) {
            await cancellableSleep(RDS_POLL_MS + Math.random() * 2000, ctx.abortSignal);
            const desc = await rds.send(new DescribeDBInstancesCommand({
              DBInstanceIdentifier: dbInstanceId,
            }));
            const instance = desc.DBInstances?.[0];
            const status = instance?.DBInstanceStatus;

            if (status === 'available') {
              dbHost = instance?.Endpoint?.Address ?? '';
              break;
            }

            // Check for terminal failure states
            const rdsTerminalStates = ['failed', 'deleting', 'deleted', 'incompatible-parameters', 'incompatible-restore', 'storage-full'];
            if (status && rdsTerminalStates.includes(status)) {
              emit({ step: 'rds-wait', status: 'error', message: `RDS entered terminal state: ${status}`, detail: 'Check AWS Console for details' });
              break;
            }

            // Emit progress every 30 seconds
            if (Date.now() - lastProgress >= RDS_PROGRESS_MS) {
              const elapsed = Math.round((Date.now() - rdsStart) / 1000);
              emit({ step: 'rds-wait', status: 'started', message: `RDS status: ${status || 'creating'}... (${elapsed}s elapsed)` });
              lastProgress = Date.now();
            }
          }

          if (dbHost) {
            outputs['DB_HOST'] = dbHost;
            emit({ step: 'rds-wait', status: 'done', message: `RDS available at ${dbHost}` });
          } else {
            emit({ step: 'rds-wait', status: 'error', message: 'RDS polling timed out after 15 minutes', detail: `Instance "${dbInstanceId}" is still provisioning. Check the AWS Console for the endpoint and add DB_HOST to your .env manually.` });
          }
        } catch (pollErr) {
          if ((pollErr as Error).message === 'Aborted') {
            emit({ step: 'rds-wait', status: 'skipped', message: 'RDS polling cancelled' });
          } else {
            console.error('RDS polling error:', (pollErr as Error).message);
            emit({ step: 'rds-wait', status: 'error', message: 'RDS polling failed', detail: 'Check AWS Console for details' });
          }
          // Non-fatal — continue without DB_HOST
        }
      } catch (err) {
        console.error('RDS creation error:', (err as Error).message);
        emit({ step: 'rds', status: 'error', message: 'Failed to create RDS instance', detail: 'Check AWS Console for details' });
        // Non-fatal — continue without DB
      }
    } else {
      emit({ step: 'rds', status: 'skipped', message: 'No database requested' });
    }

    // Step 8: Optional ElastiCache
    if (ctx.cache === 'redis') {
      emit({ step: 'elasticache', status: 'started', message: 'Creating ElastiCache Redis cluster' });
      try {
        const { ElastiCacheClient, CreateCacheClusterCommand, DescribeCacheClustersCommand } = await import('@aws-sdk/client-elasticache');
        const elasticache = new ElastiCacheClient(awsConfig);
        const clusterId = `${slug}-redis`;

        await recordResourcePending(ctx.runId, 'elasticache-cluster', clusterId, region);
        await elasticache.send(new CreateCacheClusterCommand({
          CacheClusterId: clusterId,
          CacheNodeType: cacheNodeType(ec2InstanceType),
          Engine: 'redis',
          NumCacheNodes: 1,
          Tags: [
            { Key: 'Name', Value: `${ctx.projectName}-redis` },
            { Key: 'ManagedBy', Value: 'VoidForge' },
          ],
        }));

        resources.push({ type: 'elasticache-cluster', id: clusterId, region });
        await recordResourceCreated(ctx.runId, 'elasticache-cluster', clusterId, region);
        outputs['REDIS_CLUSTER_ID'] = clusterId;
        emit({ step: 'elasticache', status: 'done', message: `ElastiCache cluster "${clusterId}" created — waiting for endpoint` });

        // Step 8b: Poll ElastiCache until available (non-fatal on timeout)
        const CACHE_POLL_MS = 5000;
        const CACHE_TIMEOUT_MS = 300000; // 5 minutes
        const CACHE_PROGRESS_MS = 15000;
        emit({ step: 'cache-wait', status: 'started', message: 'Waiting for Redis to become available (1-2 minutes)...' });
        try {
          const cacheStart = Date.now();
          let lastCacheProgress = cacheStart;
          let redisHost = '';
          while (Date.now() - cacheStart < CACHE_TIMEOUT_MS) {
            await cancellableSleep(CACHE_POLL_MS + Math.random() * 1000, ctx.abortSignal);
            const desc = await elasticache.send(new DescribeCacheClustersCommand({
              CacheClusterId: clusterId,
              ShowCacheNodeInfo: true,
            }));
            const cluster = desc.CacheClusters?.[0];
            const status = cluster?.CacheClusterStatus;

            if (status === 'available') {
              redisHost = cluster?.CacheNodes?.[0]?.Endpoint?.Address ?? '';
              break;
            }

            // Check for terminal failure states
            const cacheTerminalStates = ['deleted', 'deleting', 'create-failed', 'snapshotting'];
            if (status && cacheTerminalStates.includes(status)) {
              emit({ step: 'cache-wait', status: 'error', message: `Redis entered terminal state: ${status}`, detail: 'Check AWS Console for details' });
              break;
            }

            if (Date.now() - lastCacheProgress >= CACHE_PROGRESS_MS) {
              const elapsed = Math.round((Date.now() - cacheStart) / 1000);
              emit({ step: 'cache-wait', status: 'started', message: `Redis status: ${status || 'creating'}... (${elapsed}s elapsed)` });
              lastCacheProgress = Date.now();
            }
          }

          if (redisHost) {
            outputs['REDIS_HOST'] = redisHost;
            outputs['REDIS_PORT'] = '6379';
            emit({ step: 'cache-wait', status: 'done', message: `Redis available at ${redisHost}:6379` });
          } else {
            emit({ step: 'cache-wait', status: 'error', message: 'Redis polling timed out after 5 minutes', detail: `Cluster "${clusterId}" is still provisioning. Check the AWS Console for the endpoint.` });
          }
        } catch (pollErr) {
          if ((pollErr as Error).message === 'Aborted') {
            emit({ step: 'cache-wait', status: 'skipped', message: 'Redis polling cancelled' });
          } else {
            console.error('Redis polling error:', (pollErr as Error).message);
            emit({ step: 'cache-wait', status: 'error', message: 'Redis polling failed', detail: 'Check AWS Console for details' });
          }
        }
      } catch (err) {
        console.error('ElastiCache creation error:', (err as Error).message);
        emit({ step: 'elasticache', status: 'error', message: 'Failed to create ElastiCache cluster', detail: 'Check AWS Console for details' });
        // Non-fatal
      }
    } else {
      emit({ step: 'elasticache', status: 'skipped', message: 'No cache requested' });
    }

    // Step 9: Generate infrastructure scripts
    emit({ step: 'generate-scripts', status: 'started', message: 'Generating deploy scripts' });
    try {
      const infraDir = join(ctx.projectDir, 'infra');
      await mkdir(infraDir, { recursive: true });

      const framework = ctx.framework || 'express';

      // provision.sh
      const provisionSh = generateProvisionScript({ framework, database: ctx.database, cache: ctx.cache, instanceType: ec2InstanceType });
      await writeFile(join(infraDir, 'provision.sh'), provisionSh, { mode: 0o755 });
      files.push('infra/provision.sh');

      // deploy.sh
      const deploySh = generateDeployScript({ framework });
      await writeFile(join(infraDir, 'deploy.sh'), deploySh, { mode: 0o755 });
      files.push('infra/deploy.sh');

      // rollback.sh
      const rollbackSh = generateRollbackScript({ framework });
      await writeFile(join(infraDir, 'rollback.sh'), rollbackSh, { mode: 0o755 });
      files.push('infra/rollback.sh');

      // Caddyfile
      const caddyfile = generateCaddyfile({ framework, hostname: ctx.hostname || undefined });
      await writeFile(join(infraDir, 'Caddyfile'), caddyfile, 'utf-8');
      files.push('infra/Caddyfile');

      // ecosystem.config.js (Node frameworks only)
      if (['next.js', 'express'].includes(framework) || !framework) {
        const ecosystem = generateEcosystemConfig({ projectName: ctx.projectName, framework });
        await writeFile(join(ctx.projectDir, 'ecosystem.config.js'), ecosystem, 'utf-8');
        files.push('ecosystem.config.js');
      }

      emit({ step: 'generate-scripts', status: 'done', message: `Generated ${files.length} infrastructure files` });
    } catch (err) {
      console.error('Script generation error:', (err as Error).message);
      emit({ step: 'generate-scripts', status: 'error', message: 'Failed to generate scripts', detail: 'Check AWS Console for details' });
      return { success: false, resources, outputs, files, error: 'Failed to generate infrastructure scripts' };
    }

    // Step 10: Write .env with infrastructure details
    emit({ step: 'write-env', status: 'started', message: 'Writing infrastructure config to .env' });
    try {
      const envLines = [
        `# VoidForge Infrastructure — generated ${new Date().toISOString()}`,
        `SSH_HOST=${publicIp}`,
        `SSH_USER=ec2-user`,
        `SSH_KEY_PATH=.ssh/deploy-key.pem`,
      ];
      if (outputs['DB_ENGINE']) {
        envLines.push(`DB_ENGINE=${outputs['DB_ENGINE']}`);
        envLines.push(`DB_HOST=${outputs['DB_HOST'] || `# pending — check https://${region}.console.aws.amazon.com/rds/home?region=${region}#databases:`}`);
        envLines.push(`DB_PORT=${outputs['DB_PORT']}`);
        envLines.push(`DB_INSTANCE_ID=${outputs['DB_INSTANCE_ID']}`);
        envLines.push(`DB_USERNAME=${outputs['DB_USERNAME']}`);
        envLines.push(`DB_PASSWORD=${outputs['DB_PASSWORD']}`);
      }
      if (outputs['REDIS_CLUSTER_ID']) {
        envLines.push(`REDIS_CLUSTER_ID=${outputs['REDIS_CLUSTER_ID']}`);
        envLines.push(`REDIS_HOST=${outputs['REDIS_HOST'] || `# pending — check https://${region}.console.aws.amazon.com/elasticache/home?region=${region}`}`);
        envLines.push(`REDIS_PORT=${outputs['REDIS_PORT'] || '6379'}`);
      }
      await appendEnvSection(ctx.projectDir, envLines);
      chmodSync(join(ctx.projectDir, '.env'), 0o600);
      emit({ step: 'write-env', status: 'done', message: 'Infrastructure config written to .env' });
    } catch (err) {
      console.error('Env file write error:', (err as Error).message);
      emit({ step: 'write-env', status: 'error', message: 'Failed to write .env', detail: (err as Error).message });
      // Non-fatal
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
            const { EC2Client, DeleteSecurityGroupCommand, DescribeInstancesCommand: DescInst } = await import('@aws-sdk/client-ec2');
            const ec2 = new EC2Client(awsConfig);
            // Wait for all instances in the SG to terminate before deleting
            const maxWait = 120000; // 2 minutes
            const start = Date.now();
            while (Date.now() - start < maxWait) {
              await sleep(10000);
              try {
                await ec2.send(new DeleteSecurityGroupCommand({ GroupId: resource.id }));
                break; // Success — SG deleted
              } catch (sgErr) {
                const msg = (sgErr as Error).message || '';
                if (msg.includes('DependencyViolation')) {
                  continue; // Instance still terminating, retry
                }
                throw sgErr; // Different error — propagate
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
