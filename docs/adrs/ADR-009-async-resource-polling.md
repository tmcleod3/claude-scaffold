# ADR-009: Async Resource Polling for RDS and ElastiCache

## Status: Proposed

## Context
RDS instances take 5-10 minutes and ElastiCache clusters take 1-2 minutes to become available after creation. Currently, the AWS VPS provisioner creates these resources but doesn't wait — the user gets a `DB_INSTANCE_ID` but not a `DB_HOST`, and must check the AWS Console manually to get connection endpoints.

This means the generated `.env` file is incomplete, and the first deploy requires manual intervention to fill in database and cache connection strings.

## Decision
Add polling loops inside `aws-vps.ts` that wait for RDS and ElastiCache to reach `available` status, then extract the endpoints and add them to provisioner outputs.

**Poll inside the provisioner, not as a post-provision step.** The polling is AWS-specific and the outputs (`DB_HOST`, `REDIS_HOST`) need to be available before post-provision steps (DNS, registrar) run.

### Poll parameters:
- **RDS:** Poll every 10 seconds, emit progress every 30 seconds, timeout at 15 minutes
- **ElastiCache:** Poll every 5 seconds, emit progress every 15 seconds, timeout at 5 minutes
- Both are non-fatal — if timeout, emit error event and continue with what we have

### AWS SDK calls:
- `DescribeDBInstancesCommand` → check `DBInstanceStatus === 'available'` → extract `Endpoint.Address`
- `DescribeCacheClustersCommand` (with `ShowCacheNodeInfo: true`) → check `CacheClusterStatus === 'available'` → extract `CacheNodes[0].Endpoint.Address`

### New outputs:
- `DB_HOST` — RDS endpoint address
- `DB_USERNAME` — `admin` (already known at creation time, just not stored)
- `REDIS_HOST` — ElastiCache endpoint address
- `REDIS_PORT` — `6379`

## Consequences

**Enables:**
- Complete `.env` file with real connection strings on first provision
- Generated deploy scripts work without manual endpoint lookup
- DNS post-provision has all outputs available if needed in the future

**Trade-offs:**
- Provisioning takes longer (5-15 minutes vs current ~30 seconds)
- SSE stream stays open for the duration — existing 15s keepalive handles proxy timeouts
- If user closes browser mid-poll, resources still exist (manifest tracks them) but outputs are lost

**Mitigations:**
- Non-fatal: timeout doesn't fail the overall provision
- Progress events keep the user informed ("RDS status: creating... elapsed 2m 30s")
- AbortController integration allows the cancel button to stop polling loops when the client disconnects

## Alternatives
1. **Post-provision polling step** — Rejected. Outputs need to be available before DNS runs. Also, polling is AWS-specific and belongs with the AWS provisioner.
2. **Background job that updates .env later** — Rejected. Adds complexity (needs a separate process, file locking). The SSE stream is already open and keepalive-protected.
3. **AWS EventBridge / CloudWatch Events** — Rejected. Requires additional AWS infrastructure (SNS topic, webhook receiver). Overkill for a one-time wait.
