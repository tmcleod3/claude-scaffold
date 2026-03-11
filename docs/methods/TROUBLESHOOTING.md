# TROUBLESHOOTING — Error Recovery & Common Failures

> *When a build phase fails, when a migration breaks, when nothing makes sense — start here.*

## Philosophy

1. Diagnose before you fix. Understand the root cause.
2. Check the obvious first. Most failures are typos, missing env vars, or wrong versions.
3. Isolate the layer. Is it code, config, database, dependency, or infrastructure?
4. Don't stack fixes. Fix one thing, verify, then move to the next.
5. If you're going in circles, stop and re-read the error message literally.

---

## Build Phase Failures

### Phase 0 (Orient) — PRD is incomplete or ambiguous

**Symptoms:** Can't extract tech stack, missing schema, vague feature descriptions.

**Recovery:**
1. List every gap in the PRD explicitly
2. Flag assumptions you'd need to make
3. If using PRD_GENERATOR.md, re-run with more specific input
4. For missing schema: derive it from the feature descriptions, mark as "inferred — confirm"
5. For missing stack: pick sensible defaults (Next.js + Prisma + Postgres) and note the assumption

### Phase 1 (Scaffold) — Framework won't initialize

**Symptoms:** `create-next-app` fails, wrong Node version, dependency conflicts.

**Recovery:**
1. Check Node version: `node -v` (use the version the framework expects)
2. Clear package caches: `npm cache clean --force`
3. Delete `node_modules` and `package-lock.json`, reinstall
4. If a specific dependency conflicts, pin the version that works
5. Check if the framework's latest version has breaking changes — pin a stable version

### Phase 2 (Infrastructure) — Database won't connect

**Symptoms:** Connection refused, auth failed, migration errors.

**Recovery:**
1. Is the database running? `pg_isready` / `redis-cli ping`
2. Check connection string in `.env` — host, port, user, password, database name
3. Can you connect manually? `psql $DATABASE_URL`
4. For migration failures: check if the database exists, create it if not
5. For Prisma: `npx prisma db push` for rapid iteration, `npx prisma migrate dev` for proper migrations
6. Nuclear option: `npx prisma migrate reset` (destroys data — dev only)

### Phase 3 (Auth) — Auth flow broken

**Symptoms:** Login fails silently, sessions don't persist, OAuth redirect errors.

**Recovery:**
1. Check cookies: httpOnly, secure (requires HTTPS in prod), sameSite, domain, path
2. Check session store: is Redis running? Is the connection configured?
3. OAuth: verify redirect URIs match exactly (trailing slashes matter)
4. OAuth: verify client ID and secret are correct and for the right environment
5. Check CORS: is your frontend origin allowed?
6. Check CSRF: is the token being sent with mutations?
7. Test with `curl` to eliminate frontend issues

### Phase 4-5 (Features) — API returns wrong data or 500s

**Symptoms:** Unexpected response shape, internal server errors, data not persisting.

**Recovery:**
1. Read the actual error — check server logs, not just the HTTP status
2. Test the endpoint with `curl` to isolate frontend vs backend
3. Check database: is the data there? `npx prisma studio`
4. Check types: is the Prisma client generated? `npx prisma generate`
5. Check middleware order: auth before route handlers, error handler last
6. For 500s: add try/catch with logging to the specific route

### Phase 6 (Integrations) — Third-party API failures

**Symptoms:** Stripe/email/storage not working, webhook not received.

