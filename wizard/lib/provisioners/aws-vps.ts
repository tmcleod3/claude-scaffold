/**
 * AWS VPS provisioner — EC2 + SG + optional RDS/ElastiCache.
 * Uses @aws-sdk for all AWS API calls.
 */

import { writeFile, mkdir, chmod } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import type { Provisioner, ProvisionContext, ProvisionEmitter, ProvisionResult, CreatedResource } from './types.js';
import type { IpPermission } from '@aws-sdk/client-ec2';
import { recordResourcePending, recordResourceCreated } from '../provision-manifest.js';
import { generateProvisionScript } from './scripts/provision-vps.js';
import { generateDeployScript } from './scripts/deploy-vps.js';
import { generateRollbackScript } from './scripts/rollback-vps.js';
import { generateEcosystemConfig } from './scripts/ecosystem-config.js';
import { generateCaddyfile } from './scripts/caddyfile.js';

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_MS = 300000; // 5 minutes

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 40);
}

export const awsVpsProvisioner: Provisioner = {
  async validate(ctx: ProvisionContext): Promise<string[]> {
    const errors: string[] = [];
    if (!ctx.projectDir) errors.push('Project directory is required');
    if (!ctx.projectName) errors.push('Project name is required');
    if (!ctx.credentials['aws-access-key-id']) errors.push('AWS Access Key ID is required');
    if (!ctx.credentials['aws-secret-access-key']) errors.push('AWS Secret Access Key is required');
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
      emit({ step: 'validate-creds', status: 'done', message: `Authenticated as ${identity.Arn}` });
    } catch (err) {
      emit({ step: 'validate-creds', status: 'error', message: 'Invalid AWS credentials', detail: (err as Error).message });
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
      emit({ step: 'key-pair', status: 'error', message: 'Failed to create key pair', detail: (err as Error).message });
      return { success: false, resources, outputs, files, error: (err as Error).message };
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
      emit({ step: 'security-group', status: 'error', message: 'Failed to create security group', detail: (err as Error).message });
      return { success: false, resources, outputs, files, error: (err as Error).message };
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
      emit({ step: 'ami-lookup', status: 'error', message: 'AMI lookup failed', detail: (err as Error).message });
      return { success: false, resources, outputs, files, error: (err as Error).message };
    }

    // Step 5: Launch EC2 instance
    emit({ step: 'launch-ec2', status: 'started', message: 'Launching EC2 instance (t3.micro)' });
    let instanceId: string;
    try {
      const userDataScript = `#!/bin/bash
dnf update -y
dnf install -y git curl`;

      await recordResourcePending(ctx.runId, 'ec2-instance', 'pending', region);
      const runResult = await ec2.send(new ec2Commands.RunInstancesCommand({
        ImageId: amiId,
        InstanceType: 't3.micro',
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
      emit({ step: 'launch-ec2', status: 'error', message: 'Failed to launch EC2', detail: (err as Error).message });
      return { success: false, resources, outputs, files, error: (err as Error).message };
    }

    // Step 6: Wait for instance to be running
    emit({ step: 'wait-running', status: 'started', message: 'Waiting for instance to start...' });
    let publicIp = '';
    try {
      const start = Date.now();
      while (Date.now() - start < MAX_POLL_MS) {
        await sleep(POLL_INTERVAL_MS);
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
      emit({ step: 'wait-running', status: 'error', message: 'Instance failed to start', detail: (err as Error).message });
      return { success: false, resources, outputs, files, error: (err as Error).message };
    }

    // Step 7: Optional RDS
    if (ctx.database === 'postgres' || ctx.database === 'mysql') {
      emit({ step: 'rds', status: 'started', message: `Creating RDS instance (${ctx.database})` });
      try {
        const { RDSClient, CreateDBInstanceCommand } = await import('@aws-sdk/client-rds');
        const rds = new RDSClient(awsConfig);

        const engine = ctx.database === 'postgres' ? 'postgres' : 'mysql';
        const port = ctx.database === 'postgres' ? 5432 : 3306;
        const dbInstanceId = `${slug}-db`;
        const dbPassword = randomBytes(16).toString('hex') + 'A1!';

        await recordResourcePending(ctx.runId, 'rds-instance', dbInstanceId, region);
        await rds.send(new CreateDBInstanceCommand({
          DBInstanceIdentifier: dbInstanceId,
          DBInstanceClass: 'db.t3.micro',
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
        outputs['DB_PASSWORD'] = dbPassword;
        emit({ step: 'rds', status: 'done', message: `RDS instance "${dbInstanceId}" creating (takes ~5min to become available)`, detail: 'RDS provisioning continues in the background. Check AWS Console for endpoint.' });
      } catch (err) {
        emit({ step: 'rds', status: 'error', message: 'Failed to create RDS instance', detail: (err as Error).message });
        // Non-fatal — continue without DB
      }
    } else {
      emit({ step: 'rds', status: 'skipped', message: 'No database requested' });
    }

    // Step 8: Optional ElastiCache
    if (ctx.cache === 'redis') {
      emit({ step: 'elasticache', status: 'started', message: 'Creating ElastiCache Redis cluster' });
      try {
        const { ElastiCacheClient, CreateCacheClusterCommand } = await import('@aws-sdk/client-elasticache');
        const elasticache = new ElastiCacheClient(awsConfig);
        const clusterId = `${slug}-redis`;

        await recordResourcePending(ctx.runId, 'elasticache-cluster', clusterId, region);
        await elasticache.send(new CreateCacheClusterCommand({
          CacheClusterId: clusterId,
          CacheNodeType: 'cache.t3.micro',
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
        emit({ step: 'elasticache', status: 'done', message: `ElastiCache cluster "${clusterId}" creating` });
      } catch (err) {
        emit({ step: 'elasticache', status: 'error', message: 'Failed to create ElastiCache cluster', detail: (err as Error).message });
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
      const provisionSh = generateProvisionScript({ framework, database: ctx.database, cache: ctx.cache });
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
      const caddyfile = generateCaddyfile({ framework });
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
      emit({ step: 'generate-scripts', status: 'error', message: 'Failed to generate scripts', detail: (err as Error).message });
      return { success: false, resources, outputs, files, error: (err as Error).message };
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
        envLines.push(`DB_PORT=${outputs['DB_PORT']}`);
        envLines.push(`DB_INSTANCE_ID=${outputs['DB_INSTANCE_ID']}`);
        envLines.push(`DB_USERNAME=admin`);
        envLines.push(`DB_PASSWORD=${outputs['DB_PASSWORD']}`);
        envLines.push('# DB_HOST will be available once RDS finishes provisioning — check AWS Console');
      }
      if (outputs['REDIS_CLUSTER_ID']) {
        envLines.push(`REDIS_CLUSTER_ID=${outputs['REDIS_CLUSTER_ID']}`);
        envLines.push('# REDIS_HOST will be available once ElastiCache finishes — check AWS Console');
      }

      const envPath = join(ctx.projectDir, '.env');
      // Append to existing .env rather than overwrite
      const { readFile } = await import('node:fs/promises');
      let existing = '';
      try { existing = await readFile(envPath, 'utf-8'); } catch { /* file doesn't exist yet */ }
      const separator = existing ? '\n\n' : '';
      await writeFile(envPath, existing + separator + envLines.join('\n') + '\n', 'utf-8');

      emit({ step: 'write-env', status: 'done', message: 'Infrastructure config written to .env' });
    } catch (err) {
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
            await rds.send(new DeleteDBInstanceCommand({
              DBInstanceIdentifier: resource.id,
              SkipFinalSnapshot: true,
            }));
            break;
          }
          case 'elasticache-cluster': {
            const { ElastiCacheClient, DeleteCacheClusterCommand } = await import('@aws-sdk/client-elasticache');
            const ec = new ElastiCacheClient(awsConfig);
            await ec.send(new DeleteCacheClusterCommand({ CacheClusterId: resource.id }));
            break;
          }
        }
      } catch (err) {
        console.error(`Failed to cleanup ${resource.type} ${resource.id}:`, (err as Error).message);
      }
    }
  },
};
