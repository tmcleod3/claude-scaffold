# ADR-006: DNS as Post-Provision Step, Not Separate Provisioner

## Status: Accepted

## Context

VoidForge needs to wire custom domains to provisioned infrastructure. DNS record creation needs the *output* of provisioning — an EC2 public IP, a Pages subdomain, an S3 website URL — to know what to point the domain at. We need to decide whether DNS should be a separate provisioner or a step within the existing provision flow.

## Decision

DNS is a **post-provision step** that runs inside `wizard/api/provision.ts` after the primary provisioner returns, not a separate entry in the provisioner dispatch table.

The flow:
1. Primary provisioner runs (VPS, Cloudflare Pages, S3, etc.)
2. If provisioner succeeded AND `ctx.hostname` is set AND Cloudflare credentials exist in vault:
3. Run DNS step: look up zone, create A/CNAME record(s)
4. DNS failure is non-fatal — primary infrastructure is already live

DNS logic lives in `wizard/lib/dns/cloudflare-dns.ts` as a standalone module (not implementing the Provisioner interface).

## Consequences

- **Enables:** Single provision flow creates infra + wires DNS in one shot
- **Simplifies:** No second provision call, no orchestration between provisioners
- **Non-fatal:** DNS failure doesn't roll back working infrastructure
- **Cross-cutting:** Same DNS module works for VPS, Pages, S3, Vercel targets
- **Manifest integration:** DNS records tracked in the same run manifest for cleanup

## Alternatives

1. **DNS as separate provisioner:** Rejected — would require a second provision call and orchestration to pass outputs between provisioners
2. **DNS as middleware/hook:** Considered — cleaner separation but adds abstraction for one use case
3. **User runs DNS manually:** Rejected — this is exactly the gap v3.1 closes
