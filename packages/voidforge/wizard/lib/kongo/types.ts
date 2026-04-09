/**
 * Kongo Engine API types — matched to the real Kongo API surface at kongo.io/api/v1.
 *
 * These types represent the actual API request/response shapes, not abstract
 * interfaces. Kongo is a first-party integration (ADR-036): the user owns both
 * VoidForge and Kongo, so no adapter abstraction is needed.
 *
 * Base URL: https://kongo.io/api/v1
 * Auth: Bearer token with ke_live_ prefix
 */

// ── Page Types ───────────────────────────────────────────

export type PageStatus = 'GENERATING' | 'READY' | 'ERROR';

export type PageTemplate =
  | 'PITCH'
  | 'landing-page'
  | 'company-overview'
  | 'product-launch'
  | 'event-page'
  | 'one-pager';

export interface PageStyle {
  readonly colors?: { primary?: string; secondary?: string; accent?: string };
  readonly fonts?: { heading?: string; body?: string };
  readonly designSystem?: Record<string, unknown>;
}

export interface AccessGate {
  readonly password?: string;
  readonly emailCapture?: boolean;
}

export interface CreatePageRequest {
  readonly companyName: string;
  readonly content: string;
  readonly brief?: Record<string, unknown>;
  readonly template?: PageTemplate;
  readonly style?: PageStyle;
  readonly hosted?: boolean;
  readonly callbackUrl?: string;
  readonly metadata?: Record<string, unknown>;
  readonly accessGate?: AccessGate;
  readonly seoTitle?: string;
  readonly seoDescription?: string;
}

export interface CreatePageResponse {
  readonly pageId: string;
  readonly status: 'GENERATING';
  readonly statusUrl: string;
  readonly createdAt: string;
}

export interface PageGenerationStats {
  readonly durationSec: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
  readonly promptVersion?: string;
}

export interface PageProgressStep {
  readonly step: string;
  readonly status: string;
  readonly timestamp?: string;
}

export interface PageErrorDetail {
  readonly code: string;
  readonly message: string;
}

export interface PageDetail {
  readonly pageId: string;
  readonly status: PageStatus;
  readonly companyName: string;
  readonly html?: string;
  readonly hostedUrl?: string;
  readonly progress?: PageProgressStep[];
  readonly generation?: PageGenerationStats;
  readonly error?: PageErrorDetail;
  readonly createdAt: string;
  readonly updatedAt?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ListPagesOptions {
  readonly cursor?: string;
  readonly limit?: number;
  readonly status?: PageStatus;
  readonly sort?: 'createdAt' | 'updatedAt';
  readonly order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  readonly items: T[];
  readonly cursor?: string;
  readonly hasMore: boolean;
}

export interface BatchPageConfig {
  readonly companyName: string;
  readonly content: string;
  readonly brief?: Record<string, unknown>;
  readonly template?: PageTemplate;
  readonly style?: PageStyle;
  readonly hosted?: boolean;
  readonly callbackUrl?: string;
  readonly metadata?: Record<string, unknown>;
  readonly accessGate?: AccessGate;
  readonly seoTitle?: string;
  readonly seoDescription?: string;
}

export interface BatchGenerateRequest {
  readonly pages: BatchPageConfig[];
}

export interface BatchPageResult {
  readonly pageId: string;
  readonly status: 'GENERATING';
  readonly statusUrl: string;
  readonly createdAt: string;
}

// ── Campaign Types ───────────────────────────────────────

export type RotationStrategy = 'weighted' | 'equal' | 'bandit';

export interface SourceRule {
  readonly source: string;
  readonly variantId: string;
}

export interface CreateCampaignRequest {
  readonly name: string;
  readonly templateId: string;
  readonly slug: string;
  readonly rotationStrategy?: RotationStrategy;
  readonly trackingEnabled?: boolean;
  readonly accessGate?: AccessGate;
  readonly metadata?: Record<string, unknown>;
  readonly sourceRules?: SourceRule[];
}

export interface CampaignDetail {
  readonly campaignId: string;
  readonly name: string;
  readonly templateId: string;
  readonly slug: string;
  readonly rotationStrategy: RotationStrategy;
  readonly isPublished: boolean;
  readonly trackingEnabled: boolean;
  readonly accessGate?: { passwordProtected: boolean; emailCapture: boolean };
  readonly metadata?: Record<string, unknown>;
  readonly sourceRules?: SourceRule[];
  readonly createdAt: string;
  readonly updatedAt?: string;
}

export interface UpdateCampaignRequest {
  readonly rotationStrategy?: RotationStrategy;
  readonly trackingEnabled?: boolean;
  readonly accessGate?: AccessGate;
  readonly metadata?: Record<string, unknown>;
  readonly sourceRules?: SourceRule[];
}

export interface PublishResult {
  readonly campaignId: string;
  readonly slug: string;
  readonly domain: string;
  readonly publishedAt: string;
}

export interface ListCampaignsOptions {
  readonly cursor?: string;
  readonly limit?: number;
  readonly published?: boolean;
  readonly search?: string;
}

// ── Variant Types ────────────────────────────────────────

export interface CreateVariantRequest {
  readonly label: string;
  readonly slotValues: Record<string, string>;
  readonly weight?: number;
  readonly source?: string;
}

export interface VariantDetail {
  readonly variantId: string;
  readonly label: string;
  readonly order: number;
  readonly slotCount: number;
  readonly slotValues?: Record<string, string>;
  readonly compiledHtml?: string;
  readonly weight: number;
  readonly source?: string;
  readonly isActive: boolean;
  readonly views: number;
  readonly conversions: number;
  readonly cvr: number;
  readonly createdAt: string;
  readonly updatedAt?: string;
}

export interface UpdateVariantRequest {
  readonly label?: string;
  readonly slotValues?: Record<string, string>;
  readonly weight?: number;
  readonly isActive?: boolean;
}

export interface GenerateVariantsRequest {
  readonly count: number;
  readonly vary: string[];
  readonly baseValues?: Record<string, string>;
  readonly context?: string;
  readonly sources?: string[];
}

export interface GenerateVariantsResult {
  readonly variants: Array<{
    variantId: string;
    label: string;
    order: number;
    slotCount: number;
    source?: string;
    createdAt: string;
  }>;
  readonly generation: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    durationMs: number;
  };
}

