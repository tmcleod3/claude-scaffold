/**
 * Pattern: AI Router
 *
 * Maps natural language input to typed intents and dispatches to handlers.
 * Think of this as a programmable switch statement where AI does the matching.
 *
 * Key principles:
 * - Intents are a closed set — define them upfront, not discovered at runtime
 * - Ambiguity is an explicit state — route to clarification, not a random handler
 * - Default fallback prevents unhandled inputs from failing silently
 * - Emit metrics on every route decision for observability
 * - Handler functions are pure business logic — no AI inside handlers
 *
 * Agents: Picard (routing architecture), Stark (handler dispatch), Batman (edge cases)
 *
 * Provider note: Uses Anthropic for intent classification. Swap classify() for any provider.
 */

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

// --- Intent definitions — closed set, exhaustive ---

export const INTENTS = [
  'check_order_status',
  'request_refund',
  'update_account',
  'product_question',
  'speak_to_human',
  'ambiguous',
] as const

export type Intent = (typeof INTENTS)[number]

// --- Router types ---

interface RouteResult {
  intent: Intent
  confidence: number
  params: Record<string, string> // Extracted entities (orderId, productName, etc.)
  handlerResponse: unknown
}

interface RouterMetrics {
  intent: Intent
  confidence: number
  latencyMs: number
  routed: boolean // false if fell through to default
}

type MetricsEmitter = (metrics: RouterMetrics) => void

type IntentHandler = (
  input: string,
  params: Record<string, string>
) => Promise<unknown>

// --- Intent classification ---

const IntentOutputSchema = z.object({
  intent: z.enum(INTENTS),
  confidence: z.number().min(0).max(1),
  params: z.record(z.string()),
})

async function classifyIntent(
  client: Anthropic,
  input: string
): Promise<z.infer<typeof IntentOutputSchema>> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 256,
    system: [
      'You are an intent classifier. Classify the user message into exactly one intent.',
      `Valid intents: ${INTENTS.join(', ')}`,
      'If the intent is unclear, use "ambiguous".',
      'Extract relevant parameters (orderId, productName, etc.) from the message.',
      'Respond with JSON: { "intent": "<intent>", "confidence": <0-1>, "params": {} }',
    ].join('\n'),
    messages: [{ role: 'user', content: input }],
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Expected text response')
  return IntentOutputSchema.parse(JSON.parse(content.text))
}

// OpenAI adaptation:
//   Use openai.chat.completions.create() with response_format: { type: 'json_object' }.
//   Same schema parsing. For very high throughput, consider fine-tuned gpt-4o-mini.

// --- IntentRouter class ---

const AMBIGUITY_THRESHOLD = 0.50 // Below this, treat as ambiguous regardless of model label

export class IntentRouter {
  private handlers = new Map<Intent, IntentHandler>()
  private defaultHandler: IntentHandler
  private emitMetrics: MetricsEmitter

  constructor(
    private client: Anthropic,
    options: {
      defaultHandler: IntentHandler
      emitMetrics?: MetricsEmitter
    }
  ) {
    this.defaultHandler = options.defaultHandler
    this.emitMetrics = options.emitMetrics ?? (() => {}) // No-op if not provided
  }

  /** Register a handler for an intent. One handler per intent. */
  on(intent: Intent, handler: IntentHandler): this {
    this.handlers.set(intent, handler)
    return this
  }

  /** Classify intent from natural language and dispatch to the registered handler. */
  async routeRequest(input: string): Promise<RouteResult> {
    const start = Date.now()
    const classification = await classifyIntent(this.client, input)
    const latencyMs = Date.now() - start

    // Override to ambiguous if confidence is too low, regardless of model's label
    const effectiveIntent: Intent =
      classification.confidence < AMBIGUITY_THRESHOLD ? 'ambiguous' : classification.intent

    const handler = this.handlers.get(effectiveIntent) ?? this.defaultHandler
    const routed = this.handlers.has(effectiveIntent)

    // Emit metrics for observability — track routing decisions, not content
    this.emitMetrics({
      intent: effectiveIntent,
      confidence: classification.confidence,
      latencyMs,
      routed,
    })

    const handlerResponse = await handler(input, classification.params)

    return {
      intent: effectiveIntent,
      confidence: classification.confidence,
      params: classification.params,
      handlerResponse,
    }
  }
}

// --- Usage example ---

// const router = new IntentRouter(anthropicClient, {
//   defaultHandler: async (input) => ({
//     message: "I'm not sure how to help with that. Let me connect you with someone.",
//   }),
//   emitMetrics: (m) => statsd.increment('ai.router.intent', { intent: m.intent }),
// })
//
// router
//   .on('check_order_status', async (_input, params) => {
//     return orderService.getStatus(params.orderId)
//   })
//   .on('request_refund', async (_input, params) => {
//     return refundService.initiate(params.orderId)
//   })
//   .on('ambiguous', async (input) => {
//     return { message: 'Could you clarify? I can help with orders, refunds, or account changes.' }
//   })
//
// const result = await router.routeRequest("Where's my order #12345?")

/**
 * Framework adaptations:
 *
 * Express:
 *   - Mount router as middleware: app.post('/api/chat', async (req, res) => {
 *       const result = await router.routeRequest(req.body.message)
 *       res.json(result)
 *     })
 *   - Metrics via StatsD/Prometheus middleware
 *   - Rate limit the classification endpoint (express-rate-limit)
 *
 * FastAPI:
 *   - IntentRouter as a dependency: router = Depends(get_intent_router)
 *   - Pydantic models for RouteResult and RouterMetrics
 *   - Metrics via prometheus-fastapi-instrumentator or custom middleware
 *   - Async handlers: all handlers are async def by default in Python
 *
 * Django:
 *   - IntentRouter instantiated in services.py, called from views
 *   - Store routing decisions in a RoutingLog model for analytics
 *   - Metrics via django-prometheus or statsd
 *   - For real-time: combine with SSE pattern (sse-endpoint.ts) via Django Channels
 */
