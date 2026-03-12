import type { IncomingMessage, ServerResponse } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { addRoute } from '../router.js';
import { vaultSet, vaultGet, vaultExists, vaultUnlock, vaultKeys, vaultPath } from '../lib/vault.js';
import { parseJsonBody } from '../lib/body-parser.js';
import { clearModelCache } from '../lib/anthropic.js';

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

/** Session password — held in memory only, never written to disk */
let sessionPassword: string | null = null;

export function getSessionPassword(): string | null {
  return sessionPassword;
}

/** Validate an Anthropic API key by making a lightweight test call */
function validateAnthropicKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    });

    const req = httpsRequest(
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
        timeout: 15000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve({ valid: true });
          } else if (res.statusCode === 401) {
            resolve({ valid: false, error: 'Invalid API key' });
          } else {
            try {
              const parsed = JSON.parse(body) as { error?: { message?: string } };
              resolve({ valid: false, error: parsed.error?.message ?? `HTTP ${res.statusCode}` });
            } catch {
              resolve({ valid: false, error: `HTTP ${res.statusCode}` });
            }
          }
        });
      }
    );

    req.on('error', (err) => {
      resolve({ valid: false, error: `Connection failed: ${err.message}` });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ valid: false, error: 'Request timed out' });
    });

    req.write(postData);
    req.end();
  });
}

// GET /api/credentials/status — check vault state and stored keys
addRoute('GET', '/api/credentials/status', async (_req: IncomingMessage, res: ServerResponse) => {
  const exists = vaultExists();
  const unlocked = sessionPassword !== null;
  let hasAnthropic = false;

  if (unlocked && sessionPassword) {
    try {
      const keys = await vaultKeys(sessionPassword);
      hasAnthropic = keys.includes('anthropic-api-key');
    } catch {
      // Vault read failed — treat as locked
    }
  }

  sendJson(res, 200, {
    vaultExists: exists,
    unlocked,
    anthropic: hasAnthropic,
    vaultPath: vaultPath(),
  });
});

// POST /api/credentials/unlock — unlock vault with password (or create new vault)
addRoute('POST', '/api/credentials/unlock', async (req: IncomingMessage, res: ServerResponse) => {
  const body = await parseJsonBody(req) as { password?: string };

  if (!body.password || typeof body.password !== 'string') {
    sendJson(res, 400, { error: 'password is required' });
    return;
  }

  if (body.password.length < 4) {
    sendJson(res, 400, { error: 'Password must be at least 4 characters' });
    return;
  }

  const valid = await vaultUnlock(body.password);

  if (!valid) {
    sendJson(res, 401, { error: 'Wrong password' });
    return;
  }

  sessionPassword = body.password;

  // Check what's already stored
  let hasAnthropic = false;
  try {
    const keys = await vaultKeys(sessionPassword);
    hasAnthropic = keys.includes('anthropic-api-key');
  } catch {
    // Fresh vault
  }

  sendJson(res, 200, {
    unlocked: true,
    isNew: !vaultExists(),
    anthropic: hasAnthropic,
  });
});

// POST /api/credentials/anthropic — validate and store Anthropic API key
addRoute('POST', '/api/credentials/anthropic', async (req: IncomingMessage, res: ServerResponse) => {
  if (!sessionPassword) {
    sendJson(res, 401, { error: 'Vault is locked. Unlock with your password first.' });
    return;
  }

  const body = await parseJsonBody(req) as { apiKey?: string };

  if (!body.apiKey || typeof body.apiKey !== 'string') {
    sendJson(res, 400, { error: 'apiKey is required' });
    return;
  }

  const apiKey = body.apiKey.trim();

  if (!apiKey.startsWith('sk-ant-')) {
    sendJson(res, 400, { error: 'Invalid key format. Anthropic API keys start with sk-ant-' });
    return;
  }

  const result = await validateAnthropicKey(apiKey);

  if (!result.valid) {
    sendJson(res, 400, { error: result.error ?? 'Invalid API key' });
    return;
  }

  await vaultSet(sessionPassword, 'anthropic-api-key', apiKey);
  clearModelCache();
  sendJson(res, 200, { stored: true });
});
