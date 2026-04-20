/**
 * Anthropic API utilities — model resolution and helpers.
 *
 * Fetches available models from the API and picks the best one
 * for PRD generation. No hardcoded model IDs.
 */

import { request as httpsRequest } from 'node:https';

interface ModelInfo {
  id: string;
  display_name: string;
  created_at: string;
  type: string;
}

interface ModelsResponse {
  data: ModelInfo[];
  has_more: boolean;
  first_id: string;
  last_id: string;
}

/** Preference order: most capable first, then newest within family */
const MODEL_PREFERENCE = [
  'claude-opus',
  'claude-sonnet',
  'claude-haiku',
] as const;

/** Max output tokens by model family — use each model's full capacity */
const MAX_OUTPUT_TOKENS: Record<string, number> = {
  'claude-opus': 32768,
  'claude-sonnet': 16384,
  'claude-haiku': 8192,
};

const DEFAULT_MAX_TOKENS = 16384;

export interface ResolvedModel {
  id: string;
  maxTokens: number;
}

let cachedModel: string | null = null;

/** Fetch available models from the Anthropic API */
function fetchModels(apiKey: string): Promise<ModelInfo[]> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/models',
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        timeout: 10000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Models API returned ${res.statusCode}: ${body}`));
            return;
          }
          try {
            const parsed = JSON.parse(body) as ModelsResponse;
            resolve(parsed.data ?? []);
          } catch {
            reject(new Error('Failed to parse models response'));
          }
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Models request timed out'));
    });
    req.end();
  });
}

/**
 * Resolve the best available model for PRD generation.
 *
 * Strategy: pick the newest Opus (most capable — PRD generation is a one-time
 * operation where quality matters most). Falls back to Sonnet, then Haiku.
 */
export async function resolveBestModel(apiKey: string): Promise<string> {
  if (cachedModel) return cachedModel;

  let models: ModelInfo[];
  try {
    models = await fetchModels(apiKey);
  } catch {
    // If we can't reach the models endpoint, fall back to a known-good model.
    // This is the one hardcoded fallback — everything else is dynamic.
    return 'claude-sonnet-4-7';
  }

  if (models.length === 0) {
    return 'claude-sonnet-4-7';
  }

  // Sort each model into preference buckets, newest first within each bucket
  for (const prefix of MODEL_PREFERENCE) {
    const matches = models
      .filter((m) => m.id.startsWith(prefix))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    if (matches.length > 0) {
      cachedModel = matches[0].id;
      return cachedModel;
    }
  }

  // Nothing matched our preferences — pick the newest model overall
  const sorted = [...models].sort((a, b) => b.created_at.localeCompare(a.created_at));
  cachedModel = sorted[0].id;
  return cachedModel;
}

/** Resolve model ID + max output tokens for the selected model */
export async function resolveModelWithLimits(apiKey: string): Promise<ResolvedModel> {
  const id = await resolveBestModel(apiKey);
  const family = MODEL_PREFERENCE.find((prefix) => id.startsWith(prefix));
  const maxTokens = family ? (MAX_OUTPUT_TOKENS[family] ?? DEFAULT_MAX_TOKENS) : DEFAULT_MAX_TOKENS;
  return { id, maxTokens };
}

/** Clear the cached model (e.g., if the API key changes) */
export function clearModelCache(): void {
  cachedModel = null;
}
