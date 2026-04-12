# /deploy — Kusanagi's Deploy Agent

> *"The net is vast and infinite. But your code isn't on it until you deploy."*

Read `/docs/methods/DEVOPS_ENGINEER.md` for operating rules (see "Deploy Automation" section).

## Silver Surfer Pre-Scan (ADR-048)

Before agent deployment, the Silver Surfer selects the optimal roster:

Run: `npx thevoidforge herald --command /deploy --json`
(Add `--focus "<topic>"` if the user provided `--focus`)

Parse the JSON output. The `roster` array contains agent IDs to deploy alongside this command's lead agents. If the command fails or returns an empty roster, use the hardcoded manifest below.

**`--focus "topic"`** biases the Surfer toward agents matching the topic.
**`--light`** skips the Surfer — uses only hardcoded core roster.
**`--solo`** skips Surfer and all sub-agents — lead only.

## Context Setup
1. Read PRD frontmatter for `deploy:` target (vps, vercel, railway, docker, static, cloudflare)
2. Read `/logs/deploy-state.md` — if exists, check last deploy status
3. Read `.env` or vault for deploy credentials (SSH_HOST, SSH_KEY_PATH, VERCEL_TOKEN, etc.)
4. Check `git status` — refuse to deploy with uncommitted changes

## Step 1 — Target Detection (Kusanagi)

Read deploy target from PRD frontmatter. If not specified, scan for evidence:
- `vercel.json` or `.vercel/` → Vercel
- `railway.json` or `railway.toml` → Railway
- `Dockerfile` or `docker-compose.yml` → Docker
- `SSH_HOST` in .env or vault → VPS/EC2
- `wrangler.toml` → Cloudflare Workers/Pages
- None found → ask: "Where should this deploy? [vps/vercel/railway/docker/static]"

## Step 2 — Pre-Deploy Checks (Levi)

Levi verifies the deploy is safe:
1. **Build passes:** `npm run build` (or equivalent) must succeed
2. **Tests pass:** `npm test` must pass (if test suite exists)
3. **No uncommitted changes:** `git status` clean
4. **Credentials available:** SSH key, API token, or platform credentials accessible
5. **Version tagged:** Current version from VERSION.md matches the commit being deployed
6. If any check fails → ABORT with clear error message

## Step 3 — Deploy Execution (Levi)

Execute the deploy strategy for the detected target:

**VPS/EC2:**
```
1. ssh -i $KEY $USER@$HOST "cd /opt/app && git pull origin main"
2. ssh ... "npm ci --production"
3. ssh ... "npx prisma migrate deploy" (if Prisma detected)
4. ssh ... "npm run build"
5. ssh ... "pm2 restart ecosystem.config.js" (or systemd restart)
```

**Vercel:** `vercel --prod --token $VERCEL_TOKEN`
**Railway:** `railway up` or git push to Railway remote
**Docker:** `docker build -t app . && docker push && ssh ... "docker pull && docker restart"`
**Static/Cloudflare:** `wrangler deploy` or S3 sync

## Step 4 — Health Check (L)

After deploy completes:
1. Wait 10 seconds for service startup
2. Curl the health endpoint: `curl -sf https://$DEPLOY_URL/api/health` or the root URL
3. Verify HTTP 200 response within 30 seconds
4. If health check fails → Step 5 (rollback)
5. If healthy → log success to deploy-state.md

## Step 5 — Rollback (Valkyrie)

If health check fails:
1. **VPS:** `ssh ... "git checkout HEAD~1 && npm ci && npm run build && pm2 restart"`
2. **Vercel:** `vercel rollback --token $VERCEL_TOKEN`
3. **Docker:** `ssh ... "docker restart [previous-image]"`
4. Re-run health check on rolled-back version
5. Log rollback to deploy-state.md with timestamp and reason

## Step 6 — Report

```
═══════════════════════════════════════════
  DEPLOY COMPLETE
═══════════════════════════════════════════
  Target:     [vps | vercel | railway | docker]
  URL:        https://your-app.com
  Version:    v2.9.0
  Commit:     abc123
  Health:     ✓ 200 OK (142ms)
  Timestamp:  2026-03-22T12:00:00Z
═══════════════════════════════════════════
```

Update `/logs/deploy-state.md` with deploy results.

## Arguments
- No arguments → detect target and deploy
- `--staging` → deploy to staging/preview (if target supports it)
- `--rollback` → rollback to previous deploy
- `--status` → show current deploy state without deploying
- `--dry-run` → show what would be deployed without executing
- `--focus "topic"` → Bias Herald toward topic (natural-language, additive)

## Safety Rails
- Never deploy with uncommitted changes
- Never deploy without a passing build
- Always health check after deploy
- Always rollback on health check failure
- Deploy log with timestamps for audit trail
- In autonomous campaign mode: auto-deploy after Victory Gauntlet passes
