/**
 * Pattern: Kongo Integration
 * When to use: Integrating an external landing page engine with growth/campaign systems
 * Covers: authenticated client, from-PRD page generation, growth signal, webhook handling
 *
 * This pattern demonstrates first-party API integration for a product the team owns.
 * Unlike adapter patterns (ad-platform-adapter.ts), there's no abstraction layer —
 * the client talks directly to the external API with typed request/response shapes.
 *
 * Architecture: ADR-036
 *
 * Framework adaptations:
 * - Next.js: Webhook route at /api/webhooks/kongo
 * - Express: Router mounted at /webhooks/kongo
 * - Django/DRF: View at /api/webhooks/kongo/ with raw body parsing
 * - FastAPI: POST endpoint with Request.body() for raw access
 */

// ── Section 1: Client Interface ──────────────────────────
//
// Authenticated HTTP client with rate limiting.
// API key stored in financial vault (never .env).

interface KongoClientConfig {
  apiKey: string;          // ke_live_ prefix, vault-sourced
  baseUrl?: string;        // Default: https://kongo.io/api/v1
  timeoutMs?: number;      // Default: 30_000
  rateLimitPerMinute?: number;  // Default: 60 (client-side safety)
}

// Client methods: get<T>, post<T>, put<T>, patch<T>, delete<T>
// All return parsed response data (envelope unwrapped).
// Automatic retry on 429/503 with exponential backoff (3 attempts).
// Rate limiter: sliding window, throws KongoApiError on exhaustion.

// Error type extends the standard ApiError pattern:
class KongoApiError extends Error {
  constructor(
    public code: string,     // Kongo error code (UNAUTHORIZED, RATE_LIMITED, etc.)
    message: string,
    public status: number,   // HTTP status
    public retryable: boolean,
    public retryAfterMs?: number,
  ) {
    super(message);
  }
}

// ── Section 2: From-PRD Page Generation ──────────────────
//
// Maps PRD content to Kongo's page creation API.
// No custom endpoint needed — uses existing POST /engine/pages
// with the `brief` field for structured input.

interface PrdSeedContent {
  projectName: string;
  headline: string;
  subheadline: string;
  valueProps: string[];      // 3-5 bullet points
  ctaText: string;
  ctaUrl: string;
  brandColors: { primary: string; secondary: string; accent: string };
  logoUrl?: string;
  socialProof?: string[];
  campaignId?: string;       // VoidForge campaign ID for UTM linking
  platform?: string;         // Target ad platform (affects page style)
}

// Seed → Kongo mapping:
//   PrdSeedContent.projectName  → CreatePageRequest.companyName
//   PrdSeedContent.*            → CreatePageRequest.brief (structured)
//   PrdSeedContent.*            → CreatePageRequest.content (flattened text)
//   PrdSeedContent.brandColors  → CreatePageRequest.style.colors
//   Always: template='landing-page', hosted=true
//   Metadata: source='voidforge', projectName, campaignId, platform

// Polling: awaitPage() polls GET /engine/pages/:id every 3s until READY.
// Timeout: 120s default. Throws KongoApiError on ERROR status.

// ── Section 3: Growth Signal ─────────────────────────────
//
// Kongo doesn't have a dedicated growth-signal endpoint.
// Compute it client-side from campaign analytics.

interface ComputedGrowthSignal {
  campaignId: string;
  winningVariantId: string | null;  // null if no winner yet
  confidence: number;               // 0.0-1.0
  conversionRateDelta: number;      // Lift over control
  recommendation: 'scale' | 'iterate' | 'kill' | 'wait';
  reasoning: string;
  sampleSize: { control: number; variant: number };
}

// Algorithm: Two-proportion z-test comparing best challenger vs control (first variant by creation order).
// Minimum thresholds: 200 total views, 100 per variant.
// Confidence mapping:
//   ≥0.95 + positive delta → 'scale' (winner found)
//   ≥0.80 + positive delta → 'iterate' (promising, need more data)
//   ≥0.95 + negative/zero delta + 500+ views → 'kill'
//   else → 'wait'

// ── Section 4: Webhook Handlers ──────────────────────────
//
// Kongo sends webhooks for page lifecycle events.
// Signature: X-Kongo-Signature: t=timestamp,v1=hmac_sha256

// Verification steps:
// 1. Parse header: split by comma → extract t= and v1= parts
// 2. Check freshness: reject if timestamp > 5 minutes old
// 3. Compute expected: HMAC-SHA256 of "timestamp.rawBody" with secret
// 4. Compare: timing-safe comparison (prevents timing attacks)

// Events:
// - page.completed → update page status in heartbeat state
// - page.failed → log error, flag for retry on next daemon cycle

// Router pattern:
//   const router = createWebhookRouter();
//   router.on('page.completed', async (payload) => { ... });
//   router.on('page.failed', async (payload) => { ... });
//   await router.handle(rawBody, signature, secret);

// ── Section 5: Campaign-Page Linkage ─────────────────────
//
// Ad campaigns point to Kongo pages with UTM parameters.

// UTM taxonomy (standardized with Vin):
//   utm_source   = voidforge
//   utm_medium   = paid | organic | email | social
//   utm_campaign = {voidforge_campaign_id}
//   utm_content  = {kongo_variant_id}
//   utm_term     = {keyword} (paid search only)

// Kongo campaigns use rotation strategies:
//   'weighted' — manual traffic weights per variant
//   'equal'    — even split across all variants
//   'bandit'   — multi-armed bandit (auto-optimize)

// AI variant generation:
//   POST /engine/campaigns/:id/variants/generate
//   count: 1-20, vary: ['headline', 'tagline', 'cta_text'], context: string
//   ~$0.01, ~3s for 5 variants (Claude Sonnet)

// ── Section 6: Daemon Jobs ───────────────────────────────
//
// Three Kongo-specific heartbeat jobs:

// kongo-signal (hourly):
//   Poll getGrowthSignal() for all published campaigns.
//   Log signals to heartbeat.json. Forward 'scale'/'kill' for daemon action.
//   Fault-tolerant: continues polling other campaigns if one fails.

// kongo-seed (event-driven):
//   Triggered when Wayne's A/B evaluation declares a page variant winner.
//   Extracts winning variant's slotValues.
//   Available as seed for next createPageFromPrd() cycle.

// kongo-webhook (event-driven):
//   Receives POST from Kongo on daemon's callback port.
//   Verifies HMAC signature. Routes to typed handlers.
//   Conditional: only registered when Kongo API key exists in vault.

export {};
