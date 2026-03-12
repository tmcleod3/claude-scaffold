import type { IncomingMessage, ServerResponse } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { addRoute } from '../router.js';
import { vaultGet } from '../lib/vault.js';
import { getSessionPassword } from './credentials.js';
import { resolveBestModel } from '../lib/anthropic.js';
import { parseFrontmatter, validateFrontmatter } from '../lib/frontmatter.js';
import { parseJsonBody } from '../lib/body-parser.js';

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

  // Resolve the best available model
  const model = await resolveBestModel(apiKey);

  // Stream response via SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const postData = JSON.stringify({
    model,
    max_tokens: 8192,
    stream: true,
    messages: [
      {
        role: 'user',
        content: `${basePrompt}\n\nTHE PRODUCT IDEA:\n${userIdea}`,
      },
    ],
  });

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
          res.write(`data: ${JSON.stringify({ error: `API error: ${apiRes.statusCode} - ${errBody}` })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        });
        return;
      }

      let buffer = '';
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
              delta?: { type: string; text?: string };
            };
            if (event.type === 'content_block_delta' && event.delta?.text) {
              res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
            }
          } catch {
            // Skip unparseable chunks
          }
        }
      });

      apiRes.on('end', () => {
        res.write('data: [DONE]\n\n');
        res.end();
      });
    }
  );

  apiReq.on('error', (err) => {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  });

  req.on('close', () => {
    apiReq.destroy();
  });

  apiReq.write(postData);
  apiReq.end();
});

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
