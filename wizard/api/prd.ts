import type { IncomingMessage, ServerResponse } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { addRoute } from '../router.js';
import { vaultGet } from '../lib/vault.js';
import { getSessionPassword } from './credentials.js';
import { resolveModelWithLimits } from '../lib/anthropic.js';
import { parseFrontmatter, validateFrontmatter } from '../lib/frontmatter.js';
import { parseJsonBody } from '../lib/body-parser.js';
import { listTemplates, getTemplate } from '../lib/templates.js';

/**
 * Extract the prompt from inside the outer ``` fence after "## The Prompt".
 * Tracks fence nesting so inner ```yaml / ``` pairs don't end extraction early.
 */
function extractFencedPrompt(markdown: string): string {
  const promptIdx = markdown.indexOf('## The Prompt');
  if (promptIdx === -1) return markdown;

  const afterHeading = markdown.slice(promptIdx);
  // Find the opening fence (a line that is exactly ```)
  const openMatch = afterHeading.match(/\n```\s*\n/);
  if (!openMatch || openMatch.index === undefined) return markdown;

  const contentStart = promptIdx + openMatch.index + openMatch[0].length;
  const lines = markdown.slice(contentStart).split('\n');
  const resultLines: string[] = [];
  let depth = 0;

  for (const line of lines) {
    // Opening fence: ```something or just ```
    if (/^```\S/.test(line)) {
      depth++;
      resultLines.push(line);
      continue;
    }
    // Closing fence: exactly ```
    if (/^```\s*$/.test(line)) {
      if (depth > 0) {
        depth--;
        resultLines.push(line);
        continue;
      }
      // depth === 0 means this closes the outer fence
      break;
    }
    resultLines.push(line);
  }

  return resultLines.join('\n').trim();
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

// POST /api/prd/validate — validate PRD content
addRoute('POST', '/api/prd/validate', async (req: IncomingMessage, res: ServerResponse) => {
  const body = await parseJsonBody(req) as { content?: string };

  if (!body.content || typeof body.content !== 'string') {
    sendJson(res, 400, { error: 'content is required' });
    return;
  }

  const { frontmatter } = parseFrontmatter(body.content);
  const errors = validateFrontmatter(frontmatter);

  sendJson(res, 200, {
    valid: errors.length === 0,
    errors,
    frontmatter,
  });
});

// POST /api/prd/generate — generate PRD from idea using Claude
addRoute('POST', '/api/prd/generate', async (req: IncomingMessage, res: ServerResponse) => {
  const body = await parseJsonBody(req) as {
    idea?: string;
    name?: string;
    framework?: string;
    database?: string;
    deploy?: string;
  };

  if (!body.idea || typeof body.idea !== 'string') {
    sendJson(res, 400, { error: 'idea is required' });
    return;
  }

  const password = getSessionPassword();
  if (!password) {
    sendJson(res, 401, { error: 'Vault is locked. Unlock with your password first.' });
    return;
  }

  const apiKey = await vaultGet(password, 'anthropic-api-key');
  if (!apiKey) {
    sendJson(res, 400, { error: 'Anthropic API key not configured. Complete step 1 first.' });
    return;
  }

  // Load the PRD generator prompt
  const promptPath = join(import.meta.dirname, '..', '..', 'docs', 'methods', 'PRD_GENERATOR.md');
  let generatorPrompt: string;
  try {
    generatorPrompt = await readFile(promptPath, 'utf-8');
  } catch {
    sendJson(res, 500, { error: 'Could not load PRD generator prompt' });
    return;
  }

  // Extract prompt from inside the outer ``` fence block after "## The Prompt"
  const basePrompt = extractFencedPrompt(generatorPrompt);

  // Build the idea with any preferences
  let userIdea = body.idea;
  const prefs: string[] = [];
  if (body.name) prefs.push(`Project name: ${body.name}`);
  if (body.framework) prefs.push(`Framework preference: ${body.framework}`);
  if (body.database) prefs.push(`Database preference: ${body.database}`);
  if (body.deploy) prefs.push(`Deploy target: ${body.deploy}`);

  if (prefs.length > 0) {
    userIdea += '\n\nPreferences:\n' + prefs.join('\n');
  }

  // Resolve the best available model with its max output capacity
  const { id: model, maxTokens } = await resolveModelWithLimits(apiKey);

  // Stream response via SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const postData = JSON.stringify({
    model,
    max_tokens: maxTokens,
    stream: true,
    messages: [
      {
        role: 'user',
        content: `${basePrompt}\n\nTHE PRODUCT IDEA:\n${userIdea}`,
      },
    ],
  });

  let clientDisconnected = false;

  /** Safe write — no-op if client already disconnected */
  function sseWrite(chunk: string): void {
    if (clientDisconnected || res.writableEnded) return;
    try { res.write(chunk); } catch { clientDisconnected = true; }
  }

  function sseEnd(): void {
    if (clientDisconnected || res.writableEnded) return;
    try { res.end(); } catch { /* already closed */ }
  }

  req.on('close', () => {
    clientDisconnected = true;
    clearInterval(keepaliveTimer);
    apiReq.destroy();
  });

  // SSE keepalive — prevents proxy/VPN/browser timeout during generation
  const keepaliveTimer = setInterval(() => {
    sseWrite(': keepalive\n\n');
  }, 15000);

  const apiReq = httpsRequest(
    {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: 120000,
    },
    (apiRes) => {
      if (apiRes.statusCode !== 200) {
        let errBody = '';
        apiRes.on('data', (chunk: Buffer) => { errBody += chunk.toString(); });
        apiRes.on('end', () => {
          clearInterval(keepaliveTimer);
          sseWrite(`data: ${JSON.stringify({ error: `API error: ${apiRes.statusCode}` })}\n\n`);
          sseWrite('data: [DONE]\n\n');
          sseEnd();
        });
        return;
      }

      let buffer = '';
      let stopReason: string | null = null;

      apiRes.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data) as {
              type: string;
              delta?: { type: string; text?: string; stop_reason?: string };
            };
            if (event.type === 'content_block_delta' && event.delta?.text) {
              sseWrite(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
            }
            if (event.type === 'message_delta' && event.delta?.stop_reason) {
              stopReason = event.delta.stop_reason;
            }
          } catch {
            // Skip unparseable chunks
          }
        }
      });

      apiRes.on('end', () => {
        clearInterval(keepaliveTimer);
        if (stopReason === 'max_tokens') {
          sseWrite(`data: ${JSON.stringify({ truncated: true })}\n\n`);
        }
        sseWrite('data: [DONE]\n\n');
        sseEnd();
      });
    }
  );

  apiReq.on('error', (err) => {
    clearInterval(keepaliveTimer);
    sseWrite(`data: ${JSON.stringify({ error: 'Generation failed' })}\n\n`);
    sseWrite('data: [DONE]\n\n');
    sseEnd();
  });

  apiReq.write(postData);
  apiReq.end();
});

