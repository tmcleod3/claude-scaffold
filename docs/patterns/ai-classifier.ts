/**
 * Pattern: AI Classifier
 *
 * Key principles:
 * - Every classification has a confidence score — never act on low confidence blindly
 * - Confidence-based routing: high → auto-act, medium → soft-act, low → human review
 * - Fallback chain: primary model → fallback model → rule-based → human queue
 * - Log every classification for eval and drift detection
 * - Never expose raw model confidence to users — map to business thresholds
 *
 * Agents: Picard (routing architecture), Stark (service layer), Batman (edge cases)
 *
 * Provider note: Primary examples use Anthropic SDK. OpenAI adaptation noted inline.
 */

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

// --- Core types ---

export interface ClassificationResult<T extends string> {
  label: T
  confidence: number // 0.0 - 1.0
  reasoning: string // Model's explanation — logged, not shown to users
  model: string // Which model produced this result
  latencyMs: number
}

// Thresholds are business decisions, not model tuning knobs.
// Adjust based on eval results (see ai-eval.ts), not gut feeling.
export const CONFIDENCE_THRESHOLD = {
  AUTO_ACT: 0.85, // High confidence — act without human review
  SOFT_ACT: 0.60, // Medium — act but flag for async review
  REJECT: 0.60, // Below this — route to human queue
} as const

// --- Single-label classifier ---

const ClassifierOutputSchema = z.object({
  label: z.string(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
})

export async function classify<T extends string>(
  client: Anthropic,
  text: string,
  labels: readonly T[],
  systemPrompt: string
): Promise<ClassificationResult<T>> {
  const start = Date.now()

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 256,
    system: [
      systemPrompt,
      `Valid labels: ${labels.join(', ')}`,
      'Respond with JSON: { "label": "<label>", "confidence": <0.0-1.0>, "reasoning": "<why>" }',
    ].join('\n'),
    messages: [{ role: 'user', content: text }],
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Expected text response')

  const parsed = ClassifierOutputSchema.parse(JSON.parse(content.text))

  // Validate label is one of the allowed values
  if (!labels.includes(parsed.label as T)) {
    throw new Error(`Model returned invalid label: ${parsed.label}`)
  }

  return {
    label: parsed.label as T,
    confidence: parsed.confidence,
    reasoning: parsed.reasoning,
    model: 'claude-sonnet-4-20250514',
    latencyMs: Date.now() - start,
  }
}

// OpenAI adaptation:
//   const response = await openai.chat.completions.create({
//     model: 'gpt-4o-mini', // Cheaper model for classification
//     messages: [...],
//     response_format: { type: 'json_object' },
//   })
//   Parse response.choices[0].message.content the same way.

// --- Confidence-based routing ---

type RouteAction = 'auto_act' | 'soft_act' | 'human_review'

export function routeByConfidence<T extends string>(
  result: ClassificationResult<T>
): RouteAction {
  if (result.confidence >= CONFIDENCE_THRESHOLD.AUTO_ACT) return 'auto_act'
  if (result.confidence >= CONFIDENCE_THRESHOLD.SOFT_ACT) return 'soft_act'
  return 'human_review'
}

// Usage:
//   const result = await classify(client, ticket.body, ['billing', 'technical', 'general'], prompt)
//   const action = routeByConfidence(result)
//   if (action === 'auto_act') await autoRoute(ticket, result.label)
//   else if (action === 'soft_act') await autoRoute(ticket, result.label, { flagForReview: true })
//   else await queueForHuman(ticket, result)

// --- Fallback chain ---

interface ClassifierProvider<T extends string> {
  name: string
  classify: (text: string, labels: readonly T[]) => Promise<ClassificationResult<T>>
}

/**
 * Try classifiers in order. First one to return high-confidence wins.
 * If all fail or return low confidence, returns the best result with 'human_review' routing.
 */
export async function classifyWithFallback<T extends string>(
  text: string,
  labels: readonly T[],
  providers: ClassifierProvider<T>[]
): Promise<ClassificationResult<T> & { action: RouteAction }> {
  let bestResult: ClassificationResult<T> | null = null

  for (const provider of providers) {
    try {
      const result = await provider.classify(text, labels)

      // Keep track of best result across all providers
      if (!bestResult || result.confidence > bestResult.confidence) {
        bestResult = result
      }

      // If confidence is high enough to act, stop the chain
      if (result.confidence >= CONFIDENCE_THRESHOLD.SOFT_ACT) {
        return { ...result, action: routeByConfidence(result) }
      }

      // Low confidence — try next provider in chain
    } catch (error) {
      // Provider failed — log and try next
      console.error(`[Classifier] ${provider.name} failed:`, {
        error: error instanceof Error ? error.message : 'Unknown',
        text: text.slice(0, 100), // Truncate for logging — never log full PII
      })
    }
  }

  // All providers exhausted — return best result or default to human review
  if (bestResult) {
    return { ...bestResult, action: 'human_review' }
  }

  // Complete failure — nothing classified, must go to human
  return {
    label: labels[0], // Default label — human will override
    confidence: 0,
    reasoning: 'All classifier providers failed',
    model: 'fallback',
    latencyMs: 0,
    action: 'human_review',
  }
}

// Example fallback chain setup:
//   const providers: ClassifierProvider<TicketCategory>[] = [
//     { name: 'anthropic', classify: (text, labels) => classify(anthropicClient, text, labels, prompt) },
//     { name: 'openai', classify: (text, labels) => classifyOpenAI(openaiClient, text, labels) },
//     { name: 'rules', classify: (text, labels) => ruleBasedClassifier(text, labels) },
//   ]
//   const result = await classifyWithFallback(ticket.body, categories, providers)

/**
 * Framework adaptations:
 *
 * Express:
 *   - Classification endpoint: POST /api/classify with Zod validation on input
 *   - Confidence thresholds in environment config, not hardcoded
 *   - Log classifications to structured logging (Winston/Pino) for eval pipelines
 *
 * FastAPI:
 *   - classify() → async def classify() with Pydantic ClassificationResult model
 *   - Fallback chain: same pattern, use httpx.AsyncClient for provider calls
 *   - Route confidence thresholds via Settings (pydantic-settings)
 *   - Background classification: FastAPI BackgroundTasks for non-blocking
 *
 * Django:
 *   - Classification logic in services.py — never in views
 *   - Store ClassificationResult in a ClassificationLog model for audit trail
 *   - Thresholds in django.conf.settings or per-tenant config
 *   - Async classification: Celery task with result stored in DB
 */
