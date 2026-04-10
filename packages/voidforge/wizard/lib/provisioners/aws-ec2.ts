/**
 * AWS EC2 provisioning — credential validation, key pair, security group,
 * AMI lookup, instance launch, polling, and SSH restriction.
 */

import { writeFile, mkdir, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import type { IpPermission } from '@aws-sdk/client-ec2';
import type { ProvisionContext, ProvisionEmitter } from './types.js';
import type { InstanceType } from '../instance-sizing.js';
import type { AwsProvisionState } from './aws-config.js';
import { POLL_INTERVAL_MS, MAX_POLL_MS, cancellableSleep } from './aws-config.js';
import { recordResourcePending, recordResourceCreated } from '../provision-manifest.js';
import { slugify } from './http-client.js';

/** Step 1: Validate AWS credentials via STS. */
export async function validateCredentials(
  state: AwsProvisionState,
  stsMod: typeof import('@aws-sdk/client-sts'),
  emit: ProvisionEmitter,
): Promise<boolean> {
  emit({ step: 'validate-creds', status: 'started', message: 'Validating AWS credentials' });
  try {
    const sts = new stsMod.STSClient(state.awsConfig);
    const identity = await sts.send(new stsMod.GetCallerIdentityCommand({}));
    const entityName = (identity.Arn ?? 'unknown').split(/[/:]/).pop() ?? 'unknown';
    emit({ step: 'validate-creds', status: 'done', message: `Authenticated as ${entityName}` });
    return true;
  } catch (err) {
    console.error('AWS credential validation error:', (err as Error).message);
    emit({ step: 'validate-creds', status: 'error', message: 'Invalid AWS credentials', detail: 'Check AWS Console for details' });
    return false;
  }
}

/** Step 2: Create SSH key pair. */
export async function createKeyPair(
  state: AwsProvisionState,
  ctx: ProvisionContext,
  ec2Mod: typeof import('@aws-sdk/client-ec2'),
  emit: ProvisionEmitter,
): Promise<boolean> {
  emit({ step: 'key-pair', status: 'started', message: 'Creating SSH key pair' });
  const keyName = `${state.slug}-deploy`;
  try {
    const ec2 = new ec2Mod.EC2Client(state.awsConfig);
    await recordResourcePending(ctx.runId, 'key-pair', keyName, state.region);
    const keyResult = await ec2.send(new ec2Mod.CreateKeyPairCommand({
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
    state.files.push('.ssh/deploy-key.pem');
    state.resources.push({ type: 'key-pair', id: keyName, region: state.region });
    await recordResourceCreated(ctx.runId, 'key-pair', keyName, state.region);
    state.outputs['SSH_KEY_PATH'] = '.ssh/deploy-key.pem';
    emit({ step: 'key-pair', status: 'done', message: `Key pair "${keyName}" created` });
    return true;
  } catch (err) {
    console.error('Key pair creation error:', (err as Error).message);
    emit({ step: 'key-pair', status: 'error', message: 'Failed to create key pair', detail: 'Check AWS Console for details' });
    return false;
  }
}

/** Step 3: Create security group with ingress rules. */
export async function createSecurityGroup(
  state: AwsProvisionState,
  ctx: ProvisionContext,
  ec2Mod: typeof import('@aws-sdk/client-ec2'),
  emit: ProvisionEmitter,
): Promise<boolean> {
  emit({ step: 'security-group', status: 'started', message: 'Creating security group' });
  try {
    const ec2 = new ec2Mod.EC2Client(state.awsConfig);
    await recordResourcePending(ctx.runId, 'security-group', `${state.slug}-sg`, state.region);
    const sgResult = await ec2.send(new ec2Mod.CreateSecurityGroupCommand({
      GroupName: `${state.slug}-sg`,
      Description: `VoidForge security group for ${ctx.projectName}`,
    }));
    state.sgId = sgResult.GroupId ?? '';
    state.resources.push({ type: 'security-group', id: state.sgId, region: state.region });
    await recordResourceCreated(ctx.runId, 'security-group', state.sgId, state.region);

    // Authorize inbound: SSH (22), HTTP (80), HTTPS (443)
    // SSH initially open to 0.0.0.0/0 for provisioning — restricted to deployer IP at end (DEVOPS-R2-001).
    const ingressRules: IpPermission[] = [
      { IpProtocol: 'tcp', FromPort: 22, ToPort: 22, IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'SSH' }] },
      { IpProtocol: 'tcp', FromPort: 80, ToPort: 80, IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'HTTP' }] },
      { IpProtocol: 'tcp', FromPort: 443, ToPort: 443, IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'HTTPS' }] },
    ];

    // Allow DB port within the SG (self-referencing) so EC2 can reach RDS
    if (ctx.database === 'postgres') {
      ingressRules.push({ IpProtocol: 'tcp', FromPort: 5432, ToPort: 5432, UserIdGroupPairs: [{ GroupId: state.sgId, Description: 'PostgreSQL (SG-only)' }] });
    } else if (ctx.database === 'mysql') {
      ingressRules.push({ IpProtocol: 'tcp', FromPort: 3306, ToPort: 3306, UserIdGroupPairs: [{ GroupId: state.sgId, Description: 'MySQL (SG-only)' }] });
    }
    // Allow Redis port if cache requested
    if (ctx.cache === 'redis') {
      ingressRules.push({ IpProtocol: 'tcp', FromPort: 6379, ToPort: 6379, UserIdGroupPairs: [{ GroupId: state.sgId, Description: 'Redis (SG-only)' }] });
    }

    await ec2.send(new ec2Mod.AuthorizeSecurityGroupIngressCommand({
      GroupId: state.sgId,
      IpPermissions: ingressRules,
    }));

    const portList = ingressRules.map((r) => r.FromPort).join(', ');
    emit({ step: 'security-group', status: 'done', message: `Security group "${state.slug}-sg" created (ports ${portList})` });
    return true;
  } catch (err) {
    console.error('Security group creation error:', (err as Error).message);
    emit({ step: 'security-group', status: 'error', message: 'Failed to create security group', detail: 'Check AWS Console for details' });
    return false;
  }
}

