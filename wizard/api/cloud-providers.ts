import type { IncomingMessage, ServerResponse } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { addRoute } from '../router.js';
import { vaultSet, vaultGet, vaultKeys } from '../lib/vault.js';
import { getSessionPassword } from './credentials.js';
import { parseJsonBody } from '../lib/body-parser.js';

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function requirePassword(res: ServerResponse): string | null {
  const password = getSessionPassword();
  if (!password) {
    sendJson(res, 401, { error: 'Vault is locked.' });
    return null;
  }
  return password;
}

// --- Provider definitions ---

export interface ProviderInfo {
  id: string;
  name: string;
  fields: { key: string; label: string; placeholder: string; secret: boolean }[];
  deployTargets: string[];
  description: string;
  credentialUrl: string;
  help: string;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'aws',
    name: 'Amazon Web Services',
    fields: [
      { key: 'aws-access-key-id', label: 'Access Key ID', placeholder: 'AKIA...', secret: false },
      { key: 'aws-secret-access-key', label: 'Secret Access Key', placeholder: 'wJalr...', secret: true },
      { key: 'aws-region', label: 'Default Region', placeholder: 'us-east-1', secret: false },
    ],
    deployTargets: ['vps', 'static'],
    description: 'EC2 instances, S3, RDS, ElastiCache, Route53, SES',
    credentialUrl: 'https://console.aws.amazon.com/iam/home#/security_credentials',
    help: '<ol><li>Sign in to the <a href="https://console.aws.amazon.com" target="_blank" rel="noopener">AWS Console</a></li><li>Go to <strong>IAM &rarr; Security Credentials</strong></li><li>Under "Access keys", click <strong>Create access key</strong></li><li>Copy the <strong>Access Key ID</strong> and <strong>Secret Access Key</strong></li><li>For region, use the region closest to your users (e.g. <code>us-east-1</code>)</li></ol><p>For production, create a dedicated IAM user with limited permissions instead of using root credentials.</p>',
  },
  {
    id: 'vercel',
    name: 'Vercel',
    fields: [
      { key: 'vercel-token', label: 'API Token', placeholder: 'Bearer token', secret: true },
    ],
    deployTargets: ['vercel'],
    description: 'Serverless deployment for Next.js and static sites',
    credentialUrl: 'https://vercel.com/account/tokens',
    help: '<ol><li>Sign in to <a href="https://vercel.com" target="_blank" rel="noopener">vercel.com</a></li><li>Go to <strong>Settings &rarr; Tokens</strong></li><li>Click <strong>Create Token</strong></li><li>Give it a name (e.g. "VoidForge") and set scope to your team or personal account</li><li>Copy the token — it won\'t be shown again</li></ol>',
  },
  {
    id: 'railway',
    name: 'Railway',
    fields: [
      { key: 'railway-token', label: 'API Token', placeholder: 'Token', secret: true },
    ],
    deployTargets: ['railway'],
    description: 'Managed deployment with Postgres, Redis, and auto-scaling',
    credentialUrl: 'https://railway.com/account/tokens',
    help: '<ol><li>Sign in to <a href="https://railway.com" target="_blank" rel="noopener">railway.com</a></li><li>Go to <strong>Account Settings &rarr; Tokens</strong></li><li>Click <strong>Create Token</strong></li><li>Give it a name and copy the token</li></ol>',
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    fields: [
      { key: 'cloudflare-api-token', label: 'API Token', placeholder: 'Token', secret: true },
    ],
    deployTargets: ['cloudflare'],
    description: 'Workers, Pages, D1, R2 — edge-first deployment',
    credentialUrl: 'https://dash.cloudflare.com/profile/api-tokens',
    help: '<ol><li>Sign in to the <a href="https://dash.cloudflare.com" target="_blank" rel="noopener">Cloudflare Dashboard</a></li><li>Go to <strong>My Profile &rarr; API Tokens</strong></li><li>Click <strong>Create Token</strong></li><li>Use the <strong>"Edit Cloudflare Workers"</strong> template for Workers/Pages, or create a custom token with the permissions you need</li><li>Copy the token — it won\'t be shown again</li></ol>',
  },
];

// --- Validation functions ---

function httpsGet(hostname: string, path: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest({ hostname, path, method: 'GET', headers, timeout: 10000 }, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timed out')); });
    req.end();
  });
}

