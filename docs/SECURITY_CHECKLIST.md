# VoidForge — Pre-Deploy Security Checklist

Reusable checklist for each release. Run through before shipping.

## Secrets
- [ ] No hardcoded secrets in source (`grep -r 'sk-ant-\|AKIA\|password.*=' wizard/ scripts/`)
- [ ] `.env` in `.gitignore`
- [ ] `.ssh/` in `.gitignore`
- [ ] No `.env` files committed (`git ls-files | grep '\.env'`)
- [ ] No secrets in git history (`git log -p --all -S 'password' -S 'secret' -S 'sk-ant-' -- '*.ts' '*.js'`)
- [ ] Session password memory-only (never written to disk/logs)
- [ ] All API keys flow through encrypted vault

## Vault
- [ ] AES-256-GCM encryption active
- [ ] PBKDF2 key derivation >= 100k iterations
- [ ] Fresh random salt + IV per encryption
- [ ] Atomic writes (temp + fsync + rename)
- [ ] File permissions 0o600
- [ ] Write queue serializes concurrent operations

## Server
- [ ] Binds to `127.0.0.1` only (not `0.0.0.0`)
- [ ] CORS scoped to self-origin (not wildcard)
- [ ] Security headers set: X-Content-Type-Options, X-Frame-Options, CSP, Referrer-Policy, Permissions-Policy
- [ ] Path traversal prevented (resolve + prefix check)
- [ ] Body size limited (1MB max)
- [ ] Error responses don't leak internal details
- [ ] SSE keepalive active on long-running streams

## AWS Provisioning
- [ ] SSH/HTTP/HTTPS ports: 0.0.0.0/0 (public — correct)
- [ ] DB/Redis ports: SG self-referencing only (not 0.0.0.0/0)
- [ ] Provision manifest written before each resource creation
- [ ] Cleanup endpoint available for orphaned resources
- [ ] RDS passwords generated with `crypto.randomBytes`
- [ ] SSH keys validated non-empty before writing

## Generated Infrastructure
- [ ] provision.sh: fail2ban, SSH hardening, firewall lockdown-first
- [ ] Caddyfile: HSTS, CSP, Permissions-Policy, no Server header
- [ ] Dockerfiles: non-root user
- [ ] docker-compose: DB/Redis ports internal-only, passwords from env vars
- [ ] PM2 config: crash-loop protection

## Input Validation
- [ ] All POST endpoints validate required fields
- [ ] Provider IDs matched against hardcoded list
- [ ] API key format checked before validation call
- [ ] All `innerHTML` uses `escapeHtml()` for dynamic content
- [ ] Shell commands use `execFile` (not `exec`)

## Dependencies
- [ ] `npm audit` returns 0 critical/high
- [ ] `package-lock.json` committed
- [ ] No unnecessary runtime dependencies
