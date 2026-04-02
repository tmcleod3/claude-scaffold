# VoidForge x Kongo Engine Integration — Product Requirements Document

---

```yaml
---
name: VoidForge × Kongo Engine Integration
version: "20.1"
type: integration
stack:
  runtime: node
  framework: typescript
  database: none
auth: oauth
payments: none
deploy: npm
ai: yes
e2e: no
---
```

---

## 1. Overview

VoidForge's growth system (`/cultivation`, `/grow`) manages ad campaigns, treasury, A/B testing of ad creatives, and spend optimization. It orchestrates the full marketing lifecycle from budget allocation through performance measurement. But it has a blind spot: it cannot generate, vary, or track the landing pages those campaigns point to. Every ad campaign points at whatever page the user already has — usually a generic homepage.

**Kongo Engine** fills this gap. Kongo is a first-party AI landing page generator with built-in A/B testing and conversion tracking. The user owns both products. This integration makes Kongo the landing page engine for VoidForge's growth system.

The integration creates a **closed-loop content engine**:

```
PRD → seed content → Kongo landing page → ad campaign → conversion tracking
  ↑                                                              ↓
  └──────────── analytics → winning copy → next seed ←───────────┘
```

Every campaign gets a dedicated, A/B-tested landing page. Variant performance feeds back into copy optimization. The heartbeat daemon polls Kongo's growth-signal endpoint and pushes winning copy into new page generations. No more pointing all ads at the same generic page.

**What this integration is NOT:**
- Not a Kongo Engine rebuild inside VoidForge. Kongo remains a standalone product with its own API.
- Not a UI layer. VoidForge communicates with Kongo exclusively via REST API.
- Not a replacement for the user's main website. Kongo pages are campaign-specific landing pages.

---

## 2. Identity

- **Name:** VoidForge x Kongo Engine
- **Tagline:** *"Every campaign gets a landing page. Every page gets tested."*
- **Integration surface:** The integration lives inside VoidForge's methodology (pattern files, method docs, adapter code in `wizard/lib/kongo/`) and communicates with Kongo via its REST API.
- **Agent ownership:** **Raoden** (Conversion) leads landing page operations. **Wayne** (A/B Testing) manages page variant testing. **Kelsier** (Growth Strategist) orchestrates the closed loop.
- **Brand voice:** The integration copy follows VoidForge's Cosmere universe conventions. Kongo is referred to as "the landing page engine" or "the page forge" in user-facing output.

---

## 3. Target Audience

VoidForge users running `/cultivation` and `/grow` who need landing pages for their ad campaigns. Specifically:

| Segment | Need | Current Pain |
|---------|------|-------------|
| **Indie hackers** | Launch fast, test messaging | Manually building landing pages per campaign is a time sink |
| **Startup founders** | Per-campaign landing pages with conversion tracking | Pointing all ads at the homepage kills conversion rate |
| **Small teams** | A/B test landing pages alongside ad creatives | No connection between ad variant testing and page variant testing |
| **Solo developers** | Use VoidForge to build AND market | Growth system stops at the ad — the click destination is an afterthought |

**Prerequisite:** The user must have a Kongo Engine account and API access. VoidForge guides setup during `/cultivation install`.

---

## 4. Features

### Mission 1: KongoClient Foundation (1-2 days)

*"Before the heist, you need a way into the vault." — Kelsier*

**Agent:** Raoden (Conversion)

**Deliverables:**

| File | Purpose |
|------|---------|
| `wizard/lib/kongo/types.ts` | TypeScript interfaces for all Kongo API shapes |
| `wizard/lib/kongo/client.ts` | Authenticated HTTP client with vault-sourced API key and rate limiter |
| `wizard/lib/kongo/pages.ts` | Page CRUD: `createPage`, `createPageFromPrd`, `getStatus`, `awaitPage`, `getHtml` |
| `wizard/lib/kongo/__tests__/client.test.ts` | Unit tests with sandbox responses |
| `wizard/lib/kongo/__tests__/pages.test.ts` | Page lifecycle tests |

**Technical details:**

- `KongoClient` follows the adapter pattern established in `wizard/lib/adapters/`. Vault-first credential retrieval (never `.env` — per v14.0 ADR).
- Rate limiter: 60 requests/minute sliding window, matching `docs/patterns/outbound-rate-limiter.ts`.
- `createPageFromPrd(prd: PrdSeedContent): Promise<KongoPage>` — extracts headline, subheadline, value props, CTA text, and brand colors from the PRD and sends to Kongo's generation endpoint.
- `awaitPage(pageId: string, timeoutMs?: number): Promise<KongoPage>` — polls page status until `ready` or timeout (default 120s, 3s interval).
- All methods throw typed `KongoApiError` extending VoidForge's `ApiError` pattern.

**Acceptance criteria:**
- [ ] Client authenticates with vault-stored API key
- [ ] Rate limiter prevents >60 req/min
- [ ] `createPageFromPrd` sends structured seed content and returns page ID
- [ ] `awaitPage` polls until ready or throws on timeout
- [ ] All tests pass with sandbox responses (no live API calls in CI)

---

