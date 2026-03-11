# BUILD PROTOCOL — PRD to Production
## The Master Sequence

> *This is the playbook. Every other method doc is a tool this playbook invokes at the right moment.*

## The Team

| Phase | Lead | Supporting |
|-------|------|-----------|
| 0. Orient | **Picard** | All read PRD |
| 1. Scaffold | **Stark** + **Kusanagi** | — |
| 2. Infrastructure | **Kusanagi** | **Stark** (DB) |
| 3. Auth | **Stark** + **Galadriel** | **Kenobi** (review) |
| 4. Core Feature | **Stark** + **Galadriel** | — |
| 5. Supporting Features | **Stark** + **Galadriel** | **Batman** (regression) |
| 6. Integrations | **Stark** (Romanoff) | **Kenobi** (security) |
| 7. Admin & Ops | **Stark** + **Galadriel** | **Picard** (review) |
| 8. Marketing Pages | **Galadriel** | — |
| 9. QA Pass | **Batman** | All |
| 10. UX/UI Pass | **Galadriel** | All |
| 11. Security Pass | **Kenobi** | All |
| 12. Deploy | **Kusanagi** | **Batman** (smoke) |
| 13. Launch | All | — |

Full character pools: `/docs/NAMING_REGISTRY.md`

---

**Step 0 — Picard Ingests PRD.** Extract: identity, stack, architecture, data model, routes, flows, tiers, integrations, env vars, deployment. Flag missing items. Produce initial ADRs.

**Step 1 — Stark + Kusanagi Scaffold.** Framework, configs, schema, directory structure, types, utils, root layout. Every placeholder references its PRD section.

**Step 2 — Kusanagi Infrastructure.** Database (Banner assists) → Redis → Environment → Verify (dev, build, lint, typecheck all pass).

**Step 3 — Auth (Kenobi Reviews).** Providers, login, signup, password reset, sessions, middleware, roles. Password manager compatible.

**Step 4 — Core Feature.** Single most important user journey, end-to-end. Vertical slice. Rough UI fine, full pipeline must work.

**Step 5 — Supporting Features.** Dependency order. Data model → API → UI → Wire up → Verify. After each batch: builds, previous flows work, new flow works.

**Step 6 — Integrations.** Payments, email, storage, analytics, AI, DNS APIs. Kenobi reviews each.

**Step 7 — Admin & Operations.** Dashboard, user management, analytics views, billing, audit logging.

**Step 8 — Marketing Pages.** Homepage, features, pricing, legal, SEO.

**Step 9 — Batman's QA Pass.** Oracle scans. Red Hood breaks. Alfred reviews deps. Lucius checks config. Nightwing builds regression checklist.

**Step 10 — Galadriel's UX/UI Pass.** Elrond maps flows. Arwen audits visuals. Samwise checks a11y. Bilbo reviews copy. Gimli tests perf. Gandalf breaks edges.

**Step 11 — Kenobi's Security Pass.** Yoda audits auth. Windu tests injection. Ahsoka checks access. Leia audits secrets. Rex reviews headers. Padmé checks data. Chewie scans deps.

**Step 12 — Kusanagi Deploys.** Senku provisions. Spike configures DNS/SSL. Levi builds pipeline. L sets up monitoring. Bulma configures backups.

**Step 13 — Launch Checklist.** All flows in production ✓ SSL ✓ Email ✓ Payments ✓ Analytics ✓ Monitoring ✓ Backups ✓ Security headers ✓ Legal ✓ Performance ✓ Mobile ✓ Accessibility ✓

---

## Principles

1. PRD is source of truth.
2. Build vertically.
3. Verify at every step.
4. Small diffs.
5. Flag unknowns early.
6. Infrastructure before features.
7. Method docs are tools, not bureaucracy.
