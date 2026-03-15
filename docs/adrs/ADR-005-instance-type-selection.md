# ADR-005: PRD-Driven EC2 Instance Type Selection

## Status: Accepted

## Context

EC2 instance type is hardcoded to `t3.micro` in the AWS VPS provisioner (aws-vps.ts), with matching hardcoded sizes for RDS (`db.t3.micro`) and ElastiCache (`cache.t3.micro`). Different projects have different resource needs — a static site doesn't need what a full-stack app with database, cache, and background workers needs.

Users have no way to choose instance size. The system should recommend based on project scope and allow override.

## Decision

1. Add `instance_type` field to PRD YAML frontmatter (under Deployment section)
2. Build a scoring heuristic (`recommendInstanceType()`) in `wizard/lib/instance-sizing.ts` that reads PRD signals (type, database, cache, workers, payments, framework) and recommends `t3.micro`, `t3.small`, or `t3.medium`
3. Surface the recommendation in the Haku deploy wizard (Step 2: Review & Configure) with a dropdown to override
4. Add `instanceType` to `ProvisionContext` interface
5. AWS provisioner reads `ctx.instanceType` instead of hardcoding; RDS and ElastiCache sizes mirror the EC2 choice
6. Constrain to t3 family only: `t3.micro | t3.small | t3.medium | t3.large`
7. `t3.large` is never auto-recommended (cost protection) — requires explicit user selection

## Consequences

- **Enables:** Right-sized infrastructure from PRD scope analysis
- **Backward compatible:** Missing `instance_type` defaults to `t3.micro`
- **Cost visibility:** Users choose their cost/performance tradeoff explicitly
- **Prevents:** Cost surprises (no auto-recommendation above t3.medium)
- **Future:** Cost Tracker (v4 Prophecy) can show estimated monthly cost per selection

## Alternatives

1. **Only manual selection (no recommendation):** Rejected — users who don't know AWS instance types get no guidance
2. **Full auto-detect from codebase analysis:** Rejected — over-engineering; PRD frontmatter signals are sufficient
3. **Support all instance families (c5, m5, r5, etc.):** Rejected — t3 burstable covers the single-server use case; exotic types add complexity without clear benefit for VoidForge's audience
4. **Per-resource sizing (different sizes for EC2/RDS/ElastiCache):** Rejected — creates decision fatigue; consistent sizing is simpler and avoids resource mismatches