// POST /api/prd/env-requirements — parse PRD for project-specific credentials
addRoute('POST', '/api/prd/env-requirements', async (req: IncomingMessage, res: ServerResponse) => {
  const body = await parseJsonBody(req) as { content?: string };

  if (!body.content || typeof body.content !== 'string') {
    sendJson(res, 400, { error: 'content is required' });
    return;
  }

  const groups = parseEnvRequirements(body.content);
  sendJson(res, 200, { groups });
});

/**
 * Env vars that are auto-generated, infrastructure, or app config — never collect from user.
 * These are either provisioned by the deploy pipeline, generated at build time,
 * or derived from project config. Generic across all projects.
 */
const SKIP_VARS = new Set([
  // App config (derived from project setup)
  'NODE_ENV', 'PORT',
  'NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_APP_NAME',
  // Infrastructure (provisioned by deploy pipeline)
  'DATABASE_URL', 'REDIS_URL', 'REDIS_PASSWORD',
  // Secrets (auto-generated at build time)
  'SESSION_SECRET', 'SESSION_COOKIE_NAME', 'SESSION_TTL_DAYS',
  'CSRF_SECRET',
  // Storage (provisioned by deploy pipeline)
  'S3_ENDPOINT', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_BUCKET_NAME',
  'S3_REGION', 'S3_PUBLIC_URL',
]);

/** Prefixes that indicate feature flags — always skip. */
const SKIP_PREFIXES = ['ENABLE_'];

interface EnvField {
  key: string;
  label: string;
  placeholder: string;
  secret: boolean;
}

interface EnvGroup {
  name: string;
  fields: EnvField[];
}

