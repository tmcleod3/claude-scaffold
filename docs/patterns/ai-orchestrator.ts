/**
 * Pattern: AI Orchestrator
 *
 * Three patterns for coordinating AI model calls:
 * 1. Simple completion — single call with structured output
 * 2. Agent loop — model calls tools in a loop until done
 * 3. Circuit breaker — prevent cascading AI failures
 *
 * Key principles:
 * - Always set MAX_ITERATIONS on agent loops — unbounded loops burn tokens
 * - Retry with exponential backoff on transient failures (429, 5xx)
 * - Circuit breaker protects downstream when a provider is degraded
 * - Parse and validate model output with Zod — never trust raw JSON
 * - Log every model call with latency, tokens, and model version
 *
 * Agents: Picard (architecture), Stark (backend), Kenobi (rate limits)
 *
 * Provider note: Primary examples use Anthropic SDK (@anthropic-ai/sdk).
 * OpenAI adaptation is noted inline. The shapes are provider-agnostic.
 */

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

// --- 1. Simple Completion — single call → structured output ---

const SummarySchema = z.object({
  title: z.string(),
  bullets: z.array(z.string()).min(1).max(5),
  sentiment: z.enum(['positive', 'negative', 'neutral']),
})

type Summary = z.infer<typeof SummarySchema>

/** Single model call with retry and structured output parsing. */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: unknown) {
      const isRetryable =
        error instanceof Error &&
        ('status' in error && [429, 500, 502, 503].includes((error as { status: number }).status))

      if (!isRetryable || attempt === maxRetries) throw error

      // Exponential backoff with jitter
      const delay = baseDelayMs * 2 ** attempt + Math.random() * baseDelayMs
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw new Error('Unreachable') // TypeScript needs this
}

export async function summarize(client: Anthropic, text: string): Promise<Summary> {
  const response = await executeWithRetry(() =>
    client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      messages: [{ role: 'user', content: `Summarize as JSON: ${text}` }],
      // System prompt enforces output shape
      system: 'Respond with JSON matching: { title, bullets[], sentiment }',
    })
  )

  // Extract text content, parse with Zod — never trust raw model output
  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Expected text response')
  const parsed = JSON.parse(content.text)
  return SummarySchema.parse(parsed) // Throws ZodError on invalid shape
}

// OpenAI adaptation:
//   const response = await openai.chat.completions.create({
//     model: 'gpt-4o', messages: [...],
//     response_format: { type: 'json_object' }, // OpenAI JSON mode
//   })
//   const parsed = JSON.parse(response.choices[0].message.content)

// --- 2. Agent Loop — model calls tools until done ---

const MAX_ITERATIONS = 10 // Hard bound — never remove this

interface ToolDefinition {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

interface AgentResult {
  finalResponse: string
  toolCallCount: number
  iterations: number
}

/** Agent loop: model decides which tools to call, iterates until done. */
export async function runAgentLoop(
  client: Anthropic,
  prompt: string,
  tools: ToolDefinition[],
  executeTool: (name: string, input: Record<string, unknown>) => Promise<string>
): Promise<AgentResult> {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }]
  let toolCallCount = 0

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await executeWithRetry(() =>
      client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages,
        tools: tools as Anthropic.Tool[],
      })
    )

    // If model responds with text only (no tool calls), we're done
    if (response.stop_reason === 'end_turn') {
      const text = response.content.find((c) => c.type === 'text')
      return { finalResponse: text?.text ?? '', toolCallCount, iterations: i + 1 }
    }

    // Process tool calls
    const toolUseBlocks = response.content.filter((c) => c.type === 'tool_use')
    const toolResults: Anthropic.ToolResultBlockParam[] = []

    for (const block of toolUseBlocks) {
      if (block.type !== 'tool_use') continue
      toolCallCount++
      try {
        const result = await executeTool(block.name, block.input as Record<string, unknown>)
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
      } catch (error) {
        // Send error back to model — it can recover or try a different approach
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          is_error: true,
        })
      }
    }

    // Feed assistant response + tool results back for next iteration
    messages.push({ role: 'assistant', content: response.content })
    messages.push({ role: 'user', content: toolResults })
  }

  throw new Error(`Agent loop exceeded MAX_ITERATIONS (${MAX_ITERATIONS})`)
}

// --- 3. Circuit Breaker — prevent cascading AI failures ---

type CircuitState = 'closed' | 'open' | 'half-open'

/** Circuit breaker for AI provider calls. Opens after threshold failures. */
export class CircuitBreaker {
  private state: CircuitState = 'closed'
  private failureCount = 0
  private lastFailureTime = 0

  constructor(
    private readonly failureThreshold: number = 5,
    private readonly resetTimeoutMs: number = 60_000
  ) {}

  async execute<T>(fn: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      // Check if enough time has passed to try again
      if (Date.now() - this.lastFailureTime > this.resetTimeoutMs) {
        this.state = 'half-open'
      } else {
        return fallback() // Circuit open — use fallback immediately
      }
    }

    try {
      const result = await fn()
      // Success — reset if we were testing
      if (this.state === 'half-open') this.state = 'closed'
      this.failureCount = 0
      return result
    } catch (error) {
      this.failureCount++
      this.lastFailureTime = Date.now()

      if (this.failureCount >= this.failureThreshold) {
        this.state = 'open'
      }
      return fallback()
    }
  }

  getState(): CircuitState {
    return this.state
  }
}

// Usage:
//   const breaker = new CircuitBreaker(5, 60_000)
//   const result = await breaker.execute(
//     () => summarize(anthropicClient, text),
//     () => ruleBased.summarize(text) // Fallback: no AI, just rules
//   )

/**
 * Framework adaptations:
 *
 * Express:
 *   - Wrap agent loop in an Express route with req.setTimeout() for long-running calls
 *   - Circuit breaker as singleton middleware: app.use(aiCircuitBreaker)
 *   - Stream partial results via res.write() for SSE (see sse-endpoint.ts)
 *
 * FastAPI:
 *   - executeWithRetry → tenacity.retry(wait=wait_exponential(), stop=stop_after_attempt(3))
 *   - Agent loop: same shape, use httpx.AsyncClient for provider calls
 *   - Circuit breaker: pybreaker library or roll your own with same state machine
 *   - Background agent loops: FastAPI BackgroundTasks or Celery
 *
 * Django:
 *   - Services layer (services.py) holds orchestration logic — never in views
 *   - Circuit breaker state in Django cache (Redis) for multi-process
 *   - Agent loops in Celery tasks with soft_time_limit for MAX_ITERATIONS equivalent
 *   - Use django-ratelimit on the view to protect upstream AI spend
 */
