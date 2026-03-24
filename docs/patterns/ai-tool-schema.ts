/**
 * Pattern: AI Tool Schema
 *
 * Key principles:
 * - Define tools once, convert to any provider format (Anthropic, OpenAI)
 * - Zod schemas for parameter validation — model output is untrusted input
 * - Tool execution has error boundaries — one bad tool call can't crash the agent
 * - Registry pattern for managing available tools per context/user/role
 * - Tool results are always strings — structured data is JSON-serialized
 *
 * Agents: Stark (backend), Picard (architecture), Kenobi (input validation)
 *
 * Provider note: defineTool() creates a provider-agnostic definition.
 * toAnthropicFormat() and toOpenAIFormat() convert for each SDK.
 */

import { z, ZodType, ZodObject, ZodRawShape } from 'zod'
import type Anthropic from '@anthropic-ai/sdk'

// --- Core types ---

/** Provider-agnostic tool definition. */
export interface ToolDefinition<TInput extends ZodRawShape = ZodRawShape> {
  name: string
  description: string
  parameters: ZodObject<TInput>
  execute: (input: z.infer<ZodObject<TInput>>) => Promise<string>
}

/** Result of a tool execution. */
export interface ToolResult {
  toolName: string
  success: boolean
  output: string
  durationMs: number
  error?: string
}

// --- defineTool() — type-safe tool creation ---

/** Create a tool definition with Zod-validated parameters. */
export function defineTool<T extends ZodRawShape>(config: {
  name: string
  description: string
  parameters: ZodObject<T>
  execute: (input: z.infer<ZodObject<T>>) => Promise<string>
}): ToolDefinition<T> {
  return config
}

// Example tool definitions:
//
// const getWeatherTool = defineTool({
//   name: 'get_weather',
//   description: 'Get current weather for a city',
//   parameters: z.object({
//     city: z.string().describe('City name'),
//     units: z.enum(['celsius', 'fahrenheit']).default('celsius').describe('Temperature units'),
//   }),
//   execute: async (input) => {
//     const weather = await weatherService.getCurrent(input.city, input.units)
//     return JSON.stringify(weather) // Always return string
//   },
// })

// --- Tool execution with error boundary ---

/** Execute a tool safely. Validates input, catches errors, measures duration. */
export async function executeTool<T extends ZodRawShape>(
  tool: ToolDefinition<T>,
  rawInput: unknown
): Promise<ToolResult> {
  const start = Date.now()

  // 1. Validate input with Zod — model output is untrusted
  const parseResult = tool.parameters.safeParse(rawInput)
  if (!parseResult.success) {
    return {
      toolName: tool.name,
      success: false,
      output: '',
      durationMs: Date.now() - start,
      error: `Invalid parameters: ${parseResult.error.issues.map((i) => i.message).join(', ')}`,
    }
  }

  // 2. Execute with error boundary
  try {
    const output = await tool.execute(parseResult.data)
    return {
      toolName: tool.name,
      success: true,
      output,
      durationMs: Date.now() - start,
    }
  } catch (error) {
    return {
      toolName: tool.name,
      success: false,
      output: '',
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Tool execution failed',
    }
  }
}

// --- ToolRegistry — manage available tools ---

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>()

  /** Register a tool. Throws if name already taken. */
  register(tool: ToolDefinition): this {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`)
    }
    this.tools.set(tool.name, tool)
    return this
  }

  /** Get a tool by name. Returns undefined if not found. */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name)
  }

  /** Execute a tool by name with raw input from the model. */
  async execute(name: string, rawInput: unknown): Promise<ToolResult> {
    const tool = this.tools.get(name)
    if (!tool) {
      return {
        toolName: name,
        success: false,
        output: '',
        durationMs: 0,
        error: `Unknown tool: ${name}`,
      }
    }
    return executeTool(tool, rawInput)
  }

  /** Convert all registered tools to Anthropic format. */
  toAnthropicFormat(): Anthropic.Tool[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: zodToJsonSchema(tool.parameters),
    }))
  }

  /** Convert all registered tools to OpenAI format. */
  toOpenAIFormat(): Array<{
    type: 'function'
    function: { name: string; description: string; parameters: Record<string, unknown> }
  }> {
    return Array.from(this.tools.values()).map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: zodToJsonSchema(tool.parameters),
      },
    }))
  }

  /** List all registered tool names. */
  listNames(): string[] {
    return Array.from(this.tools.keys())
  }
}

// --- Zod to JSON Schema conversion (simplified) ---
// In production, use zod-to-json-schema package. This is a minimal reference.

function zodToJsonSchema(schema: ZodType): Record<string, unknown> {
  // Use zod-to-json-schema in production:
  //   import { zodToJsonSchema } from 'zod-to-json-schema'
  //   return zodToJsonSchema(schema)
  //
  // Simplified version for the pattern reference:
  if (schema instanceof ZodObject) {
    const shape = schema.shape
    const properties: Record<string, unknown> = {}
    const required: string[] = []

    for (const [key, value] of Object.entries(shape)) {
      const zodField = value as ZodType
      properties[key] = { type: 'string', description: zodField.description ?? '' }
      if (!zodField.isOptional()) required.push(key)
    }

    return { type: 'object', properties, required }
  }
  return { type: 'object', properties: {} }
}

// --- Usage example ---

// const registry = new ToolRegistry()
//   .register(getWeatherTool)
//   .register(lookupOrderTool)
//   .register(createTicketTool)
//
// // Pass to Anthropic agent loop (see ai-orchestrator.ts):
// const response = await client.messages.create({
//   model: 'claude-sonnet-4-20250514',
//   tools: registry.toAnthropicFormat(),
//   messages: [{ role: 'user', content: 'What is the weather in Tokyo?' }],
// })
//
// // When model returns tool_use, execute via registry:
// for (const block of response.content) {
//   if (block.type === 'tool_use') {
//     const result = await registry.execute(block.name, block.input)
//     // Feed result back to model as tool_result
//   }
// }

/**
 * Framework adaptations:
 *
 * Express:
 *   - ToolRegistry as singleton, initialized at startup
 *   - Register tools from service layer — tools call services, not DB directly
 *   - Admin endpoint to list available tools: GET /api/admin/tools
 *
 * FastAPI:
 *   - defineTool equivalent: dataclass with Pydantic model for parameters
 *   - ToolRegistry as dependency: registry = Depends(get_tool_registry)
 *   - Pydantic replaces Zod for parameter validation
 *   - Same provider adapter pattern: to_anthropic_format(), to_openai_format()
 *
 * Django:
 *   - Tools defined in tools.py, registered in apps.py ready() method
 *   - Tool permissions tied to Django auth: tool.requires_perm('orders.view')
 *   - ToolResult logged to ToolExecutionLog model for audit
 *   - Admin interface to enable/disable tools per tenant (multi-tenant.ts)
 */
