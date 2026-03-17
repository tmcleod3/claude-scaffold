# /security — Kenobi's Security Audit

## Context Setup
1. Read `/logs/build-state.md` — understand current project state
2. Read `/docs/methods/SECURITY_AUDITOR.md`
3. Read `/docs/LESSONS.md` — check for security-relevant lessons (prior vulnerabilities, auth gotchas). Flag matches during audit.

## Audit Sequence

### Phase 0.5 — First Strike (**Han** + **Cassian**)
Before the deep audits, two agents do fast recon:
- **Han (First Strike):** Quick OWASP top 10 scan — finds the obvious vulnerabilities that shouldn't require deep analysis. Shoots first.
- **Cassian (Intelligence):** Threat modeling and attack surface mapping — maps all endpoints, identifies high-value targets, produces the threat model that guides the rest of the audit.

### Phase 1 — Independent audits (parallel analysis)
Use the Agent tool to run these simultaneously — all are read-only analysis:
- **Agent 1 (Leia — Secrets):** Scan source code for hardcoded secrets, check .env is gitignored, check git history for leaked keys (`git log -p --all -S 'password' -S 'secret' -S 'api_key'`), verify different secrets dev/prod
- **Agent 2 (Chewie — Dependencies):** Run `npm audit`, check for critical/high vulns, verify lock file committed, check for deprecated packages
- **Agent 3 (Rex + Bo-Katan — Infrastructure + Perimeter):** Check security headers (HSTS, CSP, X-Frame-Options, CORS), verify TLS config, check for exposed ports/debug endpoints. **Bo-Katan** focuses on network perimeter: firewall rules, exposed ports, CORS policy enforcement.
- **Agent 4 (Maul — Red Team):** For each endpoint and flow, ask: "How would I exploit this?" Chain vulnerabilities. Test trust boundaries. Attempt privilege escalation. **RUNTIME EXPLOITATION (mandatory):** When the server is running, Maul must execute actual attack requests via curl/fetch — not just theorize. Upload a file then fetch the URL. Submit conflicting data. Send requests with stolen/expired tokens. If the server isn't running, document what couldn't be runtime-tested.

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
- **AUTH CHAIN TRACING (mandatory):** Don't just verify each endpoint checks auth — trace the full chain: Is the auth middleware actually applied to this route? Is the user/tenant context carried from middleware → service → DB query? Are there routes that SHOULD have auth middleware but don't? Read the middleware registration and verify every protected route is covered.

**Padme — Data:**
- PII identified and cataloged
- PII not in logs, error messages, or URLs
- Deletion possible (GDPR right to erasure)
- Backups encrypted

**Qui-Gon — Subtle Vulnerabilities** (after sequential audits):
- Timing-based attacks, race conditions in auth flows, logic errors that are technically correct but exploitable
- The vulnerabilities that pass every standard check

**Sabine — Unconventional** (conditional — if project has external dependencies):
- Supply chain attacks, dependency confusion, prototype pollution, CSP bypass via CDN

**Bail Organa — Governance** (conditional — if project has regulatory requirements):
- GDPR data handling, SOC2 controls, HIPAA mapping

### Phase 3 — Remediate
Write all findings to `/logs/phase-11-security-audit.md` (or appropriate phase log):

| ID | Finding | Severity | Category | Location | Remediation | Status |
|----|---------|----------|----------|----------|-------------|--------|

Severity = exploitability x impact. Critical (auth bypass, data leak) > High (injection, IDOR) > Medium (missing headers, weak config) > Low (best practice)

Fix critical and high findings immediately. Medium findings get tracked. For each fix:
1. Apply the fix
2. Verify it works
3. Check it didn't break anything (`npm test`)
4. Update the finding status in the log

### Phase 4 — Re-Verification (Maul + Anakin + Din Djarin)
After remediations are applied:
- **Maul** re-probes all remediated vulnerabilities — verify fixes hold under adversarial conditions. Execute actual HTTP requests against the running server.
- **Anakin** attempts to bypass remediations using dark-side techniques — JWT algorithm confusion, auth library edge cases, prototype pollution, framework misuse.
- **Din Djarin** bounty-hunts for anything Maul and Anakin missed — post-remediation sweep with Mandalorian tenacity.

If any agent finds new issues, fix and re-verify until clean.

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
