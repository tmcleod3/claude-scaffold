# /architect — Picard's Architecture Review

**AGENT DEPLOYMENT IS MANDATORY.** Steps 1 and 4 specify parallel agent launches via the Agent tool. You MUST actually launch these agents as separate sub-processes — do NOT shortcut to inline analysis, even if you think you can answer faster by reading files directly. The agents exist because parallel analysis catches things sequential reading misses. Skipping agent deployment is a protocol violation. (Field report #68)

## Context Setup
1. Read `/logs/build-state.md` — understand current project state
2. Read `/docs/methods/SYSTEMS_ARCHITECT.md`
3. Read `/docs/PRD.md` (System Architecture + Tech Stack sections)

## Pre-Analysis — Conflict Scan
Before any deep analysis, scan the PRD frontmatter for structural contradictions (see SYSTEMS_ARCHITECT.md Conflict Checklist). Check: auth+database, payments+auth, websockets+deploy, workers+deploy, database+deploy, cache+deploy, admin+auth, email+credentials. Flag any contradictions immediately — these cost hours if caught late.

## Agent Deployment Manifest

**Lead:** Picard (Star Trek)
**Full bridge crew:** Spock (schema), Uhura (integrations), Worf (security implications), Tuvok (security architecture), Scotty (service architecture + scaling), Kim (API design), Janeway (novel architectures), Torres (performance), La Forge (failure analysis), Data (tech debt), Crusher (system diagnostics), Archer (greenfield), Pike (bold ordering — challenges Dax in /campaign), Riker (ADR review — challenges trade-offs), Troi (PRD compliance)

## Step 0 — System Discovery (**Crusher** + **Archer**)
**Crusher** assesses system health first — test coverage, build time, dependency age, code complexity. Baseline before changes.
**Archer** (for greenfield projects) proposes initial directory structure, module boundaries, naming conventions.
Produce: system identity, component inventory, data flow diagram (ASCII), dependency graph.
Write to `/logs/` (phase-00 if during orient, or a dedicated architecture log).

## Step 1 — Parallel Analysis (Spock + Uhura + Worf)
Use the Agent tool to run these in parallel — they are independent analysis tasks:

**Agent 1 (Spock — Schema Review):**
- Normalization: are relationships correct?
- Indexes: do they match actual query patterns?
- Nullable fields: intentional or oversight?
- Audit fields: createdAt, updatedAt on every table?
- PII isolation: sensitive data identified and separated?
- Data lifecycle: what gets archived? What gets deleted?
- Backup/recovery plan: defined and tested?

**Agent 2 (Uhura — Integration Review):**
For each external service, produce:

| Service | Purpose | Failure Mode | Fallback | Cost | Lock-in Risk |
|---------|---------|-------------|----------|------|-------------|

Verify: API versions pinned, responses validated, abstraction layer exists.

**Agent 3 (Worf — Security Implications):**
For each architectural decision (schema, service boundaries, data flows), flag security implications. PII colocation, unauthenticated access to internal state, overly permissive service boundaries. Worf audits *design*, not code.

**Agent 4 (Tuvok — Security Architecture):**
Auth flow design, token storage strategy, session architecture, encryption at rest vs in transit. Where Worf flags implications, Tuvok designs the solutions.

Synthesize findings from all four agents.

## Step 2 — Scotty's Service Architecture + Kim's API Design
- Boundary assessment: is the boundary between services/modules clean?
- Monolith vs services: default monolith. Only split if there's a specific operational reason (different scaling profile, different team, different deploy cadence).
- Async vs sync: which operations should be background jobs?
- **Kim** reviews API surface: REST conventions, consistent error shapes, pagination patterns, versioning strategy.
- **Janeway** (conditional): when the standard monolith doesn't fit, proposes event-sourcing, CQRS, serverless, edge computing.
- Informed by Spock's schema, Uhura's integrations, and Worf/Tuvok's security findings.

## Step 3 — Scotty's Scaling + Torres's Performance
- **Scotty:** Identify the first bottleneck. Three-tier plan: Tier 1 (current), Tier 2 (10x, vertical), Tier 3 (100x, horizontal). Cost estimates.
- **Torres:** Performance architecture — N+1 query patterns in schema design, missing indexes for anticipated queries, connection pool sizing, caching strategy gaps. Catches performance problems before code is written.

## Step 4 — Parallel Analysis (La Forge + Data)
Use the Agent tool to run these in parallel — they are independent analysis tasks:

**Agent 1 (La Forge — Failure Analysis):**
For each component, answer: "What happens when this fails?"
- Database down → app shows error, no data loss, auto-reconnect
- Redis down → app works without cache (slower), sessions fall back
- External API down → graceful degradation, queue retries
- Worker crashes → job retries, dead letter queue, alerting

**Agent 2 (Data — Tech Debt):**
Catalog each item:

| Item | Type | Impact | Risk | Effort | Urgency |
|------|------|--------|------|--------|---------|

Types: wrong abstraction, missing abstraction, premature optimization, deferred decision, dependency debt, documentation debt.

## Step 5 — ADRs + Riker's Decision Review
Write Architecture Decision Records to `/docs/adrs/` for every non-obvious choice. After writing, **Riker reviews**: challenges trade-offs, verifies alternatives were truly considered, checks for second-order effects.
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

## Arguments
- `--plan [description]` → Planning mode: analyze and recommend without executing. Present findings and proposed changes for review.
- `--muster` → Full 9-universe deployment. Instead of the Star Trek bridge crew, deploy every viable agent across all universes in 3 waves (Vanguard → Main Force → Adversarial). See `docs/methods/MUSTER.md`. **ENFORCEMENT: Must launch Agent tool sub-processes per MUSTER.md. Inline analysis is not a Muster.**

## Handoffs
- API/DB implementation → Stark, log to `/logs/handoffs.md`
- UI impacts → Galadriel, log to `/logs/handoffs.md`
- Security implications → Kenobi, log to `/logs/handoffs.md`
- Infrastructure constraints → Kusanagi, log to `/logs/handoffs.md`