export interface RegenerateVariantRequest {
  readonly slots: string[];
  readonly direction?: string;
}

// ── Analytics Types ──────────────────────────────────────

export type AnalyticsPeriod = '7d' | '30d' | '90d' | 'all';

export interface CampaignAnalytics {
  readonly period: AnalyticsPeriod;
  readonly summary: {
    totalViews: number;
    totalConversions: number;
    cvr: number;
  };
  readonly byVariant: Array<{
    variantId: string;
    label: string;
    order: number;
    views: number;
    conversions: number;
    cvr: number;
    weight: number;
  }>;
  readonly bySource: Array<{
    source: string;
    views: number;
    conversions: number;
    cvr: number;
  }>;
  readonly byDay: Array<{
    date: string;
    views: number;
    conversions: number;
  }>;
}

// ── Computed Growth Signal (client-side) ─────────────────
// Kongo doesn't have a dedicated growth-signal endpoint.
// We compute this from campaign analytics data.

export type GrowthRecommendation = 'scale' | 'iterate' | 'kill' | 'wait';

export interface ComputedGrowthSignal {
  readonly campaignId: string;
  readonly timestamp: string;
  readonly winningVariantId: string | null;
  readonly confidence: number;
  readonly conversionRateDelta: number;
  readonly recommendation: GrowthRecommendation;
  readonly reasoning: string;
  readonly sampleSize: { control: number; variant: number };
}

// ── Conversion Event Types ───────────────────────────────

export type ConversionEventType = 'view' | 'click' | 'form_submit' | 'purchase';

export interface ConversionEvent {
  readonly campaignId: string;
  readonly variantId: string;
  readonly visitorId: string;
  readonly type: ConversionEventType;
  readonly eventName?: string;
  readonly value?: number;
  readonly utmSource?: string;
  readonly utmMedium?: string;
  readonly utmCampaign?: string;
  readonly scrollDepth?: number;
  readonly durationSec?: number;
}

// ── Webhook Types ────────────────────────────────────────

export type WebhookEventType = 'page.completed' | 'page.failed';

export interface WebhookPayload {
  readonly event: WebhookEventType;
  readonly pageId: string;
  readonly data: {
    companyName: string;
    status: 'READY' | 'ERROR';
    durationSec?: number;
    costUsd?: number;
    htmlLength?: number;
    error?: string;
  };
}

// ── API Response Envelope ────────────────────────────────

export interface KongoSuccessResponse<T> {
  readonly success: true;
  readonly data: T;
}

export interface KongoErrorResponse {
  readonly success: false;
  readonly error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type KongoResponse<T> = KongoSuccessResponse<T> | KongoErrorResponse;

// ── Error Codes ──────────────────────────────────────────

export type KongoErrorCode =
  | 'UNAUTHORIZED'
  | 'TIER_RESTRICTED'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'MONTHLY_LIMIT'
  | 'CONCURRENT_LIMIT'
  | 'SERVICE_BUSY'
  | 'VALIDATION_ERROR'
  | 'CONTENT_BLOCKED'
  | 'NOT_FOUND'
  | 'NOT_READY';

// ── Client Configuration ─────────────────────────────────

export interface KongoClientConfig {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly rateLimitPerMinute?: number;
}

// ── PRD Seed Content (VoidForge-specific) ────────────────
// Structured content extracted from a PRD for page generation.
// Maps to Kongo's CreatePageRequest with brief + template: 'landing-page'.

export interface PrdSeedContent {
  readonly projectName: string;
  readonly headline: string;
  readonly subheadline: string;
  readonly valueProps: string[];
  readonly ctaText: string;
  readonly ctaUrl: string;
  readonly brandColors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  readonly logoUrl?: string;
  readonly socialProof?: string[];
  readonly campaignId?: string;
  readonly platform?: string;
}
