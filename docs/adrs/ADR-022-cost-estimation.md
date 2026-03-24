# ADR-022: AWS Cost Estimation Before Provisioning

## Status: Accepted

## Context
Users provision AWS resources without knowing the monthly cost. After provisioning, they discover unexpected bills. Cost information should be surfaced before resources are created.

## Decision
Add a cost estimation step that runs BEFORE the provisioner for AWS targets (VPS and static-s3). Estimates based on instance type, RDS class, ElastiCache node type, and S3 storage. Emits an SSE event with the estimate. Does not block provisioning — informational only.

Lives in `wizard/lib/cost-estimator.ts`. Called from `provision.ts` before the provisioner for AWS targets.

## Consequences
- Users see cost before committing to AWS resources
- Estimates are rough (on-demand pricing, no reserved/spot)
- Non-AWS targets skip this step
- Pricing hardcoded — may drift from actual AWS pricing over time