async function validateAws(accessKeyId: string, secretKey: string, region: string): Promise<{ valid: boolean; error?: string; identity?: string }> {
  // AWS STS GetCallerIdentity with Signature V4 is complex without SDK.
  // Instead, validate format and store — Phase 3 will do the real STS call with @aws-sdk.
  if (!accessKeyId.startsWith('AKIA') || accessKeyId.length < 16) {
    return { valid: false, error: 'Access Key ID should start with AKIA and be at least 16 characters' };
  }
  if (secretKey.length < 20) {
    return { valid: false, error: 'Secret Access Key seems too short' };
  }
  const validRegions = ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'eu-west-1', 'eu-west-2', 'eu-central-1', 'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-south-1', 'sa-east-1', 'ca-central-1'];
  if (region && !validRegions.includes(region)) {
    return { valid: false, error: `Unknown region "${region}". Common regions: us-east-1, us-west-2, eu-west-1` };
  }
  return { valid: true };
}

async function validateVercel(token: string): Promise<{ valid: boolean; error?: string; identity?: string }> {
  try {
    const { status, body } = await httpsGet('api.vercel.com', '/v2/user', {
      'Authorization': `Bearer ${token}`,
    });
    if (status === 200) {
      const data = JSON.parse(body) as { user?: { username?: string } };
      return { valid: true, identity: data.user?.username };
    }
    if (status === 401 || status === 403) {
      return { valid: false, error: 'Invalid or expired token' };
    }
    return { valid: false, error: `Vercel API returned ${status}` };
  } catch (err) {
    return { valid: false, error: `Connection failed: ${(err as Error).message}` };
  }
}

async function validateRailway(token: string): Promise<{ valid: boolean; error?: string; identity?: string }> {
  try {
    // Railway uses GraphQL — try multiple queries since schema evolves
    // Team tokens may not have access to `me`, so fall back to listing projects
    const queries = [
      { query: '{ me { name email } }', extract: (d: Record<string, unknown>) => { const me = d.me as { name?: string; email?: string } | undefined; return me?.name || me?.email; } },
      { query: '{ projects { edges { node { name } } } }', extract: () => 'authenticated' },
    ];

    for (const q of queries) {
      const postData = JSON.stringify({ query: q.query });
      const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = httpsRequest({
          hostname: 'backboard.railway.com',
          path: '/graphql/v2',
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
          timeout: 10000,
        }, (res) => {
          let body = '';
          res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timed out')); });
        req.write(postData);
        req.end();
      });

      if (result.status === 401) {
        return { valid: false, error: 'Invalid or expired token' };
      }

      if (result.status === 200) {
        const parsed = JSON.parse(result.body) as { data?: Record<string, unknown>; errors?: { message: string }[] };
        // If the query succeeded with data (no errors, or errors but still got data)
        if (parsed.data && !parsed.errors) {
          const identity = q.extract(parsed.data);
          if (identity) return { valid: true, identity };
        }
        // If this query errored, try the next one
        continue;
      }

      return { valid: false, error: `Railway API returned ${result.status}` };
    }

    // If we got here, all queries returned 200 but none yielded identity — token is likely valid
    return { valid: true, identity: 'connected' };
  } catch (err) {
    return { valid: false, error: `Connection failed: ${(err as Error).message}` };
  }
}

async function validateCloudflare(token: string): Promise<{ valid: boolean; error?: string; identity?: string }> {
  try {
    const { status, body } = await httpsGet('api.cloudflare.com', '/client/v4/user/tokens/verify', {
      'Authorization': `Bearer ${token}`,
    });
    if (status === 200) {
      const data = JSON.parse(body) as { success?: boolean; result?: { status?: string } };
      if (data.success && data.result?.status === 'active') {
        return { valid: true, identity: 'active token' };
      }
      return { valid: false, error: 'Token is not active' };
    }
    if (status === 401) {
      return { valid: false, error: 'Invalid or expired token' };
    }
    return { valid: false, error: `Cloudflare API returned ${status}` };
  } catch (err) {
    return { valid: false, error: `Connection failed: ${(err as Error).message}` };
  }
}

// --- API Routes ---

// GET /api/cloud/providers — list all providers with their fields
addRoute('GET', '/api/cloud/providers', async (_req: IncomingMessage, res: ServerResponse) => {
  sendJson(res, 200, { providers: PROVIDERS });
});

// GET /api/cloud/status — which providers have stored credentials
addRoute('GET', '/api/cloud/status', async (_req: IncomingMessage, res: ServerResponse) => {
  const password = requirePassword(res);
  if (!password) return;

  const keys = await vaultKeys(password);
  const status: Record<string, boolean> = {};

  for (const provider of PROVIDERS) {
    // A provider is "configured" if all its required fields are stored
    status[provider.id] = provider.fields.every((f) => keys.includes(f.key));
  }

  sendJson(res, 200, { status });
});

