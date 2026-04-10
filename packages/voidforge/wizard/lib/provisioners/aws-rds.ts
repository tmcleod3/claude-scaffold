/**
 * AWS RDS + ElastiCache provisioning — database and cache service creation with polling.
 */

import { randomBytes } from 'node:crypto';
import type { ProvisionContext, ProvisionEmitter } from './types.js';
import type { InstanceType as Ec2InstanceType } from '../instance-sizing.js';
import type { AwsProvisionState } from './aws-config.js';
import { cancellableSleep } from './aws-config.js';
import { rdsInstanceClass, cacheNodeType } from '../instance-sizing.js';
import { recordResourcePending, recordResourceCreated } from '../provision-manifest.js';

/** Step 7: Provision RDS database (postgres or mysql). Non-fatal on failure. */
export async function provisionRds(
  state: AwsProvisionState,
  ctx: ProvisionContext,
  ec2InstanceType: Ec2InstanceType,
  emit: ProvisionEmitter,
): Promise<void> {
  if (ctx.database !== 'postgres' && ctx.database !== 'mysql') {
    emit({ step: 'rds', status: 'skipped', message: 'No database requested' });
    return;
  }

  emit({ step: 'rds', status: 'started', message: `Creating RDS instance (${ctx.database})` });
  try {
    const { RDSClient, CreateDBInstanceCommand, DescribeDBInstancesCommand } = await import('@aws-sdk/client-rds');
    const rds = new RDSClient(state.awsConfig);

    const engine = ctx.database === 'postgres' ? 'postgres' : 'mysql';
    const port = ctx.database === 'postgres' ? 5432 : 3306;
    const dbInstanceId = `${state.slug}-db`;
    // IG-R2: Random username instead of hardcoded 'admin'
    const dbUsername = `vf_${randomBytes(4).toString('hex')}`;
    const specials = '!@#$%^&*';
    const suffix = String.fromCharCode(65 + Math.floor(Math.random() * 26)) + Math.floor(Math.random() * 10) + specials[Math.floor(Math.random() * specials.length)];
    const dbPassword = randomBytes(16).toString('hex') + suffix;

    await recordResourcePending(ctx.runId, 'rds-instance', dbInstanceId, state.region);
    await rds.send(new CreateDBInstanceCommand({
      DBInstanceIdentifier: dbInstanceId,
      DBInstanceClass: rdsInstanceClass(ec2InstanceType),
      Engine: engine,
      MasterUsername: dbUsername,
      MasterUserPassword: dbPassword,
      AllocatedStorage: 20,
      PubliclyAccessible: false,
      VpcSecurityGroupIds: [state.sgId],
      Tags: [
        { Key: 'Name', Value: `${ctx.projectName}-db` },
        { Key: 'ManagedBy', Value: 'VoidForge' },
      ],
    }));

    state.resources.push({ type: 'rds-instance', id: dbInstanceId, region: state.region });
    await recordResourceCreated(ctx.runId, 'rds-instance', dbInstanceId, state.region);
    state.outputs['DB_ENGINE'] = engine;
    state.outputs['DB_PORT'] = String(port);
    state.outputs['DB_INSTANCE_ID'] = dbInstanceId;
    state.outputs['DB_USERNAME'] = dbUsername;
    state.outputs['DB_PASSWORD'] = dbPassword;
    emit({ step: 'rds', status: 'done', message: `RDS instance "${dbInstanceId}" created — waiting for endpoint` });

    // Step 7b: Poll RDS until available (non-fatal on timeout)
    await pollRdsEndpoint(state, ctx, rds, DescribeDBInstancesCommand, dbInstanceId, emit);
  } catch (err) {
    console.error('RDS creation error:', (err as Error).message);
    emit({ step: 'rds', status: 'error', message: 'Failed to create RDS instance', detail: 'Check AWS Console for details' });
    // Non-fatal — continue without DB
  }
}

async function pollRdsEndpoint(
  state: AwsProvisionState,
  ctx: ProvisionContext,
  rds: InstanceType<typeof import('@aws-sdk/client-rds').RDSClient>,
  DescribeDBInstancesCommand: typeof import('@aws-sdk/client-rds').DescribeDBInstancesCommand,
  dbInstanceId: string,
  emit: ProvisionEmitter,
): Promise<void> {
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
      state.outputs['DB_HOST'] = dbHost;
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
}

/** Step 8: Provision ElastiCache Redis cluster. Non-fatal on failure. */
export async function provisionElastiCache(
  state: AwsProvisionState,
  ctx: ProvisionContext,
  ec2InstanceType: Ec2InstanceType,
  emit: ProvisionEmitter,
): Promise<void> {
  if (ctx.cache !== 'redis') {
    emit({ step: 'elasticache', status: 'skipped', message: 'No cache requested' });
    return;
  }

  emit({ step: 'elasticache', status: 'started', message: 'Creating ElastiCache Redis cluster' });
  try {
    const { ElastiCacheClient, CreateCacheClusterCommand, DescribeCacheClustersCommand } = await import('@aws-sdk/client-elasticache');
    const elasticache = new ElastiCacheClient(state.awsConfig);
    const clusterId = `${state.slug}-redis`;

    await recordResourcePending(ctx.runId, 'elasticache-cluster', clusterId, state.region);
    // Note: CreateCacheClusterCommand does not support AuthToken — Redis AUTH requires
    // CreateReplicationGroupCommand with TransitEncryptionEnabled. Security relies on
    // SG isolation (only instances in the same SG can reach the Redis port). (IG-R3)
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

    state.resources.push({ type: 'elasticache-cluster', id: clusterId, region: state.region });
    await recordResourceCreated(ctx.runId, 'elasticache-cluster', clusterId, state.region);
    state.outputs['REDIS_CLUSTER_ID'] = clusterId;
    emit({ step: 'elasticache', status: 'done', message: `ElastiCache cluster "${clusterId}" created — waiting for endpoint` });

    // Step 8b: Poll ElastiCache until available
    await pollCacheEndpoint(state, ctx, elasticache, DescribeCacheClustersCommand, clusterId, emit);
  } catch (err) {
    console.error('ElastiCache creation error:', (err as Error).message);
    emit({ step: 'elasticache', status: 'error', message: 'Failed to create ElastiCache cluster', detail: 'Check AWS Console for details' });
    // Non-fatal
  }
}

async function pollCacheEndpoint(
  state: AwsProvisionState,
  ctx: ProvisionContext,
  elasticache: InstanceType<typeof import('@aws-sdk/client-elasticache').ElastiCacheClient>,
  DescribeCacheClustersCommand: typeof import('@aws-sdk/client-elasticache').DescribeCacheClustersCommand,
  clusterId: string,
  emit: ProvisionEmitter,
): Promise<void> {
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
      state.outputs['REDIS_HOST'] = redisHost;
      state.outputs['REDIS_PORT'] = '6379';
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
}