**Recovery:**
1. Verify API keys are set and for the right environment (test vs live)
2. Test the API call in isolation (curl or Postman)
3. Check webhook URL: is it publicly accessible? Use ngrok for local dev
4. Check webhook signature verification: is the signing secret correct?
5. For Stripe: use `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
6. For email: check SMTP credentials, sender domain, SPF/DKIM records
7. Rate limits: have you exceeded the API's rate limit?

### Phase 9-11 (QA/UX/Security) — Too many issues found

**Symptoms:** Audit produces 50+ issues, unclear where to start.

**Recovery:**
1. Triage by severity: Critical (security, data loss) → High (broken flows) → Medium → Low
2. Group by area: fix all issues in one file/component together
3. Fix critical issues first, then re-run the audit
4. Don't fix low-severity issues if they risk introducing regressions
5. Track "won't fix" items with rationale

### Phase 12 (Deploy) — Deployment fails

**Symptoms:** Build fails on server, app won't start, health check fails.

**Recovery:**
1. Build locally first: `npm run build` — if it fails locally, fix before deploying
2. Check Node version on server matches local
3. Check environment variables are set on the server
4. Check file permissions: can the app user read the files?
5. Check ports: is something else running on the port?
6. Check logs: `pm2 logs` or `journalctl -u your-app`
7. Memory: is the server running out? Check `free -h`
8. Rollback: use `/scripts/rollback.sh` and diagnose from a working state

### Phase Rollback — A batch broke something

**Symptoms:** A feature batch introduces a regression in a previous flow.

**Recovery (the rollback protocol):**
1. **Identify:** Which commit/batch introduced the regression? `git log --oneline -10`
2. **Revert:** `git revert <commit-hash>` (or `git stash` if uncommitted)
3. **Verify:** Confirm the regression is gone — run `npm test`, walk through the affected flow
4. **Isolate:** In the reverted code, identify the specific change that caused the conflict
5. **Fix:** Apply the fix in isolation, verify it doesn't break the original or the new feature
6. **Re-apply:** Re-introduce the batch with the fix included, verify everything
7. **Log:** Document in `/logs/errors.md`: what broke, root cause, resolution

**Never:** Stack untested changes hoping the next batch will fix it. Force through a failing gate. Skip the revert and try to fix forward in a complex codebase.

---

## Common Cross-Phase Failures

### TypeScript won't compile

1. `npx tsc --noEmit` — read the first error, fix it, repeat
2. Missing types: `npm i -D @types/package-name`
3. Prisma types stale: `npx prisma generate`
4. Circular imports: refactor shared types to a separate file
5. `any` creeping in: fix the type, don't suppress it

### Dependency conflicts

1. Read the conflict: which packages want different versions of what?
2. Check if one of the conflicting packages has an update
3. Use `npm ls package-name` to see the dependency tree
4. Last resort: `overrides` in package.json to force a version

### Git state is messy

1. Check what changed: `git status`, `git diff`
2. Stash work: `git stash` before switching context
3. Wrong branch: `git stash && git checkout correct-branch && git stash pop`
4. Need to undo last commit (not pushed): `git reset --soft HEAD~1`
5. File shouldn't be tracked: add to `.gitignore`, `git rm --cached filename`

### Environment mismatch (works locally, fails in prod)

1. Compare env vars: local `.env` vs server environment
2. Check Node version: local vs server
3. Check database: local schema vs prod schema (run migrations)
4. Check URLs: localhost references that should be production URLs
5. Check CORS: is the production frontend origin allowed?

### Memory/performance issues

1. Node running out of memory: `NODE_OPTIONS="--max-old-space-size=4096"`
2. Database queries slow: check for N+1, missing indexes, unneeded fields
3. Build too slow: check for large dependencies, unnecessary imports
4. Runtime memory leak: check for unclosed connections, growing arrays, event listener accumulation

---

## When to Escalate

| Symptom | Escalate to |
|---------|------------|
| "I've tried 3 approaches and none work" | Re-read the error message literally. Then ask: is the approach fundamentally wrong? |
| Architecture seems wrong for the requirements | **Picard** — may need an ADR and structural change |
| Security concern blocking a feature | **Kenobi** — security wins, but there may be a safe alternative |
| Infrastructure limitation | **Kusanagi** — may need different hosting or configuration |
| Feature requirement unclear | Go back to the PRD. If the PRD is ambiguous, flag it explicitly. |

---

## Recovery Checklist

After resolving any significant failure:

- [ ] Root cause identified and documented
- [ ] Fix applied and verified
- [ ] No regressions introduced (check related flows)
- [ ] If the failure can recur, add a guard (validation, test, monitoring)
- [ ] Update `/docs/LESSONS.md` if the pattern is new
- [ ] Update `/docs/qa-prompt.md` if it affects a critical flow
