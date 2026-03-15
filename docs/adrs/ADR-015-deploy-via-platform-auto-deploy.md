# ADR-015: Platform Deploy via GitHub Auto-Deploy, Not Direct API

## Status: Accepted

## Context
For Vercel, Cloudflare Pages, and Railway, v3.8.0 can either:
- (A) Link the GitHub repo and let the platform auto-deploy on push
- (B) Trigger deployments explicitly via platform APIs

## Decision
Option A — link the repo, push code, and let the platform handle deployment. Poll the platform's deployment status to confirm success.

This gives users permanent CI/CD: every subsequent push to main auto-deploys. Option B would only deploy once and require re-triggering for future changes.

## Consequences
- Vercel: Call link API, then poll `/v13/deployments` for the deployment triggered by the push
- Cloudflare: Include `source` in project creation, then push triggers Pages build
- Railway: Create service with GitHub source, push triggers deploy
- All three get permanent CI/CD out of the box
- First deploy may take longer (platform must clone, build, deploy)

## Alternatives
1. **Direct API deployment (upload artifacts):** Rejected — one-time only, no CI/CD
2. **Generate GitHub Actions workflow:** Rejected — adds complexity, platform-native auto-deploy is simpler
