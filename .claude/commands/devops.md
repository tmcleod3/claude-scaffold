# /devops — Kusanagi's Infrastructure & Deploy

## Context Setup
1. Read `/logs/build-state.md` — understand current project state
2. Read `/docs/PRD.md` frontmatter — check `deploy` value to determine target
3. Read `/docs/methods/DEVOPS_ENGINEER.md`

## Deploy Target Branching

The infrastructure sequence adapts based on `deploy` in PRD frontmatter:

| Target | Senku | Levi | Spike | L | Bulma |
|--------|-------|------|-------|---|-------|
| `vps` | Full provision.sh | PM2 + deploy.sh | Caddy/Nginx + DNS | Health + uptime | DB backup + cron |
| `vercel` | Skip | `vercel.json` config | DNS only | Vercel analytics | Vercel Postgres backup |
| `railway` | Skip | railway.toml config | DNS only | Railway metrics | Railway backup |
| `docker` | Dockerfile + compose | docker-compose deploy | Traefik/Caddy | Container health | Volume backup |
| `static` | Skip | Static hosting config | DNS + CDN | Uptime monitor only | Skip |

## Sequence — VPS (full)

### Senku — Provisioning
Create `/scripts/provision.sh`:
- System updates, tools, runtime (Node/Python/Ruby per stack)
- Database (Postgres/MySQL), Redis if needed
- Reverse proxy (Caddy preferred), process manager (PM2)
- App user (non-root), firewall (22/80/443 only), fail2ban
- Log rotation, swap, unattended security upgrades
- Script must be idempotent — safe to run twice

### Levi — Deployment
Create `/scripts/deploy.sh`:
- Pull latest code → `npm ci` → generate ORM → migrate → build → reload PM2 → health check
- Auto-rollback on health check failure
- Create `/scripts/rollback.sh` for manual rollback

### Spike — Networking
- Caddyfile or nginx config with HTTPS, gzip, security headers
- SSL auto-renewal
- DNS records documented
- SPF/DKIM/DMARC for email sending

### PM2 Config
Create `ecosystem.config.js`:
- Web: cluster mode (>= 2 instances), memory limit
- Workers: fork mode, memory limit
- Auto-start on reboot (`pm2 startup` + `pm2 save`)

### L — Monitoring
- Health endpoint: `/api/health` checking DB, Redis (if used), disk space
- External uptime monitor (document which service)
- Structured request logging (method, path, status, duration)
- Error tracking integration
- Slow query logging (>1s)
- Alerts: CPU >80%, Memory >85%, Disk >80%

### Bulma — Backup
Create `/scripts/backup-db.sh`:
- Compressed database dump
- Upload to off-site storage (R2/S3)
- 30-day retention, auto-cleanup
- Daily cron job
- **Test restore at least once** — document the procedure

### Holo — Cost
Document in `/docs/INFRASTRUCTURE.md`:
- Monthly hosting cost
- Per-user cost at current and projected scale
- Most expensive service
- Right-sizing recommendations

## First-Deploy Pre-flight Checklist

Before the first production deployment:

- [ ] All environment variables set on server (compare against .env.example)
- [ ] Secrets are production values (not dev/test keys)
- [ ] Database created and accessible from server
- [ ] Database seeded with required initial data (admin user, default config)
- [ ] DNS records pointed to server IP
- [ ] SSL certificate provisioned (or auto-provision configured)
- [ ] Firewall rules active (22/80/443 only)
- [ ] Health check endpoint responds correctly
- [ ] Deploy script tested on a staging environment first (if available)
- [ ] Rollback script tested
- [ ] Backup script runs successfully
- [ ] Monitoring alerts configured and tested
- [ ] Error tracking receives test errors
- [ ] Kenobi has reviewed server security configuration

Log all results to `/logs/phase-12-deploy.md`.

## Deliverables
1. /scripts/ (provision.sh, deploy.sh, rollback.sh, backup-db.sh)
2. /docs/RUNBOOK.md — operational procedures for 3am debugging
3. /docs/INFRASTRUCTURE.md — server inventory, DNS, costs
4. ecosystem.config.js (or equivalent)
5. Reverse proxy config
6. Cron jobs documented
7. Monitoring configured

## Handoffs
- Code bugs found during deploy → Batman, log to `/logs/handoffs.md`
- Security config review → Kenobi, log to `/logs/handoffs.md`
- Scaling architecture → Picard, log to `/logs/handoffs.md`
- App performance issues → Stark, log to `/logs/handoffs.md`