// POST /api/cloud/validate — validate and store credentials for a provider
addRoute('POST', '/api/cloud/validate', async (req: IncomingMessage, res: ServerResponse) => {
  const password = requirePassword(res);
  if (!password) return;

  const body = await parseJsonBody(req) as { provider?: string; credentials?: Record<string, string> };

  if (!body.provider || !body.credentials) {
    sendJson(res, 400, { error: 'provider and credentials are required' });
    return;
  }

  const provider = PROVIDERS.find((p) => p.id === body.provider);
  if (!provider) {
    sendJson(res, 400, { error: `Unknown provider: ${body.provider}` });
    return;
  }

  const creds = body.credentials;

  // Validate based on provider
  let result: { valid: boolean; error?: string; identity?: string };

  switch (body.provider) {
    case 'aws':
      result = await validateAws(
        creds['aws-access-key-id'] ?? '',
        creds['aws-secret-access-key'] ?? '',
        creds['aws-region'] ?? 'us-east-1',
      );
      break;
    case 'vercel':
      result = await validateVercel(creds['vercel-token'] ?? '');
      break;
    case 'railway':
      result = await validateRailway(creds['railway-token'] ?? '');
      break;
    case 'cloudflare':
      result = await validateCloudflare(creds['cloudflare-api-token'] ?? '');
      break;
    default:
      result = { valid: false, error: 'No validator for this provider' };
  }

  if (!result.valid) {
    sendJson(res, 400, { error: result.error ?? 'Validation failed' });
    return;
  }

  // Store all fields in the vault
  for (const field of provider.fields) {
    const value = creds[field.key];
    if (value) {
      await vaultSet(password, field.key, value);
    }
  }

  sendJson(res, 200, { stored: true, identity: result.identity });
});

// DELETE /api/cloud/provider — remove a provider's credentials
addRoute('POST', '/api/cloud/remove', async (req: IncomingMessage, res: ServerResponse) => {
  const password = requirePassword(res);
  if (!password) return;

  const body = await parseJsonBody(req) as { provider?: string };
  if (!body.provider) {
    sendJson(res, 400, { error: 'provider is required' });
    return;
  }

  const provider = PROVIDERS.find((p) => p.id === body.provider);
  if (!provider) {
    sendJson(res, 400, { error: `Unknown provider: ${body.provider}` });
    return;
  }

  // Import vaultDelete
  const { vaultDelete } = await import('../lib/vault.js');
  for (const field of provider.fields) {
    await vaultDelete(password, field.key);
  }

  sendJson(res, 200, { removed: true });
});

// GET /api/cloud/deploy-targets — available deploy targets based on stored credentials
addRoute('GET', '/api/cloud/deploy-targets', async (_req: IncomingMessage, res: ServerResponse) => {
  const password = requirePassword(res);
  if (!password) return;

  const keys = await vaultKeys(password);

  // Docker and static-local are always available (no credentials needed)
  const targets: { id: string; name: string; available: boolean; provider: string | null; description: string }[] = [
    { id: 'vps', name: 'VPS (AWS EC2)', available: false, provider: 'aws', description: 'Full server with SSH access. Best for: full-stack apps, background workers, databases on the same box.' },
    { id: 'vercel', name: 'Vercel', available: false, provider: 'vercel', description: 'Serverless + edge. Best for: Next.js, static sites, JAMstack.' },
    { id: 'railway', name: 'Railway', available: false, provider: 'railway', description: 'Managed containers with add-ons. Best for: full-stack apps that need Postgres/Redis without managing servers.' },
    { id: 'cloudflare', name: 'Cloudflare Workers/Pages', available: false, provider: 'cloudflare', description: 'Edge-first serverless. Best for: APIs, static sites, globally distributed apps.' },
    { id: 'static', name: 'Static (S3 + CloudFront)', available: false, provider: 'aws', description: 'Static hosting with CDN. Best for: marketing sites, docs, SPAs with separate API.' },
    { id: 'docker', name: 'Docker (local)', available: true, provider: null, description: 'Dockerfile + docker-compose.yml. No cloud credentials needed. Best for: local dev, self-hosted.' },
  ];

  for (const target of targets) {
    if (target.provider) {
      const provider = PROVIDERS.find((p) => p.id === target.provider);
      if (provider) {
        target.available = provider.fields.every((f) => keys.includes(f.key));
      }
    }
  }

  sendJson(res, 200, { targets });
});
