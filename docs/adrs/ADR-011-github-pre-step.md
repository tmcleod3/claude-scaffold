# ADR-011: GitHub as Pre-Provision Step

## Status: Accepted

## Context
v3.8.0 adds GitHub integration (create repo, push code) so that platform-linked deploys work. The question is: should GitHub operations run before, after, or within the provisioner?

Cloudflare Pages requires the `source` (GitHub connection) to be set at project creation time — it cannot be added later via PATCH. Vercel and Railway link repos after project creation. AWS VPS and S3 don't consume GitHub at all.

## Decision
GitHub operations (create repo, git init, git push) run as a **pre-provision step** in `provision.ts`, before the provisioner's `provision()` method. Results are injected into the `outputs` map as `GITHUB_REPO_URL`, `GITHUB_OWNER`, `GITHUB_REPO_NAME`. Provisioners that need GitHub data read from outputs, matching the post-provision DNS pattern (ADR-006) but in reverse.

The Cloudflare provisioner is modified to include `source.type: "github"` in the project creation payload when GitHub outputs are available.

## Consequences
- GitHub step must succeed before Vercel/Cloudflare/Railway provisioners can link repos
- If GitHub step fails, provisioners still create unlinked projects (graceful degradation)
- No change to the `ProvisionContext` interface — GitHub data flows through `outputs`, not context fields
- AWS VPS and S3 targets skip GitHub step (deploy via SSH/SDK instead)

## Alternatives
1. **Post-provision step (like DNS):** Rejected — Cloudflare Pages requires source at creation time
2. **Modify ProvisionContext:** Rejected — adds fields irrelevant to Docker/S3/VPS, pollutes interface
3. **Separate orchestration layer:** Rejected — overengineered, SSE stream already handles sequencing
