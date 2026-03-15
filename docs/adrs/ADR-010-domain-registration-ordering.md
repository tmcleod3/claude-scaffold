# ADR-010: Domain Registration as Pre-DNS Step

## Status: Proposed

## Context
VoidForge v3.1 added Cloudflare DNS wiring as a post-provision step (ADR-006). The remaining v3.1 prophecy item is domain registration via Cloudflare Registrar — allowing users who don't own a domain yet to purchase one through Haku.

The question: where in the provisioning pipeline does registration happen?

## Decision
Domain registration runs as a **pre-DNS** step, after the primary provisioner completes but before DNS record creation.

### Ordering:
```
1. Primary provisioner (EC2, Vercel, etc.) → outputs
2. Domain registration (if requested) → creates zone on Cloudflare
3. DNS record creation → uses existing or newly-created zone
```

### Why pre-DNS, not post-DNS:
- Registration creates the Cloudflare zone automatically
- DNS needs the zone to exist to create records
- If the user doesn't own the domain yet, `findZone()` in the DNS module will fail
- Registration must happen first so the zone is available for DNS

### Two paths:
- **User already owns domain on Cloudflare:** Skip registration, DNS works as-is (zone exists)
- **User wants to buy domain:** Register first → zone is created → DNS creates records in that zone

### Safety:
- Domain registration is **irreversible** — Cloudflare doesn't support programmatic deletion in the first year
- Registration is NOT tracked for automatic cleanup (unlike all other resources)
- Requires a **separate confirmation gate** in the Haku UI with cost warning ("$10-15/year, non-refundable")
- Requires explicit user opt-in via checkbox, not automatic

### API requirements:
- Cloudflare `account_id` must be stored in vault (currently only `cloudflare-api-token` is stored)
- Token needs `Registrar:Edit` permission in addition to existing `Zone:DNS:Edit`

## Consequences

**Enables:**
- Full "from nothing, everything" flow — user goes from idea to live-at-their-domain without leaving VoidForge
- Domain purchase + DNS + SSL all happen in one provisioning run

**Trade-offs:**
- Adds real money to the provisioning flow — cost warning and confirmation are critical
- Cloudflare Registrar only — no Route53 registrar support in this iteration
- 60-day transfer lock after registration (Cloudflare policy, not our choice)
- Account ID requirement adds a vault field (minor UI change in cloud-providers.ts)

**Prevents:**
- Accidental domain purchases (separate confirmation gate)
- Orphaned domains on cleanup (not tracked for deletion)

## Alternatives
1. **Post-DNS step** — Rejected. DNS fails without a zone. Registration creates the zone.
2. **Separate command / separate wizard step** — Rejected. Breaks the "one shot" provisioning flow. The user wants everything in one run.
3. **Route53 Registrar support** — Deferred. Cloudflare first because the DNS module already uses Cloudflare. Route53 would require a parallel DNS implementation.
4. **Skip registration, require user to own domain** — Considered. This is already the default path. Registration is opt-in for users who don't have a domain yet.