### Mission 2: Campaign + Variant Management (2-3 days)

*"I can become anyone. Let me become six versions of this page and see which one wins." — Wayne*

**Agents:** Wayne (A/B Testing), Raoden (Conversion)

**Deliverables:**

| File | Purpose |
|------|---------|
| `wizard/lib/kongo/campaigns.ts` | Campaign CRUD: `createCampaign`, `publish`, `unpublish`, `update`, `batchStatus` |
| `wizard/lib/kongo/variants.ts` | Variant ops: `createVariant`, `bulkGenerate`, `regenerateSlots`, `setRotation` |
| `wizard/lib/kongo/__tests__/campaigns.test.ts` | Campaign lifecycle tests |
| `wizard/lib/kongo/__tests__/variants.test.ts` | Variant generation and rotation tests |

**Technical details:**

- `createCampaign(config: KongoCampaignConfig): Promise<KongoCampaign>` — creates a Kongo campaign with traffic split configuration and conversion goal.
- `bulkGenerate(pageId: string, count: number, variations: VariationAxis[]): Promise<KongoVariant[]>` — generates N variants along specified axes (headline, hero image, CTA text, layout).
- `setRotation(campaignId: string, strategy: 'even' | 'bandit'): Promise<void>` — switches between even split and multi-armed bandit rotation.
- Wayne integration: add `testLayer: 'page'` to VoidForge's existing A/B testing framework alongside `testLayer: 'creative'` and `testLayer: 'audience'`. Page variants are evaluated with the same statistical rigor (min 500 impressions, 3 days, 95% confidence).

**Acceptance criteria:**
- [ ] Campaign creation with traffic split and conversion goal
- [ ] Bulk variant generation (3-6 variants per page)
- [ ] Rotation strategy switching (even vs. bandit)
- [ ] `testLayer: 'page'` integrated into Wayne's A/B evaluation logic
- [ ] `batchStatus` retrieves status for all campaigns in one call

---

### Mission 3: Analytics + Conversion Tracking (2-3 days)

*"I see everything. Even the things you try to hide." — Vin*

**Agents:** Vin (Analytics), Raoden (Conversion)

**Deliverables:**

| File | Purpose |
|------|---------|
| `wizard/lib/kongo/analytics.ts` | Analytics: `getPageAnalytics`, `getCampaignAnalytics`, `getGrowthSignal` |
| `wizard/lib/kongo/webhooks.ts` | Webhook receiver: signature verification, event routing |
| `wizard/lib/kongo/__tests__/analytics.test.ts` | Analytics response parsing tests |
| `wizard/lib/kongo/__tests__/webhooks.test.ts` | Webhook signature verification tests |

**Technical details:**

- `getGrowthSignal(campaignId: string): Promise<KongoGrowthSignal>` — returns the structured signal Kongo computes: winning variant ID, confidence level, conversion rate delta, recommended next action (`scale` | `iterate` | `kill`).
- Vin integration: UTM taxonomy standardized between VoidForge and Kongo. Format: `utm_source=voidforge&utm_medium=paid&utm_campaign={campaignId}&utm_content={variantId}`. Kongo tracks these through to conversion.
- Attribution pipeline: Kongo conversion events are matched to VoidForge campaign IDs via UTM parameters. Vin's existing attribution model (last-click with cross-platform dedup) is extended to include page variant as an attribution dimension.
- Webhook events handled:
  - `bandit.winner_declared` — a variant has won with statistical significance
  - `campaign.conversion_milestone` — campaign hit a conversion count threshold (100, 500, 1000, 5000)
  - `page.generation_complete` — async page generation finished
  - `page.generation_failed` — page generation failed (retry or alert)
- Webhook signature: HMAC-SHA256 with shared secret stored in vault. Verification follows `docs/patterns/middleware.ts` auth pattern.

**Acceptance criteria:**
- [ ] Growth signal parsing with typed response
- [ ] UTM taxonomy matches VoidForge's existing format
- [ ] Webhook signature verification rejects invalid signatures
- [ ] All four webhook event types routed to correct handlers
- [ ] Conversion attribution includes page variant dimension

---

### Mission 4: /cultivation install Integration (1-2 days)

*"Day-0 infrastructure. The heist begins before anyone knows we're in the building." — Kelsier*

**Agents:** Kelsier (Growth Strategist), Breeze (Platform Relations)

**Deliverables:**

| File | Purpose |
|------|---------|
| `wizard/lib/kongo/oauth.ts` | OAuth flow: browser open, callback server, code exchange, vault storage |
| `wizard/lib/kongo/__tests__/oauth.test.ts` | OAuth flow tests (mocked browser + callback) |
| Updates to `/cultivation` install flow | Step 2b insertion |
| Updates to Danger Room | "Landing Pages" tab |

**Technical details:**