/** Step 4: Find latest Amazon Linux 2023 AMI. */
export async function findAmi(
  state: AwsProvisionState,
  ec2Mod: typeof import('@aws-sdk/client-ec2'),
  emit: ProvisionEmitter,
): Promise<string | null> {
  emit({ step: 'ami-lookup', status: 'started', message: 'Finding latest Amazon Linux 2023 AMI' });
  try {
    const ec2 = new ec2Mod.EC2Client(state.awsConfig);
    const amiResult = await ec2.send(new ec2Mod.DescribeImagesCommand({
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
    const amiId = images[0].ImageId!;
    emit({ step: 'ami-lookup', status: 'done', message: `AMI: ${amiId}` });
    return amiId;
  } catch (err) {
    console.error('AMI lookup error:', (err as Error).message);
    emit({ step: 'ami-lookup', status: 'error', message: 'AMI lookup failed', detail: 'Check AWS Console for details' });
    return null;
  }
}

/** Steps 5-6: Launch EC2 instance and wait for it to be running. */
export async function launchAndWaitEc2(
  state: AwsProvisionState,
  ctx: ProvisionContext,
  ec2Mod: typeof import('@aws-sdk/client-ec2'),
  amiId: string,
  ec2InstanceType: InstanceType,
  emit: ProvisionEmitter,
): Promise<boolean> {
  // Step 5: Launch
  emit({ step: 'launch-ec2', status: 'started', message: `Launching EC2 instance (${ec2InstanceType})` });
  try {
    const ec2 = new ec2Mod.EC2Client(state.awsConfig);
    const keyName = `${state.slug}-deploy`;
    const userDataScript = `#!/bin/bash
dnf update -y
dnf install -y git curl`;

    await recordResourcePending(ctx.runId, 'ec2-instance', 'pending', state.region);
    const runResult = await ec2.send(new ec2Mod.RunInstancesCommand({
      ImageId: amiId,
      InstanceType: ec2InstanceType,
      MinCount: 1,
      MaxCount: 1,
      KeyName: keyName,
      SecurityGroupIds: [state.sgId],
      UserData: Buffer.from(userDataScript).toString('base64'),
      TagSpecifications: [{
        ResourceType: 'instance',
        Tags: [
          { Key: 'Name', Value: ctx.projectName },
          { Key: 'ManagedBy', Value: 'VoidForge' },
        ],
      }],
    }));

    state.instanceId = runResult.Instances?.[0]?.InstanceId ?? '';
    if (!state.instanceId) throw new Error('No instance ID returned');
    state.resources.push({ type: 'ec2-instance', id: state.instanceId, region: state.region });
    await recordResourceCreated(ctx.runId, 'ec2-instance', state.instanceId, state.region);
    emit({ step: 'launch-ec2', status: 'done', message: `Instance ${state.instanceId} launched` });
  } catch (err) {
    console.error('EC2 launch error:', (err as Error).message);
    emit({ step: 'launch-ec2', status: 'error', message: 'Failed to launch EC2', detail: 'Check AWS Console for details' });
    return false;
  }

  // Step 6: Wait for running
  emit({ step: 'wait-running', status: 'started', message: 'Waiting for instance to start...' });
  try {
    const ec2 = new ec2Mod.EC2Client(state.awsConfig);
    const start = Date.now();
    while (Date.now() - start < MAX_POLL_MS) {
      await cancellableSleep(POLL_INTERVAL_MS + Math.random() * 1000, ctx.abortSignal);
      const desc = await ec2.send(new ec2Mod.DescribeInstancesCommand({
        InstanceIds: [state.instanceId],
      }));
      const instance = desc.Reservations?.[0]?.Instances?.[0];
      const instanceState = instance?.State?.Name;

      if (instanceState === 'running') {
        state.publicIp = instance?.PublicIpAddress ?? '';
        if (state.publicIp) break;
      }
      if (instanceState === 'terminated' || instanceState === 'shutting-down') {
        throw new Error(`Instance entered state: ${instanceState}`);
      }
    }
    if (!state.publicIp) throw new Error('Instance did not get a public IP within timeout');
    state.outputs['SSH_HOST'] = state.publicIp;
    state.outputs['SSH_USER'] = 'ec2-user';
    emit({ step: 'wait-running', status: 'done', message: `Instance running at ${state.publicIp}` });
    return true;
  } catch (err) {
    if ((err as Error).message === 'Aborted') {
      emit({ step: 'wait-running', status: 'skipped', message: 'EC2 polling cancelled' });
      return true; // Non-fatal abort
    }
    console.error('EC2 wait error:', (err as Error).message);
    emit({ step: 'wait-running', status: 'error', message: 'Instance failed to start', detail: 'Check AWS Console for details' });
    return false;
  }
}

/** DEVOPS-R2-001: Restrict SSH from 0.0.0.0/0 to deployer's IP after provisioning. */
export async function restrictSsh(
  state: AwsProvisionState,
  emit: ProvisionEmitter,
): Promise<void> {
  try {
    const { EC2Client, RevokeSecurityGroupIngressCommand, AuthorizeSecurityGroupIngressCommand } = await import('@aws-sdk/client-ec2');
    const ec2Restrict = new EC2Client(state.awsConfig);

    // Detect deployer's public IP via checkip.amazonaws.com
    let deployerIp: string | null = null;
    try {
      const ipRes = await fetch('https://checkip.amazonaws.com', { signal: AbortSignal.timeout(5000) });
      if (ipRes.ok) deployerIp = (await ipRes.text()).trim();
    } catch { /* non-fatal — keep 0.0.0.0/0 if detection fails */ }

    if (deployerIp && /^\d+\.\d+\.\d+\.\d+$/.test(deployerIp)) {
      // Revoke the wide-open SSH rule
      await ec2Restrict.send(new RevokeSecurityGroupIngressCommand({
        GroupId: state.sgId,
        IpPermissions: [{ IpProtocol: 'tcp', FromPort: 22, ToPort: 22, IpRanges: [{ CidrIp: '0.0.0.0/0' }] }],
      }));
      // Add restricted SSH rule for deployer's IP only
      await ec2Restrict.send(new AuthorizeSecurityGroupIngressCommand({
        GroupId: state.sgId,
        IpPermissions: [{ IpProtocol: 'tcp', FromPort: 22, ToPort: 22, IpRanges: [{ CidrIp: `${deployerIp}/32`, Description: 'SSH (deployer IP)' }] }],
      }));
      emit({ step: 'ssh-restrict', status: 'done', message: `SSH restricted to ${deployerIp}/32 (was 0.0.0.0/0)` });
    } else {
      emit({ step: 'ssh-restrict', status: 'warning', message: 'Could not detect public IP — SSH remains open to 0.0.0.0/0. Restrict manually in AWS Console.' });
    }
  } catch (err) {
    emit({ step: 'ssh-restrict', status: 'warning', message: 'SSH restriction failed (non-fatal). Restrict port 22 manually.', detail: (err as Error).message });
  }
}