function parseEnvRequirements(prdContent: string): EnvGroup[] {
  // Find the env vars section — look for a block with multiple VAR="value" lines
  const lines = prdContent.split('\n');
  const groups: EnvGroup[] = [];
  let currentGroup: EnvGroup | null = null;

  for (const line of lines) {
    // Detect section headers like "# ─── WhatsApp Business API ───────"
    const headerMatch = line.match(/^#\s*[─\-]+\s*(.+?)\s*[─\-]*$/);
    if (headerMatch) {
      const name = headerMatch[1].trim();
      currentGroup = { name, fields: [] };
      groups.push(currentGroup);
      continue;
    }

    // Detect env var assignments: VAR_NAME="value" or VAR_NAME=value
    const varMatch = line.match(/^([A-Z][A-Z0-9_]+)=["']?(.*?)["']?\s*(?:#.*)?$/);
    if (!varMatch || !currentGroup) continue;

    const [, key, rawValue] = varMatch;

    // Skip auto-generated / infrastructure / tuning vars
    if (SKIP_VARS.has(key)) continue;
    if (SKIP_PREFIXES.some((p) => key.startsWith(p))) continue;

    const value = rawValue.trim();

    // Skip tuning params — values that are purely numeric, boolean, or duration-like
    // These are config knobs, not API credentials (e.g., MAX_RETRIES="5", TIMEOUT_MS="30000")
    if (/^\d+$/.test(value) || value === 'true' || value === 'false') continue;

    // Skip if the value looks like a real config URL (not a placeholder)
    const isApiUrl = key.endsWith('_API_URL') || key.endsWith('_URL');
    if (isApiUrl && value.startsWith('http')) continue;

    // Only collect vars that look like they need user-provided values
    // (empty, placeholder prefixes, or common API key patterns)
    const isPlaceholder = !value
      || value.includes('your-')
      || value.includes('your_')
      || /^(sk-|pk\.|AIza|re_|ghp_)/.test(value)
      || value.endsWith('...')
      || value.startsWith('Bearer ');

    if (!isPlaceholder && value.length > 0) continue;

    // Determine if this is a secret field
    const secretPatterns = ['KEY', 'SECRET', 'TOKEN', 'PASSWORD'];
    const isSecret = secretPatterns.some((p) => key.includes(p));

    // Generate human-readable label from var name
    const label = key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .replace(/\bApi\b/g, 'API')
      .replace(/\bUrl\b/g, 'URL')
      .replace(/\bId\b/g, 'ID')
      .replace(/\bSdk\b/g, 'SDK')
      .replace(/\bApp\b/g, 'App');

    currentGroup.fields.push({
      key,
      label,
      placeholder: value || key.toLowerCase().replace(/_/g, '-'),
      secret: isSecret,
    });
  }

  // Filter out empty groups
  return groups.filter((g) => g.fields.length > 0);
}

// GET /api/prd/template — return the PRD template
addRoute('GET', '/api/prd/template', async (_req: IncomingMessage, res: ServerResponse) => {
  const templatePath = join(import.meta.dirname, '..', '..', 'docs', 'PRD.md');
  try {
    const content = await readFile(templatePath, 'utf-8');
    sendJson(res, 200, { content });
  } catch {
    sendJson(res, 500, { error: 'Could not load PRD template' });
  }
});

// GET /api/prd/prompt — return the PRD generator prompt for use with other AIs
addRoute('GET', '/api/prd/prompt', async (_req: IncomingMessage, res: ServerResponse) => {
  const promptPath = join(import.meta.dirname, '..', '..', 'docs', 'methods', 'PRD_GENERATOR.md');
  try {
    const content = await readFile(promptPath, 'utf-8');
    sendJson(res, 200, { prompt: extractFencedPrompt(content) });
  } catch {
    sendJson(res, 500, { error: 'Could not load PRD generator prompt' });
  }
});

// GET /api/prd/templates — list available project templates
addRoute('GET', '/api/prd/templates', async (_req: IncomingMessage, res: ServerResponse) => {
  sendJson(res, 200, { templates: listTemplates() });
});

// GET /api/prd/templates/:id — get a specific template's full PRD content
addRoute('GET', '/api/prd/templates/get', async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url || '', 'http://localhost');
  const id = url.searchParams.get('id');
  if (!id) {
    sendJson(res, 400, { error: 'id query parameter is required' });
    return;
  }
  const template = getTemplate(id);
  if (!template) {
    sendJson(res, 404, { error: `Template not found: ${id}` });
    return;
  }
  // Build a complete PRD with frontmatter
  const frontmatterYaml = Object.entries(template.frontmatter)
    .map(([k, v]) => `${k}: "${v}"`)
    .join('\n');
  const prd = `\`\`\`yaml\nname: "[PROJECT_NAME]"\n${frontmatterYaml}\n\`\`\`\n\n---\n\n${template.prdSections}`;
  sendJson(res, 200, { template: { ...template, prd } });
});
