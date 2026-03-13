# /architect — Picard's Architecture Review

## Context Setup
1. Read `/logs/build-state.md` — understand current project state
2. Read `/docs/methods/SYSTEMS_ARCHITECT.md`
3. Read `/docs/PRD.md` (System Architecture + Tech Stack sections)

## Step 0 — System Discovery
Produce: system identity, component inventory, data flow diagram (ASCII), dependency graph.
Write to `/logs/` (phase-00 if during orient, or a dedicated architecture log).

## Step 1 — Spock's Schema Review
- Normalization: are relationships correct?
- Indexes: do they match actual query patterns?
- Nullable fields: intentional or oversight?
- Audit fields: createdAt, updatedAt on every table?
- PII isolation: sensitive data identified and separated?
- Data lifecycle: what gets archived? What gets deleted?
- Backup/recovery plan: defined and tested?

## Step 2 — Scotty's Service Architecture
- Boundary assessment: is the boundary between services/modules clean?
- Monolith vs services: default monolith. Only split if there's a specific operational reason (different scaling profile, different team, different deploy cadence).
- Async vs sync: which operations should be background jobs?

## Step 3 — Scotty's Scaling Assessment
Identify the first bottleneck. Produce three-tier plan:
- **Tier 1 (current):** Single server. What works, what's the ceiling.
- **Tier 2 (10x):** Vertical scaling + optimization. Add indexes, caching, connection pooling.
- **Tier 3 (100x):** Horizontal scaling. Read replicas, CDN, queue-based processing, service splits.
Include cost estimates at each tier.

## Step 4 — Uhura's Integration Review (parallel analysis)
Use the Agent tool to run Spock (schema review) and Uhura (integration review) in parallel if both are needed — they're independent analysis tasks.

For each external service, produce:

| Service | Purpose | Failure Mode | Fallback | Cost | Lock-in Risk |
|---------|---------|-------------|----------|------|-------------|

Verify: API versions pinned, responses validated, abstraction layer exists.

## Step 5 — La Forge's Failure Analysis
For each component, answer: "What happens when this fails?"
- Database down → app shows error, no data loss, auto-reconnect
- Redis down → app works without cache (slower), sessions fall back
- External API down → graceful degradation, queue retries
- Worker crashes → job retries, dead letter queue, alerting

## Step 6 — Data's Tech Debt
Catalog each item:

| Item | Type | Impact | Risk | Effort | Urgency |
|------|------|--------|------|--------|---------|

Types: wrong abstraction, missing abstraction, premature optimization, deferred decision, dependency debt, documentation debt.

## Step 7 — ADRs
Write Architecture Decision Records to `/docs/adrs/` for every non-obvious choice:
```
# ADR-001: [Title]
## Status: Accepted
## Context: [Why this decision was needed]
## Decision: [What was decided]
## Consequences: [Trade-offs, what this enables, what this prevents]
## Alternatives: [What else was considered and why it was rejected]
```

## Conflict Resolution
When architectural decisions conflict with other agents:
1. Check the PRD — product requirements take precedence
2. If PRD is silent, present trade-offs to the user with a recommendation
3. Document the resolution as an ADR
4. Log to `/logs/decisions.md`

For specific conflicts:
- **Picard vs Kusanagi (infra can't support arch):** Picard adjusts architecture to match real constraints
- **Picard vs Stark (implementation disagrees with design):** Present options, Picard decides, document as ADR
- **Picard vs Kenobi (security vs simplicity):** Security wins. Find the simplest secure architecture.

## Deliverables
1. ARCHITECTURE.md
2. /docs/adrs/ directory with decision records
3. SCALING.md
4. TECH_DEBT.md
5. FAILURE_MODES.md
6. All findings logged to appropriate `/logs/` file

## Handoffs
- API/DB implementation → Stark, log to `/logs/handoffs.md`
- UI impacts → Galadriel, log to `/logs/handoffs.md`
- Security implications → Kenobi, log to `/logs/handoffs.md`
- Infrastructure constraints → Kusanagi, log to `/logs/handoffs.md`