- `/cultivation install` gains a new **Step 2b** after treasury connection: *"Connect Kongo for landing pages?"*
  - If yes: open browser to Kongo's OAuth authorization URL
  - Spin up a temporary local HTTP server on a random port for the OAuth callback
  - Exchange authorization code for API key
  - Store API key in financial vault (same vault as ad platform credentials)
  - Verify connection with `GET /engine/pages` — expect 200
  - Display: `"Kongo connected — [account name] ([N] existing pages)"`
  - If no: skip. Kongo remains optional. Growth system works without it (campaigns just don't get dedicated landing pages).
- Danger Room gains a **"Landing Pages"** tab (visible only when Kongo is connected):
  - Page table: page name, URL, variant count, conversion rate, status
  - Campaign linkage: which ad campaign points to which Kongo page
  - Generation queue: pages currently being generated

**Acceptance criteria:**
- [ ] OAuth flow completes: browser open -> callback -> code exchange -> vault store
- [ ] Connection verified with read-only API call
- [ ] Kongo is optional — skipping does not break `/grow`
- [ ] Danger Room shows Landing Pages tab when connected
- [ ] Tab hidden when Kongo is not connected

---

### Mission 5: /grow Phase 3.5 — Page Generation (2-3 days)

*"Every leak in the funnel. Every page a precision instrument." — Raoden*

**Agents:** Raoden (Conversion), Shallan (Creative), Kelsier (Growth Strategist)

**Deliverables:**

| File | Purpose |
|------|---------|
| Updates to `/grow` phase execution | New Phase 3.5 between Content (Phase 3) and Distribution (Phase 4) |
| `wizard/lib/kongo/seed.ts` | Seed content extraction from PRD + Phase 3 output |
| `wizard/lib/kongo/__tests__/seed.test.ts` | Seed extraction tests |
| Updates to `docs/methods/GROWTH_STRATEGIST.md` | Phase 3.5 documentation |
| Updates to `docs/methods/HEARTBEAT.md` | Kongo job documentation |

**Technical details:**

- **Phase 3.5 — Page Generation (Raoden + Shallan):**

  *"Before you distribute, you need somewhere to send them."*

  1. **Seed extraction** (Raoden): Pull headline, value props, social proof, CTA text, brand colors from PRD and Phase 3 content output. Structure as `PrdSeedContent`.
  2. **Page generation** (Raoden): For each ad campaign created in Phase 4 planning, generate a dedicated Kongo landing page via `createPageFromPrd`.
  3. **Variant generation** (Shallan): For each page, generate 3 variants along the headline axis and 2 along the CTA axis = 6 combinations. Uses `bulkGenerate`.
  4. **Campaign linking**: Each ad campaign's destination URL is set to its Kongo page URL with UTM parameters. The page URL replaces the generic homepage URL that would otherwise be used.

- **Phase 4.5 launch gate addition:** Before campaigns can launch in Phase 4.5, all Kongo pages must be in `ready` status. If any page is still generating, Phase 4.5 blocks with: `"Waiting for [N] Kongo pages to finish generation..."` and polls every 10 seconds.

- **Skip behavior:** If Kongo is not connected, Phase 3.5 is skipped entirely. Campaigns use the product's homepage URL as before. A note is logged: `"Kongo not connected — campaigns will use homepage as landing page. Run /cultivation install to connect."`

**Phase summary for updated GROWTH_STRATEGIST.md:**

```
Phase 1   — Reconnaissance (Kelsier + Vin + Marsh)
Phase 2   — Foundation (Navani + Raoden)
Phase 3   — Content (Shallan + Hoid)
Phase 3.5 — Page Generation (Raoden + Shallan) ← NEW, requires Kongo
Phase 4   — Distribution (Kaladin + Lift + Adolin + Wax + Wayne + Steris + Sarene)
Phase 4.5 — Launch Preparation (Steris + Shallan + Vin)
Phase 5   — Compliance (Szeth)
Phase 6   — Measure & Iterate (Vin + Kelsier)
```

**Acceptance criteria:**
- [ ] Seed content extraction produces valid `PrdSeedContent` from PRD
- [ ] One Kongo page generated per ad campaign
- [ ] 6 variants generated per page (3 headline x 2 CTA)
- [ ] Campaign destination URLs point to Kongo pages with UTM params
- [ ] Phase 4.5 blocks until all pages are `ready`
- [ ] Phase 3.5 skipped gracefully when Kongo not connected
- [ ] GROWTH_STRATEGIST.md updated with Phase 3.5 documentation

---

### Mission 6: Heartbeat Daemon Jobs (1-2 days)

*"The daemon watches while you sleep." — Dockson*

**Agents:** Dockson (Treasury), Vin (Analytics)

**Deliverables:**

| File | Purpose |
|------|---------|
| `wizard/lib/kongo/jobs.ts` | Heartbeat job definitions: `kongo-signal`, `kongo-seed` |
| `wizard/lib/kongo/__tests__/jobs.test.ts` | Job execution tests |
| Updates to heartbeat daemon scheduler | Register new jobs |

**Technical details:**

Three new heartbeat daemon jobs:

| Job | Schedule | Logic |
|-----|----------|-------|
| `kongo-signal` | Hourly | Poll `getGrowthSignal` for all active Kongo campaigns. Log signal to heartbeat state. If signal recommends `kill`, flag campaign for daemon's existing kill-check job. If signal recommends `scale`, flag for budget rebalance. |
| `kongo-seed` | On A/B winner | Triggered when Wayne's A/B evaluation declares a winner (or when `bandit.winner_declared` webhook fires). Extract winning variant's copy. Push winning copy back to Kongo as seed for next page iteration. Log to growth report. |
| `kongo-webhook` | Event-driven | Receive Kongo webhook events on the daemon's existing HTTP callback port. Verify HMAC signature. Route to appropriate handler (`bandit.winner_declared` triggers `kongo-seed`, `campaign.conversion_milestone` logs to growth report, `page.generation_complete`/`page.generation_failed` update page status in heartbeat state). |

**Integration with existing daemon architecture:**
- Jobs registered via the same scheduler interface as existing jobs (health ping, spend check, campaign status, etc.)
- Webhook handler added as a new route on the daemon's Unix socket API (or HTTP callback port if configured)
- `kongo-signal` results stored in `heartbeat.json` alongside existing campaign data
- Jobs are only registered when Kongo is connected (check vault for Kongo API key on daemon startup)

**Acceptance criteria:**
- [ ] `kongo-signal` polls hourly and logs growth signal
- [ ] `kongo-seed` triggers on A/B winner and pushes winning copy
- [ ] Webhook handler verifies HMAC and routes all four event types
- [ ] Jobs skip cleanly when Kongo is not connected
- [ ] Job results appear in heartbeat state and Danger Room

---

### Mission 7: GTM Content Engine Codification (1-2 days)

*"There's always another secret." — Kelsier*

**Agents:** Kelsier (Growth Strategist), Shallan (Creative), Hoid (Copywriter)

**Deliverables:**

| File | Purpose |
|------|---------|
| Updates to `docs/methods/GROWTH_STRATEGIST.md` | New "Content Engine" section |
| Updates to `docs/methods/HEARTBEAT.md` | Content engine daemon jobs |

**Technical details:**

New **"Content Engine"** section in GROWTH_STRATEGIST.md codifies the GTM Playbook's content pipeline:

**3-Phase Activation Model:**

| Phase | Mode | What Happens |
|-------|------|-------------|
| **Phase A: Manual** | Human-driven | User writes seed content. Kongo generates pages. User reviews and publishes. |
| **Phase B: Semi-Auto** | Human-approved | Daemon suggests seed content from analytics. Kongo generates pages. User approves before publish. |
| **Phase C: Fully Auto** | Daemon-driven | Daemon extracts seed from winning variants. Kongo generates and publishes. Human monitors via Danger Room. |

Users start at Phase A. Promotion to Phase B requires 10+ successful page generations. Promotion to Phase C requires 50+ pages with positive conversion delta and explicit user opt-in (`/grow --auto-pages`).

**Content Pipeline Target:** 30-65 pieces/week at Phase C:
- 5-10 landing page variants (Kongo)
- 10-20 social posts (Postiz adapter)
- 5-10 short-form videos (external: CapCut, MakeUGC)
- 5-15 community posts (Kaladin, manual)
- 5-10 email sequences (Hoid)

**Integration Classification:**

| Tool | Classification | VoidForge Surface |
|------|---------------|-------------------|
| **Kongo Engine** | First-party integration | `wizard/lib/kongo/` — full adapter |
| **Postiz** | Adapter | `wizard/lib/adapters/postiz.ts` — social scheduling |
| **LarryLoop** | Adapter | `wizard/lib/adapters/larryloop.ts` — email sequences |
| **Make.com** | Orchestrator | Webhook triggers only — no adapter |
| **Whop** | External | No adapter — manual or Make.com webhook |
| **SideShift** | External | No adapter — stablecoin conversion via Circle |
| **CapCut** | External | No adapter — manual video editing |
| **MakeUGC** | External | No adapter — manual UGC generation |
| **Superscale** | External | No adapter — manual analytics |

**Weekly Feedback Loop:**
- **Monday:** Vin pulls analytics from all active campaigns + Kongo pages. Growth signal aggregated.
- **Tuesday:** Kelsier reviews signals. Identifies winning copy patterns. Generates seed content brief.
- **Wednesday:** Raoden sends seeds to Kongo. Shallan generates social variants. Hoid drafts email copy.
- **Thursday:** Wax distributes: new pages go live, social posts scheduled, email sequences queued.
- **Friday:** Vin monitors first 24h performance. Circuit breakers active. Underperformers flagged.

This loop runs manually at Phase A, with daemon assistance at Phase B, and fully autonomously at Phase C.

**Acceptance criteria:**
- [ ] Content Engine section added to GROWTH_STRATEGIST.md
- [ ] 3-phase activation model documented with promotion criteria
- [ ] Integration classification table complete
- [ ] Weekly feedback loop documented
- [ ] HEARTBEAT.md updated with content engine job references

---

### Mission 8: Pattern + Documentation (1 day)

*"The pattern is the teacher." — Picard*

**Agents:** Picard (Architecture), Coulson (Release)

**Deliverables:**

| File | Purpose |
|------|---------|
| `docs/patterns/kongo-integration.ts` | Reference implementation: KongoClient, from-PRD contract, growth-signal, webhooks |
| Updates to `CLAUDE.md` | Pattern entry in Code Patterns table |
| Updates to `HOLOCRON.md` | Kongo integration section in The Arsenal |
| Updates to `ROADMAP.md` | v20.1 entry |

**Pattern file structure (`docs/patterns/kongo-integration.ts`):**

```typescript
// Pattern: Kongo Integration
// When to use: Integrating an external landing page engine with growth/campaign systems
// Covers: authenticated client, from-PRD page generation, growth signal consumption, webhook handling

// Section 1: KongoClient interface
// Section 2: From-PRD contract (seed extraction → page generation)
// Section 3: Growth signal interface (analytics → decision)
// Section 4: Webhook handlers (event verification → routing)
// Section 5: Campaign-page linkage (ad campaign → landing page → UTM → attribution)
```

**CLAUDE.md addition** (in Code Patterns table):
```
- `kongo-integration.ts` — Landing page engine: client, from-PRD generation, growth signal, webhook handlers
```

**HOLOCRON.md addition** (in The Arsenal, after Cultivation/Grow section):
- What Kongo integration does
- How to connect (`/cultivation install` Step 2b)
- How it works with `/grow` (Phase 3.5)
- How to monitor (Danger Room Landing Pages tab)

**Acceptance criteria:**
- [ ] Pattern file follows existing pattern conventions (see `docs/patterns/ad-platform-adapter.ts`)
- [ ] CLAUDE.md pattern table includes kongo-integration entry
- [ ] HOLOCRON.md includes Kongo section with setup and usage
- [ ] ROADMAP.md updated with v20.1 milestone

---

## 5. Data Models

### Core Types (`wizard/lib/kongo/types.ts`)

```typescript
/** Seed content extracted from PRD for page generation */
interface KongoPageInput {
  headline: string;
  subheadline: string;
  valueProps: string[];        // 3-5 bullet points
  ctaText: string;             // Primary CTA button text
  ctaUrl: string;              // Where the CTA points (signup, purchase, etc.)
  brandColors: {
    primary: string;           // Hex
    secondary: string;         // Hex
    accent: string;            // Hex
  };
  logoUrl?: string;
  socialProof?: string[];      // Testimonials, stats, logos
  metadata: {
    projectName: string;
    campaignId?: string;       // VoidForge campaign ID for UTM linking
    platform?: string;         // Target ad platform (affects page style)
  };
}

/** A generated Kongo landing page */
interface KongoPage {
  id: string;
  status: 'generating' | 'ready' | 'failed' | 'archived';
  url: string;                 // Live page URL
  previewUrl: string;          // Preview URL (pre-publish)
  html?: string;               // Raw HTML (available when status=ready)
  createdAt: string;           // ISO 8601
  generationTimeMs?: number;   // How long generation took
  seed: KongoPageInput;        // The input that generated this page
  error?: string;              // Error message if status=failed
}

/** A Kongo campaign (groups pages + variants for A/B testing) */
interface KongoCampaign {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'paused' | 'completed';
  pageIds: string[];           // Pages in this campaign
  trafficSplit: Record<string, number>;  // variantId → percentage (sums to 100)
  rotationStrategy: 'even' | 'bandit';
  conversionGoal: string;      // e.g., 'signup', 'purchase', 'demo_request'
  createdAt: string;
  updatedAt: string;
}

/** Configuration for creating a Kongo campaign */
interface KongoCampaignConfig {
  name: string;
  pageId: string;              // Base page to test variants against
  variantCount: number;        // How many variants to generate
  variationAxes: VariationAxis[];  // What to vary
  rotationStrategy: 'even' | 'bandit';
  conversionGoal: string;
}

type VariationAxis = 'headline' | 'subheadline' | 'cta_text' | 'hero_image' | 'layout' | 'color_scheme';

/** A variant of a Kongo page */
interface KongoVariant {
  id: string;
  pageId: string;
  campaignId: string;
  axis: VariationAxis;         // What was varied
  delta: string;               // Human-readable description of the change
  url: string;
  status: 'generating' | 'ready' | 'failed';
  impressions: number;
  conversions: number;
  conversionRate: number;      // 0.0-1.0
}

/** Conversion report for a page or campaign */
interface KongoConversionReport {
  entityId: string;            // Page ID or Campaign ID
  entityType: 'page' | 'campaign';
  period: { start: string; end: string };
  totalVisitors: number;
  uniqueVisitors: number;
  conversions: number;
  conversionRate: number;
  bounceRate: number;
  avgTimeOnPage: number;       // Seconds
  topReferrers: Array<{ source: string; count: number }>;
  deviceBreakdown: { desktop: number; mobile: number; tablet: number };
}

/** Growth signal — Kongo's recommendation for a campaign */
interface KongoGrowthSignal {
  campaignId: string;
  timestamp: string;
  winningVariantId: string | null;  // null if no winner yet
  confidence: number;               // 0.0-1.0
  conversionRateDelta: number;      // Improvement over control (e.g., 0.15 = 15% lift)
  recommendation: 'scale' | 'iterate' | 'kill' | 'wait';
  reasoning: string;                // Human-readable explanation
  sampleSize: {
    control: number;
    variant: number;
  };
  nextEvaluation: string;           // ISO 8601 — when Kongo will next evaluate
}

/** Webhook event from Kongo */
interface KongoWebhookEvent {
  id: string;
  type: 'bandit.winner_declared' | 'campaign.conversion_milestone' | 'page.generation_complete' | 'page.generation_failed';
  timestamp: string;
  signature: string;                // HMAC-SHA256
  payload: BanditWinnerPayload | ConversionMilestonePayload | PageGenerationPayload;
}

interface BanditWinnerPayload {
  campaignId: string;
  winningVariantId: string;
  confidence: number;
  conversionRateDelta: number;
  losingVariantIds: string[];
}

interface ConversionMilestonePayload {
  campaignId: string;
  milestone: number;             // 100, 500, 1000, 5000
  totalConversions: number;
  conversionRate: number;
}

interface PageGenerationPayload {
  pageId: string;
  status: 'ready' | 'failed';
  url?: string;
  error?: string;
  generationTimeMs?: number;
}
```

---

## 6. API Routes

No new VoidForge API routes. This integration consumes Kongo's external REST API via the `KongoClient` library.

**Kongo API endpoints consumed:**

| Method | Endpoint | Used By |
|--------|----------|---------|
| `POST` | `/engine/pages` | `pages.createPage` |
| `POST` | `/engine/pages/from-prd` | `pages.createPageFromPrd` |
| `GET` | `/engine/pages/:id` | `pages.getStatus` |
| `GET` | `/engine/pages/:id/html` | `pages.getHtml` |
| `POST` | `/engine/campaigns` | `campaigns.createCampaign` |
| `PUT` | `/engine/campaigns/:id` | `campaigns.update` |
| `POST` | `/engine/campaigns/:id/publish` | `campaigns.publish` |
| `POST` | `/engine/campaigns/:id/unpublish` | `campaigns.unpublish` |
| `GET` | `/engine/campaigns/batch-status` | `campaigns.batchStatus` |
| `POST` | `/engine/variants` | `variants.createVariant` |
| `POST` | `/engine/variants/bulk` | `variants.bulkGenerate` |
| `PUT` | `/engine/variants/:id/slots` | `variants.regenerateSlots` |
| `PUT` | `/engine/campaigns/:id/rotation` | `variants.setRotation` |
| `GET` | `/engine/analytics/page/:id` | `analytics.getPageAnalytics` |
| `GET` | `/engine/analytics/campaign/:id` | `analytics.getCampaignAnalytics` |
| `GET` | `/engine/analytics/growth-signal/:id` | `analytics.getGrowthSignal` |

**Webhook receiver:** The heartbeat daemon's existing HTTP callback port receives `POST /webhooks/kongo` events. This is not a new server — it is a new route on the daemon's existing listener.

---

## 7. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        VoidForge                                │
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────┐ │
│  │ /cultivation │   │    /grow     │   │  Heartbeat Daemon    │ │
│  │   install    │   │  Phases 1-6  │   │                      │ │
│  │              │   │              │   │  ┌────────────────┐  │ │
│  │  Step 2b:    │   │  Phase 3.5:  │   │  │ kongo-signal   │  │ │
│  │  "Connect    │   │  Page Gen    │   │  │ (hourly)       │  │ │
│  │   Kongo?"    │   │  (Raoden)    │   │  ├────────────────┤  │ │
│  │      │       │   │      │       │   │  │ kongo-seed     │  │ │
│  │      ▼       │   │      ▼       │   │  │ (on winner)    │  │ │
│  │  OAuth flow  │   │  KongoClient │   │  ├────────────────┤  │ │
│  │  → vault     │   │      │       │   │  │ kongo-webhook  │  │ │
│  └──────┬───────┘   └──────┼───────┘   │  │ (event-driven) │  │ │
│         │                  │           │  └────────────────┘  │ │
│         │                  │           └──────────┬───────────┘ │
│         │                  │                      │             │
│         └──────────┬───────┴──────────────────────┘             │
│                    │                                            │
│         ┌──────────▼──────────┐                                 │
│         │  wizard/lib/kongo/  │                                 │
│         │  ┌───────────────┐  │                                 │
│         │  │   client.ts   │──┼───── Rate Limiter (60/min)      │
│         │  │   pages.ts    │  │                                 │
│         │  │  campaigns.ts │  │                                 │
│         │  │  variants.ts  │  │                                 │
│         │  │  analytics.ts │  │                                 │
│         │  │  webhooks.ts  │  │                                 │
│         │  │   oauth.ts    │  │                                 │
│         │  │   seed.ts     │  │                                 │
│         │  │   types.ts    │  │                                 │
│         │  └───────┬───────┘  │                                 │
│         └──────────┼──────────┘                                 │
│                    │                                            │
└────────────────────┼────────────────────────────────────────────┘
                     │ HTTPS
                     ▼
┌────────────────────────────────────────┐
│           Kongo Engine API             │
│                                        │
│  /engine/pages          (CRUD)         │
│  /engine/campaigns      (A/B mgmt)    │
│  /engine/variants       (generation)   │
│  /engine/analytics      (metrics)      │
│  → webhooks outbound    (events)       │
└────────────────────────────────────────┘
```

**Data flow — closed loop:**

```
1. PRD + Phase 3 content
       │
       ▼
2. Seed extraction (Raoden)
       │
       ▼
3. Kongo page generation (POST /engine/pages/from-prd)
       │
       ▼
4. Variant generation (POST /engine/variants/bulk)
       │
       ▼
5. Campaign launch (ad platform → Kongo page URL + UTM)
       │
       ▼
6. Traffic flows → Kongo tracks conversions
       │
       ▼
7. Heartbeat polls growth signal (GET /engine/analytics/growth-signal)
       │
       ▼
8. Winner declared → winning copy extracted
       │
       ▼
9. Winning copy fed back as seed → step 3 (loop)
```

---

## 8. Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Runtime | Node.js (TypeScript strict) | Matches VoidForge's existing stack |
| HTTP Client | `node:https` | No new dependencies — follows VoidForge's no-new-deps-without-justification rule |
| Auth | OAuth 2.0 (authorization code flow) | Kongo's auth model; API key stored in vault |
| Rate Limiting | In-memory sliding window | Matches `outbound-rate-limiter.ts` pattern |
| Webhook Verification | HMAC-SHA256 | Industry standard; shared secret in vault |
| Testing | Vitest | VoidForge's existing test framework |
| State | `heartbeat.json` extension | No new state files — extends existing daemon state |

**No new dependencies.** The entire integration uses `node:https` for HTTP calls, `node:crypto` for HMAC verification, and VoidForge's existing vault for credential storage.

---

## 9. Deployment

**npm package (main branch):** The integration ships as part of VoidForge's npm package. All code lives in `wizard/lib/kongo/`. No additional install steps — Kongo features activate when the user connects Kongo during `/cultivation install`.

**Scaffold and core branches:** These branches receive:
- `docs/patterns/kongo-integration.ts` — the pattern file
- `docs/methods/GROWTH_STRATEGIST.md` updates — Phase 3.5 documentation
- `docs/methods/HEARTBEAT.md` updates — Kongo job documentation
- `CLAUDE.md` — pattern table entry
- `HOLOCRON.md` — Kongo section

They do NOT receive `wizard/lib/kongo/` (wizard code is main-only). Scaffold/core users building their own growth system can reference the pattern file for the integration contract.

**Branch sync rule applies:** All shared file changes propagate to all three branches per CLAUDE.md branch sync protocol.

---

## 10. Analytics & Tracking

**Metrics that matter:**

| Metric | Source | Frequency |
|--------|--------|-----------|
| Page conversion rate | Kongo analytics API | Hourly (daemon) |
| Variant lift (vs. control) | Kongo growth signal | Hourly (daemon) |
| Campaign ROAS (with page attribution) | VoidForge + Kongo | Daily (daemon) |
| Pages generated (total/week) | Kongo API | Weekly (growth report) |
| Content engine phase (A/B/C) | VoidForge state | On promotion |
| Time-to-winner (avg days) | Kongo campaign analytics | Weekly (growth report) |

**UTM taxonomy (standardized with Vin):**

```
utm_source   = voidforge
utm_medium   = paid | organic | email | social
utm_campaign = {voidforge_campaign_id}
utm_content  = {kongo_variant_id}
utm_term     = {keyword} (paid search only)
```

---

## 11. Security

- **Credentials:** Kongo API key stored in VoidForge's encrypted financial vault. Never in `.env`, never in plaintext config.
- **OAuth:** Authorization code flow with PKCE. Temporary callback server runs on localhost only, random port, shuts down after code exchange.
- **Webhook verification:** HMAC-SHA256 with shared secret. Reject requests with invalid or missing signatures. Timing-safe comparison to prevent timing attacks.
- **Rate limiting:** Client-side rate limiter prevents accidental API abuse. 60 requests/minute sliding window.
- **No PII in logs:** Page content may contain user-provided copy. Logs record page IDs and campaign IDs, never page content or seed text.
- **Vault timeout:** Kongo API key follows the same vault timeout rules as ad platform credentials (default 12h, vacation mode 168h).

---

## 12. Error Handling

All errors follow VoidForge's `ApiError` pattern from `docs/patterns/error-handling.ts`.

| Error | Handling | User-Facing Message |
|-------|----------|-------------------|
| Kongo API 401 | Re-authenticate via OAuth | "Kongo session expired. Re-run `/cultivation install` to reconnect." |
| Kongo API 429 | Backoff + retry (3 attempts, exponential) | "Kongo rate limit hit. Retrying in [N]s..." |
| Kongo API 500 | Log + skip + continue | "Kongo is temporarily unavailable. Page generation deferred." |
| Page generation timeout | Log + flag for retry | "Page [id] generation timed out after 120s. Will retry on next daemon cycle." |
| Webhook signature invalid | Reject + log (no retry) | (Internal only — no user message) |
| Kongo not connected | Skip gracefully | "Kongo not connected — skipping page generation." |

---

## 13. Brand Voice

The integration speaks in VoidForge's existing Cosmere voice:

- **Raoden** on page generation: *"Every leak in the funnel gets sealed. Every page is precision."*
- **Wayne** on variant testing: *"I can be six different pages at once. Let's see which one the audience likes."*
- **Kelsier** on the closed loop: *"The heist doesn't end when the ad runs. It ends when the page converts."*
- **Vin** on analytics: *"I see the signal in the noise. This variant is winning."*

Error messages are direct, never cute: `"Kongo connection failed — check API key in vault."` Not `"Oops! Something went wrong with the page forge!"`

---

## 14. Testing Strategy

| Layer | Framework | Count (est.) | What |
|-------|-----------|-------------|------|
| Unit | Vitest | ~40 | Client methods, seed extraction, type parsing, webhook verification |
| Integration | Vitest + sandbox | ~20 | Full page lifecycle, campaign lifecycle, analytics retrieval |
| Daemon | Vitest | ~10 | Job scheduling, signal polling, seed push, webhook routing |

**Sandbox approach:** All tests use Kongo's sandbox mode (or mocked HTTP responses). No live API calls in CI. Sandbox responses match production API shapes exactly — validated against Kongo's OpenAPI spec.

**Test files:**
- `wizard/lib/kongo/__tests__/client.test.ts`
- `wizard/lib/kongo/__tests__/pages.test.ts`
- `wizard/lib/kongo/__tests__/campaigns.test.ts`
- `wizard/lib/kongo/__tests__/variants.test.ts`
- `wizard/lib/kongo/__tests__/analytics.test.ts`
- `wizard/lib/kongo/__tests__/webhooks.test.ts`
- `wizard/lib/kongo/__tests__/oauth.test.ts`
- `wizard/lib/kongo/__tests__/seed.test.ts`
- `wizard/lib/kongo/__tests__/jobs.test.ts`

**Estimated total: ~70 new tests**, bringing VoidForge from 499 to ~569.

---

## 15. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Kongo API changes | Medium | High | Type interfaces are the contract boundary. Version-pin API calls. KongoClient abstracts all HTTP — changes isolated to one file. |
| Page generation latency (>120s) | Low | Medium | Async generation with polling. Phase 4.5 gate waits. Daemon retries failed generations. |
| Rate limit exhaustion | Low | Low | Client-side rate limiter at 60/min. Bulk endpoints used where available. |
| OAuth flow fails on headless servers | Medium | Medium | Fallback: manual API key entry via `--kongo-key` flag. Stored in vault same as OAuth path. |
| Kongo downtime during /grow | Low | Medium | Phase 3.5 skips gracefully. Campaigns launch without dedicated pages (homepage fallback). Logged as degraded, not failed. |
| Scope creep into Kongo internals | Medium | High | This integration is API-only. VoidForge never touches Kongo's database, never hosts pages, never modifies Kongo's behavior. The boundary is the REST API. |

---

## 16. Launch Sequence

| Mission | Scope | Est. Days | Dependencies | Gate |
|---------|-------|-----------|-------------|------|
| **1. KongoClient Foundation** | Client, types, page CRUD | 1-2 | None | Client authenticates, pages create/poll |
| **2. Campaign + Variants** | Campaign CRUD, variant generation, Wayne integration | 2-3 | Mission 1 | Campaigns create, variants generate, A/B layer works |
| **3. Analytics + Webhooks** | Analytics, growth signal, webhook receiver | 2-3 | Mission 1 | Growth signal parses, webhooks verify + route |
| **4. /cultivation install** | OAuth flow, Step 2b, Danger Room tab | 1-2 | Mission 1 | OAuth completes, vault stores key, tab renders |
| **5. /grow Phase 3.5** | Phase insertion, seed extraction, campaign linking | 2-3 | Missions 1-3 | Pages generate per campaign, Phase 4.5 gate works |
| **6. Heartbeat Jobs** | Daemon jobs, webhook handler | 1-2 | Missions 1, 3 | Jobs poll/trigger, signals logged, webhooks handled |
| **7. Content Engine** | GROWTH_STRATEGIST.md, HEARTBEAT.md updates | 1-2 | Missions 5-6 | Docs complete, 3-phase model documented |
| **8. Pattern + Docs** | Pattern file, CLAUDE.md, HOLOCRON.md, ROADMAP.md | 1 | All missions | Pattern matches conventions, all docs updated |

**Total estimated effort:** 10-18 days

**Execution order:** Missions 1-3 can partially parallelize (Mission 1 first, then 2 and 3 in parallel). Mission 4 can run in parallel with 2-3 after Mission 1 completes. Missions 5-6 require 1-3. Missions 7-8 are documentation and run last.

```
Mission 1 ──┬──→ Mission 2 ──┬──→ Mission 5 ──→ Mission 7 ──→ Mission 8
             │                │
             ├──→ Mission 3 ──┤
             │                │
             └──→ Mission 4 ──┘──→ Mission 6 ──┘
```

**Post-launch:** After v20.1 ships, the integration enters autonomous mode. The heartbeat daemon runs `kongo-signal` and `kongo-seed` jobs. Vin monitors. Wayne evaluates. The closed loop turns.
