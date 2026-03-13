# QA Reference

> Auto-maintained by the QA agent. Update after every QA pass.

## Stack
- **Language:** TypeScript (strict mode, ESM)
- **Runtime:** Node.js 20+
- **Package Manager:** npm
- **Framework:** None (raw `node:http` server, vanilla JS frontend)
- **Database:** None (encrypted vault file for credentials)
- **External APIs:** Anthropic (PRD generation), AWS SDK (provisioning), Vercel/Railway/Cloudflare (validation only)

## How to Run
```bash
npm run wizard       # Launches wizard server + opens browser
npm run typecheck    # TypeScript strict check (no emit)
```

## How to Validate
1. `npm run typecheck` passes with zero errors
2. `npm run wizard` launches, all 9 steps complete
3. Docker target: generates valid Dockerfile + docker-compose.yml
4. Config stubs: generate appropriate config files (vercel.json, railway.toml, wrangler.toml)
5. AWS VPS target: requires real credentials (manual validation)
6. Skip provisioning: flow completes cleanly
7. SSE stream: provision logs render in real-time in browser

## Critical Flows to Test
1. Full wizard flow: vault unlock -> cloud creds -> project setup -> PRD -> deploy target -> review -> create -> provision -> done
2. Simple mode flow: vault unlock -> project setup -> PRD -> review -> create -> provision -> done
3. Docker provisioning: generates Dockerfile, docker-compose.yml, .dockerignore
4. AWS VPS provisioning: STS validate -> key pair -> SG -> AMI -> EC2 -> RDS -> ElastiCache -> scripts -> .env
5. Config stub provisioning: vercel.json / railway.toml / wrangler.toml / deploy-s3.sh
6. Skip provisioning: transitions cleanly to done step
7. Provision error + cleanup: resources cleaned up, user can continue
8. SSE streaming: events render in real-time with correct status icons

## Known Issues
_None yet._

## Regression Checklist

| # | Flow | Steps | Expected | Status | Added |
|---|------|-------|----------|--------|-------|
| 1 | Typecheck | Run `npm run typecheck` | Zero errors | Pass | Phase 3 |
| 2 | Wizard launches | Run `npm run wizard` | Server starts, browser opens | Manual | Phase 3 |
| 3 | Full 9-step flow | Complete all wizard steps in advanced mode | Project created, provisioned, done screen shows | Manual | Phase 3 |
| 4 | Simple mode flow | Choose simple setup, complete wizard | Steps 2(cloud) and 5(deploy) skipped, Docker provisioned | Manual | Phase 3 |
| 5 | Docker provisioning | Select Docker target, create project | Dockerfile + docker-compose.yml + .dockerignore generated | Manual | Phase 3 |
| 6 | Vercel config stub | Select Vercel target | vercel.json generated, message says "deploy with vercel deploy" | Manual | Phase 3 |
| 7 | Railway config stub | Select Railway target | railway.toml generated | Manual | Phase 3 |
| 8 | Cloudflare config stub | Select Cloudflare target | wrangler.toml generated | Manual | Phase 3 |
| 9 | Static S3 config stub | Select Static target | infra/deploy-s3.sh generated with correct --exclude/--include | Manual | Phase 3 |
| 10 | Skip provisioning | Click "Skip Provisioning" on step 8 | Navigates to done, in-flight fetch aborted | Manual | Phase 3 |
| 11 | Provision error + cleanup | Trigger error during provisioning, click cleanup | Resources cleaned up, user can continue | Manual | Phase 3 |
| 12 | SSE streaming | Watch provision log during Docker provisioning | Events render with spinner -> checkmark transitions | Manual | Phase 3 |
| 13 | Project name with quotes | Use project name containing single quote | ecosystem.config.js renders correctly (no injection) | Manual | Phase 3 |
| 14 | AWS VPS provisioning | Provide real AWS creds, select VPS | EC2 + SG created, scripts in infra/, .env updated | Manual (needs AWS) | Phase 3 |
| 15 | .ssh/ not committed | After VPS provisioning, run `git status` | .ssh/ not listed as untracked | Manual | Phase 3 |
| 16 | Provision confirmation gate | Click "Create Project", reach step 8 | See confirmation with resource description + "Start Provisioning" button | Manual | UX Audit |
| 17 | AWS disclosure | Select VPS target, reach step 8 | Confirmation warns about AWS charges and resource creation | Manual | UX Audit |
| 18 | Focus on step 9 | Complete provisioning, click Continue | Focus moves to "Project Created!" heading | Manual | UX Audit |
| 19 | DB password masked | Complete AWS+RDS provisioning | Password shows as dots in infra details, not plaintext | Manual | UX Audit |
| 20 | Keyboard: step 8 | Tab through step 8 | Start, Skip buttons reachable; after provisioning, Continue reachable | Manual | UX Audit |
| 21 | Mobile: provision log | View step 8 on mobile viewport | Log max-height reduced, readable | Manual | UX Audit |
| 22 | Mobile: infra details | View step 9 infra on mobile | Items stack vertically, long values wrap | Manual | UX Audit |
| 23 | Provision empty state | Reach step 8 before provisioning starts | Shows "Waiting for provisioning to start..." | Manual | UX Audit |
| 24 | Continue Without Infrastructure | Trigger provision error, click "Continue Without Infrastructure" | Reaches done step, skipped state noted | Manual | UX Audit |
| 25 | Vercel provisioning | Connect Vercel token, select Vercel target | Project created on Vercel, vercel.json generated | Pass | QA2 |
| 26 | Railway provisioning | Connect Railway token, select Railway target | Project created on Railway, railway.toml generated | Pass | QA2 |
| 27 | Cloudflare provisioning | Connect CF token, select Cloudflare target | Pages project created, wrangler.toml generated | Pass | QA2 |
| 28 | Static S3 provisioning | Use AWS creds, select Static target | S3 bucket created with static hosting, deploy script generated | Pass | QA2 |
| 29 | Special char project name | Use name like "!!!" or "---" | Slug falls back to "voidforge-project", no crash | Manual | QA2 |
| 30 | API returns HTML error | Simulate non-JSON response | Graceful error message, no JSON.parse crash | Manual | QA2 |
