# ADR-023: Post-Deploy Health Monitoring

## Status: Accepted

## Context
After deploy, there is no visibility into whether the application stays up. VPS deploys have no uptime monitoring. Platform deploys have dashboards but users don't know where to find them.

## Decision
For VPS: generate a cron-based health check script (`infra/healthcheck.sh`) that curls the deploy URL every 5 minutes and logs failures. For platform targets: emit SSE messages with direct links to the platform's monitoring dashboard (Vercel Analytics, Railway Metrics, Cloudflare Analytics).

Lives in `wizard/lib/health-monitor.ts`. Called from `provision.ts` after successful deploy.

## Consequences
- VPS users get basic uptime monitoring out of the box
- Platform users get one-click access to their monitoring dashboards
- VPS health script requires the server to have cron configured (standard on Amazon Linux)
- No alerting — just logging (alerting deferred to future version)
