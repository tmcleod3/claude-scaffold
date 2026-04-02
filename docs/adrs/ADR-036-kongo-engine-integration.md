# ADR-036: Kongo Engine as VoidForge's First-Party Landing Page System
## Status: Accepted
## Context

VoidForge's /grow and /cultivation systems manage ad campaigns, treasury, spend optimization, and A/B testing of ad creatives — but have zero capability to generate, vary, or track the landing pages those campaigns point to. All campaigns point to the same generic marketing page. This is a conversion leak: optimizing ad spend without optimizing the destination.

The gaps (confirmed by 14-agent Muster, 2026-04-01):
1. No landing page generation — only audit/optimization of existing pages
2. No page variant A/B testing — A/B testing is ad-creative only
3. No link tracking / shortlinks / redirect service
4. No UTM builder or standardized taxonomy
5. No attribution pipeline implementation
6. No per-campaign or per-audience landing pages

Kongo Engine (kongo.io) is an AI-powered landing page platform with 37 API endpoints covering page generation, templates, campaigns, A/B testing (multi-armed bandit), conversion tracking, recipient links, and webhooks.

**Critical context:** Kongo is owned by the same person who owns VoidForge, built using VoidForge in a separate repo. This means: zero cost, no quota constraints, no vendor lock-in, and the API is malleable — any endpoints VoidForge needs can be built on Kongo's side.

Validated by two Muster rounds (14 unique agent deployments): Picard, Sisko, Batman, Kusanagi, Seldon, Kelsier, Raoden, Wax, Wayne, Vin, Scotty, Navani, Kim, Riker, Holo.

## Decision

Integrate Kongo Engine as VoidForge's first-party landing page system. Kongo is not behind an abstract adapter — it IS the landing page layer. Direct integration via a thin typed client.

### Architecture

```
wizard/lib/kongo/
  client.ts          — Authenticated HTTP client, vault-sourced API key
  pages.ts           — Page lifecycle: create (from-prd), update, publish, archive
  variants.ts        — Bulk variant generation, per-platform optimization
  analytics.ts       — Growth signal polling + webhook receipt
  provisioner.ts     — Called by /cultivation install to create workspace + key
```

### Data Flow

PRD YAML frontmatter → `POST /engine/pages/from-prd` → Kongo page provisioned → `POST /engine/variants/bulk` (per-platform variants) → Ad campaigns launched with Kongo URLs as `landingUrl` → Kongo tracks conversions → Heartbeat daemon polls `GET /engine/analytics/:id/growth-signal` → Wayne evaluates A/B results → Winner copy feeds back into next seed content cycle.

### Integration Points

| VoidForge Component | Kongo Interaction |
|---|---|
| `/cultivation install` | Provisions Kongo workspace, stores API key in vault |
| `/grow` Phase 3 (Content) | Seed content → Kongo page generation |
| `/grow` Phase 3.5 (NEW) | Raoden provisions per-campaign landing pages via Kongo |
| `/grow` Phase 4 (Distribution) | `landingUrl` = Kongo campaign URL for every ad campaign |
| `/grow` Phase 4.5 (Launch Prep) | Landing page generation is a launch gate — no campaign goes live without verified Kongo URL |
| Heartbeat daemon | `kongo-signal` job (hourly), `kongo-seed` job (on A/B winner), webhook receiver |
| Wayne (A/B) | `testLayer: 'page'` added alongside existing `'ad'` layer. Never run both simultaneously. |
| Vin (Analytics) | Kongo conversion data + ad platform spend → true end-to-end ROAS |

### Kongo API Extensions (to be built on Kongo side)

| Endpoint | Purpose |
|---|---|
| `POST /engine/pages/from-prd` | PRD YAML → landing page (structured input, not free-text) |
| `POST /engine/variants/bulk` | Per-platform variant matrix in one call |
| `POST /engine/campaigns/batch-status` | Multi-campaign status polling for daemon |
| `POST /engine/campaigns/:id/bandit/start\|status\|apply` | A/B automation lifecycle |
| `GET /engine/analytics/:id/growth-signal` | Structured signal for Vin (CTR, bounce, scroll, CVR, trending/underperforming sections) |
| 4 webhook events | bandit.winner_declared, campaign.conversion_milestone, analytics.weekly_digest, page.slots_updated |

### Bundling

| VoidForge Tier | Kongo Access |
|---|---|
| scaffold (free) | Referral link at /build Phase 8 |
| main | Auto-provisioned during /cultivation install (OAuth → vault) |
| Direct Kongo | 20% VoidForge user discount |

### SEO Constraint (Navani)

Kongo-hosted pages (`{slug}.kongo.io`) are acceptable for paid ad landing pages (Quality Score unaffected). Organic SEO content must live on the user's own domain — link equity on kongo.io subdomains does not accrue to the user.

## Consequences

- Every ad campaign gets a dedicated, tracked, A/B-testable landing page
- The feedback loop closes: page conversion data informs next week's seed content
- Two products to maintain — kept manageable by a thin client layer (5-10 methods)
- Kongo's scope expands from pitch decks to growth marketing pages — template library needed
- VoidForge users get landing pages "for free" as part of the growth workflow

## Alternatives Considered

1. **Abstract LandingPageAdapter interface** — Rejected after ownership revealed. Abstraction adds complexity with no vendor-mitigation benefit when you own both sides.
2. **Self-hosted pages via /build + /deploy** — Rejected as primary path. No real-time A/B testing, no bandit optimization, no conversion tracking infrastructure. Retained as fallback for organic SEO content.
3. **Dual-mode (Kongo + self-hosted)** — Rejected as unnecessary complexity. Kongo handles paid landing pages; existing /build handles organic content. They serve different purposes, not competing implementations of the same interface.
