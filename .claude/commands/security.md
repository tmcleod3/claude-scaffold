# /security — Kenobi's Security Audit

## Context Setup
1. Read `/logs/build-state.md` — understand current project state
2. Read `/docs/methods/SECURITY_AUDITOR.md`

## Audit Sequence

### Phase 1 — Independent audits (parallel analysis)
Use the Agent tool to run these simultaneously — all are read-only analysis:
- **Agent 1 (Leia — Secrets):** Scan source code for hardcoded secrets, check .env is gitignored, check git history for leaked keys (`git log -p --all -S 'password' -S 'secret' -S 'api_key'`), verify different secrets dev/prod
- **Agent 2 (Chewie — Dependencies):** Run `npm audit`, check for critical/high vulns, verify lock file committed, check for deprecated packages
- **Agent 3 (Rex — Infrastructure):** Check security headers (HSTS, CSP, X-Frame-Options, CORS), verify TLS config, check for exposed ports/debug endpoints

### Phase 2 — Sequential audits (depend on understanding the codebase)
These require full codebase context — run sequentially:

**Yoda — Auth:**
- Password hashing (bcrypt >= 12 rounds, no plaintext anywhere)
- Session management (crypto random, httpOnly/secure/sameSite, invalidated on logout)
- OAuth (state param, redirect whitelist, server-side exchange)
- Reset tokens (single-use, expire, rate limited)
- Reference `/docs/patterns/middleware.ts` for auth middleware patterns

**Windu — Input:**
- SQL injection (parameterized queries everywhere)
- XSS (escaped output, no dangerouslySetInnerHTML without sanitization, CSP)
- SSRF (URL allowlist if user provides URLs)
- Command injection (no user input in shell commands)
- Path traversal (sanitized filenames)

**Ahsoka — Access Control:**
- Every endpoint verifies ownership (no IDOR)
- UUIDs not sequential IDs in URLs
- Admin verified server-side (not just hidden UI)
- Tier features verified server-side
- Rate limiting per-user and per-IP
- Reference `/docs/patterns/multi-tenant.ts` if multi-tenant

**Padme — Data:**
- PII identified and cataloged
- PII not in logs, error messages, or URLs
- Deletion possible (GDPR right to erasure)
- Backups encrypted

### Phase 3 — Log findings
Write all findings to `/logs/phase-11-security-audit.md` (or appropriate phase log):

| ID | Finding | Severity | Category | Location | Remediation | Status |
|----|---------|----------|----------|----------|-------------|--------|

Severity = exploitability x impact. Critical (auth bypass, data leak) > High (injection, IDOR) > Medium (missing headers, weak config) > Low (best practice)

### Phase 4 — Remediate
Fix critical and high findings immediately. Medium findings get tracked. For each fix:
1. Apply the fix
2. Verify it works
3. Check it didn't break anything (`npm test`)
4. Update the finding status in the log

### Phase 5 — Deliverables
1. SECURITY_AUDIT.md — prioritized findings with evidence
2. SECURITY_CHECKLIST.md — reusable pre-deploy verification list
3. Remediation code fixes
4. INCIDENT_RESPONSE.md — if none exists, create template

## Handoffs
- Backend refactoring needed → Stark, log to `/logs/handoffs.md`
- UI changes needed → Galadriel, log to `/logs/handoffs.md`
- Infrastructure changes → Kusanagi, log to `/logs/handoffs.md`
- Verify fixes didn't break → Batman, log to `/logs/handoffs.md`
